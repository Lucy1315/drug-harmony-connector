// Processing engine - uses local MFDS Excel data

import { getMFDSData, searchLocal } from './mfds-local';
import {
  cleanProduct,
  findBestMatch,
  type MFDSCandidate,
  type ProcessResult,
} from './drug-matcher';

interface ProcessOptions {
  products: { product: string; 순번?: string }[];
  onProgress: (current: number, total: number) => void;
  /** Pre-confirmed translations from user review step */
  confirmedTranslations?: Map<string, string>;
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

export async function processProducts(opts: ProcessOptions): Promise<{ results: ProcessResult[]; allCandidates: MFDSCandidate[] }> {
  const { products, onProgress, confirmedTranslations } = opts;

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

  // Cache: cleanedKey -> candidates
  const cache = new Map<string, MFDSCandidate[]>();

  // Process each unique key by searching local data
  let completed = 0;
  const totalKeys = uniqueKeys.length;

  for (const key of uniqueKeys) {
    const searchTerm = searchMap.get(key) || key;
    const results = await searchLocal(searchTerm);
    cache.set(key, results);
    completed++;
    onProgress(completed, totalKeys);
  }

  // Collect ALL candidates from the full dataset for aggregation
  const allCandidates = await getMFDSData();

  // Map results back to input rows
  const results: ProcessResult[] = products.map((row, i) => {
    const key = cleanedKeys[i];
    const candidates = cache.get(key) || [];

    if (!key) {
      return {
        type: 'unmatched' as const,
        product: row.product,
        cleanedKey: key,
        reason: 'NO_RESULT' as const,
        candidatesCount: 0,
      };
    }

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

  return { results, allCandidates };
}
