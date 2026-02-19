// Local MFDS data loader - parses Excel file instead of calling API
import * as XLSX from 'xlsx';
import type { MFDSCandidate } from './drug-matcher';
import { cleanProduct } from './drug-matcher';

let cachedData: MFDSCandidate[] | null = null;
let loadingPromise: Promise<MFDSCandidate[]> | null = null;

function parsePermitDate(raw: any): string {
  if (!raw) return '';
  // Handle Excel date serial numbers
  if (typeof raw === 'number') {
    const date = new Date((raw - 25569) * 86400 * 1000);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }
  // Handle string dates like "7/13/98", "9/27/01", "2015-01-26"
  const s = String(raw).trim();
  // Already YYYYMMDD
  if (/^\d{8}$/.test(s)) return s;
  // MM/DD/YY or M/D/YY
  const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    let year = parseInt(slashMatch[3]);
    if (year < 100) year += year > 50 ? 1900 : 2000;
    return `${year}${String(parseInt(slashMatch[1])).padStart(2, '0')}${String(parseInt(slashMatch[2])).padStart(2, '0')}`;
  }
  // YYYY-MM-DD
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}${isoMatch[2]}${isoMatch[3]}`;
  return s.replace(/[^0-9]/g, '').slice(0, 8);
}

async function loadFromExcel(): Promise<MFDSCandidate[]> {
  const response = await fetch('/data/mfds-data.xlsx');
  const buffer = await response.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any>(ws);

  const candidates: MFDSCandidate[] = [];
  for (const row of rows) {
    const itemName = String(row['제품명'] || '').trim();
    if (!itemName) continue;
    // Skip cancelled/withdrawn items
    const status = String(row['취소/취하'] || '').trim();
    if (status === '취하' || status === '취소') continue;

    candidates.push({
      mfdsItemName: itemName,
      mfdsEngName: String(row['제품영문명'] || '').trim(),
      ingredient: String(row['주성분'] || '').trim(),
      ingredientEng: String(row['주성분영문'] || '').trim(),
      permitDate: parsePermitDate(row['허가일']),
      permitNo: String(row['허가번호'] || '').trim(),
      itemSeq: String(row['품목기준코드'] || '').trim(),
      companyName: String(row['업체명'] || '').trim(),
    });
  }

  console.log(`[MFDS Local] Loaded ${candidates.length} items from Excel`);
  return candidates;
}

/** Load and cache the full MFDS dataset */
export async function getMFDSData(): Promise<MFDSCandidate[]> {
  if (cachedData) return cachedData;
  if (!loadingPromise) {
    loadingPromise = loadFromExcel().then((data) => {
      cachedData = data;
      loadingPromise = null;
      return data;
    });
  }
  return loadingPromise;
}

// Korean dosage form suffixes to strip for flexible matching
const KOR_DOSAGE_FORMS = ['필름코팅정', '서방정', '장용정', '츄어블정', '분산정', '구강붕해정', '정', '주사액', '주사', '주', '캡슐', '시럽', '현탁액', '액', '산', '연고', '크림', '패치', '점안액', '점비액'];

/** Extract base product name by stripping Korean dosage forms */
function stripDosageForm(name: string): string {
  const upper = name.toUpperCase().trim();
  for (const form of KOR_DOSAGE_FORMS) {
    const formUpper = form.toUpperCase();
    if (upper.endsWith(formUpper) && upper.length > formUpper.length) {
      return upper.slice(0, -formUpper.length);
    }
  }
  return upper;
}

/** Search local MFDS data by product name (Korean or English) */
export async function searchLocal(query: string): Promise<MFDSCandidate[]> {
  const data = await getMFDSData();
  const q = query.toUpperCase().trim();
  if (!q) return [];

  const isKorean = /[\uAC00-\uD7AF]/.test(q);

  // First try exact substring match
  let results = data.filter((c) => {
    if (isKorean) {
      return c.mfdsItemName.toUpperCase().includes(q);
    } else {
      return (
        (c.mfdsEngName || '').toUpperCase().includes(q) ||
        c.mfdsItemName.toUpperCase().includes(q)
      );
    }
  });

  // If no results and Korean, try with dosage form stripped
  // e.g. "글리벡정" → "글리벡" to match "글리벡필름코팅정"
  if (results.length === 0 && isKorean) {
    const baseQ = stripDosageForm(q);
    if (baseQ !== q && baseQ.length >= 2) {
      results = data.filter((c) => c.mfdsItemName.toUpperCase().includes(baseQ));
    }
  }

  return results;
}

/** Search by ingredient name */
export async function searchByIngredient(query: string): Promise<MFDSCandidate[]> {
  const data = await getMFDSData();
  const q = query.toUpperCase().trim();
  if (!q) return [];
  return data.filter((c) => c.ingredient.toUpperCase().includes(q));
}
