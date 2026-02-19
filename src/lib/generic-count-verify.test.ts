import { describe, it, expect } from "vitest";
import {
  normalizeIngredientEng,
  normalizeIngredientKor,
  getIngredientGroupKey,
  computeAggregates,
  type MatchedResult,
  type MFDSCandidate,
} from "./drug-matcher";

describe("normalizeIngredientEng", () => {
  it("strips salt forms and hydration from English ingredient names", () => {
    expect(normalizeIngredientEng("Pemetrexed Disodium Heptahydrate")).toBe("PEMETREXED");
    expect(normalizeIngredientEng("Pemetrexed Disodium")).toBe("PEMETREXED");
    expect(normalizeIngredientEng("Imatinib Mesylate")).toBe("IMATINIB");
    expect(normalizeIngredientEng("Tadalafil")).toBe("TADALAFIL");
    expect(normalizeIngredientEng("Erlotinib Hydrochloride")).toBe("ERLOTINIB");
    expect(normalizeIngredientEng("Sorafenib Tosylate")).toBe("SORAFENIB");
  });
});

describe("normalizeIngredientKor", () => {
  it("strips Korean salt forms and hydration suffixes", () => {
    expect(normalizeIngredientKor("페메트렉시드이나트륨염칠수화물")).toBe("페메트렉시드");
    expect(normalizeIngredientKor("페메트렉시드이나트륨")).toBe("페메트렉시드");
    expect(normalizeIngredientKor("페메트렉시드이나트륨염")).toBe("페메트렉시드");
    expect(normalizeIngredientKor("이마티닙메실산염")).toBe("이마티닙");
    expect(normalizeIngredientKor("타다라필")).toBe("타다라필");
    expect(normalizeIngredientKor("엘로티닙염산염")).toBe("엘로티닙");
  });
});

describe("getIngredientGroupKey", () => {
  it("returns normalized English key when ingredientEng is available", () => {
    expect(getIngredientGroupKey({ ingredient: "페메트렉시드이나트륨염칠수화물", ingredientEng: "Pemetrexed Disodium Heptahydrate" }))
      .toBe("PEMETREXED");
  });

  it("returns normalized Korean key when ingredientEng is missing", () => {
    // Now normalizeIngredientKor strips suffixes
    expect(getIngredientGroupKey({ ingredient: "페메트렉시드이나트륨염칠수화물", ingredientEng: "" }))
      .toBe("페메트렉시드");
    expect(getIngredientGroupKey({ ingredient: "페메트렉시드이나트륨", ingredientEng: "" }))
      .toBe("페메트렉시드");
  });
});

describe("computeAggregates with cross-reference grouping", () => {
  it("correctly groups Pemetrexed records with mixed eng/kor ingredients", () => {
    const candidates: MFDSCandidate[] = [
      { mfdsItemName: "알림타주100밀리그램", ingredient: "페메트렉시드이나트륨염칠수화물", ingredientEng: "Pemetrexed Disodium Heptahydrate", permitDate: "20060101", permitNo: "P1", itemSeq: "S1" },
      { mfdsItemName: "알림타주500밀리그램", ingredient: "페메트렉시드이나트륨염칠수화물", ingredientEng: "Pemetrexed Disodium Heptahydrate", permitDate: "20060101", permitNo: "P2", itemSeq: "S2" },
      { mfdsItemName: "메인타주100밀리그램", ingredient: "페메트렉시드이나트륨", ingredientEng: "Pemetrexed Disodium", permitDate: "20150101", permitNo: "P3", itemSeq: "S3" },
      // NO English ingredient
      { mfdsItemName: "알림시드주100밀리그램", ingredient: "페메트렉시드이나트륨염칠수화물", ingredientEng: "", permitDate: "20160101", permitNo: "P4", itemSeq: "S4" },
      { mfdsItemName: "페메드주500밀리그램", ingredient: "페메트렉시드이나트륨", ingredientEng: "", permitDate: "20170101", permitNo: "P5", itemSeq: "S5" },
      { mfdsItemName: "페메렉스주100밀리그램", ingredient: "페메트렉시드이나트륨염칠수화물", ingredientEng: "Pemetrexed Disodium Heptahydrate", permitDate: "20180101", permitNo: "P6", itemSeq: "S6" },
    ];

    const matchedResults: MatchedResult[] = [{
      type: 'matched', product: 'ALIMTA', cleanedKey: 'ALIMTA',
      candidate: candidates[0], matchQuality: 'EXACT',
    }];

    const aggregates = computeAggregates(matchedResults, candidates);
    const stats = aggregates.get("PEMETREXED");
    expect(stats).toBeDefined();
    // 알림타주(original, 2 dosages → 1 normalized name) + 메인타주 + 알림시드주 + 페메드주 + 페메렉스주 = 5, minus 1 original = 4 generics
    expect(stats!.genericCount).toBe(4);
  });
});
