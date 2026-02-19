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
  isNewDrug?: boolean; // 신약구분 'Y' = originator drug
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
  'ANHYDROUS',
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
  'MICRONIZED',
].sort((a, b) => b.length - a.length); // longest first to avoid partial matches

// Korean pharmaceutical salt forms and hydration states to strip
const KOREAN_PHARMA_SUFFIXES = [
  '칠수화물', '육수화물', '오수화물', '사수화물', '삼수화물',
  '이수화물', '일수화물', '반수화물', '수화물', '무수물',
  '이나트륨염', '일나트륨염', '나트륨염',
  '이나트륨', '일나트륨', '나트륨',
  '이칼륨', '일칼륨', '칼륨',
  '이칼슘', '일칼슘', '칼슘',
  '마그네슘',
  '염산염', '황산염', '메실산염', '말레산염', '푸마르산염',
  '타르타르산염', '주석산염', '구연산염', '인산염', '질산염',
  '숙신산염', '베실산염', '토실산염', '아세트산염',
  '브롬화물', '염화물', '요오드화물',
  '메글루민', '트로메타민', '라이신', '아르기닌',
].sort((a, b) => b.length - a.length);

/**
 * Normalize Korean ingredient name for grouping:
 * strips dosage, Korean salt forms, and hydration states so that
 * "페메트렉시드이나트륨염칠수화물" and "페메트렉시드이나트륨" → "페메트렉시드"
 */
export function normalizeIngredientKor(s: string): string {
  let n = normalizeDosage(s);
  // Repeatedly scan all suffixes until no more can be removed
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of KOREAN_PHARMA_SUFFIXES) {
      if (n.endsWith(suffix)) {
        n = n.slice(0, -suffix.length).trim();
        changed = true;
        break; // restart from longest suffix
      }
    }
  }
  return n.trim();
}

/**
 * Normalize English ingredient name for grouping:
 * strips dosage, salt forms, and hydration states so that
 * "Pemetrexed Disodium Heptahydrate" and "Pemetrexed Disodium" → "PEMETREXED"
 */
export function normalizeIngredientEng(s: string): string {
  let n = normalizeDosage(s);
  // Remove numbers between words (e.g. "Disodium 2.5 Hydrate" → "Disodium Hydrate")
  n = n.replace(/\b[\d.,]+\b/g, '');
  for (const suffix of PHARMA_SUFFIXES) {
    n = n.replace(new RegExp('\\b' + suffix + '\\b', 'g'), '');
  }
  n = n.replace(/\s+/g, ' ').trim();
  return n;
}

/**
 * Get the best grouping key for an ingredient: prefer English (normalized), fallback to normalized Korean.
 */
export function getIngredientGroupKey(candidate: { ingredient?: string; ingredientEng?: string }): string {
  const eng = (candidate.ingredientEng || '').trim();
  if (eng) return normalizeIngredientEng(eng);
  return normalizeIngredientKor(candidate.ingredient || '');
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

  // Phase 1: Initial grouping by getIngredientGroupKey (English preferred, Korean fallback)
  const ingredientMap = new Map<string, { normalizedProductNames: Map<string, string>; minDate: string; newDrugProducts: Set<string> }>();

  // Also build a mapping: normalized Korean ingredient → English group key (for cross-referencing)
  const korToEngMap = new Map<string, string>(); // normalizedKor → engGroupKey

  // First pass: build groups, and for records with BOTH eng and kor, record the mapping
  for (const [, c] of masterMap) {
    const eng = (c.ingredientEng || '').trim();
    const kor = (c.ingredient || '').trim();
    if (eng && kor) {
      const engKey = normalizeIngredientEng(eng);
      const korKey = normalizeIngredientKor(kor);
      if (engKey && korKey) {
        korToEngMap.set(korKey, engKey);
      }
    }
  }

  // Second pass: assign each candidate to a group, using cross-reference for Korean-only records
  // Also collect newDrug products per group in the same pass (avoids O(n×m) re-scan)
  for (const [, c] of masterMap) {
    let ingr = getIngredientGroupKey(c);
    if (!ingr) continue;

    // If this record has no English ingredient, check if its normalized Korean maps to an English group
    const eng = (c.ingredientEng || '').trim();
    if (!eng) {
      const korKey = normalizeIngredientKor(c.ingredient || '');
      const mappedEngKey = korToEngMap.get(korKey);
      if (mappedEngKey) {
        ingr = mappedEngKey; // Merge into the English group
      }
    }

    const entry = ingredientMap.get(ingr) || { normalizedProductNames: new Map(), minDate: '99999999', newDrugProducts: new Set() };
    const normalizedName = normalizeDosage(c.mfdsItemName || '');
    if (normalizedName) {
      const existingDate = entry.normalizedProductNames.get(normalizedName) || '99999999';
      const dt = c.permitDate || '99999999';
      if (dt < existingDate) {
        entry.normalizedProductNames.set(normalizedName, dt);
      }
      // Track 신약구분 products in the same pass
      if (c.isNewDrug) {
        entry.newDrugProducts.add(normalizedName);
      }
    }
    const dt = c.permitDate || '99999999';
    if (dt < entry.minDate) entry.minDate = dt;
    ingredientMap.set(ingr, entry);
  }

  // Count generics = total unique product names MINUS original product names
  // Original = product(s) marked as 신약구분='Y' (isNewDrug), or fallback to earliest permit date
  const result = new Map<string, { genericCount: number; minPermitDate: string }>();
  for (const [ingr, data] of ingredientMap) {
    const { normalizedProductNames, minDate, newDrugProducts } = data;
    
    let originalCount: number;
    if (newDrugProducts.size > 0) {
      // Use 신약구분 to identify originals
      originalCount = 0;
      for (const [prodName] of normalizedProductNames) {
        if (newDrugProducts.has(prodName)) originalCount++;
      }
      // If none of the normalized names matched (shouldn't happen), fallback
      if (originalCount === 0) originalCount = 1;
    } else {
      // Fallback: use earliest permit date
      originalCount = 0;
      for (const [, productDate] of normalizedProductNames) {
        if (productDate === minDate) originalCount++;
      }
    }
    
    const genericCount = normalizedProductNames.size - originalCount;
    result.set(ingr, { genericCount, minPermitDate: minDate });
  }
  return result;
}

