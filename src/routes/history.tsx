import { createFileRoute, Link } from "@tanstack/react-router";
import { useAccount } from "wagmi";
import { useTxHistory, clearTxHistory, type TxRecord } from "@/lib/txHistory";
import { explorerTx } from "@/lib/chain";
import { ActivityFeed } from "@/components/ActivityFeed";
import { useState } from "react";

export const Route = createFileRoute("/history")({
  component: HistoryPage,
  head: () => ({
    meta: [
      { title: "History — ORVEX" },
      { name: "description", content: "Riwayat transaksi swap, liquidity & approve di ORVEX." },
    ],
  }),
});

type Tab = "local" | "onchain";
type Filter = "all" | "swap" | "liquidity" | "approve" | "wrap";

function classify(title: string): Filter {
  const t = title.toLowerCase();
  if (t.includes("approv")) return "approve";
  if (t.includes("wrap") || t.includes("unwrap")) return "wrap";
  if (t.includes("liquid")) return "liquidity";
  if (t.includes("swap")) return "swap";
  return "swap";
}

function fmtAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function HistoryPage() {
  const { address, isConnected } = useAccount();
  const all = useTxHistory(address);
  const [tab, setTab] = useState<Tab>("local");
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = filter === "all" ? all : all.filter((r) => classify(r.title) === filter);

  return (
    <div className="relative max-w-5xl mx-auto px-4 py-12">
      <div className="pointer-events-none absolute inset-x-0 -top-10 h-[360px] overflow-hidden -z-10">
        <div className="absolute top-0 left-10 h-72 w-72 rounded-full blur-3xl animate-aurora" style={{ background: "var(--gradient-luxe)" }} />
        <div className="absolute -top-10 right-0 h-72 w-72 rounded-full blur-3xl animate-aurora-2" style={{ background: "var(--gradient-gold)" }} />
      </div>

      <div className="animate-rise mb-6">
        <div className="text-[11px] tracking-[0.3em] uppercase text-gradient-gold font-semibold mb-2">Atelier · Ledger</div>
        <h1 className="text-4xl md:text-5xl font-extrabold text-gradient-luxe tracking-tight">Transaction History</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isConnected ? `Wallet ${address?.slice(0, 8)}…${address?.slice(-6)}` : "Connect wallet to view your activity"}
        </p>
      </div>

      {!isConnected ? (
        <div className="glass rounded-2xl p-10 text-center text-muted-foreground">
          Connect a wallet to see your transaction history.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-4 animate-rise">
            <div className="flex gap-1 bg-surface-2 rounded-xl p-1">
              <button
                onClick={() => setTab("local")}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${tab === "local" ? "bg-gradient-brand text-primary-foreground" : "text-muted-foreground"}`}
              >Wallet ({all.length})</button>
              <button
                onClick={() => setTab("onchain")}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${tab === "onchain" ? "bg-gradient-brand text-primary-foreground" : "text-muted-foreground"}`}
              >On-chain</button>
            </div>
            {tab === "local" && all.length > 0 && (
              <button
                onClick={() => { if (confirm("Clear local history?")) clearTxHistory(address); }}
                className="ml-auto text-xs text-muted-foreground hover:text-destructive transition"
              >Clear ↻</button>
            )}
          </div>

          {tab === "local" ? (
            <>
              <div className="flex flex-wrap gap-2 mb-4">
                {([
                  { k: "all", l: "All" },
                  { k: "swap", l: "Swap" },
                  { k: "liquidity", l: "Liquidity" },
                  { k: "approve", l: "Approve" },
                  { k: "wrap", l: "Wrap" },
                ] as { k: Filter; l: string }[]).map(({ k, l }) => (
                  <button
                    key={k}
                    onClick={() => setFilter(k)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition ${
                      filter === k
                        ? "bg-gradient-luxe text-primary-foreground border-transparent shadow-neon"
                        : "bg-surface-2 border-border text-muted-foreground hover:border-primary/60"
                    }`}
                  >{l}</button>
                ))}
              </div>

              {filtered.length === 0 ? (
                <div className="glass rounded-2xl p-10 text-center text-muted-foreground text-sm">
                  Belum ada transaksi tercatat di browser ini.{" "}
                  <Link to="/swap" className="text-accent hover:underline">Mulai swap →</Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {filtered.map((r) => <Row key={r.hash} r={r} />)}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground mt-4 text-center">
                Tracked locally per browser. Untuk riwayat on-chain lengkap, buka tab “On-chain”.
              </p>
            </>
          ) : (
            <ActivityFeed owner={address!} />
          )}
        </>
      )}
    </div>
  );
}

function Row({ r }: { r: TxRecord }) {
  const kind = classify(r.title);
  const tone =
    r.status === "success" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
    : r.status === "failed" ? "bg-destructive/15 text-destructive border-destructive/30"
    : "bg-amber-500/15 text-amber-400 border-amber-500/30";
  const kindTone =
    kind === "swap" ? "bg-primary/15 text-primary"
    : kind === "liquidity" ? "bg-accent/15 text-accent"
    : kind === "approve" ? "bg-muted/30 text-muted-foreground"
    : "bg-amber-500/15 text-amber-400";
  return (
    <a href={explorerTx(r.hash)} target="_blank" rel="noreferrer"
       className="glass rounded-xl px-4 py-3 flex items-center justify-between gap-3 hover:border-primary/40 transition border border-border">
      <div className="flex items-center gap-3 min-w-0">
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${kindTone}`}>{kind}</span>
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{r.title}</div>
          <div className="text-[11px] text-muted-foreground font-mono truncate">{r.hash.slice(0, 14)}…{r.hash.slice(-8)}</div>
        </div>
      </div>
      <div className="text-right shrink-0">
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${tone}`}>{r.status}</span>
        <div className="text-[11px] text-muted-foreground mt-0.5">{fmtAgo(r.ts)} ↗</div>
      </div>
    </a>
  );
}