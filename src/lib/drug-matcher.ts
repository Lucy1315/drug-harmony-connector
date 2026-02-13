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
  permitDate: string; // raw PRMSN_DT / ITEM_PERMIT_DATE string e.g. "19950101"
  permitNo: string;
  itemSeq: string;
  companyName?: string; // 업체명
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
  originalFlag: string; // "O" or ""
  genericCount: number;
  ingredient: string;
  mfdsItemName: string;
  originalMfdsNames?: string[]; // product names with earliest permit date for this ingredient
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
  // Build master set from ALL candidates, deduplicate by permitNo
  const masterMap = new Map<string, MFDSCandidate>();
  const candidateSource = allCandidates || matchedResults.map(r => r.candidate);
  for (const c of candidateSource) {
    if (c.permitNo && !masterMap.has(c.permitNo)) {
      masterMap.set(c.permitNo, c);
    }
  }

  // Group by NORMALIZED ingredient
  // Count unique company names (업체명) per ingredient group
  // e.g. same company with 25mg and 50mg = 1 count, different companies = separate counts
  const ingredientMap = new Map<string, { companyNames: Set<string>; minDate: string }>();

  for (const [, c] of masterMap) {
    const ingr = normalizeIngredient(c.ingredient || '');
    if (!ingr) continue;
    const entry = ingredientMap.get(ingr) || { companyNames: new Set(), minDate: '99999999' };
    // Count by unique company name (업체명)
    const company = (c.companyName || '').trim().toUpperCase();
    if (company) {
      entry.companyNames.add(company);
    }
    const dt = c.permitDate || '99999999';
    if (dt < entry.minDate) entry.minDate = dt;
    ingredientMap.set(ingr, entry);
  }

  const result = new Map<string, { genericCount: number; minPermitDate: string }>();
  for (const [ingr, data] of ingredientMap) {
    result.set(ingr, { genericCount: data.companyNames.size, minPermitDate: data.minDate });
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

  // Build normalized ingredient → all unique MFDS product names map from all candidates
  const ingredientProductNames = new Map<string, Set<string>>();
  if (allCandidates) {
    for (const c of allCandidates) {
      const ingr = normalizeIngredient(c.ingredient || '');
      if (!ingr || !c.mfdsItemName) continue;
      if (!ingredientProductNames.has(ingr)) {
        ingredientProductNames.set(ingr, new Set());
      }
      ingredientProductNames.get(ingr)!.add(c.mfdsItemName);
    }
  }

  // Build normalized ingredient → original product names (earliest permit date)
  const ingredientOriginals = new Map<string, Set<string>>();
  if (allCandidates) {
    for (const c of allCandidates) {
      const ingr = normalizeIngredient(c.ingredient || '');
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
        originalFlag: '',
        genericCount: 0,
        ingredient: '',
        mfdsItemName: '',
        순번,
      });
      continue;
    }

    const ingr = normalizeIngredient(r.candidate.ingredient || '');
    const stats = aggregates.get(ingr);
    const genericCount = stats?.genericCount || 0;
    const myDate = r.candidate.permitDate || '99999999';
    const originalFlag = stats && myDate === stats.minPermitDate ? 'O' : '';

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
      mfdsItemName,
      originalMfdsNames: originals ? [...originals] : undefined,
      순번,
      matchQuality: r.matchQuality,
    });
  }

  return { matched, unmatched };
}
