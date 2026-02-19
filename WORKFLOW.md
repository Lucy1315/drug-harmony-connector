# 한국 식약처 의약품 품목허가 현황 분석 — 워크플로우

## 개요

사용자가 업로드한 약품 목록(엑셀/CSV)을 식약처(MFDS) 허가 데이터베이스와 대조하여,
각 제품의 **오리지널 허가 여부**, **제네릭 수**, **영문 성분명**을 자동 산출합니다.

---

## 전체 처리 흐름

```
┌─────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌────────────┐
│ 1. 파일 업로드 │ → │ 2. 영문 번역  │ → │ 3. 번역 검토  │ → │ 4. MFDS 매칭  │ → │ 5. 결과 출력 │
│  (엑셀/CSV)  │    │ (영문→한글)   │    │ (사용자 확인) │    │  & 집계 계산  │    │ (테이블/엑셀)│
└─────────────┘    └──────────────┘    └──────────────┘    └──────────────┘    └────────────┘
```

---

## 단계별 상세

### 1단계: 파일 업로드 (`FileUpload.tsx`)

| 항목 | 설명 |
|------|------|
| **입력** | `.xlsx`, `.xls`, `.csv` 파일 |
| **헤더 인식** | `Product`, `제품명`, `item_name` 컬럼 자동 감지 (없으면 첫 번째 컬럼) |
| **순번 컬럼** | `순번`, `seq`, `no` 컬럼 자동 감지 (선택사항) |
| **출력** | `InputRow[]` — `{ product: string, 순번?: string }` |

### 2단계: 제품명 정규화 및 영문 감지 (`process-engine.ts`)

| 항목 | 설명 |
|------|------|
| **정규화** | `cleanProduct()` — 대문자 변환, 특수 토큰 제거(`P5V>>`, `EUP>>` 등), `.`→공백 |
| **중복 제거** | 정규화된 키 기준으로 고유값 추출 |
| **영문 감지** | 한글(유니코드 AC00-D7AF) 미포함 시 영문으로 판별 |
| **번역** | 영문 키가 있으면 AI 번역 Edge Function 호출 (`translate-drug-names`) |

### 3단계: 번역 검토 (`TranslationReview.tsx`)

| 항목 | 설명 |
|------|------|
| **조건** | 영문 제품명이 1개 이상일 때만 표시 |
| **UI** | 영문 원문 ↔ 한글 번역 결과를 테이블로 표시, 사용자가 수정 가능 |
| **확인** | 사용자가 "확인" 클릭 시 확정된 번역 맵으로 다음 단계 진행 |
| **취소** | 사용자가 "취소" 클릭 시 초기 상태로 복귀 |

### 4단계: MFDS 매칭 및 집계 (`process-engine.ts`, `drug-matcher.ts`, `mfds-local.ts`)

#### 4-1. 참조 데이터 로딩 (`mfds-local.ts`)
- `public/data/mfds-data.xlsx` 파일에서 MFDS 허가 데이터 파싱
- **제외 항목**: `취소/취하` 상태인 품목은 제외
- **신약구분 필드**: `findNewDrugField()` — "신약구분", "신약 구분", "NEW_DRUG" 등 컬럼명을 동적 감지, 값이 `Y`이면 `isNewDrug = true`
- **캐싱**: 최초 1회만 로딩 후 메모리 캐시 사용
- **필드 매핑**: `제품명`, `제품영문명`, `주성분`, `주성분영문`, `허가일`, `허가번호`, `품목기준코드`, `업체명`, `신약구분(isNewDrug)`

#### 4-2. 검색 (`mfds-local.ts: searchLocal()`)
- **한글 검색**: `mfdsItemName`에 포함 여부 (대소문자 무시)
- **영문 검색**: `mfdsEngName` 또는 `mfdsItemName`에 포함 여부
- **제형 제거 fallback**: 한글 검색 결과가 없을 때, 제형 접미사(`정`, `주`, `캡슐` 등)를 제거 후 재검색

#### 4-3. 최적 매칭 (`drug-matcher.ts: findBestMatch()`)
| 우선순위 | 조건 | 매칭 품질 |
|---------|------|-----------|
| 1 | 한글: 정규화된 제품명 완전 일치 | EXACT |
| 2 | 영문: 영문명 완전 일치 | EXACT |
| 3 | 영문: 영문명 부분 일치 | EXACT |
| 4 | 후보 중 허가일 가장 빠른 것 | FUZZY |

#### 4-4. 성분명 정규화 (`drug-matcher.ts`)

