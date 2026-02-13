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
  // Collect all unique ingredients from matched results
  const matchedIngredients = new Set<string>();
  for (const r of matchedResults) {
    const ingr = (r.candidate.ingredient || '').toUpperCase().trim();
    if (ingr) matchedIngredients.add(ingr);
  }

  // Build master set from ALL candidates (not just matched), deduplicate by permitNo
  const masterMap = new Map<string, MFDSCandidate>();
  const candidateSource = allCandidates || matchedResults.map(r => r.candidate);
  for (const c of candidateSource) {
    if (c.permitNo && !masterMap.has(c.permitNo)) {
      masterMap.set(c.permitNo, c);
    }
  }

  // Group by ingredient
  const ingredientMap = new Map<string, { permitNos: Set<string>; minDate: string }>();

  for (const [permitNo, c] of masterMap) {
    const ingr = (c.ingredient || '').toUpperCase().trim();
    if (!ingr) continue;
    const entry = ingredientMap.get(ingr) || { permitNos: new Set(), minDate: '99999999' };
    entry.permitNos.add(permitNo);
    const dt = c.permitDate || '99999999';
    if (dt < entry.minDate) entry.minDate = dt;
    ingredientMap.set(ingr, entry);
  }

  const result = new Map<string, { genericCount: number; minPermitDate: string }>();
  for (const [ingr, data] of ingredientMap) {
    result.set(ingr, { genericCount: data.permitNos.size, minPermitDate: data.minDate });
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

    const ingr = (r.candidate.ingredient || '').toUpperCase().trim();
    const stats = aggregates.get(ingr);
    const genericCount = stats?.genericCount || 0;
    const myDate = r.candidate.permitDate || '99999999';
    const originalFlag = stats && myDate === stats.minPermitDate ? 'O' : '';

    matched.push({
      product: r.product,
      originalFlag,
      genericCount: ingr ? genericCount : 0,
      ingredient: r.candidate.ingredient || '',
      mfdsItemName: r.candidate.mfdsItemName || '',
      순번,
      matchQuality: r.matchQuality,
    });
  }

  return { matched, unmatched };
}
