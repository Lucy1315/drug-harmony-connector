// Processing engine with concurrency, retry, caching, deduplication

import { queryMFDS, type MFDSItem } from './mfds-api';
import {
  cleanProduct,
  findBestMatch,
  type MFDSCandidate,
  type ProcessResult,
  type MatchedResult,
  type UnmatchedResult,
} from './drug-matcher';

const CONCURRENCY = 4;
const MAX_RETRIES = 2;
const RETRY_DELAY = 500;

interface ProcessOptions {
  supabaseUrl: string;
  anonKey: string;
  serviceKey: string;
  products: { product: string; 순번?: string }[];
  onProgress: (current: number, total: number) => void;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(
  supabaseUrl: string,
  anonKey: string,
  serviceKey: string,
  itemName: string
): Promise<MFDSItem[]> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { items } = await queryMFDS(supabaseUrl, anonKey, serviceKey, itemName);
      return items;
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      await sleep(RETRY_DELAY * (attempt + 1));
    }
  }
  return [];
}

function itemsToCandidates(items: MFDSItem[]): MFDSCandidate[] {
  return items.map((item) => ({
    mfdsItemName: item.ITEM_NAME || '',
    ingredient: item.ITEM_INGR_NAME || '',
    permitDate: item.PRMSN_DT || '',
    permitNo: item.PRDUCT_PRMISN_NO || '',
    itemSeq: item.ITEM_SEQ || '',
  }));
}

export async function processProducts(opts: ProcessOptions): Promise<ProcessResult[]> {
  const { supabaseUrl, anonKey, serviceKey, products, onProgress } = opts;

  // Build cleaned keys and dedup
  const cleanedKeys = products.map((p) => cleanProduct(p.product));
  const uniqueKeys = [...new Set(cleanedKeys)];

  // Cache: cleanedKey -> candidates | error
  const cache = new Map<string, MFDSCandidate[] | Error>();

  // Process unique keys with concurrency
  let completed = 0;

  async function processKey(key: string) {
    try {
      const items = await fetchWithRetry(supabaseUrl, anonKey, serviceKey, key);
      cache.set(key, itemsToCandidates(items));
    } catch (err) {
      cache.set(key, err instanceof Error ? err : new Error(String(err)));
    }
    completed++;
    onProgress(completed, uniqueKeys.length);
  }

  // Run with concurrency limit
  const queue = [...uniqueKeys];
  const running: Promise<void>[] = [];

  while (queue.length > 0 || running.length > 0) {
    while (running.length < CONCURRENCY && queue.length > 0) {
      const key = queue.shift()!;
      const p = processKey(key).then(() => {
        const idx = running.indexOf(p);
        if (idx !== -1) running.splice(idx, 1);
      });
      running.push(p);
    }
    if (running.length > 0) {
      await Promise.race(running);
    }
  }

  // Map results back to input rows
  const results: ProcessResult[] = products.map((row, i) => {
    const key = cleanedKeys[i];
    const cached = cache.get(key);

    if (!key) {
      return {
        type: 'unmatched' as const,
        product: row.product,
        cleanedKey: key,
        reason: 'NO_RESULT' as const,
        candidatesCount: 0,
      };
    }

    if (cached instanceof Error) {
      return {
        type: 'unmatched' as const,
        product: row.product,
        cleanedKey: key,
        reason: 'API_ERROR' as const,
        candidatesCount: 0,
        errorMessage: cached.message,
      };
    }

    const candidates = cached || [];

    if (candidates.length === 0) {
      return {
        type: 'unmatched' as const,
        product: row.product,
        cleanedKey: key,
        reason: 'NO_RESULT' as const,
        candidatesCount: 0,
      };
    }

    const match = findBestMatch(key, candidates);
    if (!match) {
      return {
        type: 'unmatched' as const,
        product: row.product,
        cleanedKey: key,
        reason: 'AMBIGUOUS' as const,
        candidatesCount: candidates.length,
      };
    }

    if (!match.candidate.ingredient) {
      // Still matched but no ingredient
      return {
        type: 'matched' as const,
        product: row.product,
        cleanedKey: key,
        candidate: match.candidate,
        matchQuality: match.quality,
      };
    }

    return {
      type: 'matched' as const,
      product: row.product,
      cleanedKey: key,
      candidate: match.candidate,
      matchQuality: match.quality,
    };
  });

  return results;
}
