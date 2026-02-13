import { useState } from 'react';
import { Check, Edit3, Languages, X } from 'lucide-react';

export interface TranslationEntry {
  eng: string;
  kor: string;
  edited?: boolean;
}

interface TranslationReviewProps {
  translations: TranslationEntry[];
  onConfirm: (confirmed: TranslationEntry[]) => void;
  onCancel: () => void;
}

export default function TranslationReview({ translations, onConfirm, onCancel }: TranslationReviewProps) {
  const [entries, setEntries] = useState<TranslationEntry[]>(translations);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');

  const startEdit = (i: number) => {
    setEditingIndex(i);
    setEditValue(entries[i].kor);
  };

  const saveEdit = () => {
    if (editingIndex === null) return;
    setEntries((prev) =>
      prev.map((e, i) =>
        i === editingIndex ? { ...e, kor: editValue.trim() || e.eng, edited: true } : e
      )
    );
    setEditingIndex(null);
    setEditValue('');
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditValue('');
  };

  const translatedCount = entries.filter((e) => /[\uAC00-\uD7AF]/.test(e.kor)).length;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Languages className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">영문→한국어 번역 확인</h3>
          <span className="text-xs text-muted-foreground">
            ({translatedCount}/{entries.length}개 번역됨)
          </span>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        AI가 영문 제품명을 한국어로 번역했습니다. 번역이 잘못된 경우 수정 후 확인을 눌러주세요.
      </p>

      <div className="max-h-64 overflow-y-auto border border-border rounded-md">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 sticky top-0">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">영문 제품명</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">한국어 번역</th>
              <th className="w-16 px-3 py-2 font-medium text-muted-foreground">수정</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => {
              const isTranslated = /[\uAC00-\uD7AF]/.test(entry.kor);
              const isEditing = editingIndex === i;

              return (
                <tr key={i} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-2 font-mono text-foreground">{entry.eng}</td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEdit();
                            if (e.key === 'Escape') cancelEdit();
                          }}
                          autoFocus
                          className="w-full rounded border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                        <button onClick={saveEdit} className="text-primary hover:text-primary/80">
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={cancelEdit} className="text-muted-foreground hover:text-foreground">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span className={`${isTranslated ? 'text-foreground' : 'text-warning'} ${entry.edited ? 'font-semibold' : ''}`}>
                        {entry.kor}
                        {entry.edited && <span className="ml-1 text-primary text-[10px]">(수정됨)</span>}
                        {!isTranslated && <span className="ml-1 text-[10px]">(번역 실패)</span>}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {!isEditing && (
                      <button onClick={() => startEdit(i)} className="text-muted-foreground hover:text-foreground">
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          취소
        </button>
        <button
          onClick={() => onConfirm(entries)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Check className="h-3.5 w-3.5" /> 확인 후 분석 실행
        </button>
      </div>
    </div>
  );
}
