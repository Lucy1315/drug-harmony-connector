import { useState, useCallback } from 'react';
import { Upload, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';

export interface InputRow {
  product: string;
  순번?: string;
}

interface FileUploadProps {
  onDataLoaded: (rows: InputRow[]) => void;
  disabled?: boolean;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Sanitize parsed rows to prevent prototype pollution from crafted spreadsheet headers */
function sanitizeRows(rows: Record<string, any>[]): Record<string, any>[] {
  return rows.map((row) => {
    const clean: Record<string, any> = {};
    for (const key of Object.keys(row)) {
      if (!BLOCKED_KEYS.has(key)) {
        clean[key] = row[key];
      }
    }
    return clean;
  });
}

export default function FileUpload({ onDataLoaded, disabled }: FileUploadProps) {
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const processFile = useCallback((file: File) => {
    setError(null);
    if (file.size > MAX_FILE_SIZE) {
      setError(`파일 크기가 너무 큽니다 (최대 ${MAX_FILE_SIZE / 1024 / 1024}MB)`);
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result;
      if (!data) return;
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = sanitizeRows(XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' }));

      if (rawRows.length === 0) return;

      // Detect header: find "Product" or "제품명" column
      const headers = Object.keys(rawRows[0]);
      const productCol = headers.find((h) => {
        const lower = h.toLowerCase().trim();
        return lower === 'product' || lower === '제품명' || lower === 'item_name';
      }) || headers[0]; // fallback to first column

      const seqCol = headers.find((h) => {
        const lower = h.toLowerCase().trim();
        return lower === '순번' || lower === 'seq' || lower === 'no';
      });

      const rows: InputRow[] = [];
      for (const raw of rawRows) {
        const product = String(raw[productCol] || '').trim();
        if (!product) continue;
        rows.push({
          product,
          순번: seqCol ? String(raw[seqCol] || '') : undefined,
        });
      }

      onDataLoaded(rows);
    };
    reader.readAsArrayBuffer(file);
  }, [onDataLoaded]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`
        border-2 border-dashed rounded-lg p-5 text-center transition-all cursor-pointer
        ${dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}
        ${disabled ? 'opacity-50 pointer-events-none' : ''}
      `}
      onClick={() => {
        if (disabled) return;
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.xlsx,.xls,.csv';
        input.onchange = (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (file) processFile(file);
        };
        input.click();
      }}
    >
      {error && (
        <p className="text-destructive text-xs mb-2">{error}</p>
      )}
      {fileName ? (
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="h-6 w-6 text-primary flex-shrink-0" />
          <div className="text-left min-w-0">
            <p className="font-medium text-foreground text-sm truncate">{fileName}</p>
            <p className="text-xs text-muted-foreground">클릭하여 변경</p>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="font-medium text-foreground text-sm">엑셀/CSV 파일 업로드</p>
          <p className="text-xs text-muted-foreground">드래그 또는 클릭</p>
        </div>
      )}
    </div>
  );
}
