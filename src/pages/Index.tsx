import { useState, useCallback } from 'react';
import { Pill, Loader2, Download, Key, Eye, EyeOff, FileText, AlertTriangle, CheckCircle2, Beaker, Layers, Languages } from 'lucide-react';
import * as XLSX from 'xlsx';
import FileUpload, { type InputRow } from '@/components/FileUpload';
import ResultsTable from '@/components/ResultsTable';
import UnmatchedSection from '@/components/UnmatchedSection';
import ProgressBar from '@/components/ProgressBar';
import TranslationReview, { type TranslationEntry } from '@/components/TranslationReview';
import { buildFinalRows, computeAggregates, type FinalRow, type UnmatchedRow, type MFDSCandidate, type MatchedResult } from '@/lib/drug-matcher';
import { processProducts, translateEngToKor, getUniqueKeys } from '@/lib/process-engine';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

type AppPhase = 'idle' | 'translating' | 'review' | 'processing' | 'done';

const Index = () => {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [inputRows, setInputRows] = useState<InputRow[]>([]);
  const [matched, setMatched] = useState<FinalRow[]>([]);
  const [unmatched, setUnmatched] = useState<UnmatchedRow[]>([]);
  const [phase, setPhase] = useState<AppPhase>('idle');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [activeTab, setActiveTab] = useState<'results' | 'unmatched'>('results');
  const [translationEntries, setTranslationEntries] = useState<TranslationEntry[]>([]);

  const handleProcess = useCallback(async () => {
    if (!apiKey.trim() || inputRows.length === 0) return;

    const { engKeys } = getUniqueKeys(inputRows);
    console.log('[DEBUG] handleProcess called, engKeys count:', engKeys.length, 'sample:', engKeys.slice(0, 3));

    if (engKeys.length > 0) {
      // Phase 1: Translate English names first
      setPhase('translating');
      console.log('[DEBUG] Starting translation for', engKeys.length, 'English names');
      const translations = await translateEngToKor(SUPABASE_URL, SUPABASE_KEY, engKeys);
      console.log('[DEBUG] Translation complete, got', translations.size, 'results');

      // Build review entries
      const entries: TranslationEntry[] = engKeys.map((eng) => ({
        eng,
        kor: translations.get(eng) || eng,
      }));
      setTranslationEntries(entries);
      setPhase('review');
      console.log('[DEBUG] Phase set to review, entries:', entries.length);
    } else {
      console.log('[DEBUG] No English keys, going straight to analysis');
      runAnalysis(new Map());
    }
  }, [apiKey, inputRows]);

  const runAnalysis = useCallback(async (confirmedTranslations: Map<string, string>) => {
    setPhase('processing');
    setMatched([]);
    setUnmatched([]);
    setActiveTab('results');

    const { results, allCandidates } = await processProducts({
      supabaseUrl: SUPABASE_URL,
      anonKey: SUPABASE_KEY,
      serviceKey: apiKey.trim(),
      products: inputRows,
      onProgress: (current, total) => setProgress({ current, total }),
      confirmedTranslations,
    });

    const { matched: m, unmatched: u } = buildFinalRows(results, inputRows, allCandidates);
    setMatched(m);
    setUnmatched(u);
    setPhase('done');
  }, [apiKey, inputRows]);

  const handleTranslationConfirm = useCallback((entries: TranslationEntry[]) => {
    const translationMap = new Map<string, string>();
    for (const e of entries) {
      translationMap.set(e.eng, e.kor);
    }
    runAnalysis(translationMap);
  }, [runAnalysis]);

  const handleTranslationCancel = useCallback(() => {
    setPhase('idle');
    setTranslationEntries([]);
  }, []);

  const handleManualMatch = useCallback((unmatchedIndex: number, candidate: MFDSCandidate) => {
    const row = unmatched[unmatchedIndex];
    if (!row) return;

    setMatched((prev) => {
      const updated = [...prev];
      const idx = updated.findIndex((m) => m.product === row.product && !m.ingredient);
      if (idx !== -1) {
        updated[idx] = {
          ...updated[idx],
          ingredient: candidate.ingredient || '',
          mfdsItemName: candidate.mfdsItemName || '',
          matchQuality: 'EXACT',
        };
      }
      return updated;
    });

    setUnmatched((prev) => prev.filter((_, i) => i !== unmatchedIndex));
  }, [unmatched]);

  const exportExcel = (type: 'results' | 'unmatched') => {
    if (type === 'results') {
      const data = matched.map((r) => ({
        '제품명': r.product,
        '식약처 오리지널 품목허가': r.originalFlag,
        '제네릭 수 (개)': r.genericCount || '',
        '성분명': r.ingredient,
        'MFDS 제품명': r.mfdsItemName,
        '순번': r.순번,
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '결과');
      XLSX.writeFile(wb, '식약처_분석결과.xlsx');
    } else {
      const data = unmatched.map((r) => ({
        '순번': r.순번,
        '제품명': r.product,
        '검색 키': r.cleanedKey,
        '사유': r.reason,
        '후보 수': r.candidatesCount,
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '매칭실패');
      XLSX.writeFile(wb, '매칭실패_목록.xlsx');
    }
  };

  const processing = phase === 'processing' || phase === 'translating';
  const done = phase === 'done';
  const canProcess = apiKey.trim().length > 0 && inputRows.length > 0 && !processing && phase !== 'review';
  const matchedCount = done ? matched.filter((r) => r.ingredient).length : 0;
  const unmatchedCount = done ? unmatched.length : 0;
  const uniqueIngredients = done ? new Set(matched.map((r) => r.ingredient).filter(Boolean)).size : 0;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <header className="border-b border-border bg-card px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
          <Pill className="h-4 w-4 text-primary-foreground" />
        </div>
        <h1 className="text-base font-bold text-foreground tracking-tight">한국 식약처 의약품 품목허가 현황 분석</h1>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <aside className="w-72 border-r border-border bg-card p-4 space-y-4 flex-shrink-0 overflow-y-auto">
          {/* API Key */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Key className="h-3 w-3" /> MFDS API 키
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="서비스 키 입력..."
                disabled={processing}
                className="w-full rounded-md border border-input bg-background px-3 py-2 pr-8 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              />
              <button type="button" onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground">세션 중에만 사용되며 저장되지 않습니다.</p>
          </div>

          {/* File upload */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <FileText className="h-3 w-3" /> 파일 업로드
            </label>
            <FileUpload onDataLoaded={setInputRows} disabled={processing} />
            {inputRows.length > 0 && (
              <p className="text-xs text-muted-foreground">{inputRows.length}개 제품 로드됨</p>
            )}
          </div>

          {/* Action button */}
          <button
            onClick={handleProcess}
            disabled={!canProcess}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {processing && <Loader2 className="h-4 w-4 animate-spin" />}
            {phase === 'translating' ? '번역 중...' : processing ? '처리 중...' : '분석 실행'}
          </button>

          {/* Progress */}
          {phase === 'translating' && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Languages className="h-3.5 w-3.5 animate-pulse text-primary" />
              영문 제품명 번역 중...
            </div>
          )}
          {phase === 'processing' && (
            <ProgressBar
              current={progress.current}
              total={progress.total}
              label={`처리 중: ${progress.current} / ${progress.total}`}
            />
          )}
        </aside>

        {/* Main area */}
        <main className="flex-1 overflow-y-auto p-4 space-y-4">
          {phase === 'idle' && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-muted-foreground space-y-2">
                <Beaker className="h-12 w-12 mx-auto opacity-30" />
                <p className="text-sm">엑셀 파일과 API 키를 입력한 후 분석을 실행하세요.</p>
              </div>
            </div>
          )}

          {phase === 'translating' && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-muted-foreground space-y-2">
                <Languages className="h-12 w-12 mx-auto opacity-30 animate-pulse" />
                <p className="text-sm">영문 제품명을 한국어로 번역하고 있습니다...</p>
              </div>
            </div>
          )}

          {phase === 'review' && (
            <TranslationReview
              translations={translationEntries}
              onConfirm={handleTranslationConfirm}
              onCancel={handleTranslationCancel}
            />
          )}

          {phase === 'processing' && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-muted-foreground space-y-2">
                <Loader2 className="h-12 w-12 mx-auto opacity-30 animate-spin" />
                <p className="text-sm">MFDS 데이터 분석 중...</p>
              </div>
            </div>
          )}

          {done && (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-4 gap-3">
                <SummaryCard icon={<Layers className="h-4 w-4" />} label="총 입력 제품 수" value={inputRows.length} />
                <SummaryCard icon={<CheckCircle2 className="h-4 w-4 text-success" />} label="매칭 성공" value={matchedCount} color="text-success" />
                <SummaryCard icon={<AlertTriangle className="h-4 w-4 text-warning" />} label="매칭 실패" value={unmatchedCount} color="text-warning" />
                <SummaryCard icon={<Beaker className="h-4 w-4 text-primary" />} label="고유 성분 수" value={uniqueIngredients} color="text-primary" />
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-1 border-b border-border">
                <TabButton active={activeTab === 'results'} onClick={() => setActiveTab('results')}>
                  결과 ({matched.length})
                </TabButton>
                <TabButton active={activeTab === 'unmatched'} onClick={() => setActiveTab('unmatched')}>
                  매칭 실패 ({unmatched.length})
                </TabButton>
                <div className="flex-1" />
                {activeTab === 'results' && (
                  <button onClick={() => exportExcel('results')}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 text-primary px-3 py-1.5 text-xs font-medium hover:bg-primary/20 transition-colors mb-1">
                    <Download className="h-3 w-3" /> 엑셀 다운로드
                  </button>
                )}
                {activeTab === 'unmatched' && unmatched.length > 0 && (
                  <button onClick={() => exportExcel('unmatched')}
                    className="inline-flex items-center gap-1.5 rounded-md bg-warning/10 text-warning px-3 py-1.5 text-xs font-medium hover:bg-warning/20 transition-colors mb-1">
                    <Download className="h-3 w-3" /> 매칭 실패 다운로드
                  </button>
                )}
              </div>

              {activeTab === 'results' && <ResultsTable results={matched} />}
              {activeTab === 'unmatched' && (
                <UnmatchedSection
                  rows={unmatched}
                  supabaseUrl={SUPABASE_URL}
                  anonKey={SUPABASE_KEY}
                  serviceKey={apiKey}
                  onManualMatch={handleManualMatch}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
};

function SummaryCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${color || 'text-foreground'}`}>{value}</p>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
        active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

export default Index;
