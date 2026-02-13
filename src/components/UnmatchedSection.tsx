import { AlertTriangle } from 'lucide-react';
import type { UnmatchedRow } from '@/lib/drug-matcher';

interface UnmatchedSectionProps {
  rows: UnmatchedRow[];
}

const REASON_LABELS: Record<string, string> = {
  NO_RESULT: '검색 결과 없음',
  NO_RESULT_ENG: '영문명 검색 불가 (한국어 제품명 사용 필요)',
  NO_INGREDIENT: '성분 정보 없음',
  AMBIGUOUS: '모호한 결과',
  API_ERROR: 'API 오류',
};

export default function UnmatchedSection({ rows }: UnmatchedSectionProps) {
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
