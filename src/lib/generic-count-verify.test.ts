import { describe, it, expect } from 'vitest';
import {
  normalizeIngredientEng,
  normalizeDosage,
  getIngredientGroupKey,
  computeAggregates,
  type MFDSCandidate,
  type MatchedResult,
} from './drug-matcher';

describe('normalizeIngredientEng', () => {
  it('strips salt forms and hydration from Pemetrexed variants', () => {
    expect(normalizeIngredientEng('Pemetrexed Disodium Heptahydrate')).toBe('PEMETREXED');
    expect(normalizeIngredientEng('Pemetrexed Disodium')).toBe('PEMETREXED');
    expect(normalizeIngredientEng('pemetrexed disodium heptahydrate 100mg')).toBe('PEMETREXED');
  });

  it('strips common salt forms', () => {
    expect(normalizeIngredientEng('Imatinib Mesylate')).toBe('IMATINIB');
    expect(normalizeIngredientEng('Amlodipine Besylate')).toBe('AMLODIPINE');
    expect(normalizeIngredientEng('Valganciclovir Hydrochloride')).toBe('VALGANCICLOVIR');
  });
});

describe('getIngredientGroupKey prefers English', () => {
  it('uses English ingredient when available', () => {
    const c = { ingredient: '페메트렉시드이나트륨염칠수화물', ingredientEng: 'Pemetrexed Disodium Heptahydrate' };
    expect(getIngredientGroupKey(c)).toBe('PEMETREXED');
  });

  it('falls back to Korean when English is empty', () => {
    const c = { ingredient: '페메트렉시드이나트륨염칠수화물', ingredientEng: '' };
    expect(getIngredientGroupKey(c)).toBe('페메트렉시드이나트륨염칠수화물'.toUpperCase());
  });
});

describe('computeAggregates counts generics correctly for Pemetrexed', () => {
  it('counts multiple generics with same normalized English ingredient', () => {
    // Simulate MFDS data: 1 original (알림타) + 3 generics (메인타, 알림시드, 페메드)
    const allCandidates: MFDSCandidate[] = [
      // Original: 알림타주 (earliest permit date)
      {
        mfdsItemName: '알림타주100밀리그램(페메트렉시드이나트륨염칠수화물)',
        mfdsEngName: 'Alimta Inj.',
        ingredient: '페메트렉시드이나트륨염칠수화물 100밀리그램',
        ingredientEng: 'Pemetrexed Disodium Heptahydrate 100mg',
        permitDate: '20060101',
        permitNo: 'P001',
        itemSeq: 'SEQ001',
      },
      {
        mfdsItemName: '알림타주500밀리그램(페메트렉시드이나트륨염칠수화물)',
        mfdsEngName: 'Alimta Inj.',
        ingredient: '페메트렉시드이나트륨염칠수화물 500밀리그램',
        ingredientEng: 'Pemetrexed Disodium Heptahydrate 500mg',
        permitDate: '20060101',
        permitNo: 'P002',
        itemSeq: 'SEQ002',
      },
      {
        mfdsItemName: '알림타액상주25밀리그램/밀리리터(페메트렉시드이나트륨염칠수화물)',
        mfdsEngName: 'Alimta Liquid Inj.',
        ingredient: '페메트렉시드이나트륨염칠수화물',
        ingredientEng: 'Pemetrexed Disodium Heptahydrate',
        permitDate: '20200101',
        permitNo: 'P003',
        itemSeq: 'SEQ003',
      },
      // Generic 1: 메인타주 (different company, later date)
      {
        mfdsItemName: '메인타주100밀리그램(페메트렉시드이나트륨)',
        ingredient: '페메트렉시드이나트륨 100밀리그램',
        ingredientEng: 'Pemetrexed Disodium 100mg',
        permitDate: '20150601',
        permitNo: 'P010',
        itemSeq: 'SEQ010',
      },
      {
        mfdsItemName: '메인타주500밀리그램(페메트렉시드이나트륨)',
        ingredient: '페메트렉시드이나트륨 500밀리그램',
        ingredientEng: 'Pemetrexed Disodium 500mg',
        permitDate: '20150601',
        permitNo: 'P011',
        itemSeq: 'SEQ011',
      },
      // Generic 2: 알림시드주
      {
        mfdsItemName: '알림시드주100밀리그램(페메트렉시드이나트륨)',
        ingredient: '페메트렉시드이나트륨 100밀리그램',
        ingredientEng: 'Pemetrexed Disodium 100mg',
        permitDate: '20160301',
        permitNo: 'P020',
        itemSeq: 'SEQ020',
      },
      // Generic 3: 페메드주
      {
        mfdsItemName: '페메드주100밀리그램(페메트렉시드이나트륨)',
        ingredient: '페메트렉시드이나트륨 100밀리그램',
        ingredientEng: 'Pemetrexed Disodium 100mg',
        permitDate: '20170801',
        permitNo: 'P030',
        itemSeq: 'SEQ030',
      },
    ];

    const matched: MatchedResult[] = [{
      type: 'matched',
      product: 'ALIMTA',
      cleanedKey: 'ALIMTA',
      candidate: allCandidates[0],
      matchQuality: 'EXACT',
    }];

    const aggregates = computeAggregates(matched, allCandidates);

    // All should be under "PEMETREXED" key
    const key = getIngredientGroupKey(allCandidates[0]);
    expect(key).toBe('PEMETREXED');

    const stats = aggregates.get('PEMETREXED');
    expect(stats).toBeDefined();

    // Unique normalized product names:
    // 알림타주 (original - earliest date 20060101)
    // 알림타액상주 (same date? no, 20200101 - so generic)
    // 메인타주 (generic)
    // 알림시드주 (generic)
    // 페메드주 (generic)
    // Total unique names after normalizeDosage: 5 - 
    // Original (earliest date 20060101): 알림타주 → 1 original
    // Generics: 알림타액상주, 메인타주, 알림시드주, 페메드주 → 4 generics
    expect(stats!.genericCount).toBe(4);
    expect(stats!.minPermitDate).toBe('20060101');
  });
});