/**
 * Build a cross-reference map: normalizedKor → engGroupKey
 * from candidates that have BOTH English and Korean ingredient names.
 */
function buildKorToEngMap(candidates: MFDSCandidate[]): Map<string, string> {
  const korToEngMap = new Map<string, string>();
  for (const c of candidates) {
    const eng = (c.ingredientEng || '').trim();
    const kor = (c.ingredient || '').trim();
    if (eng && kor) {
      const engKey = normalizeIngredientEng(eng);
      const korKey = normalizeIngredientKor(kor);
      if (engKey && korKey) {
        korToEngMap.set(korKey, engKey);
      }
    }
  }
  return korToEngMap;
}

/**
 * Resolve the ingredient group key with cross-referencing:
 * if the candidate has no English ingredient, try to map its Korean ingredient
 * to an English group key via the korToEngMap.
 */
function resolveIngredientGroupKey(
  candidate: MFDSCandidate,
  korToEngMap: Map<string, string>
): string {
  const eng = (candidate.ingredientEng || '').trim();
  if (eng) return normalizeIngredientEng(eng);
  const korKey = normalizeIngredientKor(candidate.ingredient || '');
  const mappedEngKey = korToEngMap.get(korKey);
  return mappedEngKey || korKey;
}

export function buildFinalRows(
  results: ProcessResult[],
  inputRows: { product: string; 순번?: string }[],
  allCandidates?: MFDSCandidate[]
): { matched: FinalRow[]; unmatched: UnmatchedRow[] } {
  const allMatched = results.filter((r): r is MatchedResult => r.type === 'matched');
  const aggregates = computeAggregates(allMatched, allCandidates);

  // Build korToEng cross-reference from all candidates
  const korToEngMap = allCandidates ? buildKorToEngMap(allCandidates) : new Map<string, string>();

  // Build ingredient group key → all unique MFDS product names map
  const ingredientProductNames = new Map<string, Set<string>>();
  if (allCandidates) {
    for (const c of allCandidates) {
      const ingr = resolveIngredientGroupKey(c, korToEngMap);
      if (!ingr || !c.mfdsItemName) continue;
      if (!ingredientProductNames.has(ingr)) ingredientProductNames.set(ingr, new Set());
      ingredientProductNames.get(ingr)!.add(c.mfdsItemName);
    }
  }

  // Build ingredient group key → original product names (신약구분=Y, or fallback to earliest permit date)
  const ingredientOriginals = new Map<string, Set<string>>();
  if (allCandidates) {
    // First pass: collect 신약구분=Y products per ingredient
    for (const c of allCandidates) {
      const ingr = resolveIngredientGroupKey(c, korToEngMap);
      if (!ingr || !c.mfdsItemName) continue;
      if (c.isNewDrug) {
        if (!ingredientOriginals.has(ingr)) ingredientOriginals.set(ingr, new Set());
        ingredientOriginals.get(ingr)!.add(c.mfdsItemName);
      }
    }
    // Second pass: for ingredients without 신약구분 markers, fallback to earliest permit date
    for (const c of allCandidates) {
      const ingr = resolveIngredientGroupKey(c, korToEngMap);
      if (!ingr || !c.mfdsItemName) continue;
      if (ingredientOriginals.has(ingr)) continue; // already has 신약구분 data
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

    const ingr = resolveIngredientGroupKey(r.candidate, korToEngMap);
    const stats = aggregates.get(ingr);
    const genericCount = stats?.genericCount || 0;
    
    // Original flag: "O" only if the matched product itself is 신약구분=Y,
    // or if no 신약구분 data exists in the group, the earliest permit date product
    const originals = ingredientOriginals.get(ingr);
    const matchedProductName = r.candidate.mfdsItemName || '';
    const isOriginal = originals ? originals.has(matchedProductName) : false;
    const originalFlag = isOriginal ? 'O' : (ingr && stats ? 'X' : 'X');

    const allNames = ingredientProductNames.get(ingr);
    const mfdsItemName = allNames && allNames.size > 0
      ? [...allNames].join(', ')
      : r.candidate.mfdsItemName || '';

    const originalsForDisplay = ingredientOriginals.get(ingr);

    matched.push({
      product: r.product,
      originalFlag,
      genericCount: ingr ? genericCount : 0,
      ingredient: r.candidate.ingredient || '',
      ingredientEng: r.candidate.ingredientEng || '',
      mfdsItemName,
      originalMfdsNames: originalsForDisplay ? [...originalsForDisplay] : undefined,
      순번,
      matchQuality: r.matchQuality,
    });
  }

  return { matched, unmatched };
}
