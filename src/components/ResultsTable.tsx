import { useState, useMemo } from 'react';
import { Search, Download, ArrowUpDown } from 'lucide-react';
import * as XLSX from 'xlsx';
import type { MatchResult } from '@/lib/drug-matcher';

interface ResultsTableProps {
  results: MatchResult[];
}

type SortKey = 'product' | 'originalFlag' | 'genericCount' | 'ingredient' | 'mfdsItemName';
type SortDir = 'asc' | 'desc';

export default function ResultsTable({ results }: ResultsTableProps) {
  const [filter, setFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('product');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const matched = results.filter((r) => r.matched);

  const filtered = useMemo(() => {
    const q = filter.toLowerCase();
    let list = matched;
    if (q) {
      list = list.filter(
        (r) =>
          r.product.toLowerCase().includes(q) ||
          r.ingredient.toLowerCase().includes(q) ||
          r.mfdsItemName.toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      let av: string | number = '';
      let bv: string | number = '';
      if (sortKey === 'genericCount') {
        av = a.genericCount;
        bv = b.genericCount;
      } else {
        av = (a[sortKey] || '').toLowerCase();
        bv = (b[sortKey] || '').toLowerCase();
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [matched, filter, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const exportToExcel = () => {
    const data = matched.map((r) => ({
      Product: r.product,
      Original: r.originalFlag,
      'Generic Count': r.genericCount,
      Ingredient: r.ingredient,
      'MFDS Product Name': r.mfdsItemName,
      순번: r.순번,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Results');
    XLSX.writeFile(wb, 'mfds_results.xlsx');
  };

  const columns: { key: SortKey; label: string; className?: string }[] = [
    { key: 'product', label: 'Product' },
    { key: 'originalFlag', label: 'Original', className: 'w-20 text-center' },
    { key: 'genericCount', label: 'Generic #', className: 'w-24 text-center' },
    { key: 'ingredient', label: 'Ingredient' },
    { key: 'mfdsItemName', label: 'MFDS Product Name' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter results..."
            className="w-full rounded-md border border-input bg-card pl-9 pr-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{filtered.length} rows</span>
          <button
            onClick={exportToExcel}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
        </div>
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
                    className={`px-3 py-2 text-left text-xs font-semibold text-muted-foreground cursor-pointer hover:text-foreground transition-colors ${col.className || ''}`}
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
              {filtered.map((r, i) => (
                <tr key={i} className="hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2 text-xs text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-2 font-medium text-foreground">{r.product}</td>
                  <td className="px-3 py-2 text-center">
                    {r.originalFlag && (
                      <span className="inline-block bg-primary/10 text-primary font-bold text-xs px-2 py-0.5 rounded">
                        O
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center table-cell-mono">{r.genericCount}</td>
                  <td className="px-3 py-2 text-foreground">{r.ingredient || '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground text-xs">{r.mfdsItemName}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground table-cell-mono">{r.순번}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                    No matching results
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
