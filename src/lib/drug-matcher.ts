// Cleaning and matching logic for drug product names

const TRAILING_TOKENS = [
  'P5V>>', 'EUP>>', 'AB8>>', 'CC4>>', 'MPM>>', 'G-O', '>>'
];

export function cleanProductName(name: string): string {
  let cleaned = name.trim();
  
  // Remove trailing tokens (order matters - longer tokens first)
  const sortedTokens = [...TRAILING_TOKENS].sort((a, b) => b.length - a.length);
  let changed = true;
  while (changed) {
    changed = false;
    for (const token of sortedTokens) {
      if (cleaned.toUpperCase().endsWith(token)) {
        cleaned = cleaned.slice(0, -token.length).trim();
        changed = true;
      }
    }
  }

  // Replace '.' with space
  cleaned = cleaned.replace(/\./g, ' ');
  // Collapse multiple spaces
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  // Uppercase
  cleaned = cleaned.toUpperCase();

  return cleaned;
}

export interface MFDSProduct {
  ITEM_NAME: string;
  PRDUCT_PRMISN_NO: string;
  PRMSN_DT: string;
  ITEM_INGR_NAME: string;
  순번?: string;
}

export interface MatchResult {
  product: string;
  cleanedKey: string;
  matched: boolean;
  mfdsProduct?: MFDSProduct;
  ingredient: string;
  originalFlag: string;
  genericCount: number;
  mfdsItemName: string;
  순번: string;
  unmatchedReason?: string;
}

export function findBestMatch(
  cleanedKey: string,
  candidates: MFDSProduct[]
): MFDSProduct | null {
  if (candidates.length === 0) return null;

  // Try exact match on cleaned ITEM_NAME
  const exactMatches = candidates.filter(
    (c) => cleanProductName(c.ITEM_NAME || '') === cleanedKey
  );

  const pool = exactMatches.length > 0 ? exactMatches : candidates;

  // Pick earliest PRMSN_DT
  const sorted = [...pool].sort((a, b) => {
    const da = a.PRMSN_DT || '99999999';
    const db = b.PRMSN_DT || '99999999';
    return da.localeCompare(db);
  });

  return sorted[0];
}

export function computeAggregates(results: MatchResult[]): MatchResult[] {
  // Group by ingredient
  const ingredientGroups = new Map<string, MatchResult[]>();
  
  for (const r of results) {
    if (!r.matched || !r.ingredient) continue;
    const key = r.ingredient.toUpperCase().trim();
    if (!key) continue;
    const group = ingredientGroups.get(key) || [];
    group.push(r);
    ingredientGroups.set(key, group);
  }

  // Compute per-ingredient: distinct PRDUCT_PRMISN_NO count and min PRMSN_DT
  const ingredientStats = new Map<string, { count: number; minDate: string }>();
  
  for (const [key, group] of ingredientGroups) {
    const uniquePermissions = new Set(
      group
        .filter((r) => r.mfdsProduct?.PRDUCT_PRMISN_NO)
        .map((r) => r.mfdsProduct!.PRDUCT_PRMISN_NO)
    );
    const minDate = group.reduce((min, r) => {
      const dt = r.mfdsProduct?.PRMSN_DT || '99999999';
      return dt < min ? dt : min;
    }, '99999999');
    
    ingredientStats.set(key, { count: uniquePermissions.size, minDate });
  }

  // Apply to results
  return results.map((r) => {
    if (!r.matched || !r.ingredient) return r;
    const key = r.ingredient.toUpperCase().trim();
    const stats = ingredientStats.get(key);
    if (!stats) return r;

    const genericCount = stats.count;
    const myDate = r.mfdsProduct?.PRMSN_DT || '99999999';
    const originalFlag = myDate === stats.minDate ? 'O' : '';

    return { ...r, genericCount, originalFlag };
  });
}
