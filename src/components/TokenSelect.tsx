import { useState } from "react";
import { TOKENS, type Token } from "@/lib/tokens";

export function TokenSelect({
  value,
  onChange,
  exclude,
  label,
}: {
  value: Token;
  onChange: (t: Token) => void;
  exclude?: Token;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-2 hover:border-primary/60 border border-border transition shrink-0"
      >
        <img src={value.logo} alt={value.symbol} className="h-6 w-6 rounded-full" />
        <span className="font-semibold">{value.symbol}</span>
        <span className="text-xs text-muted-foreground">▾</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="glass-strong rounded-2xl p-5 w-full max-w-sm shadow-neon" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold">{label ?? "Select token"}</h3>
              <button onClick={() => setOpen(false)} className="text-muted-foreground">✕</button>
            </div>
            <div className="space-y-1 max-h-[60vh] overflow-y-auto">
              {TOKENS.filter((t) => !exclude || t.address !== exclude.address).map((t) => (
                <button
                  key={t.address + t.symbol}
                  onClick={() => { onChange(t); setOpen(false); }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-surface-2 transition"
                >
                  <img src={t.logo} alt={t.symbol} className="h-8 w-8 rounded-full" />
                  <div className="text-left flex-1">
                    <div className="font-medium">{t.symbol}</div>
                    <div className="text-xs text-muted-foreground">{t.name}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
