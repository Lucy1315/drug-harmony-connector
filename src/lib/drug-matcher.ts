// Cleaning, matching, and aggregation logic for drug product names

const SUFFIX_TOKENS = ['P5V>>', 'EUP>>', 'AB8>>', 'CC4>>', 'MPM>>', 'G-O', '>>'];

export function cleanProduct(s: string): string {
  let c = s.trim().toUpperCase();
  // Replace '.' with space
  c = c.replace(/\./g, ' ');
  // Remove suffix tokens (longer first, repeat)
  const sorted = [...SUFFIX_TOKENS].sort((a, b) => b.length - a.length);
  let changed = true;
  while (changed) {
    changed = false;
    for (const tok of sorted) {
      // Remove anywhere in string
      const idx = c.indexOf(tok);
      if (idx !== -1) {
        c = (c.slice(0, idx) + c.slice(idx + tok.length)).trim();
        changed = true;
      }
    }
  }
  // Collapse spaces
  c = c.replace(/\s+/g, ' ').trim();
  return c;
}

export type MatchQuality = 'EXACT' | 'FUZZY';
export type UnmatchReason = 'NO_RESULT' | 'NO_RESULT_ENG' | 'NO_INGREDIENT' | 'AMBIGUOUS' | 'API_ERROR';

export interface MFDSCandidate {
  mfdsItemName: string;
  mfdsEngName?: string;
  ingredient: string;
  ingredientEng?: string; // 주성분영문
  permitDate: string;
  permitNo: string;
  itemSeq: string;
  companyName?: string;
}

export interface MatchedResult {
  type: 'matched';
  product: string;
  cleanedKey: string;
  candidate: MFDSCandidate;
  matchQuality: MatchQuality;
}

export interface UnmatchedResult {
  type: 'unmatched';
  product: string;
  cleanedKey: string;
  reason: UnmatchReason;
  candidatesCount: number;
  errorMessage?: string;
}

export type ProcessResult = MatchedResult | UnmatchedResult;

export interface FinalRow {
  product: string;
  originalFlag: string; // "O" or "X"
  genericCount: number;
  ingredient: string;
  ingredientEng?: string; // English ingredient name
  mfdsItemName: string;
  originalMfdsNames?: string[];
  순번: string;
  matchQuality?: MatchQuality;
}

export interface UnmatchedRow {
  순번: string;
  product: string;
  cleanedKey: string;
  reason: UnmatchReason;
  candidatesCount: number;
}

// Strip dosage/quantity from a string (ingredient or product name)
// e.g. "에타너셉트 25밀리그램" → "에타너셉트", "Etanercept 50mg/mL" → "ETANERCEPT"
// Also used to normalize product names: "레볼레이드정25밀리그램" and "레볼레이드정50밀리그램" → same base
export function normalizeDosage(s: string): string {
  let n = s.toUpperCase().trim();
  // Remove parenthetical content like (as ...), (유전자재조합)
  n = n.replace(/\(.*?\)/g, '');
  // Remove compound dosage patterns like 40mg/0.8mL, 20mg/mL
  n = n.replace(/[\d.,]+\s*(MG|ML|G|MCG|UG|IU|UNIT|UNITS|밀리그램|그램|밀리리터|리터|마이크로그램|단위|국제단위)\s*\/\s*[\d.,]*\s*(MG|ML|G|MCG|UG|IU|UNIT|UNITS|밀리그램|그램|밀리리터|리터|마이크로그램|단위|국제단위)?/gi, '');
  // Remove dosage patterns: numbers with units
  n = n.replace(/[\d.,]+\s*(MG|ML|G|MCG|UG|IU|UNIT|UNITS|밀리그램|그램|밀리리터|리터|마이크로그램|단위|국제단위|%)/gi, '');
  // Remove standalone number/unit ratios like 50/mL
  n = n.replace(/[\d.,]+\s*\/\s*[\d.,]*\s*(MG|ML|G|MCG|UG|IU|UNIT|UNITS|밀리그램|그램|밀리리터|리터|마이크로그램|단위|국제단위)?/gi, '');
  // Remove remaining slashes left over
  n = n.replace(/\s*\/\s*/g, ' ');
  // Remove trailing standalone numbers
  n = n.replace(/\s+[\d.,]+\s*$/g, '');
  // Remove leading standalone numbers
  n = n.replace(/^[\d.,]+\s+/g, '');
  // Collapse spaces and trim
  n = n.replace(/\s+/g, ' ').trim();
  return n;
}

// Alias for ingredient normalization (backward compat)
export function normalizeIngredient(s: string): string {
  return normalizeDosage(s);
}

