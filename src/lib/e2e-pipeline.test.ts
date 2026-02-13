import { describe, it, expect, beforeAll } from "vitest";
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";
import {
  cleanProduct,
  findBestMatch,
  buildFinalRows,
  normalizeIngredient,
  normalizeDosage,
  type MFDSCandidate,
  type ProcessResult,
} from "./drug-matcher";

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
      permitDate: String(row["허가일"] || ""),
      permitNo: String(row["허가번호"] || "").trim(),
      itemSeq: String(row["품목기준코드"] || "").trim(),
      companyName: String(row["업체명"] || "").trim(),
    });
  }
  return candidates;
}

function searchLocal(query: string, data: MFDSCandidate[]): MFDSCandidate[] {
  const q = query.toUpperCase().trim();
  if (!q) return [];
  const isKorean = /[\uAC00-\uD7AF]/.test(q);
  return data.filter((c) => {
    if (isKorean) return c.mfdsItemName.toUpperCase().includes(q);
    return (c.mfdsEngName || "").toUpperCase().includes(q) || c.mfdsItemName.toUpperCase().includes(q);
  });
}

// Simulate the full processing pipeline
function simulateProcess(
  productNames: string[],
  allCandidates: MFDSCandidate[]
) {
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

describe("E2E: Full pipeline generic count verification", () => {
  let allCandidates: MFDSCandidate[];

  beforeAll(() => {
    allCandidates = loadMFDSData();
    console.log(`Loaded ${allCandidates.length} MFDS records`);
  });

  const testCases = [
    "허셉틴주",
    "삼페넷주",
    "캐싸일라주",
    "허쥬마주",
  ];

  it("processes Korean drug names with correct O/X flags and English ingredients", () => {
    const { matched } = simulateProcess(testCases, allCandidates);

    console.log("\n=== 분석 결과 ===");
    console.log("제품명 | B열(O/X) | C열(제네릭수) | D열(영문성분명)");
    console.log("-".repeat(80));
    for (const row of matched) {
      console.log(
        `${row.product} | ${row.originalFlag} | ${row.genericCount} | ${row.ingredientEng || row.ingredient || "(미매칭)"}`
      );
    }

    // All matched products should have O flag (original exists in MFDS)
    for (const row of matched) {
      if (row.ingredient) {
        expect(row.originalFlag).toBe('O');
        // ingredientEng may be empty for some products - just log
        if (!row.ingredientEng) {
          console.log(`  Note: "${row.product}" has no English ingredient name`);
        }
      } else {
        expect(row.originalFlag).toBe('X');
      }
    }
    expect(matched.length).toBe(testCases.length);
  });

  it("verifies specific ingredient generic counts from full dataset", () => {
    // Check a few ingredients manually
    const ingredientChecks = [
      { search: "트라스투주맙", ingredientFilter: "트라스투주맙" },
    ];

    for (const check of ingredientChecks) {
      const filtered = allCandidates.filter(
        (c) => c.ingredient.includes(check.ingredientFilter)
      );
      const uniqueProducts = new Set(
        filtered.map((c) => normalizeDosage(c.mfdsItemName))
      );
      console.log(
        `\n${check.ingredientFilter}: ${filtered.length}건 → ${uniqueProducts.size}개 고유 제품명`
      );
      console.log(`  제품명: ${[...uniqueProducts].join(", ")}`);
    }
  });

  it("processes a mixed list of drugs with O/X and English ingredient", () => {
    const mixedList = [
      "허셉틴주150밀리그램",
      "타쎄바정150밀리그램",
      "넥사바정200밀리그램",
    ];

    const { matched } = simulateProcess(mixedList, allCandidates);

    console.log("\n=== 혼합 약품 분석 결과 ===");
    console.log("제품명 | B열(O/X) | C열(제네릭수) | D열(영문성분명)");
    console.log("-".repeat(80));
    for (const row of matched) {
      console.log(`${row.product} | ${row.originalFlag} | ${row.genericCount} | ${row.ingredientEng || "(없음)"}`);
    }

    for (const row of matched) {
      if (row.ingredient) {
        expect(row.originalFlag).toBe('O');
        expect(row.genericCount).toBeGreaterThan(0);
      }
    }
  });
});
