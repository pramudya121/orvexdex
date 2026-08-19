import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { ActivityFeed } from "@/components/ActivityFeed";
import { useTxHistory, clearTxHistory, type TxRecord } from "@/lib/txHistory";
import { explorerTx } from "@/lib/chain";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "Transaction History — ORVEX DEX" },
      {
        name: "description",
        content:
          "Track every ORVEX transaction: swaps, liquidity, farming and domain actions with live status and on-chain activity.",
      },
      { property: "og:title", content: "Transaction History — ORVEX DEX" },
      {
        property: "og:description",
        content: "Live status of your ORVEX swaps, liquidity and farming transactions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HistoryPage,
});

type Filter = "all" | "pending" | "success" | "failed";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "success", label: "Confirmed" },
  { id: "failed", label: "Failed" },
];

function statusClass(s: TxRecord["status"]) {
  if (s === "pending") return "bg-amber-500/15 text-amber-400";
  if (s === "success") return "bg-emerald-500/15 text-emerald-400";
  return "bg-destructive/15 text-destructive";
}

function timeAgo(ts: number) {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function HistoryPage() {
  const { address, isConnected } = useAccount();
  const txs = useTxHistory(address);
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(
    () => (filter === "all" ? txs : txs.filter((t) => t.status === filter)),
    [txs, filter],
  );

  const counts = useMemo(
    () => ({
      all: txs.length,
      pending: txs.filter((t) => t.status === "pending").length,
      success: txs.filter((t) => t.status === "success").length,
      failed: txs.filter((t) => t.status === "failed").length,
    }),
    [txs],
  );

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-8 animate-fade-in">
      <header className="space-y-2">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          Transaction <span className="text-gradient-luxe">History</span>
        </h1>
        <p className="text-muted-foreground">
          Every action you sign on ORVEX, tracked locally, plus your on-chain trading activity.
        </p>
      </header>

      {!isConnected ? (
        <div className="glass rounded-2xl p-10 text-center text-muted-foreground">
          Connect your wallet to view your transaction history.
        </div>
      ) : (
        <>
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="glass rounded-full p-1 flex items-center gap-1">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFilter(f.id)}
                    className={`px-4 py-1.5 rounded-full text-sm transition ${
                      filter === f.id
                        ? "bg-primary/15 text-primary font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {f.label}
                    <span className="ml-1.5 text-xs opacity-70">{counts[f.id]}</span>
                  </button>
                ))}
              </div>
              {txs.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => clearTxHistory(address)}>
                  Clear history
                </Button>
              )}
            </div>

            {filtered.length === 0 ? (
              <div className="glass rounded-2xl p-8 text-sm text-muted-foreground text-center">
                No {filter === "all" ? "" : filter} transactions recorded yet.
              </div>
            ) : (
              <ul className="space-y-2">
                {filtered.map((t) => (
                  <li key={t.hash}>
                    <a
                      href={explorerTx(t.hash)}
                      target="_blank"
                      rel="noreferrer"
                      className="glass rounded-xl px-4 py-3 flex items-center justify-between gap-3 hover:neon-border transition"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-md capitalize ${statusClass(t.status)}`}
                        >
                          {t.status === "success" ? "confirmed" : t.status}
                        </span>
                        <span className="text-sm truncate">{t.title}</span>
                      </div>
                      <span className="text-xs text-muted-foreground font-mono shrink-0">
                        {timeAgo(t.ts)} ↗
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">On-chain activity</h2>
            <ActivityFeed owner={address!} />
          </section>
        </>
      )}
    </main>
  );
}