**영문 성분명 정규화** (`normalizeIngredientEng`):
- 괄호 내용 제거
- 용량/단위 제거
- 영문 pharma suffix 제거: `HEPTAHYDRATE`, `DISODIUM`, `HYDROCHLORIDE`, `MESYLATE`, `ANHYDROUS`, `MICRONIZED` 등 (50+종)
- 대문자 변환 후 공백 정리

**한국어 성분명 정규화** (`normalizeIngredientKor`):
- 괄호 내용 제거
- 용량/단위 제거 (밀리그램, mg 등)
- 한국어 pharma suffix 제거: `칠수화물`, `이나트륨염`, `염산염`, `무수물` 등 (40+종)
- 예: `페메트렉시드이나트륨염칠수화물` → `페메트렉시드`

**성분 그룹키 결정** (`getIngredientGroupKey`):
- 영문 성분명 우선 → `normalizeIngredientEng` 적용
- 영문 없으면 → `normalizeIngredientKor` 적용

#### 4-5. 이중 그룹핑 (Cross-reference) (`computeAggregates`)

일부 MFDS 레코드는 `ingredientEng`(주성분영문)이 비어있어 한국어 성분명으로 폴백됩니다.
동일 성분인데 별도 그룹으로 분리되는 문제를 방지하기 위해 **이중 그룹핑 전략**을 사용합니다:

```
1차: 영문+한국어 모두 있는 레코드에서 [정규화 한국어 → 영문 그룹키] 매핑 테이블 구축
2차: 영문 없는 레코드의 정규화 한국어가 매핑 테이블에 있으면 해당 영문 그룹에 병합
3차: 어디에도 속하지 않는 레코드는 한국어 키로 독립 그룹 유지
```

#### 4-6. 제네릭 수 산출 로직 (`computeAggregates`)

1. 전체 MFDS 데이터를 `itemSeq`(품목기준코드) 기준으로 중복 제거
2. 정규화된 성분명별로 그룹핑 (이중 그룹핑 적용)
3. 각 그룹 내에서 제품명을 용량 무관하게 정규화(`normalizeDosage`) → 고유 제품명 목록 산출
4. 각 제품명의 최초 허가일 추적
5. **오리지널 제품 판별** (우선순위):
   - **1순위**: `신약구분` 필드가 `Y`인 제품(들) → 오리지널로 분류
   - **2순위 (fallback)**: 해당 성분 그룹에 `신약구분=Y` 제품이 없으면, 최초 허가일 기준으로 오리지널 판별
6. **제네릭 수** = 고유 제품명 수 − 오리지널 제품 수

> **예시**: 페메트렉시드 성분에 알림타(신약구분=Y), 알지크(N), 페메드(N) 등 → 오리지널 1개(알림타), 나머지는 제네릭

### 5단계: 결과 출력 (`buildFinalRows()`, `ResultsTable.tsx`, `Index.tsx`)

#### 최종 출력 테이블 (엑셀 다운로드 포함)

| 열 | 헤더 | 설명 |
|----|------|------|
| **A** | 제품명 | 사용자가 업로드한 원본 제품명 (그대로 표시) |
| **B** | 식약처 오리지널 품목허가 | `O` = 매칭된 제품 자체가 `신약구분=Y`인 오리지널 의약품 / `X` = 오리지널이 아니거나 매칭 실패 |
| **C** | 제네릭 수 (개) | 오리지널을 제외한 고유 제품명 수 (용량 무관) |
| **D** | 성분명 | 영문 성분명 (`주성분영문` 필드 우선) |
| **E** | MFDS 제품명 | 동일 성분의 모든 등록 제품명 목록 (오리지널 제품은 "오리지널" 배지로 표시) |
| **F** | 순번 | 입력 파일의 순번 (있는 경우) |

#### 오리지널 판별 기준 (`buildFinalRows`)
- **열 B (`originalFlag`)**: 매칭된 MFDS 제품 자체의 `신약구분` 필드가 `Y`이면 `O`, 아니면 `X`
  - 예: 알림타주500mg(신약구분=Y) → `O`, 알지크주사(신약구분=N) → `X`
- **열 E (MFDS 제품명 목록)**: 동일 성분 그룹 내 `신약구분=Y` 제품에 "오리지널" 배지 표시
- **Fallback**: 성분 그룹에 `신약구분=Y` 제품이 없으면, 최초 허가일 기준으로 오리지널 판별

