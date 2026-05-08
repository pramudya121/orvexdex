import { useMemo, useState } from "react";
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
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const list = TOKENS.filter((t) => !exclude || t.address !== exclude.address);
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter(
      (t) =>
        t.symbol.toLowerCase().includes(needle) ||
        t.name.toLowerCase().includes(needle) ||
        t.address.toLowerCase().includes(needle),
    );
  }, [q, exclude]);

  return (
    <>
      <button
        onClick={() => { setOpen(true); setQ(""); }}
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
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="relative mb-3">
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name, symbol, or paste address"
                className="w-full bg-surface-2 border border-border rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none focus:border-primary placeholder:text-muted-foreground/60"
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">⌕</span>
            </div>
            <div className="space-y-1 max-h-[55vh] overflow-y-auto pr-1">
              {filtered.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-8">No tokens match "{q}"</div>
              )}
              {filtered.map((t) => (
                <button
                  key={t.address + t.symbol}
                  onClick={() => { onChange(t); setOpen(false); }}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition ${value.address === t.address && value.symbol === t.symbol ? "bg-primary/10 border border-primary/40" : "hover:bg-surface-2 border border-transparent"}`}
                >
                  <img src={t.logo} alt={t.symbol} className="h-8 w-8 rounded-full" />
                  <div className="text-left flex-1 min-w-0">
                    <div className="font-medium truncate">{t.symbol}</div>
                    <div className="text-xs text-muted-foreground truncate">{t.name}</div>
                  </div>
                  {t.isNative && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/20 text-accent">NATIVE</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
