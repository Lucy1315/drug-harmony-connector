import { useState } from 'react';
import { Key, Eye, EyeOff } from 'lucide-react';

interface ApiKeyInputProps {
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
}

export default function ApiKeyInput({ value, onChange, disabled }: ApiKeyInputProps) {
  const [show, setShow] = useState(false);

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
        <Key className="h-3.5 w-3.5 text-primary" />
        MFDS API Key
      </label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter your MFDS API service key..."
          disabled={disabled}
          className="w-full rounded-md border border-input bg-card px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">Key is used in-browser only and never stored.</p>
    </div>
  );
}
