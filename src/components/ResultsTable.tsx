import { useState, useMemo } from 'react';
import { Search, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { FinalRow } from '@/lib/drug-matcher';

interface ResultsTableProps {
  results: FinalRow[];
}

type SortKey = 'product' | 'originalFlag' | 'genericCount' | 'ingredient' | 'mfdsItemName';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 25;

export default function ResultsTable({ results }: ResultsTableProps) {
  const [filter, setFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('product');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = filter.toLowerCase();
    let list = results;
    if (q) {
      list = list.filter(
        (r) =>
          r.product.toLowerCase().includes(q) ||
          r.ingredient.toLowerCase().includes(q) ||
          r.mfdsItemName.toLowerCase().includes(q)
      );
    }
    list = [...list].sort((a, b) => {
      let av: string | number = '';
      let bv: string | number = '';
      if (sortKey === 'genericCount') {
        av = a.genericCount; bv = b.genericCount;
      } else {
        av = (a[sortKey] || '').toLowerCase();
        bv = (b[sortKey] || '').toLowerCase();
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [results, filter, sortKey, sortDir]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
    setPage(0);
  };

  const columns: { key: SortKey; label: string; cls?: string }[] = [
    { key: 'product', label: '제품명' },
    { key: 'originalFlag', label: '오리지널', cls: 'w-20 text-center' },
    { key: 'genericCount', label: '제네릭 수', cls: 'w-24 text-center' },
    { key: 'ingredient', label: '성분명' },
    { key: 'mfdsItemName', label: 'MFDS 제품명' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={filter}
            onChange={(e) => { setFilter(e.target.value); setPage(0); }}
            placeholder="검색..."
            className="w-full rounded-md border border-input bg-card pl-9 pr-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <span className="text-sm text-muted-foreground">{filtered.length}건</span>
      </div>

      <div className="rounded-lg border border-border overflow-hidden bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/60">
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground w-10">#</th>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`px-3 py-2 text-left text-xs font-semibold text-muted-foreground cursor-pointer hover:text-foreground transition-colors ${col.cls || ''}`}
                    onClick={() => toggleSort(col.key)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      <ArrowUpDown className="h-3 w-3" />
                    </span>
                  </th>
                ))}
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground w-16">순번</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paged.map((r, i) => (
                <tr key={page * PAGE_SIZE + i} className="hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">{page * PAGE_SIZE + i + 1}</td>
                  <td className="px-3 py-1.5 font-medium text-foreground">{r.product}</td>
                  <td className="px-3 py-1.5 text-center">
                    {r.originalFlag && (
                      <span className="inline-block bg-primary/10 text-primary font-bold text-xs px-2 py-0.5 rounded">O</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-center table-cell-mono">{r.genericCount || ''}</td>
                  <td className="px-3 py-1.5 text-foreground">{r.ingredient || '—'}</td>
                  <td className="px-3 py-1.5 text-muted-foreground text-xs">
                    {r.mfdsItemName}
                    {r.matchQuality === 'FUZZY' && r.mfdsItemName && (
                      <span className="ml-1 text-warning text-[10px] font-medium">(유사)</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground table-cell-mono">{r.순번}</td>
                </tr>
              ))}
              {paged.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">결과 없음</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
            className="p-1 rounded border border-border text-muted-foreground hover:text-foreground disabled:opacity-30">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm text-muted-foreground">{page + 1} / {totalPages}</span>
          <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
            className="p-1 rounded border border-border text-muted-foreground hover:text-foreground disabled:opacity-30">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
