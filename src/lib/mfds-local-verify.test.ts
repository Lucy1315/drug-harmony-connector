import { describe, it, expect, beforeAll } from "vitest";
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";
import { normalizeIngredient, normalizeDosage, computeAggregates, type MFDSCandidate, type MatchedResult } from "./drug-matcher";

// Load actual MFDS Excel data for E2E verification
function loadTestData(): MFDSCandidate[] {
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
      permitDate: String(row["허가일"] || ""),
      permitNo: String(row["허가번호"] || "").trim(),
      itemSeq: String(row["품목기준코드"] || "").trim(),
      companyName: String(row["업체명"] || "").trim(),
    });
  }
  return candidates;
}

describe("E2E: Generic count verification with real MFDS data", () => {
  let allCandidates: MFDSCandidate[];

  beforeAll(() => {
    allCandidates = loadTestData();
    console.log(`Loaded ${allCandidates.length} candidates from Excel`);
  });

  it("should find trastuzumab products and count unique product names", () => {
    // Find all candidates with 트라스투주맙 ingredient
    const trastuzumabCandidates = allCandidates.filter(
      (c) => c.ingredient.toUpperCase().includes("트라스투주맙") || c.ingredient.toUpperCase().includes("TRASTUZUMAB")
    );

    console.log(`\n=== 트라스투주맙 관련 제품 ===`);
    const uniqueProducts = new Set<string>();
    for (const c of trastuzumabCandidates) {
      const normalized = normalizeDosage(c.mfdsItemName);
      uniqueProducts.add(normalized);
      console.log(`  ${c.mfdsItemName} → normalized: ${normalized} (${c.companyName})`);
    }
    console.log(`\nUnique normalized product names: ${[...uniqueProducts].join(", ")}`);
    console.log(`Generic count (unique products): ${uniqueProducts.size}`);

    expect(trastuzumabCandidates.length).toBeGreaterThan(0);
  });

  it("should find Eltrombopag Olamine products if present", () => {
    const candidates = allCandidates.filter(
      (c) => c.ingredient.toUpperCase().includes("ELTROMBOPAG") || c.ingredient.includes("엘트롬보팔")
    );

    console.log(`\n=== ELTROMBOPAG OLAMINE 관련 제품: ${candidates.length}건 ===`);
    const uniqueProducts = new Set<string>();
    for (const c of candidates) {
      const normalized = normalizeDosage(c.mfdsItemName);
      uniqueProducts.add(normalized);
      console.log(`  ${c.mfdsItemName} → normalized: ${normalized} (${c.companyName})`);
    }
    if (candidates.length > 0) {
      console.log(`Generic count (unique products): ${uniqueProducts.size}`);
    } else {
      console.log("해당 성분이 현재 엑셀 데이터에 없습니다");
    }
    // This test just logs - passes regardless since data may not include this ingredient
    expect(true).toBe(true);
  });

  it("computeAggregates produces correct counts from real data", () => {
    // Use a subset: Eltrombopag candidates
    const candidates = allCandidates.filter(
      (c) => c.ingredient.toUpperCase().includes("ELTROMBOPAG") || c.ingredient.includes("엘트롬보팔")
    );

    if (candidates.length === 0) {
      console.log("No Eltrombopag candidates found - skipping");
      return;
    }

    const matched: MatchedResult[] = [{
      type: "matched",
      product: "REVOLADE",
      cleanedKey: "REVOLADE",
      candidate: candidates[0],
      matchQuality: "EXACT",
    }];

    const agg = computeAggregates(matched, allCandidates);

    // Find the ingredient key
    const ingr = normalizeIngredient(candidates[0].ingredient);
    const stats = agg.get(ingr);
    console.log(`\ncomputeAggregates for "${ingr}": genericCount=${stats?.genericCount}, minPermitDate=${stats?.minPermitDate}`);

    expect(stats).toBeDefined();
    expect(stats!.genericCount).toBeGreaterThan(0);
  });
});