#### 매칭 실패 탭
| 사유 코드 | 설명 |
|-----------|------|
| `NO_RESULT` | 한글 검색 결과 없음 |
| `NO_RESULT_ENG` | 영문 검색 결과 없음 |
| `AMBIGUOUS` | 후보가 있으나 최적 매칭 불가 |

---

## 파일 구조

```
src/
├── pages/Index.tsx            # 메인 UI (업로드 → 분석 → 결과 표시)
├── components/
│   ├── FileUpload.tsx          # 엑셀/CSV 업로드 컴포넌트
│   ├── ResultsTable.tsx        # 매칭 결과 테이블 (A~F열)
│   ├── UnmatchedSection.tsx    # 매칭 실패 목록 + 수동 매칭
│   ├── TranslationReview.tsx   # 영문→한글 번역 검토 UI
│   ├── ManualMatchDialog.tsx   # 수동 매칭 다이얼로그
│   └── ProgressBar.tsx         # 진행률 표시
├── lib/
│   ├── drug-matcher.ts         # 정규화, 매칭, 집계 로직
│   │   ├── cleanProduct()           # 제품명 정규화
│   │   ├── normalizeDosage()        # 용량/단위 제거
│   │   ├── normalizeIngredientEng() # 영문 성분명 정규화 (salt/hydrate 제거)
│   │   ├── normalizeIngredientKor() # 한국어 성분명 정규화 (염형태/수화물 제거)
│   │   ├── getIngredientGroupKey()  # 성분 그룹키 (영문 우선, 한국어 fallback)
│   │   ├── findBestMatch()          # 최적 후보 매칭
│   │   ├── computeAggregates()      # 제네릭 수 산출 (이중 그룹핑 + 신약구분)
│   │   └── buildFinalRows()         # 최종 출력 행 생성
│   ├── process-engine.ts       # 처리 파이프라인 (번역 + 검색 + 매칭)
│   │   ├── translateEngToKor()      # 영문→한글 AI 번역
│   │   ├── getUniqueKeys()          # 고유 키 추출 + 영문 분류
│   │   └── processProducts()        # 전체 처리 오케스트레이션
│   └── mfds-local.ts           # MFDS 엑셀 데이터 로더/검색
│       ├── getMFDSData()            # 데이터 로딩 + 캐싱
│       ├── searchLocal()            # 제품명 기반 검색 (제형 제거 fallback 포함)
│       ├── searchByIngredient()     # 성분명 기반 검색
│       └── findNewDrugField()       # 신약구분 컬럼 동적 감지
public/
└── data/mfds-data.xlsx         # MFDS 허가 데이터 (참조 DB, 신약구분 컬럼 포함)
supabase/functions/
├── translate-drug-names/       # 영문→한글 AI 번역 Edge Function
└── mfds-proxy/                 # (레거시) MFDS API 프록시
```

---

## 핵심 데이터 구조

### MFDSCandidate (MFDS 허가 품목 1건)
```typescript
interface MFDSCandidate {
  mfdsItemName: string;      // 제품명 (한글)
  mfdsEngName?: string;      // 제품영문명
  ingredient: string;        // 주성분 (한글)
  ingredientEng?: string;    // 주성분영문
  permitDate: string;        // 허가일 (YYYYMMDD)
  permitNo: string;          // 허가번호
  itemSeq: string;           // 품목기준코드 (고유 식별자)
  companyName?: string;      // 업체명
  isNewDrug?: boolean;       // 신약구분 ('Y' = 오리지널 의약품)
}
```

### FinalRow (최종 출력 행)
```typescript
interface FinalRow {
  product: string;           // 원본 제품명
  originalFlag: string;      // "O" 또는 "X"
  genericCount: number;      // 제네릭 수
  ingredient: string;        // 주성분 (한글)
  ingredientEng?: string;    // 주성분 (영문)
  mfdsItemName: string;      // 동일 성분 MFDS 등록 제품명 전체
  originalMfdsNames?: string[]; // 오리지널 제품명 목록
  순번: string;
  matchQuality?: MatchQuality;
}
```

---

## UI 상태 흐름 (AppPhase)

```
idle → loading-data → translating → review → processing → done
                         │                        ↑
                         └── (한글만일 때 건너뜀) ──┘
```

| Phase | 화면 표시 |
|-------|----------|
| `idle` | 파일 업로드 안내 |
| `loading-data` | MFDS 데이터 로딩 스피너 |
| `translating` | 영문 번역 진행 스피너 |
| `review` | 번역 결과 검토 테이블 |
| `processing` | 매칭 진행률 바 |
| `done` | 요약 카드 + 결과 테이블 + 엑셀 다운로드 |