// Common pharmaceutical salt forms and hydration states to strip for ingredient grouping
const PHARMA_SUFFIXES = [
  'HEPTAHYDRATE', 'HEXAHYDRATE', 'PENTAHYDRATE', 'TETRAHYDRATE',
  'TRIHYDRATE', 'SESQUIHYDRATE', 'DIHYDRATE', 'MONOHYDRATE', 'HYDRATE',
  'DISODIUM', 'TRISODIUM', 'MONOSODIUM', 'SODIUM', 'POTASSIUM', 'CALCIUM', 'MAGNESIUM',
  'HYDROCHLORIDE', 'DIHYDROCHLORIDE', 'MONOHYDROCHLORIDE',
  'MESYLATE', 'MESILATE', 'MALEATE', 'FUMARATE', 'HEMIFUMARATE',
  'TARTRATE', 'BITARTRATE', 'SUCCINATE', 'BESYLATE', 'BESILATE', 'TOSYLATE',
  'ACETATE', 'DIACETATE', 'CITRATE', 'SULFATE', 'SULPHATE',
  'PHOSPHATE', 'NITRATE', 'BROMIDE', 'CHLORIDE', 'IODIDE',
  'MEGLUMINE', 'TROMETHAMINE', 'LYSINE', 'ARGININE',
  'PIVOXIL', 'AXETIL', 'MEDOXOMIL', 'CILEXETIL', 'MOFETIL',
  'VALERATE', 'PROPIONATE', 'BUTYRATE', 'FUROATE', 'DIPROPIONATE',
  'PAMOATE', 'EMBONATE', 'STEARATE', 'PALMITATE',
  'XINAFOATE', 'NAPSYLATE', 'DECANOATE', 'ENANTHATE',
].sort((a, b) => b.length - a.length); // longest first to avoid partial matches

/**
 * Normalize English ingredient name for grouping:
 * strips dosage, salt forms, and hydration states so that
 * "Pemetrexed Disodium Heptahydrate" and "Pemetrexed Disodium" → "PEMETREXED"
 */
export function normalizeIngredientEng(s: string): string {
  let n = normalizeDosage(s);
  for (const suffix of PHARMA_SUFFIXES) {
    n = n.replace(new RegExp('\\b' + suffix + '\\b', 'g'), '');
  }
  n = n.replace(/\s+/g, ' ').trim();
  return n;
}

/**
 * Get the best grouping key for an ingredient: prefer English (normalized), fallback to Korean.
 */
export function getIngredientGroupKey(candidate: { ingredient?: string; ingredientEng?: string }): string {
  const eng = (candidate.ingredientEng || '').trim();
  if (eng) return normalizeIngredientEng(eng);
  return normalizeIngredient(candidate.ingredient || '');
}

// Clean English name for comparison
function cleanEngName(s: string): string {
  return s.toUpperCase().replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
}

function isKoreanStr(s: string): boolean {
  return /[\uAC00-\uD7AF]/.test(s);
}

export function findBestMatch(
  cleanedKey: string,
  candidates: MFDSCandidate[]
): { candidate: MFDSCandidate; quality: MatchQuality } | null {
  if (candidates.length === 0) return null;

  const keyIsKorean = isKoreanStr(cleanedKey);

  if (keyIsKorean) {
    // Korean matching: compare cleaned ITEM_NAME
    const exact = candidates.filter(
      (c) => cleanProduct(c.mfdsItemName) === cleanedKey
    );

    if (exact.length > 0) {
      const sorted = [...exact].sort((a, b) => (a.permitDate || '99999999').localeCompare(b.permitDate || '99999999'));
      return { candidate: sorted[0], quality: 'EXACT' };
    }
  } else {
    // English matching: compare cleaned ITEM_ENG_NAME
    const cleanedKeyEng = cleanEngName(cleanedKey);
    
    // Exact match on English name
    const exactEng = candidates.filter((c) => {
      const engName = cleanEngName(c.mfdsEngName || '');
      return engName === cleanedKeyEng;
    });

    if (exactEng.length > 0) {
      const sorted = [...exactEng].sort((a, b) => (a.permitDate || '99999999').localeCompare(b.permitDate || '99999999'));
      return { candidate: sorted[0], quality: 'EXACT' };
    }

    // Partial: English name starts with or contains the search key
    const partialEng = candidates.filter((c) => {
      const engName = cleanEngName(c.mfdsEngName || '');
      return engName.includes(cleanedKeyEng) || cleanedKeyEng.includes(engName.split(' ')[0]);
    });

    if (partialEng.length > 0) {
      const sorted = [...partialEng].sort((a, b) => (a.permitDate || '99999999').localeCompare(b.permitDate || '99999999'));
      return { candidate: sorted[0], quality: 'EXACT' };
    }
  }

  // Fuzzy fallback: pick earliest permitDate
  const sorted = [...candidates].sort((a, b) => (a.permitDate || '99999999').localeCompare(b.permitDate || '99999999'));
  return { candidate: sorted[0], quality: 'FUZZY' };
}

