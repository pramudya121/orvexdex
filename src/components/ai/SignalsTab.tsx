import { useEffect, useMemo, useRef, useState } from "react";
import { useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import { ADDR } from "@/lib/chain";
import { TOKENS, WZKLTC, type Token } from "@/lib/tokens";
import { factoryAbi } from "@/lib/abis/factory";
import { pairAbi } from "@/lib/abis/pair";
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
  Radio,
  Filter,
  Sparkles,
  Pause,
  Play,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const ZERO = "0x0000000000000000000000000000000000000000";
const REFRESH_MS = 8_000;
const HISTORY_LEN = 20;
const MAX_FEED = 60;

type SignalKind = "BUY" | "SELL" | "HOLD";

type Signal = {
  id: string;
  ts: number;
  token: Token;
  kind: SignalKind;
  confidence: number; // 0-100
  price: number; // in wzkLTC
  changePct: number; // since last tick
  rationale: string;
};

type TokenState = {
  token: Token;
  pair: `0x${string}` | null;
  token0?: `0x${string}`;
  price: number;
  history: number[];
  changePct: number;
  signal: Signal | null;
};

// candidate tokens (skip native + wzkLTC self)
const QUOTE_TOKENS = TOKENS.filter((t) => !t.isNative && t.address.toLowerCase() !== WZKLTC.address.toLowerCase());

function classify(history: number[], lastChange: number): { kind: SignalKind; confidence: number; reason: string } {
  if (history.length < 2) return { kind: "HOLD", confidence: 30, reason: "Building baseline…" };
  const abs = Math.abs(lastChange);
  // momentum from window
  const first = history[0];
  const last = history[history.length - 1];
  const windowPct = first > 0 ? ((last - first) / first) * 100 : 0;
  if (lastChange >= 1.2 || windowPct >= 3) {
    const conf = Math.min(99, 55 + Math.round(abs * 8 + Math.abs(windowPct) * 2));
    return { kind: "BUY", confidence: conf, reason: `Momentum +${windowPct.toFixed(2)}% over window, tick +${lastChange.toFixed(2)}%` };
  }
  if (lastChange <= -1.2 || windowPct <= -3) {
    const conf = Math.min(99, 55 + Math.round(abs * 8 + Math.abs(windowPct) * 2));
    return { kind: "SELL", confidence: conf, reason: `Pressure ${windowPct.toFixed(2)}% over window, tick ${lastChange.toFixed(2)}%` };
  }
  return { kind: "HOLD", confidence: 40 + Math.min(40, Math.round(abs * 10)), reason: `Range-bound, drift ${lastChange.toFixed(2)}%` };
}

export function SignalsTab() {
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState<"ALL" | SignalKind>("ALL");
  const [feed, setFeed] = useState<Signal[]>([]);
  const [states, setStates] = useState<Record<string, TokenState>>(() =>
    Object.fromEntries(
      QUOTE_TOKENS.map((t) => [
        t.address.toLowerCase(),
        { token: t, pair: null, price: 0, history: [], changePct: 0, signal: null } as TokenState,
      ]),
    ),
  );
  const prevPriceRef = useRef<Record<string, number>>({});

  // 1) discover pair addresses
  const pairCalls = useMemo(
    () =>
      QUOTE_TOKENS.map((t) => ({
        address: ADDR.factory as `0x${string}`,
        abi: factoryAbi,
        functionName: "getPair" as const,
        args: [WZKLTC.address, t.address] as const,
      })),
    [],
  );
  const pairsRes = useReadContracts({ contracts: pairCalls, allowFailure: true, query: { staleTime: 60_000 } });

  const pairs = useMemo(() => {
    const out: { token: Token; pair: `0x${string}` | null }[] = [];
    QUOTE_TOKENS.forEach((t, i) => {
      const r = pairsRes.data?.[i];
      const addr = r?.status === "success" ? (r.result as `0x${string}`) : null;
      out.push({ token: t, pair: addr && addr !== ZERO ? addr : null });
    });
    return out;
  }, [pairsRes.data]);

  // 2) read reserves + token0 for each valid pair
  const reserveCalls = useMemo(() => {
    const calls: { address: `0x${string}`; abi: typeof pairAbi; functionName: "getReserves" | "token0" }[] = [];
    pairs.forEach((p) => {
      if (!p.pair) return;
      calls.push({ address: p.pair, abi: pairAbi, functionName: "getReserves" });
      calls.push({ address: p.pair, abi: pairAbi, functionName: "token0" });
    });
    return calls;
  }, [pairs]);

  const reservesRes = useReadContracts({
    contracts: reserveCalls,
    allowFailure: true,
    query: {
      refetchInterval: paused ? false : REFRESH_MS,
      enabled: reserveCalls.length > 0,
    },
  });

  // 3) on each successful refresh, compute prices and emit signals
  useEffect(() => {
    if (!reservesRes.data || paused) return;
    let idx = 0;
    const next: Record<string, TokenState> = { ...states };
    const newSignals: Signal[] = [];
    pairs.forEach((p) => {
      if (!p.pair) return;
      const reservesCall = reservesRes.data![idx++];
      const token0Call = reservesRes.data![idx++];
      if (reservesCall?.status !== "success" || token0Call?.status !== "success") return;
      const [r0, r1] = reservesCall.result as [bigint, bigint, number];
      const token0 = (token0Call.result as `0x${string}`).toLowerCase();
      const wzkIsToken0 = token0 === WZKLTC.address.toLowerCase();
      const wzkReserve = wzkIsToken0 ? r0 : r1;
      const tokReserve = wzkIsToken0 ? r1 : r0;
      if (wzkReserve === 0n || tokReserve === 0n) return;
      const wzkF = Number(formatUnits(wzkReserve, WZKLTC.decimals));
      const tokF = Number(formatUnits(tokReserve, p.token.decimals));
      // price of token in wzkLTC
      const price = wzkF / tokF;
      const key = p.token.address.toLowerCase();
      const prev = prevPriceRef.current[key] ?? price;
      const changePct = prev > 0 ? ((price - prev) / prev) * 100 : 0;
      prevPriceRef.current[key] = price;

      const prevState = next[key];
      const history = [...(prevState?.history ?? []), price].slice(-HISTORY_LEN);
      const c = classify(history, changePct);
      const sig: Signal = {
        id: `${key}-${Date.now()}`,
        ts: Date.now(),
        token: p.token,
        kind: c.kind,
        confidence: c.confidence,
        price,
        changePct,
        rationale: c.reason,
      };
      next[key] = { token: p.token, pair: p.pair, token0: token0 as `0x${string}`, price, history, changePct, signal: sig };
      // only push to feed when it's a meaningful event (not pure HOLD with ~0 movement) OR first reading
      if (c.kind !== "HOLD" || Math.abs(changePct) > 0.3 || (prevState?.history.length ?? 0) === 0) {
        newSignals.push(sig);
      }
    });
    setStates(next);
    if (newSignals.length) {
      setFeed((prev) => [...newSignals.sort((a, b) => b.confidence - a.confidence), ...prev].slice(0, MAX_FEED));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservesRes.dataUpdatedAt, paused]);

  const visibleFeed = useMemo(
    () => (filter === "ALL" ? feed : feed.filter((s) => s.kind === filter)),
    [feed, filter],
  );

  const stats = useMemo(() => {
    const buys = feed.filter((s) => s.kind === "BUY").length;
    const sells = feed.filter((s) => s.kind === "SELL").length;
    const holds = feed.filter((s) => s.kind === "HOLD").length;
    return { buys, sells, holds, total: feed.length };
  }, [feed]);

  const activeTokens = Object.values(states).filter((s) => s.pair);

  return (
    <div className="space-y-5">
      {/* status bar */}
      <div className="glass-strong rounded-2xl p-4 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className={`relative flex h-2.5 w-2.5`}>
              {!paused && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              )}
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${paused ? "bg-amber-400" : "bg-emerald-400"}`} />
            </span>
            <span className="text-sm font-bold">
              {paused ? "Paused" : "Live Feed"}
            </span>
            <span className="text-xs text-muted-foreground">· refresh every {REFRESH_MS / 1000}s</span>
          </div>
          <div className="hidden lg:block h-6 w-px bg-white/10" />
          <Stat label="Tracking" value={`${activeTokens.length} pairs`} icon={Radio} />
          <Stat label="Signals" value={stats.total} icon={Activity} />
          <Stat label="Buy" value={stats.buys} tone="emerald" icon={TrendingUp} />
          <Stat label="Sell" value={stats.sells} tone="rose" icon={TrendingDown} />
        </div>
        <div className="flex items-center gap-2">
          <div className="glass rounded-full p-1 flex items-center gap-1">
            {(["ALL", "BUY", "SELL", "HOLD"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-full text-[11px] font-bold transition ${
                  filter === f
                    ? "bg-white/10 text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f === "ALL" && <Filter className="inline h-3 w-3 mr-1" />}
                {f}
              </button>
            ))}
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setPaused((p) => !p)}
                className="glass rounded-full p-2 hover:border-emerald-500/60 transition"
              >
                {paused ? <Play className="h-4 w-4 text-emerald-400" /> : <Pause className="h-4 w-4 text-amber-400" />}
              </button>
            </TooltipTrigger>
            <TooltipContent>{paused ? "Resume" : "Pause"} live stream</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* token tiles */}
        <div className="lg:col-span-2 grid sm:grid-cols-2 gap-4">
          {activeTokens.length === 0 && (
            <div className="sm:col-span-2 glass rounded-2xl p-8 text-center text-sm text-muted-foreground">
              <Sparkles className="h-6 w-6 mx-auto mb-2 text-emerald-400 opacity-60" />
              Discovering on-chain trading pairs…
            </div>
          )}
          {activeTokens.map((s) => (
            <TokenSignalCard key={s.token.address} state={s} />
          ))}
        </div>

        {/* live feed */}
        <div className="glass-strong rounded-2xl p-4 lg:max-h-[640px] flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-emerald-400" />
              <h3 className="font-bold text-sm">Signal Stream</h3>
            </div>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {visibleFeed.length} events
            </span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 scroll-thin">
            {visibleFeed.length === 0 && (
              <div className="text-center text-xs text-muted-foreground py-12">
                Waiting for on-chain activity…
              </div>
            )}
            {visibleFeed.map((s) => (
              <FeedRow key={s.id} signal={s} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  tone?: "emerald" | "rose";
  icon: React.ComponentType<{ className?: string }>;
}) {
  const color =
    tone === "emerald" ? "text-emerald-400" : tone === "rose" ? "text-rose-400" : "text-foreground";
  return (
    <div className="flex items-center gap-2">
      <Icon className={`h-3.5 w-3.5 ${color}`} />
      <div className="leading-tight">
        <div className={`text-sm font-bold ${color}`}>{value}</div>
        <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function TokenSignalCard({ state }: { state: TokenState }) {
  const { token, price, changePct, history, signal } = state;
  const up = changePct >= 0;
  const kind = signal?.kind ?? "HOLD";
  const kindStyles =
    kind === "BUY"
      ? { bg: "from-emerald-500/20 to-emerald-500/0", text: "text-emerald-400", border: "border-emerald-500/40", chip: "bg-emerald-500/15 text-emerald-400" }
      : kind === "SELL"
        ? { bg: "from-rose-500/20 to-rose-500/0", text: "text-rose-400", border: "border-rose-500/40", chip: "bg-rose-500/15 text-rose-400" }
        : { bg: "from-white/5 to-white/0", text: "text-muted-foreground", border: "border-white/10", chip: "bg-white/10 text-muted-foreground" };

  // sparkline
  const w = 100;
  const h = 32;
  const path = useMemo(() => {
    if (history.length < 2) return "";
    const min = Math.min(...history);
    const max = Math.max(...history);
    const range = max - min || 1;
    return history
      .map((v, i) => {
        const x = (i / (history.length - 1)) * w;
        const y = h - ((v - min) / range) * h;
        return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");
  }, [history]);

  return (
    <div className={`relative rounded-2xl border ${kindStyles.border} bg-gradient-to-br ${kindStyles.bg} p-4 overflow-hidden transition-all hover:scale-[1.01]`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <img src={token.logo} alt="" className="h-8 w-8 rounded-full ring-1 ring-white/10" />
          <div className="min-w-0">
            <div className="font-bold text-sm truncate">{token.symbol}</div>
            <div className="text-[10px] text-muted-foreground truncate">{token.name}</div>
          </div>
        </div>
        <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-full ${kindStyles.chip}`}>
          {kind}
        </span>
      </div>

      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="text-lg font-black tracking-tight">
            {price > 0 ? price.toFixed(price < 0.01 ? 8 : 6) : "—"}
            <span className="text-[10px] font-normal text-muted-foreground ml-1">wzkLTC</span>
          </div>
          <div className={`text-xs font-bold flex items-center gap-1 ${up ? "text-emerald-400" : "text-rose-400"}`}>
            {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {up ? "+" : ""}{changePct.toFixed(2)}%
          </div>
        </div>
        <svg width={w} height={h} className="opacity-80">
          <path d={path} fill="none" stroke="currentColor" strokeWidth={1.5} className={kindStyles.text} />
        </svg>
      </div>

      {signal && (
        <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between gap-2">
          <div className="text-[10px] text-muted-foreground truncate flex-1">{signal.rationale}</div>
          <div className="flex items-center gap-1.5">
            <div className="h-1 w-12 rounded-full bg-white/10 overflow-hidden">
              <div className={`h-full ${kind === "BUY" ? "bg-emerald-400" : kind === "SELL" ? "bg-rose-400" : "bg-white/40"}`} style={{ width: `${signal.confidence}%` }} />
            </div>
            <span className={`text-[10px] font-bold ${kindStyles.text}`}>{signal.confidence}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function FeedRow({ signal }: { signal: Signal }) {
  const Icon = signal.kind === "BUY" ? TrendingUp : signal.kind === "SELL" ? TrendingDown : Minus;
  const tone =
    signal.kind === "BUY"
      ? "border-l-emerald-400 bg-emerald-500/5"
      : signal.kind === "SELL"
        ? "border-l-rose-400 bg-rose-500/5"
        : "border-l-white/20 bg-white/[0.02]";
  const textTone =
    signal.kind === "BUY" ? "text-emerald-400" : signal.kind === "SELL" ? "text-rose-400" : "text-muted-foreground";
  const time = new Date(signal.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className={`border-l-2 ${tone} rounded-r-lg px-3 py-2 animate-rise`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={`h-3.5 w-3.5 ${textTone} shrink-0`} />
          <span className={`text-xs font-black ${textTone}`}>{signal.kind}</span>
          <img src={signal.token.logo} alt="" className="h-4 w-4 rounded-full" />
          <span className="text-xs font-bold">{signal.token.symbol}</span>
        </div>
        <span className="text-[10px] text-muted-foreground tabular-nums">{time}</span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="text-[10px] text-muted-foreground truncate flex-1">{signal.rationale}</span>
        <span className={`text-[10px] font-bold ${textTone}`}>{signal.confidence}%</span>
      </div>
    </div>
  );
}
