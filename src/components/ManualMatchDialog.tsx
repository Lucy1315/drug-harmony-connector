import { useState } from 'react';
import { Search, Loader2, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { searchLocal } from '@/lib/mfds-local';
import type { MFDSCandidate } from '@/lib/drug-matcher';

interface ManualMatchDialogProps {
  open: boolean;
  onClose: () => void;
  product: string;
  cleanedKey: string;
  onSelect: (candidate: MFDSCandidate) => void;
}

export default function ManualMatchDialog({
  open, onClose, product, cleanedKey, onSelect,
}: ManualMatchDialogProps) {
  const [query, setQuery] = useState(cleanedKey);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<MFDSCandidate[]>([]);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const items = await searchLocal(query.trim());
      setResults(items);
    } catch {
      setResults([]);
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">수동 매칭 — {product}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 mt-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="제품명 검색..."
              className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            검색
          </button>
        </div>

        <div className="flex-1 overflow-y-auto mt-3 rounded-lg border border-border">
          {loading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> 검색 중...
            </div>
          )}
          {!loading && searched && results.length === 0 && (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              검색 결과가 없습니다.
            </div>
          )}
          {!loading && results.length > 0 && (
            <table className="w-full text-sm">
              <thead className="sticky top-0">
                <tr className="bg-muted/60">
                  <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">제품명</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">영문명</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">성분명</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">허가일</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-muted-foreground w-16">선택</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {results.slice(0, 100).map((item, i) => (
                  <tr key={i} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-1.5 text-foreground">{item.mfdsItemName}</td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{item.mfdsEngName || '—'}</td>
                    <td className="px-3 py-1.5 text-foreground">{item.ingredient || '—'}</td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground table-cell-mono">
                      {(item.permitDate || '').replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <button
                        onClick={() => { onSelect(item); onClose(); }}
                        className="inline-flex items-center justify-center h-7 w-7 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && !searched && (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              제품명을 입력하고 검색하세요.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