export function computeAggregates(
  matchedResults: MatchedResult[],
  allCandidates?: MFDSCandidate[]
): Map<string, { genericCount: number; minPermitDate: string }> {
  // Build master set from ALL candidates, deduplicate by itemSeq (품목기준코드, globally unique)
  const masterMap = new Map<string, MFDSCandidate>();
  const candidateSource = allCandidates || matchedResults.map(r => r.candidate);
  for (const c of candidateSource) {
    const key = c.itemSeq || c.permitNo || '';
    if (key && !masterMap.has(key)) {
      masterMap.set(key, c);
    }
  }

  // Group by NORMALIZED ENGLISH ingredient (fallback to Korean)
  // This ensures "Pemetrexed Disodium Heptahydrate" and "Pemetrexed Disodium" are in the same group
  const ingredientMap = new Map<string, { normalizedProductNames: Map<string, string>; minDate: string }>();

  for (const [, c] of masterMap) {
    const ingr = getIngredientGroupKey(c);
    if (!ingr) continue;
    const entry = ingredientMap.get(ingr) || { normalizedProductNames: new Map(), minDate: '99999999' };
    const normalizedName = normalizeDosage(c.mfdsItemName || '');
    if (normalizedName) {
      // Track earliest permit date per normalized product name
      const existingDate = entry.normalizedProductNames.get(normalizedName) || '99999999';
      const dt = c.permitDate || '99999999';
      if (dt < existingDate) {
        entry.normalizedProductNames.set(normalizedName, dt);
      }
    }
    const dt = c.permitDate || '99999999';
    if (dt < entry.minDate) entry.minDate = dt;
    ingredientMap.set(ingr, entry);
  }

  // Count generics = total unique product names MINUS original product names
  // Original = product(s) with the earliest permit date for that ingredient
  const result = new Map<string, { genericCount: number; minPermitDate: string }>();
  for (const [ingr, data] of ingredientMap) {
    const { normalizedProductNames, minDate } = data;
    let originalCount = 0;
    for (const [, productDate] of normalizedProductNames) {
      if (productDate === minDate) originalCount++;
    }
    const genericCount = normalizedProductNames.size - originalCount;
    result.set(ingr, { genericCount, minPermitDate: minDate });
  }
  return result;
}

export function buildFinalRows(
  results: ProcessResult[],
  inputRows: { product: string; 순번?: string }[],
  allCandidates?: MFDSCandidate[]
): { matched: FinalRow[]; unmatched: UnmatchedRow[] } {
  // Gather all matched for aggregation
  const allMatched = results.filter((r): r is MatchedResult => r.type === 'matched');
  const aggregates = computeAggregates(allMatched, allCandidates);

  // Build ingredient group key → all unique MFDS product names map from all candidates
  const ingredientProductNames = new Map<string, Set<string>>();
  if (allCandidates) {
    for (const c of allCandidates) {
      const ingr = getIngredientGroupKey(c);
      if (!ingr || !c.mfdsItemName) continue;
      if (!ingredientProductNames.has(ingr)) {
        ingredientProductNames.set(ingr, new Set());
      }
      ingredientProductNames.get(ingr)!.add(c.mfdsItemName);
    }
  }

  // Build ingredient group key → original product names (earliest permit date)
  const ingredientOriginals = new Map<string, Set<string>>();
  if (allCandidates) {
    for (const c of allCandidates) {
      const ingr = getIngredientGroupKey(c);
      if (!ingr || !c.mfdsItemName) continue;
      const stats = aggregates.get(ingr);
      if (stats && c.permitDate === stats.minPermitDate) {
        if (!ingredientOriginals.has(ingr)) ingredientOriginals.set(ingr, new Set());
        ingredientOriginals.get(ingr)!.add(c.mfdsItemName);
      }
    }
  }

  const matched: FinalRow[] = [];
  const unmatched: UnmatchedRow[] = [];

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const input = inputRows[i];
    const 순번 = input?.순번 || '';

    if (r.type === 'unmatched') {
      unmatched.push({
        순번,
        product: r.product,
        cleanedKey: r.cleanedKey,
        reason: r.reason,
        candidatesCount: r.candidatesCount,
      });
      matched.push({
        product: r.product,
        originalFlag: 'X',
        genericCount: 0,
        ingredient: '',
        mfdsItemName: '',
        순번,
      });
      continue;
    }

    const ingr = getIngredientGroupKey(r.candidate);
    const stats = aggregates.get(ingr);
    const genericCount = stats?.genericCount || 0;
    // B열: O if original product exists in MFDS for this ingredient, X if not
    const originalFlag = ingr && stats ? 'O' : 'X';

    // Get all product names with the same normalized ingredient
    const allNames = ingredientProductNames.get(ingr);
    const mfdsItemName = allNames && allNames.size > 0
      ? [...allNames].join(', ')
      : r.candidate.mfdsItemName || '';

    const originals = ingredientOriginals.get(ingr);

    matched.push({
      product: r.product,
      originalFlag,
      genericCount: ingr ? genericCount : 0,
      ingredient: r.candidate.ingredient || '',
      ingredientEng: r.candidate.ingredientEng || '',
      mfdsItemName,
      originalMfdsNames: originals ? [...originals] : undefined,
      순번,
      matchQuality: r.matchQuality,
    });
  }

  return { matched, unmatched };
}
