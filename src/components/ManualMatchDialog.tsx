import { useState } from 'react';
import { Search, Loader2, Check, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { queryMFDS, type MFDSItem } from '@/lib/mfds-api';
import type { MFDSCandidate } from '@/lib/drug-matcher';

interface ManualMatchDialogProps {
  open: boolean;
  onClose: () => void;
  product: string;
  cleanedKey: string;
  supabaseUrl: string;
  anonKey: string;
  serviceKey: string;
  onSelect: (candidate: MFDSCandidate) => void;
}

export default function ManualMatchDialog({
  open, onClose, product, cleanedKey, supabaseUrl, anonKey, serviceKey, onSelect,
}: ManualMatchDialogProps) {
  const [query, setQuery] = useState(cleanedKey);
  const [searchByEng, setSearchByEng] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<MFDSItem[]>([]);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const isEng = searchByEng || !/[\uAC00-\uD7AF]/.test(query.trim());
      const { items } = await queryMFDS(supabaseUrl, anonKey, serviceKey, query.trim());
      setResults(items);
    } catch {
      setResults([]);
    }
    setLoading(false);
  };

  const selectItem = (item: MFDSItem) => {
    onSelect({
      mfdsItemName: item.ITEM_NAME || '',
      mfdsEngName: item.ITEM_ENG_NAME || '',
      ingredient: item.ITEM_INGR_NAME || '',
      permitDate: item.PRMSN_DT || item.ITEM_PERMIT_DATE || '',
      permitNo: item.PRDUCT_PRMISN_NO || '',
      itemSeq: item.ITEM_SEQ || '',
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">수동 매칭 — {product}</DialogTitle>
        </DialogHeader>

        {/* Search bar */}
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
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap cursor-pointer select-none">
            <input
              type="checkbox"
              checked={searchByEng}
              onChange={(e) => setSearchByEng(e.target.checked)}
              className="rounded border-input"
            />
            영문 검색
          </label>
          <button
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            검색
          </button>
        </div>

        {/* Results */}
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
                {results.map((item, i) => (
                  <tr key={i} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-1.5 text-foreground">{item.ITEM_NAME}</td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{item.ITEM_ENG_NAME || '—'}</td>
                    <td className="px-3 py-1.5 text-foreground">{item.ITEM_INGR_NAME || '—'}</td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground table-cell-mono">
                      {(item.PRMSN_DT || item.ITEM_PERMIT_DATE || '').replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <button
                        onClick={() => selectItem(item)}
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
