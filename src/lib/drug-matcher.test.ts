import { describe, it, expect } from "vitest";
import { normalizeIngredient } from "./drug-matcher";

describe("normalizeIngredient", () => {
  it("removes mg dosage", () => {
    expect(normalizeIngredient("에타너셉트 25mg")).toBe("에타너셉트");
    expect(normalizeIngredient("Etanercept 50mg")).toBe("ETANERCEPT");
  });

  it("removes mL dosage", () => {
    expect(normalizeIngredient("아달리무맙 40mg/0.8mL")).toBe("아달리무맙");
  });

  it("removes 밀리그램 (Korean unit)", () => {
    expect(normalizeIngredient("에타너셉트 25밀리그램")).toBe("에타너셉트");
  });

  it("removes g dosage", () => {
    expect(normalizeIngredient("아목시실린 500g")).toBe("아목시실린");
  });

  it("removes % dosage", () => {
    expect(normalizeIngredient("포비돈요오드 10%")).toBe("포비돈요오드");
  });

  it("removes mcg/ug dosage", () => {
    expect(normalizeIngredient("플루티카손 250mcg")).toBe("플루티카손");
    expect(normalizeIngredient("플루티카손 250ug")).toBe("플루티카손");
  });

  it("removes IU dosage", () => {
    expect(normalizeIngredient("인슐린 100IU")).toBe("인슐린");
  });

  it("removes 국제단위 (Korean IU)", () => {
    expect(normalizeIngredient("인슐린 100국제단위")).toBe("인슐린");
  });

  it("removes 마이크로그램", () => {
    expect(normalizeIngredient("플루티카손 250마이크로그램")).toBe("플루티카손");
  });

  it("removes parenthetical content", () => {
    expect(normalizeIngredient("에타너셉트(유전자재조합) 25mg")).toBe("에타너셉트");
  });

  it("removes compound dosage like 50mg/mL", () => {
    expect(normalizeIngredient("토실리주맙 20mg/mL")).toBe("토실리주맙");
  });

  it("groups same ingredient with different dosages to same key", () => {
    const a = normalizeIngredient("에타너셉트 25mg");
    const b = normalizeIngredient("에타너셉트 50mg");
    const c = normalizeIngredient("에타너셉트 25밀리그램");
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("handles plain ingredient without dosage", () => {
    expect(normalizeIngredient("아달리무맙")).toBe("아달리무맙");
    expect(normalizeIngredient("Adalimumab")).toBe("ADALIMUMAB");
  });

  it("handles empty string", () => {
    expect(normalizeIngredient("")).toBe("");
  });
});
