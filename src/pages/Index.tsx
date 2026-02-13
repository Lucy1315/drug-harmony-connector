import { useState, useCallback } from 'react';
import { Pill, Loader2 } from 'lucide-react';
import FileUpload from '@/components/FileUpload';
import ApiKeyInput from '@/components/ApiKeyInput';
import ResultsTable from '@/components/ResultsTable';
import UnmatchedSection from '@/components/UnmatchedSection';
import ProgressBar from '@/components/ProgressBar';
import { cleanProductName, findBestMatch, computeAggregates, type MatchResult, type MFDSProduct } from '@/lib/drug-matcher';
import { queryMFDS } from '@/lib/mfds-api';

const Index = () => {
  const [apiKey, setApiKey] = useState('');
  const [products, setProducts] = useState<string[]>([]);
  const [results, setResults] = useState<MatchResult[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const handleProcess = useCallback(async () => {
    if (!apiKey.trim() || products.length === 0) return;
    setProcessing(true);
    setResults([]);
    setProgress({ current: 0, total: products.length });

    const rawResults: MatchResult[] = [];

    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const cleanedKey = cleanProductName(product);

      let result: MatchResult = {
        product,
        cleanedKey,
        matched: false,
        ingredient: '',
        originalFlag: '',
        genericCount: 0,
        mfdsItemName: '',
        순번: '',
      };

      try {
        if (!cleanedKey) {
          result.unmatchedReason = 'Empty after cleaning';
          rawResults.push(result);
          setProgress({ current: i + 1, total: products.length });
          continue;
        }

        const { items } = await queryMFDS(apiKey, cleanedKey);

        if (items.length === 0) {
          result.unmatchedReason = 'No API results';
          rawResults.push(result);
          setProgress({ current: i + 1, total: products.length });
          continue;
        }

        const candidates: MFDSProduct[] = items.map((item) => ({
          ITEM_NAME: item.ITEM_NAME || '',
          PRDUCT_PRMISN_NO: item.PRDUCT_PRMISN_NO || '',
          PRMSN_DT: item.PRMSN_DT || '',
          ITEM_INGR_NAME: item.ITEM_INGR_NAME || '',
          순번: item.ITEM_SEQ || '',
        }));

        const best = findBestMatch(cleanedKey, candidates);

        if (best) {
          result = {
            ...result,
            matched: true,
            mfdsProduct: best,
            ingredient: best.ITEM_INGR_NAME || '',
            mfdsItemName: best.ITEM_NAME || '',
            순번: best.순번 || '',
          };
        } else {
          result.unmatchedReason = 'No suitable match in results';
        }
      } catch (err) {
        result.unmatchedReason = `API error: ${err instanceof Error ? err.message : 'Unknown'}`;
      }

      rawResults.push(result);
      setProgress({ current: i + 1, total: products.length });
    }

    const aggregated = computeAggregates(rawResults);
    setResults(aggregated);
    setProcessing(false);
  }, [apiKey, products]);

  const canProcess = apiKey.trim().length > 0 && products.length > 0 && !processing;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
            <Pill className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground tracking-tight">MFDS Drug Standardizer</h1>
            <p className="text-xs text-muted-foreground">Match product names to MFDS registry</p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Setup section */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-4">
            <ApiKeyInput value={apiKey} onChange={setApiKey} disabled={processing} />
          </div>
          <FileUpload
            onDataLoaded={setProducts}
            disabled={processing}
          />
        </div>

        {/* Status & action */}
        {products.length > 0 && (
          <div className="flex items-center justify-between bg-card rounded-lg border border-border px-4 py-3">
            <p className="text-sm text-foreground">
              <span className="font-medium">{products.length}</span> products loaded
            </p>
            <button
              onClick={handleProcess}
              disabled={!canProcess}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processing && <Loader2 className="h-4 w-4 animate-spin" />}
              {processing ? 'Processing...' : 'Standardize'}
            </button>
          </div>
        )}

        {/* Progress */}
        {processing && (
          <ProgressBar
            current={progress.current}
            total={progress.total}
            label="Querying MFDS API..."
          />
        )}

        {/* Results */}
        {results.length > 0 && !processing && (
          <>
            <ResultsTable results={results} />
            <UnmatchedSection results={results} />
          </>
        )}
      </main>
    </div>
  );
};

export default Index;
