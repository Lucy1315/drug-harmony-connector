// Processing engine with concurrency, retry, caching, deduplication

import { queryMFDS, type MFDSItem } from './mfds-api';
import {
  cleanProduct,
  findBestMatch,
  type MFDSCandidate,
  type ProcessResult,
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
  /** Pre-confirmed translations from user review step */
  confirmedTranslations?: Map<string, string>;
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
    mfdsEngName: item.ITEM_ENG_NAME || '',
    ingredient: item.ITEM_INGR_NAME || '',
    permitDate: item.PRMSN_DT || item.ITEM_PERMIT_DATE || '',
    permitNo: item.PRDUCT_PRMISN_NO || '',
    itemSeq: item.ITEM_SEQ || '',
  }));
}

function isEnglishKey(key: string): boolean {
  return !/[\uAC00-\uD7AF]/.test(key);
}

/** Translate English drug names to Korean via AI edge function */
export async function translateEngToKor(
  supabaseUrl: string,
  anonKey: string,
  engNames: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (engNames.length === 0) return result;

  try {
    const url = `${supabaseUrl}/functions/v1/translate-drug-names`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': anonKey },
      body: JSON.stringify({ names: engNames }),
    });

    if (!response.ok) {
      console.warn('Translation API failed:', response.status);
      return result;
    }

    const data = await response.json();
    const translations: { eng: string; kor: string }[] = data.translations || [];
    for (const t of translations) {
      const engUpper = t.eng.toUpperCase().trim();
      const kor = t.kor.trim();
      // Only use translation if it's actually Korean
      if (/[\uAC00-\uD7AF]/.test(kor)) {
        result.set(engUpper, kor);
      }
    }
  } catch (err) {
    console.warn('Translation failed:', err);
  }
  return result;
}

/** Get unique cleaned keys and identify which are English */
export function getUniqueKeys(products: { product: string }[]): {
  cleanedKeys: string[];
  uniqueKeys: string[];
  engKeys: string[];
} {
  const cleanedKeys = products.map((p) => cleanProduct(p.product));
  const uniqueKeys = [...new Set(cleanedKeys)];
  const engKeys = uniqueKeys.filter(isEnglishKey);
  return { cleanedKeys, uniqueKeys, engKeys };
}

export async function processProducts(opts: ProcessOptions): Promise<ProcessResult[]> {
  const { supabaseUrl, anonKey, serviceKey, products, onProgress, confirmedTranslations } = opts;

  // Build cleaned keys and dedup
  const cleanedKeys = products.map((p) => cleanProduct(p.product));
  const uniqueKeys = [...new Set(cleanedKeys)];

  // Build search map using confirmed translations if provided
  const searchMap = new Map<string, string>();
  for (const key of uniqueKeys) {
    if (isEnglishKey(key) && confirmedTranslations) {
      searchMap.set(key, confirmedTranslations.get(key) || key);
    } else {
      searchMap.set(key, key);
    }
  }

  // Cache: cleanedKey -> candidates | error
  const cache = new Map<string, MFDSCandidate[] | Error>();

  // Process unique keys with concurrency
  let completed = 0;
  const totalKeys = uniqueKeys.length;

  async function processKey(key: string) {
    const searchTerm = searchMap.get(key) || key;
    try {
      const items = await fetchWithRetry(supabaseUrl, anonKey, serviceKey, searchTerm);
      cache.set(key, itemsToCandidates(items));
    } catch (err) {
      cache.set(key, err instanceof Error ? err : new Error(String(err)));
    }
    completed++;
    onProgress(completed, totalKeys);
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
        reason: isEnglishKey(key) ? 'NO_RESULT_ENG' as const : 'NO_RESULT' as const,
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
