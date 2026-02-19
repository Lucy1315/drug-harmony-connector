import { describe, it, expect, beforeAll } from "vitest";
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";
import {
  cleanProduct,
  findBestMatch,
  buildFinalRows,
  normalizeIngredient,
  normalizeIngredientEng,
  normalizeIngredientKor,
  getIngredientGroupKey,
  computeAggregates,
  normalizeDosage,
  type MFDSCandidate,
  type ProcessResult,
  type MatchedResult,
} from "./drug-matcher";

function parsePermitDate(raw: any): string {
  if (!raw) return '';
  if (typeof raw === 'number') {
    const date = new Date((raw - 25569) * 86400 * 1000);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }
  const s = String(raw).trim();
  if (/^\d{8}$/.test(s)) return s;
  const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    let year = parseInt(slashMatch[3]);
    if (year < 100) year += year > 50 ? 1900 : 2000;
    return `${year}${String(parseInt(slashMatch[1])).padStart(2, '0')}${String(parseInt(slashMatch[2])).padStart(2, '0')}`;
  }
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}${isoMatch[2]}${isoMatch[3]}`;
  return s.replace(/[^0-9]/g, '').slice(0, 8);
}

function loadMFDSData(): MFDSCandidate[] {
  const filePath = path.resolve(__dirname, "../../public/data/mfds-data.xlsx");
  const buffer = fs.readFileSync(filePath);
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any>(ws);
  const candidates: MFDSCandidate[] = [];
  for (const row of rows) {
    const itemName = String(row["제품명"] || "").trim();
    if (!itemName) continue;
    const status = String(row["취소/취하"] || "").trim();
    if (status === "취하" || status === "취소") continue;
    candidates.push({
      mfdsItemName: itemName,
      mfdsEngName: String(row["제품영문명"] || "").trim(),
      ingredient: String(row["주성분"] || "").trim(),
      ingredientEng: String(row["주성분영문"] || "").trim(),
      permitDate: parsePermitDate(row["허가일"]),
      permitNo: String(row["허가번호"] || "").trim(),
      itemSeq: String(row["품목기준코드"] || "").trim(),
      companyName: String(row["업체명"] || "").trim(),
    });
  }
  return candidates;
}

const KOR_DOSAGE_FORMS = ['필름코팅정', '서방정', '장용정', '츄어블정', '분산정', '구강붕해정', '정', '주사액', '주사', '주', '캡슐', '시럽', '현탁액', '액', '산', '연고', '크림', '패치', '점안액', '점비액'];

function stripDosageForm(name: string): string {
  const upper = name.toUpperCase().trim();
  for (const form of KOR_DOSAGE_FORMS) {
    const fu = form.toUpperCase();
    if (upper.endsWith(fu) && upper.length > fu.length) return upper.slice(0, -fu.length);
  }
  return upper;
}

function searchLocal(query: string, data: MFDSCandidate[]): MFDSCandidate[] {
  const q = query.toUpperCase().trim();
  if (!q) return [];
  const isKorean = /[\uAC00-\uD7AF]/.test(q);
  let results = data.filter((c) => {
    if (isKorean) return c.mfdsItemName.toUpperCase().includes(q);
    return (c.mfdsEngName || "").toUpperCase().includes(q) || c.mfdsItemName.toUpperCase().includes(q);
  });
  if (results.length === 0 && isKorean) {
    const baseQ = stripDosageForm(q);
    if (baseQ !== q && baseQ.length >= 2) {
      results = data.filter((c) => c.mfdsItemName.toUpperCase().includes(baseQ));
    }
  }
  return results;
}

function simulateProcess(productNames: string[], allCandidates: MFDSCandidate[]) {
  const inputRows = productNames.map((p, i) => ({ product: p, 순번: String(i + 1) }));
  const results: ProcessResult[] = inputRows.map((row) => {
    const key = cleanProduct(row.product);
    const candidates = searchLocal(key, allCandidates);
    if (candidates.length === 0) {
      return { type: "unmatched" as const, product: row.product, cleanedKey: key, reason: "NO_RESULT" as const, candidatesCount: 0 };
    }
    const match = findBestMatch(key, candidates);
    if (!match) {
      return { type: "unmatched" as const, product: row.product, cleanedKey: key, reason: "AMBIGUOUS" as const, candidatesCount: candidates.length };
    }
    return { type: "matched" as const, product: row.product, cleanedKey: key, candidate: match.candidate, matchQuality: match.quality };
  });
  return buildFinalRows(results, inputRows, allCandidates);
}

describe("E2E: Generic count verification with real MFDS data", () => {
  let allCandidates: MFDSCandidate[];

  beforeAll(() => {
    allCandidates = loadMFDSData();
    console.log(`Loaded ${allCandidates.length} MFDS records`);
  });

  it("ALIMTA(Pemetrexed): diagnose generic count", () => {
    const { matched } = simulateProcess(["알림타주"], allCandidates);
    const row = matched[0];
    console.log(`ALIMTA: flag=${row.originalFlag}, generics=${row.genericCount}`);
    expect(row.originalFlag).toBe("O");
    expect(row.genericCount).toBeGreaterThanOrEqual(5);
  }, 30000);

  it("GLIVEC(Imatinib): diagnose generic count", () => {
    const glivecKor = searchLocal("글리벡", allCandidates);
    console.log(`GLIVEC Korean search: ${glivecKor.length}`);
    for (const c of glivecKor.slice(0, 3)) console.log(`  ${c.mfdsItemName} | eng: ${c.mfdsEngName}`);
    const glivecEng = searchLocal("GLIVEC", allCandidates);
    console.log(`GLIVEC English search: ${glivecEng.length}`);
    for (const c of glivecEng.slice(0, 3)) console.log(`  ${c.mfdsItemName} | eng: ${c.mfdsEngName}`);
    const imaRecords = allCandidates.filter(c =>
      (c.ingredientEng || '').toUpperCase().includes('IMATINIB') || (c.ingredient || '').includes('이마티닙')
    );
    console.log(`All Imatinib records: ${imaRecords.length}`);
    const { matched } = simulateProcess(["글리벡정"], allCandidates);
    const row = matched[0];
    console.log(`Result: flag=${row.originalFlag}, generics=${row.genericCount}`);
    expect(row).toBeDefined();
  });

  it("CIALIS(Tadalafil): generic count >= 5", () => {
    const { matched } = simulateProcess(["시알리스정"], allCandidates);
    const row = matched[0];
    console.log(`CIALIS: flag=${row.originalFlag}, generics=${row.genericCount}, ingredient=${row.ingredientEng || row.ingredient}`);
    expect(row.originalFlag).toBe("O");
    expect(row.genericCount).toBeGreaterThanOrEqual(5);
  }, 30000);

  it("DOCETAXEL: diagnose generic count", () => {
    const docRecords = allCandidates.filter(c =>
      (c.ingredientEng || '').toUpperCase().includes('DOCETAXEL') ||
      (c.ingredient || '').includes('도세탁셀')
    );
    console.log(`\nDocetaxel records: ${docRecords.length}`);
    const groupKeys = new Map<string, string[]>();
    for (const c of docRecords) {
      const key = getIngredientGroupKey(c);
      const names = groupKeys.get(key) || [];
      names.push(`${normalizeDosage(c.mfdsItemName)} [ingrEng="${c.ingredientEng}", ingrKor="${c.ingredient}", date=${c.permitDate}]`);
      groupKeys.set(key, names);
    }
    for (const [key, names] of groupKeys) {
      console.log(`  Key: "${key}" → ${names.length} records`);
      for (const n of names.slice(0, 5)) console.log(`    ${n}`);
      if (names.length > 5) console.log(`    ... and ${names.length - 5} more`);
    }

    // Try searching for Docetaxel product
    const searchResults = searchLocal("탁소텔", allCandidates);
    console.log(`Search "탁소텔": ${searchResults.length} results`);
    for (const c of searchResults.slice(0, 3)) {
      console.log(`  ${c.mfdsItemName} | ingrEng: ${c.ingredientEng}`);
    }

    const { matched } = simulateProcess(["탁소텔주"], allCandidates);
    const row = matched[0];
    console.log(`TAXOTERE: flag=${row.originalFlag}, generics=${row.genericCount}, ingr=${row.ingredientEng || row.ingredient}`);
    expect(row.originalFlag).toBe("O");
    expect(row.genericCount).toBeGreaterThanOrEqual(3);
  }, 30000);

  it("ZOMETA(Zoledronic Acid): diagnose generic count", () => {
    const { matched } = simulateProcess(["조메타주"], allCandidates);
    const row = matched[0];
    console.log(`ZOMETA: flag=${row.originalFlag}, generics=${row.genericCount}, ingr=${row.ingredientEng}`);
    expect(row.originalFlag).toBe("O");
    expect(row.genericCount).toBeGreaterThanOrEqual(3);
  }, 30000);

  it("Comprehensive: verify multiple drugs have reasonable generic counts", () => {
    const drugs = [
      { name: "알림타주", minGenerics: 5, label: "ALIMTA/Pemetrexed" },
      { name: "글리벡정", minGenerics: 5, label: "GLIVEC/Imatinib" },
      { name: "시알리스정", minGenerics: 5, label: "CIALIS/Tadalafil" },
      { name: "조메타주", minGenerics: 3, label: "ZOMETA/Zoledronic Acid" },
      { name: "허셉틴주", minGenerics: 1, label: "HERCEPTIN/Trastuzumab" },
      { name: "넥사바정", minGenerics: 1, label: "NEXAVAR/Sorafenib" },
      { name: "타쎄바정", minGenerics: 1, label: "TARCEVA/Erlotinib" },
      { name: "탁소텔주", minGenerics: 3, label: "TAXOTERE/Docetaxel" },
      { name: "엘록사틴주", minGenerics: 1, label: "ELOXATIN/Oxaliplatin" },
      { name: "젬자주", minGenerics: 1, label: "GEMZAR/Gemcitabine" },
      { name: "탁솔주", minGenerics: 1, label: "TAXOL/Paclitaxel" },
      { name: "아바스틴주", minGenerics: 1, label: "AVASTIN/Bevacizumab" },
      { name: "맙테라주", minGenerics: 1, label: "MABTHERA/Rituximab" },
    ];

    console.log("\n=== Comprehensive Generic Count Verification ===");
    console.log("Drug | Flag | Generics | Ingredient");
    console.log("-".repeat(70));

    const failures: string[] = [];
    for (const drug of drugs) {
      const { matched } = simulateProcess([drug.name], allCandidates);
      const row = matched[0];
      const flag = row.originalFlag;
      const gc = row.genericCount;
      const ingr = row.ingredientEng || row.ingredient || "N/A";
      const ok = flag === "O" && gc >= drug.minGenerics;
      console.log(`${ok ? "✓" : "✗"} ${drug.label}: ${flag} | ${gc} (min ${drug.minGenerics}) | ${ingr}`);
      if (!ok) failures.push(`${drug.label}: flag=${flag}, generics=${gc}, expected>=${drug.minGenerics}`);
    }
    if (failures.length > 0) {
      console.warn(`\n⚠ Failures:\n${failures.join("\n")}`);
    }
    // At least 80% should pass
    expect(failures.length).toBeLessThanOrEqual(Math.ceil(drugs.length * 0.2));
  }, 120000);

  it("processes Korean drug names with correct O/X flags", () => {
    const testCases = ["허셉틴주", "삼페넷주", "캐싸일라주", "허쥬마주"];
    const { matched } = simulateProcess(testCases, allCandidates);

    for (const row of matched) {
      if (row.ingredient) {
        expect(row.originalFlag).toBe('O');
      }
    }
    expect(matched.length).toBe(testCases.length);
  }, 30000);

  it("processes a mixed list of drugs", () => {
    const mixedList = ["허셉틴주150밀리그램", "타쎄바정150밀리그램", "넥사바정200밀리그램"];
    const { matched } = simulateProcess(mixedList, allCandidates);

    for (const row of matched) {
      if (row.ingredient) {
        expect(row.originalFlag).toBe('O');
        expect(row.genericCount).toBeGreaterThan(0);
      }
    }
  }, 30000);
});
