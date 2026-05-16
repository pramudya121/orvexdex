import { useMemo, useState } from "react";
import { type Token } from "@/lib/tokens";
import { useAllTokens, useCustomTokens, useImportToken } from "@/lib/customTokens";
import { useAccount, useBalance, useReadContracts } from "wagmi";
import { erc20Abi } from "@/lib/abis/wzkltc";
import { fmt } from "@/lib/format";

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
  const allTokens = useAllTokens();
  const { remove: removeCustom, add: addCustom, list: customList } = useCustomTokens();
  const customSet = useMemo(() => new Set(customList.map((t) => t.address.toLowerCase())), [customList]);
  const importInfo = useImportToken(q.trim().startsWith("0x") ? q.trim() : undefined);
  const { address } = useAccount();
  const native = useBalance({ address, query: { enabled: !!address && open, refetchInterval: 12000 } });
  const erc20Tokens = useMemo(() => allTokens.filter((t) => !t.isNative), [allTokens]);
  const balCalls = useMemo(
    () => (address ? erc20Tokens.map((t) => ({ address: t.address, abi: erc20Abi, functionName: "balanceOf" as const, args: [address] as const })) : []),
    [erc20Tokens, address],
  );
  const bals = useReadContracts({ contracts: balCalls, query: { enabled: !!address && open && balCalls.length > 0, refetchInterval: 12000 } });
  const balanceOf = (t: Token): bigint | undefined => {
    if (!address) return undefined;
    if (t.isNative) return native.data?.value;
    const i = erc20Tokens.findIndex((x) => x.address === t.address && x.symbol === t.symbol);
    return i >= 0 ? (bals.data?.[i]?.result as bigint | undefined) : undefined;
  };

  const filtered = useMemo(() => {
    const list = allTokens.filter((t) => !exclude || t.address.toLowerCase() !== exclude.address.toLowerCase());
    const needle = q.trim().toLowerCase();
    const matched = !needle ? list : list.filter(
      (t) =>
        t.symbol.toLowerCase().includes(needle) ||
        t.name.toLowerCase().includes(needle) ||
        t.address.toLowerCase().includes(needle),
    );
    // Sort by balance desc when wallet connected
    if (!address) return matched;
    return [...matched].sort((a, b) => {
      const ba = balanceOf(a) ?? 0n;
      const bb = balanceOf(b) ?? 0n;
      return ba > bb ? -1 : ba < bb ? 1 : 0;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, exclude, allTokens, address, native.data?.value, bals.data]);

  return (
    <>
      <button
        onClick={() => { setOpen(true); setQ(""); }}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-2 hover:border-primary/60 border border-border transition shrink-0"
      >
        <img src={value.logo} alt={`${value.symbol} token logo`} className="h-6 w-6 rounded-full" />
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
                aria-label="Search tokens by name, symbol, or contract address"
                className="w-full bg-surface-2 border border-border rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none focus:border-primary placeholder:text-muted-foreground/60"
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">⌕</span>
            </div>
            <div className="space-y-1 max-h-[55vh] overflow-y-auto pr-1">
              {filtered.length === 0 && !importInfo.token && !importInfo.isLoading && (
                <div className="text-center text-sm text-muted-foreground py-8">No tokens match "{q}"</div>
              )}
              {importInfo.isLoading && filtered.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-6">Looking up token…</div>
              )}
              {importInfo.token && !filtered.some((t) => t.address.toLowerCase() === importInfo.token!.address.toLowerCase()) && (
                <div className="p-3 rounded-xl border border-accent/40 bg-accent/5 mb-2">
                  <div className="flex items-center gap-3 mb-2">
                    <img src={importInfo.token.logo} alt={`${importInfo.token.symbol} token logo`} className="h-8 w-8 rounded-full" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{importInfo.token.symbol} <span className="text-[10px] text-muted-foreground">unverified</span></div>
                      <div className="text-xs text-muted-foreground truncate">{importInfo.token.name}</div>
                    </div>
                    <button
                      onClick={() => { addCustom(importInfo.token!); onChange(importInfo.token!); setOpen(false); }}
                      className="px-3 py-1.5 rounded-lg bg-gradient-brand text-primary-foreground text-xs font-semibold"
                    >Import</button>
                  </div>
                  <div className="text-[11px] text-amber-400">Anyone can create a token. Verify the contract address before trading.</div>
                </div>
              )}
              {filtered.map((t) => (
                <button
                  key={t.address + t.symbol}
                  onClick={() => { onChange(t); setOpen(false); }}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition ${value.address === t.address && value.symbol === t.symbol ? "bg-primary/10 border border-primary/40" : "hover:bg-surface-2 border border-transparent"}`}
                >
                  <img src={t.logo} alt={`${t.symbol} token logo`} className="h-8 w-8 rounded-full" />
                  <div className="text-left flex-1 min-w-0">
                    <div className="font-medium truncate">{t.symbol}</div>
                    <div className="text-xs text-muted-foreground truncate">{t.name}</div>
                  </div>
                  {address && (
                    <div className="text-right shrink-0 mr-2">
                      <div className="font-mono text-sm tabular-nums">{fmt(balanceOf(t), t.decimals, 4)}</div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">balance</div>
                    </div>
                  )}
                  {t.isNative && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/20 text-accent">NATIVE</span>}
                  {customSet.has(t.address.toLowerCase()) && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); removeCustom(t.address); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); removeCustom(t.address); } }}
                      className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-2 text-muted-foreground hover:text-destructive border border-border"
                    >remove</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
