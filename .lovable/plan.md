
# ALIMTA 제네릭 카운트 검증 및 수정 계획

## 문제 분석

현재 `computeAggregates`에서 제네릭 카운트가 부정확한 근본 원인:

1. **`ingredientEng` 필드가 비어있는 MFDS 레코드**: 일부 제네릭 제품의 `ingredientEng`(주성분영문) 필드가 비어있으면, `getIngredientGroupKey`가 한국어 성분명으로 폴백합니다. 한국어 성분명은 "페메트렉시드이나트륨염칠수화물"과 "페메트렉시드이나트륨" 등 형태가 달라 **별도 그룹으로 분리**되어 카운트에서 누락됩니다.

2. **한국어 성분명 정규화 부족**: 영문 성분명에는 salt form/hydration 제거 로직(`normalizeIngredientEng`)이 있지만, 한국어 성분명에는 "이나트륨염", "칠수화물", "이나트륨" 등 한국어 염형태 제거 로직이 없습니다.

## 해결 방안

### 1단계: 진단 테스트 작성
실제 MFDS 데이터(`public/data/mfds-data.xlsx`)를 로드하여 다음 제품들의 성분 그룹핑 상태를 확인하는 E2E 테스트 추가:
- **ALIMTA** (Pemetrexed) - 기존 문제 제품
- **GLIVEC** (Imatinib) - 다수 제네릭 존재
- **CIALIS** (Tadalafil) - 다수 제네릭 존재
- **기타 입력 파일 내 주요 제품**

테스트에서 각 성분 그룹키별로 실제 몇 개의 고유 제품명이 그룹핑되는지 출력하여 누락 여부를 확인합니다.

### 2단계: 한국어 성분명 정규화 함수 추가
`normalizeIngredientKor` 함수를 새로 만들어 한국어 염형태 및 수화물 접미사를 제거합니다:
- "이나트륨염칠수화물", "이나트륨염", "이나트륨", "일수화물", "이수화물" 등
- "염산염", "황산염", "메실산염", "말레산염" 등 한국어 pharma suffix

### 3단계: 이중 그룹핑 전략 (Cross-reference)
`computeAggregates`에서 동일 `itemSeq`를 가진 레코드 중 `ingredientEng`가 있는 것과 없는 것이 같은 성분이면 하나의 그룹으로 통합하는 로직 추가:
- 같은 MFDS 레코드 집합 내에서, `ingredientEng`가 있는 레코드의 정규화 키를 기준으로, `ingredientEng`가 없는 레코드도 한국어 성분명 매칭을 통해 동일 그룹에 병합

### 4단계: 다중 제품 E2E 검증
`e2e-pipeline.test.ts`에 ALIMTA, GLIVEC, CIALIS 등을 추가하여 실제 MFDS 데이터 기반으로 제네릭 카운트가 1보다 큰지(여러 제네릭이 존재하므로) 검증합니다.

---

## 기술 상세

### 수정 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/lib/drug-matcher.ts` | `normalizeIngredientKor` 함수 추가, `getIngredientGroupKey` 개선, `computeAggregates`에 cross-reference 그룹핑 |
| `src/lib/e2e-pipeline.test.ts` | ALIMTA, GLIVEC, CIALIS 등 실제 데이터 기반 제네릭 카운트 검증 추가 |
| `src/lib/generic-count-verify.test.ts` | 한국어 성분명 정규화 테스트 케이스 추가 |

### `computeAggregates` 개선 로직

```text
[기존] ingredientEng 있음 -> normalizeIngredientEng -> "PEMETREXED"
[기존] ingredientEng 없음 -> normalizeIngredient(한국어) -> "페메트렉시드이나트륨" (다른 키!)

[개선] 1차: 영문 성분명이 있는 레코드들로 그룹 생성
       2차: 영문 성분명이 없는 레코드는 한국어 성분명을 정규화 후,
            같은 한국어 원형을 가진 영문 그룹이 있으면 해당 그룹에 병합
       3차: 어디에도 속하지 않는 레코드는 한국어 키로 독립 그룹 유지
```

### 한국어 pharma suffix 제거 목록 (예시)

```text
"칠수화물", "육수화물", "오수화물", "사수화물", "삼수화물",
"이수화물", "일수화물", "수화물",
"이나트륨염", "일나트륨염", "나트륨염", "나트륨",
"염산염", "황산염", "메실산염", "말레산염", "푸마르산염",
"타르타르산염", "구연산염", "인산염", "질산염"
```

### 검증 기준
- ALIMTA(Pemetrexed): 제네릭 수 >= 5 (메인타, 알림시드, 페메드 등)
- GLIVEC(Imatinib): 제네릭 수 >= 10
- CIALIS(Tadalafil): 제네릭 수 >= 5
