import { AlertTriangle } from 'lucide-react';
import type { MatchResult } from '@/lib/drug-matcher';

interface UnmatchedSectionProps {
  results: MatchResult[];
}

export default function UnmatchedSection({ results }: UnmatchedSectionProps) {
  const unmatched = results.filter((r) => !r.matched);
  if (unmatched.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-warning" />
        Unmatched Products ({unmatched.length})
      </h3>
      <div className="rounded-lg border border-warning/30 bg-warning/5 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-warning/10">
              <th className="px-3 py-2 text-left text-xs font-semibold text-foreground">#</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-foreground">Product</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-foreground">Cleaned Key</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-foreground">Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-warning/20">
            {unmatched.map((r, i) => (
              <tr key={i} className="hover:bg-warning/5">
                <td className="px-3 py-2 text-xs text-muted-foreground">{i + 1}</td>
                <td className="px-3 py-2 font-medium text-foreground">{r.product}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground table-cell-mono">{r.cleanedKey}</td>
                <td className="px-3 py-2 text-xs text-destructive">{r.unmatchedReason || 'No match found'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
