import { useState, useCallback } from 'react';
import { Upload, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';

interface FileUploadProps {
  onDataLoaded: (products: string[]) => void;
  disabled?: boolean;
}

export default function FileUpload({ onDataLoaded, disabled }: FileUploadProps) {
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const processFile = useCallback((file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result;
      if (!data) return;
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      
      // Take first column, skip header if it looks like a header
      const products: string[] = [];
      for (let i = 0; i < rows.length; i++) {
        const val = rows[i]?.[0];
        if (val && typeof val === 'string' && val.trim()) {
          products.push(val.trim());
        } else if (val && typeof val === 'number') {
          products.push(String(val));
        }
      }
      onDataLoaded(products);
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
        relative border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer
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
      {fileName ? (
        <div className="flex items-center justify-center gap-3">
          <FileSpreadsheet className="h-8 w-8 text-primary" />
          <div className="text-left">
            <p className="font-medium text-foreground">{fileName}</p>
            <p className="text-sm text-muted-foreground">Click or drop to replace</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="font-medium text-foreground">Drop Excel or CSV file here</p>
          <p className="text-sm text-muted-foreground">or click to browse</p>
        </div>
      )}
    </div>
  );
}
