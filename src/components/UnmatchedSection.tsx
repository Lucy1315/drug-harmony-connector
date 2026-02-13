import { useState } from 'react';
import { Search } from 'lucide-react';
import type { UnmatchedRow } from '@/lib/drug-matcher';
import type { MFDSCandidate } from '@/lib/drug-matcher';
import ManualMatchDialog from './ManualMatchDialog';

interface UnmatchedSectionProps {
  rows: UnmatchedRow[];
  onManualMatch: (rowIndex: number, candidate: MFDSCandidate) => void;
}

const REASON_LABELS: Record<string, string> = {
  NO_RESULT: '검색 결과 없음',
  NO_RESULT_ENG: '영문명 검색 불가 (한국어 제품명 사용 필요)',
  NO_INGREDIENT: '성분 정보 없음',
  AMBIGUOUS: '모호한 결과',
  API_ERROR: 'API 오류',
};

export default function UnmatchedSection({ rows, onManualMatch }: UnmatchedSectionProps) {
  const [dialogRow, setDialogRow] = useState<{ index: number; row: UnmatchedRow } | null>(null);

  if (rows.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-warning/30 bg-warning/5 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-warning/10">
              <th className="px-3 py-2 text-left text-xs font-semibold text-foreground">#</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-foreground">순번</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-foreground">제품명</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-foreground">검색 키</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-foreground">사유</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-foreground">후보 수</th>
              <th className="px-3 py-2 text-center text-xs font-semibold text-foreground w-20">수동 매칭</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-warning/20">
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-warning/5">
                <td className="px-3 py-1.5 text-xs text-muted-foreground">{i + 1}</td>
                <td className="px-3 py-1.5 text-xs text-muted-foreground table-cell-mono">{r.순번 || '—'}</td>
                <td className="px-3 py-1.5 font-medium text-foreground">{r.product}</td>
                <td className="px-3 py-1.5 text-xs text-muted-foreground table-cell-mono">{r.cleanedKey}</td>
                <td className="px-3 py-1.5 text-xs text-destructive">{REASON_LABELS[r.reason] || r.reason}</td>
                <td className="px-3 py-1.5 text-xs text-muted-foreground table-cell-mono">{r.candidatesCount}</td>
                <td className="px-3 py-1.5 text-center">
                  <button
                    onClick={() => setDialogRow({ index: i, row: r })}
                    className="inline-flex items-center justify-center gap-1 rounded-md bg-primary/10 text-primary px-2 py-1 text-xs font-medium hover:bg-primary/20 transition-colors"
                  >
                    <Search className="h-3 w-3" />
                    검색
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dialogRow && (
        <ManualMatchDialog
          open
          onClose={() => setDialogRow(null)}
          product={dialogRow.row.product}
          cleanedKey={dialogRow.row.cleanedKey}
          onSelect={(candidate) => {
            onManualMatch(dialogRow.index, candidate);
            setDialogRow(null);
          }}
        />
      )}
    </div>
  );
}
