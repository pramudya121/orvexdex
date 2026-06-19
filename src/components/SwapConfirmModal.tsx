import { useEffect } from "react";
import type { Token } from "@/lib/tokens";
import { fmt, slippageMax, slippageMin } from "@/lib/format";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  pending: boolean;
  tokenIn: Token;
  tokenOut: Token;
  amountInWei: bigint;
  amountOutWei: bigint;
  slippageBps: number;
  tradeMode: "exactIn" | "exactOut";
  priceImpact: number | null;
  hops: 1 | 2;
  deadlineMin: number;
};

export function SwapConfirmModal({
  open, onClose, onConfirm, pending,
  tokenIn, tokenOut, amountInWei, amountOutWei,
  slippageBps, tradeMode, priceImpact, hops, deadlineMin,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !pending) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending, onClose]);

  if (!open) return null;

  const rate = amountInWei > 0n
    ? fmt((amountOutWei * 10n ** BigInt(tokenIn.decimals)) / amountInWei, tokenOut.decimals, 6)
    : "0";

  const high = priceImpact !== null && priceImpact >= 5;
  const warn = priceImpact !== null && priceImpact >= 1 && priceImpact < 5;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirm swap"
      className="fixed inset-0 z-[100] grid place-items-center p-4 animate-fade-in"
    >
      <button
        type="button"
        aria-label="Close confirmation"
        onClick={() => { if (!pending) onClose(); }}
        className="absolute inset-0 bg-background/70 backdrop-blur-md"
      />
      <div className="relative w-full max-w-md rounded-3xl glass-strong border-gold shadow-elegant p-6 animate-scale-in">
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-gradient-gold font-bold">Review</div>
            <h2 className="text-xl font-bold mt-1">Confirm Swap</h2>
          </div>
          <button
            onClick={onClose}
            disabled={pending}
            aria-label="Close"
            className="h-8 w-8 rounded-lg bg-surface-2 border border-border hover:border-primary/60 transition disabled:opacity-40"
          >×</button>
        </div>

        {/* You pay */}
        <div className="rounded-2xl p-4 bg-surface-2/60 border border-border">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">You pay</div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <div className="text-2xl font-extrabold truncate">{fmt(amountInWei, tokenIn.decimals, 8)}</div>
            <div className="flex items-center gap-2 shrink-0">
              <img src={tokenIn.logo} alt={`${tokenIn.symbol} logo`} className="h-7 w-7 rounded-full ring-1 ring-primary/30" />
              <span className="font-bold">{tokenIn.symbol}</span>
            </div>
          </div>
        </div>

        <div className="flex justify-center -my-2 relative z-10">
          <div className="h-9 w-9 rounded-xl glass-strong border-gold grid place-items-center text-sm">↓</div>
        </div>

        {/* You receive */}
        <div className="rounded-2xl p-4 bg-surface-2/60 border border-border">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">You receive</div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <div className="text-2xl font-extrabold text-gradient-luxe-anim truncate">{fmt(amountOutWei, tokenOut.decimals, 8)}</div>
            <div className="flex items-center gap-2 shrink-0">
              <img src={tokenOut.logo} alt={`${tokenOut.symbol} logo`} className="h-7 w-7 rounded-full ring-1 ring-primary/30" />
              <span className="font-bold">{tokenOut.symbol}</span>
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="mt-4 p-4 rounded-2xl bg-surface/60 border border-border space-y-2 text-xs">
          <Row label="Rate" value={`1 ${tokenIn.symbol} ≈ ${rate} ${tokenOut.symbol}`} />
          {tradeMode === "exactIn" ? (
            <Row label="Min received" value={`${fmt(slippageMin(amountOutWei, slippageBps), tokenOut.decimals)} ${tokenOut.symbol}`} />
          ) : (
            <Row label="Max sold" value={`${fmt(slippageMax(amountInWei, slippageBps), tokenIn.decimals)} ${tokenIn.symbol}`} />
          )}
          <Row label="Slippage tolerance" value={`${(slippageBps / 100).toFixed(2)}%`} />
          <Row
            label="Price impact"
            value={priceImpact === null ? "—" : priceImpact < 0.01 ? "< 0.01%" : `${priceImpact.toFixed(2)}%`}
            valueClass={high ? "text-destructive font-semibold" : warn ? "text-amber-400" : "text-accent"}
          />
          <Row
            label="Route"
            value={hops === 2 ? `${tokenIn.symbol} → wzkLTC → ${tokenOut.symbol}` : `${tokenIn.symbol} → ${tokenOut.symbol}`}
            valueClass="text-accent"
          />
          <Row label="Deadline" value={`${deadlineMin} min`} />
        </div>

        {high && (
          <div className="mt-3 p-3 rounded-xl bg-destructive/10 border border-destructive/40 text-xs text-destructive">
            ⚠ High price impact ({priceImpact!.toFixed(2)}%). You will lose a significant amount to slippage. Consider a smaller trade.
          </div>
        )}
        {warn && !high && (
          <div className="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-400">
            Price impact is elevated ({priceImpact!.toFixed(2)}%). Review before confirming.
          </div>
        )}

        <div className="mt-5 flex gap-3">
          <button
            onClick={onClose}
            disabled={pending}
            className="flex-1 py-3 rounded-xl glass border-gold font-semibold hover:bg-surface-2 transition press disabled:opacity-40"
          >Cancel</button>
          <button
            onClick={onConfirm}
            disabled={pending}
            className={`press relative flex-1 py-3 rounded-xl font-bold shadow-neon overflow-hidden text-primary-foreground transition disabled:opacity-50 disabled:cursor-not-allowed ${high ? "bg-destructive" : "bg-gradient-brand"}`}
          >
            <span className="relative z-10 inline-flex items-center justify-center gap-2">
              {pending && <span className="h-4 w-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />}
              {pending ? "Confirming…" : high ? "Swap Anyway" : "Confirm Swap"}
            </span>
            {!pending && (
              <span aria-hidden className="absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent skew-x-12 animate-[shimmer-sweep_2.6s_ease-in-out_infinite]" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={`text-right truncate ${valueClass ?? ""}`}>{value}</span>
    </div>
  );
}
