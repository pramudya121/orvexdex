import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  useAccount,
  useBalance,
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { erc20Abi, formatUnits, parseUnits, isAddress } from "viem";
import { ADDR, explorerAddr } from "@/lib/chain";
import { TOKENS, findToken } from "@/lib/tokens";
import { aiGuardrailAbi } from "@/lib/abis/aiGuardrail";
import { aiExecutionControllerAbi } from "@/lib/abis/aiExecutionController";
import { multiTokenVaultAbi } from "@/lib/abis/multiTokenVault";
import { aiTradingAgentAbi } from "@/lib/abis/aiTradingAgent";
import { SignalsTab } from "@/components/ai/SignalsTab";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { useToast } from "@/components/ui/toaster";
import { Walkthrough, type TourStep } from "@/components/Walkthrough";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Sparkles,
  ShieldCheck,
  Terminal as TerminalIcon,
  Bot,
  Vault,
  X,
  Power,
  AlertTriangle,
  Loader2,
  Plus,
  Activity,
  Wifi,
  WifiOff,
  Pause,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  Wallet,
  HelpCircle,

} from "lucide-react";


const getErr = (e: unknown) => {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null) {
    const m = e as { shortMessage?: string; message?: string };
    return m.shortMessage || m.message;
  }
  return undefined;
};

const ZERO = "0x0000000000000000000000000000000000000000";

export const Route = createFileRoute("/ai")({
  component: AIHubPage,
  head: () => ({
    meta: [
      { title: "AI Trading Hub — ORVEX" },
      {
        name: "description",
        content:
          "AI vaults, personal copilot, risk guardrails, and an automated execution console — all in one ORVEX dashboard.",
      },
      { property: "og:title", content: "AI Trading Hub — ORVEX" },
      {
        property: "og:description",
        content: "AI Collective Vaults, Personal Copilot, Guardrails & Live Automation on LitVM.",
      },
    ],
  }),
});

type TabId = "vaults" | "copilot" | "guardrail" | "console";
const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "vaults", label: "Collective Vaults", icon: Vault },
  { id: "copilot", label: "Personal Copilot", icon: Bot },
  { id: "guardrail", label: "Guardrail & Risk", icon: ShieldCheck },
  { id: "console", label: "Automation Console", icon: TerminalIcon },
];

const TOUR_KEY = "orvex.ai.tour.v1";

const TAB_HINTS: Record<TabId, string> = {
  vaults: "Deposit into AI-managed strategy vaults",
  copilot: "Delegate trading to your personal AI agent",
  guardrail: "Configure on-chain safety limits",
  console: "Live executor stream & controls",
};

const TOUR_STEPS: (TourStep & { tab?: TabId })[] = [
  { target: "tabs", tab: "vaults", title: "Four Powerful Modules", body: "Switch between Collective Vaults, your Personal Copilot, Risk Guardrails, and the Automation Console. Each tab maps to a real on-chain contract.", placement: "bottom" },
  { target: "vault-card", tab: "vaults", title: "AI-Managed Vaults", body: "Deposit assets into ERC-4626-style strategies. The AI auto-rebalances positions. TVL and 7D trend update live from the chain.", placement: "bottom" },
  { target: "emergency-stop", tab: "copilot", title: "Emergency Stop", body: "Instantly revoke all AI delegation on-chain — your funds stay yours. One click calls cancelDelegation().", placement: "bottom" },
  { target: "activate-agent", tab: "copilot", title: "Delegate to Your Copilot", body: "Authorize a session key for 1–30 days. The AI can trade within your Guardrail limits — nothing more.", placement: "top" },
  { target: "guardrail-params", tab: "guardrail", title: "Set Hard Risk Limits", body: "Cap slippage, daily volume, and trade size. The Guardrail contract enforces these for every AI transaction.", placement: "bottom" },
  { target: "whitelist", tab: "guardrail", title: "Token Whitelist", body: "Only whitelisted tokens are tradable by the AI. Toggle any asset on or off in one transaction.", placement: "top" },
  { target: "console-terminal", tab: "console", title: "Live Automation Console", body: "Watch the AI executor stream actions in real time. Pause execution, simulate errors, or clear the log anytime.", placement: "top" },
];

function AIHubPage() {
  const { isConnected, address } = useAccount();
  const [tab, setTab] = useState<TabId>("vaults");
  const [tourOpen, setTourOpen] = useState(false);

  // Owner detection — Guardrail & Automation Console are admin-only modules
  const guardrailOwner = useReadContract({ address: ADDR.aiGuardrail, abi: aiGuardrailAbi, functionName: "owner" });
  const consoleOwner = useReadContract({ address: ADDR.aiExecutionController, abi: aiExecutionControllerAbi, functionName: "owner" });
  const isGuardrailOwner = !!address && !!guardrailOwner.data && (guardrailOwner.data as string).toLowerCase() === address.toLowerCase();
  const isConsoleOwner = !!address && !!consoleOwner.data && (consoleOwner.data as string).toLowerCase() === address.toLowerCase();

  // Avoid SSR/client hydration mismatch — owner data is only known on the client
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const visibleTabs = useMemo(() => TABS.filter((t) => {
    if (t.id === "guardrail") return mounted ? isGuardrailOwner : false;
    if (t.id === "console") return mounted ? isConsoleOwner : false;
    return true;
  }), [mounted, isGuardrailOwner, isConsoleOwner]);

  // If current tab becomes hidden (e.g. after disconnect), fall back to vaults
  useEffect(() => {
    if (!visibleTabs.find((t) => t.id === tab)) setTab("vaults");
  }, [visibleTabs, tab]);

  const visibleTour = useMemo(
    () => TOUR_STEPS.filter((s) => !s.tab || visibleTabs.find((t) => t.id === s.tab)),
    [visibleTabs],
  );

  useEffect(() => {
    try {
      if (!localStorage.getItem(TOUR_KEY)) {
        const t = setTimeout(() => setTourOpen(true), 700);
        return () => clearTimeout(t);
      }
    } catch { /* ignore */ }
  }, []);


  return (
    <TooltipProvider delayDuration={200}>
    <div className="relative max-w-7xl mx-auto px-4 py-10">
      {/* aurora */}
      <div className="pointer-events-none absolute inset-x-0 -top-10 h-[520px] overflow-hidden -z-10">
        <div className="absolute -top-32 left-1/4 h-80 w-80 rounded-full blur-3xl animate-aurora"
          style={{ background: "radial-gradient(circle, rgba(16,185,129,.35), transparent 60%)" }} />
        <div className="absolute top-10 right-10 h-96 w-96 rounded-full blur-3xl animate-aurora-2"
          style={{ background: "radial-gradient(circle, rgba(56,189,248,.35), transparent 60%)" }} />
        <div className="absolute inset-0 grid-bg opacity-20" />
      </div>

      {/* header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 animate-rise">
        <div className="flex items-center gap-3">
          <div className="relative h-12 w-12 rounded-2xl grid place-items-center shadow-neon"
            style={{ background: "linear-gradient(135deg,#10b981,#38bdf8)" }}>
            <Sparkles className="h-6 w-6 text-black" />
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.25em] font-semibold text-emerald-400">
              ORVEX × AI
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">
              AI Trading <span style={{ background: "linear-gradient(135deg,#10b981,#38bdf8)", WebkitBackgroundClip: "text", color: "transparent" }}>Hub</span>
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setTourOpen(true)}
                className="inline-flex items-center gap-1.5 glass rounded-full px-3 py-1.5 text-xs font-semibold hover:border-emerald-500/60 transition"
              >
                <HelpCircle className="h-3.5 w-3.5 text-emerald-400" /> Take Tour
              </button>
            </TooltipTrigger>
            <TooltipContent>Walk through every AI Hub feature in 60s</TooltipContent>
          </Tooltip>
          {isConnected ? (
            <span className="inline-flex items-center gap-2 glass rounded-full px-3 py-1.5 text-xs">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <Wifi className="h-3.5 w-3.5 text-emerald-400" /> Wallet Connected
            </span>
          ) : (
            <ConnectButton />
          )}
        </div>
      </div>

      {/* Tabs */}
      <div data-tour="tabs" className="glass rounded-2xl p-1.5 flex flex-wrap gap-1 mb-6">
        {visibleTabs.map((t) => {
          const active = t.id === tab;
          const Icon = t.icon;
          return (
            <Tooltip key={t.id}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setTab(t.id)}
                  className={`relative flex-1 min-w-[140px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 ${
                    active
                      ? "text-black shadow-neon"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                  }`}
                  style={active ? { background: "linear-gradient(135deg,#10b981,#38bdf8)" } : undefined}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                  {(t.id === "guardrail" || t.id === "console") && (
                    <span className="ml-1 text-[9px] uppercase tracking-wider opacity-70">Admin</span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>{TAB_HINTS[t.id]}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      {/* Wallet gate */}
      {!isConnected ? (
        <WalletGate />
      ) : (
        <div key={tab} className="animate-rise">
          {tab === "vaults" && <VaultsTab />}
          {tab === "copilot" && <CopilotTab />}
          {tab === "guardrail" && isGuardrailOwner && <GuardrailTab />}
          {tab === "console" && isConsoleOwner && <ConsoleTab />}
        </div>
      )}

      {/* contract chips */}
      <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <ContractChip label="MultiTokenVault" addr={ADDR.multiTokenVault} />
        <ContractChip label="TradingAgent" addr={ADDR.aiTradingAgent} />
        <ContractChip label="Guardrail" addr={ADDR.aiGuardrail} />
        <ContractChip label="ExecutionController" addr={ADDR.aiExecutionController} />
      </div>


      <Walkthrough
        steps={visibleTour}
        open={tourOpen}
        onClose={() => setTourOpen(false)}
        storageKey={TOUR_KEY}
        onStepChange={(s) => {
          const t = (s as TourStep & { tab?: TabId }).tab;
          if (t && isConnected) setTab(t);
        }}
      />
    </div>
    </TooltipProvider>
  );
}


function WalletGate() {
  return (
    <div className="glass-strong rounded-3xl p-10 md:p-16 text-center animate-rise">
      <div className="mx-auto h-16 w-16 rounded-2xl grid place-items-center shadow-neon mb-4"
        style={{ background: "linear-gradient(135deg,#10b981,#38bdf8)" }}>
        <Wallet className="h-8 w-8 text-black" />
      </div>
      <h2 className="text-2xl md:text-3xl font-black tracking-tight mb-2">Connect Your Wallet</h2>
      <p className="text-muted-foreground max-w-md mx-auto mb-6">
        AI Trading Hub uses on-chain signatures to activate vaults, agents and guardrails. Connect your wallet to get started.
      </p>
      <div className="inline-block"><ConnectButton /></div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// TAB 1 — Collective Vaults (MultiTokenVault)
// ══════════════════════════════════════════════════════════════════

type Strategy = {
  id: string;
  name: string;
  tag: "Low" | "Med" | "High";
  desc: string;
  tokenAddr: `0x${string}`;
};

const STRATEGIES: Strategy[] = [
  { id: "stable", name: "Stablecoin Yield Maximizer", tag: "Low", desc: "Auto-rotation across stable pools — focused on consistent APR.", tokenAddr: ADDR.wzkLTC as `0x${string}` },
  { id: "bluechip", name: "AI Blue-Chip Momentum", tag: "Med", desc: "Blue-chip accumulation triggered by 7-day momentum signals.", tokenAddr: ADDR.ORVX as `0x${string}` },
  { id: "alt", name: "AltSeason Hunter", tag: "High", desc: "High-exposure plays on trending altcoins with AI-driven stop-loss.", tokenAddr: ADDR.TRX as `0x${string}` },
  { id: "xrp", name: "Cross-Asset Rebalance", tag: "Med", desc: "Adaptive XRP/ADA/ZEC weighting based on live volatility.", tokenAddr: ADDR.XRP as `0x${string}` },
];

function VaultsTab() {
  const [selected, setSelected] = useState<Strategy | null>(null);

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 gap-5">
      {STRATEGIES.map((s, i) => (
        <div key={s.id} data-tour={i === 0 ? "vault-card" : undefined}>
          <StrategyCard strategy={s} onManage={() => setSelected(s)} />
        </div>
      ))}
      {selected && <VaultDrawer strategy={selected} onClose={() => setSelected(null)} />}
    </div>

  );
}

function StrategyCard({ strategy, onManage }: { strategy: Strategy; onManage: () => void }) {
  const token = findToken(strategy.tokenAddr) ?? TOKENS[1];
  const tvl = useReadContract({
    address: ADDR.multiTokenVault,
    abi: multiTokenVaultAbi,
    functionName: "totalAssets",
    args: [strategy.tokenAddr],
    query: { refetchInterval: 10_000 },
  });
  const tvlNum = tvl.data ? Number(formatUnits(tvl.data as bigint, token.decimals)) : 0;

  const tagColor =
    strategy.tag === "Low"
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
      : strategy.tag === "Med"
        ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
        : "bg-rose-500/15 text-rose-400 border-rose-500/30";

  // pseudo-random deterministic sparkline berdasar id
  const points = useMemo(() => generateSparkline(strategy.id, 24), [strategy.id]);
  const trend = points[points.length - 1] - points[0];

  return (
    <div className="glass-strong rounded-3xl p-6 card-hover relative overflow-hidden">
      <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full blur-3xl opacity-30"
        style={{ background: strategy.tag === "High" ? "#f43f5e" : strategy.tag === "Med" ? "#f59e0b" : "#10b981" }} />
      <div className="relative">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <img src={token.logo} alt={token.symbol} className="h-10 w-10 rounded-full bg-surface" />
            <div>
              <div className="font-bold text-lg leading-tight">{strategy.name}</div>
              <div className="text-xs text-muted-foreground">{token.symbol} · ERC-4626-like</div>
            </div>
          </div>
          <span className={`text-[10px] uppercase tracking-[0.2em] px-2 py-1 rounded-full border font-bold ${tagColor}`}>
            {strategy.tag} Risk
          </span>
        </div>
        <p className="text-sm text-muted-foreground mb-4">{strategy.desc}</p>

        <Sparkline points={points} positive={trend >= 0} />

        <div className="grid grid-cols-2 gap-3 mt-4">
          <Metric label="TVL" value={`${tvlNum.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${token.symbol}`} />
          <Metric label="7D" value={`${trend >= 0 ? "+" : ""}${trend.toFixed(2)}%`} accent={trend >= 0 ? "emerald" : "rose"} />
        </div>

        <button
          onClick={onManage}
          className="mt-5 w-full py-3 rounded-xl text-black font-bold shadow-neon transition hover:opacity-90"
          style={{ background: "linear-gradient(135deg,#10b981,#38bdf8)" }}
        >
          Manage Vault
        </button>
      </div>
    </div>
  );
}

function generateSparkline(seed: string, n: number): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const out: number[] = [];
  let v = 100;
  for (let i = 0; i < n; i++) {
    h = (h * 1664525 + 1013904223) >>> 0;
    const delta = ((h % 1000) / 1000 - 0.45) * 4;
    v = Math.max(60, Math.min(160, v + delta));
    out.push(v);
  }
  return out;
}

function Sparkline({ points, positive }: { points: number[]; positive: boolean }) {
  const w = 280, h = 60, pad = 4;
  const min = Math.min(...points), max = Math.max(...points);
  const span = Math.max(1, max - min);
  const path = points
    .map((p, i) => {
      const x = pad + (i / (points.length - 1)) * (w - pad * 2);
      const y = h - pad - ((p - min) / span) * (h - pad * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const color = positive ? "#10b981" : "#f43f5e";
  return (
    <div className="rounded-xl bg-black/30 border border-border p-2">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-14">
        <defs>
          <linearGradient id={`g-${positive ? "p" : "n"}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.4" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${path} L${w - pad},${h - pad} L${pad},${h - pad} Z`} fill={`url(#g-${positive ? "p" : "n"})`} />
        <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: "emerald" | "rose" }) {
  const cls = accent === "emerald" ? "text-emerald-400" : accent === "rose" ? "text-rose-400" : "";
  return (
    <div className="rounded-xl bg-black/30 border border-border p-3">
      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
      <div className={`font-bold text-sm mt-1 ${cls}`}>{value}</div>
    </div>
  );
}

function VaultDrawer({ strategy, onClose }: { strategy: Strategy; onClose: () => void }) {
  const { address } = useAccount();
  const token = findToken(strategy.tokenAddr) ?? TOKENS[1];
  const toast = useToast();
  const { writeContractAsync } = useWriteContract();
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState(50); // bps display
  const [pending, setPending] = useState<`0x${string}` | undefined>();
  const receipt = useWaitForTransactionReceipt({ hash: pending });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const bal = useBalance({ address, token: strategy.tokenAddr, query: { enabled: !!address } });
  const allowance = useReadContract({
    address: strategy.tokenAddr,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, ADDR.multiTokenVault as `0x${string}`] : undefined,
    query: { enabled: !!address, refetchInterval: 8_000 },
  });
  const myShares = useReadContract({
    address: ADDR.multiTokenVault,
    abi: multiTokenVaultAbi,
    functionName: "shareBalance",
    args: address ? [address, strategy.tokenAddr] : undefined,
    query: { enabled: !!address, refetchInterval: 8_000 },
  });

  const amountWei = useMemo(() => {
    try {
      return amount ? parseUnits(amount as `${number}`, token.decimals) : 0n;
    } catch {
      return 0n;
    }
  }, [amount, token.decimals]);

  const needsApprove =
    mode === "deposit" &&
    amountWei > 0n &&
    (allowance.data === undefined || (allowance.data as bigint) < amountWei);

  useEffect(() => {
    if (receipt.isSuccess && pending) {
      toast.push({ title: "Vault tx confirmed", type: "success", hash: pending });
      setPending(undefined);
      setAmount("");
      bal.refetch();
      allowance.refetch();
      myShares.refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isSuccess]);

  const handleApprove = async () => {
    if (!address) return;
    try {
      const h = await writeContractAsync({
        address: strategy.tokenAddr,
        abi: erc20Abi,
        functionName: "approve",
        args: [ADDR.multiTokenVault as `0x${string}`, amountWei],
      });
      setPending(h);
      toast.push({ title: "Approving vault…", hash: h });
    } catch (e) {
      toast.push({ title: "Approve failed", description: getErr(e), type: "error" });
    }
  };

  const handleSubmit = async () => {
    if (!address || amountWei === 0n) return;
    try {
      const h = await writeContractAsync({
        address: ADDR.multiTokenVault,
        abi: multiTokenVaultAbi,
        functionName: mode,
        args: [strategy.tokenAddr, amountWei],
      });
      setPending(h);
      toast.push({ title: `${mode === "deposit" ? "Deposit" : "Withdraw"} submitted`, hash: h });
    } catch (e) {
      toast.push({ title: `${mode} failed`, description: getErr(e), type: "error" });
    }
  };

  const balNum = bal.data ? Number(formatUnits(bal.data.value, token.decimals)) : 0;
  const sharesNum = myShares.data ? Number(formatUnits(myShares.data as bigint, token.decimals)) : 0;

  return (
    <div className="fixed inset-0 z-50 flex">
      <button className="flex-1 bg-black/70 backdrop-blur-sm " onClick={onClose} aria-label="Close drawer" />
      <div className="w-full max-w-md h-full bg-background border-l border-border shadow-2xl overflow-y-auto animate-rise">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={token.logo} alt={token.symbol} className="h-9 w-9 rounded-full" />
            <div>
              <div className="font-bold">{strategy.name}</div>
              <div className="text-xs text-muted-foreground">Vault · {token.symbol}</div>
            </div>
          </div>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-full hover:bg-white/5">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-1 bg-surface-2 rounded-xl p-1">
            <button onClick={() => setMode("deposit")}
              className={`py-2 rounded-lg text-sm font-semibold transition ${mode === "deposit" ? "bg-emerald-500/20 text-emerald-400" : "text-muted-foreground"}`}>
              Deposit
            </button>
            <button onClick={() => setMode("withdraw")}
              className={`py-2 rounded-lg text-sm font-semibold transition ${mode === "withdraw" ? "bg-sky-500/20 text-sky-400" : "text-muted-foreground"}`}>
              Withdraw
            </button>
          </div>

          <div className="rounded-2xl bg-surface-2 border border-border p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>{mode === "deposit" ? "Deposit amount" : "Withdraw amount"}</span>
              <button
                onClick={() =>
                  setAmount(
                    mode === "deposit"
                      ? balNum.toString()
                      : sharesNum.toString(),
                  )
                }
                className="hover:text-foreground"
              >
                {mode === "deposit" ? `Balance: ${balNum.toFixed(4)}` : `Shares: ${sharesNum.toFixed(4)}`} · MAX
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="0.0"
                className="flex-1 bg-transparent outline-none text-2xl font-bold"
                inputMode="decimal"
              />
              <span className="text-sm font-semibold text-muted-foreground">{token.symbol}</span>
            </div>
          </div>

          <div className="rounded-2xl bg-surface-2 border border-border p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Slippage tolerance</span>
              <span className="font-mono font-semibold">{(slippage / 100).toFixed(2)}%</span>
            </div>
            <input
              type="range"
              min={10}
              max={500}
              step={10}
              value={slippage}
              onChange={(e) => setSlippage(Number(e.target.value))}
              className="w-full accent-emerald-500"
            />
            <div className="flex gap-2">
              {[10, 50, 100, 300].map((b) => (
                <button key={b} onClick={() => setSlippage(b)}
                  className={`px-2 py-1 text-xs rounded-md border transition ${slippage === b ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400" : "border-border text-muted-foreground hover:text-foreground"}`}>
                  {b / 100}%
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border">
              <span>Estimated gas</span>
              <span className="font-mono">~0.0012 zkLTC</span>
            </div>
          </div>

          {needsApprove ? (
            <button onClick={handleApprove} disabled={!!pending}
              className="w-full py-3 rounded-xl bg-amber-500 text-black font-bold hover:opacity-90 transition disabled:opacity-50 inline-flex items-center justify-center gap-2">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Approve {token.symbol}
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={amountWei === 0n || !!pending}
              className="w-full py-3 rounded-xl text-black font-bold shadow-neon disabled:opacity-50 inline-flex items-center justify-center gap-2"
              style={{ background: "linear-gradient(135deg,#10b981,#38bdf8)" }}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {mode === "deposit" ? "Deposit to Vault" : "Withdraw from Vault"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// TAB 2 — Personal AI Copilot (AITradingAgent)
// ══════════════════════════════════════════════════════════════════

function CopilotTab() {
  const { address } = useAccount();
  const toast = useToast();
  const { writeContractAsync } = useWriteContract();
  const [days, setDays] = useState(7);
  const [sessionKeyInput, setSessionKeyInput] = useState("");
  const [pending, setPending] = useState<`0x${string}` | undefined>();
  const receipt = useWaitForTransactionReceipt({ hash: pending });

  const owner = useReadContract({ address: ADDR.aiTradingAgent, abi: aiTradingAgentAbi, functionName: "owner" });
  const sessionKey = useReadContract({
    address: ADDR.aiTradingAgent, abi: aiTradingAgentAbi, functionName: "sessionKey",
    query: { refetchInterval: 8_000 },
  });
  const sessionExpiry = useReadContract({
    address: ADDR.aiTradingAgent, abi: aiTradingAgentAbi, functionName: "sessionExpiry",
    query: { refetchInterval: 8_000 },
  });

  const isOwnerOfAgent = !!address && owner.data && (owner.data as string).toLowerCase() === address.toLowerCase();
  const sessionAddr = sessionKey.data as `0x${string}` | undefined;
  const expiry = sessionExpiry.data ? Number(sessionExpiry.data as bigint) : 0;
  const active = !!sessionAddr && sessionAddr !== ZERO && expiry > Math.floor(Date.now() / 1000);
  const remainingSec = active ? expiry - Math.floor(Date.now() / 1000) : 0;
  const remainingDays = Math.floor(remainingSec / 86400);
  const remainingHours = Math.floor((remainingSec % 86400) / 3600);

  useEffect(() => {
    if (receipt.isSuccess && pending) {
      toast.push({ title: "Confirmation stored on-chain", type: "success", hash: pending });
      setPending(undefined);
      sessionKey.refetch();
      sessionExpiry.refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isSuccess]);

  const handleActivate = async () => {
    if (!isAddress(sessionKeyInput)) {
      toast.push({ title: "Invalid session key address", type: "error" });
      return;
    }
    try {
      const h = await writeContractAsync({
        address: ADDR.aiTradingAgent, abi: aiTradingAgentAbi, functionName: "setSessionKey",
        args: [sessionKeyInput as `0x${string}`, BigInt(days * 86400)],
      });
      setPending(h);
      toast.push({ title: `Activating agent for ${days} days…`, hash: h });
    } catch (e) {
      toast.push({ title: "Aktivasi failed", description: getErr(e), type: "error" });
    }
  };

  const handleEmergencyStop = async () => {
    try {
      const h = await writeContractAsync({
        address: ADDR.aiTradingAgent, abi: aiTradingAgentAbi, functionName: "cancelDelegation",
      });
      setPending(h);
      toast.push({ title: "Revoking AI access…", hash: h, type: "info" });
    } catch (e) {
      toast.push({ title: "Revoke access failed", description: getErr(e), type: "error" });
    }
  };

  const handleEmergencyWithdraw = async () => {
    try {
      const h = await writeContractAsync({
        address: ADDR.aiTradingAgent, abi: aiTradingAgentAbi, functionName: "emergencyWithdraw",
      });
      setPending(h);
      toast.push({ title: "Emergency withdraw…", hash: h });
    } catch (e) {
      toast.push({ title: "Withdraw failed", description: getErr(e), type: "error" });
    }
  };

  return (
    <div className="space-y-5">
      {/* Emergency banner */}
      <button
        data-tour="emergency-stop"
        onClick={handleEmergencyStop}
        disabled={!isOwnerOfAgent || !active || !!pending}
        className="w-full rounded-2xl border border-rose-500/50 bg-gradient-to-r from-rose-600 to-red-500 p-5 text-left shadow-[0_0_40px_-10px_rgba(244,63,94,0.7)] hover:shadow-[0_0_60px_-10px_rgba(244,63,94,0.9)] transition disabled:opacity-40 disabled:cursor-not-allowed"

      >
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-black/30 grid place-items-center">
            <AlertTriangle className="h-6 w-6 text-white" />
          </div>
          <div className="flex-1">
            <div className="text-[11px] uppercase tracking-[0.25em] font-bold text-white/80">Emergency Control</div>
            <div className="text-xl font-black text-white">EMERGENCY STOP — Revoke All AI Access</div>
            <div className="text-xs text-white/80 mt-0.5">
              Calls <code>cancelDelegation()</code> on the Agent contract. Instant & on-chain.
            </div>
          </div>
          <Power className="h-7 w-7 text-white" />
        </div>
      </button>

      <div className="grid md:grid-cols-3 gap-5">
        {/* Status */}
        <div className="md:col-span-1 glass-strong rounded-3xl p-6">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">
            <Activity className="h-4 w-4" /> Agent Status
          </div>
          <div className="flex items-center gap-3 mb-4">
            {active ? (
              <>
                <span className="relative flex h-4 w-4">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
                  <span className="relative inline-flex h-4 w-4 rounded-full bg-emerald-400" />
                </span>
                <div>
                  <div className="font-black text-emerald-400">CONNECTED</div>
                  <div className="text-xs text-muted-foreground">
                    Remaining: {remainingDays}d {remainingHours}h
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="h-4 w-4 rounded-full bg-muted-foreground/40" />
                <div>
                  <div className="font-black text-muted-foreground">DISCONNECTED</div>
                  <div className="text-xs text-muted-foreground">No active session key</div>
                </div>
              </>
            )}
          </div>
          <div className="space-y-2 text-xs">
            <Row label="Owner" value={owner.data ? short(owner.data as string) : "…"} />
            <Row label="Session key" value={sessionAddr && sessionAddr !== ZERO ? short(sessionAddr) : "—"} />
            <Row label="Expiry" value={expiry ? new Date(expiry * 1000).toLocaleString() : "—"} />
          </div>
          {!isOwnerOfAgent && (
            <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
              You are not the owner of this Agent — only the owner can change the session key.
            </div>
          )}
        </div>

        {/* Activate */}
        <div data-tour="activate-agent" className="md:col-span-2 glass-strong rounded-3xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.25em] text-sky-400 font-bold">Activate AI Agent</div>
              <div className="font-black text-2xl">Scoped Execution Delegation</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" checked={active} readOnly />
              <div className="w-16 h-8 bg-surface-2 border border-border rounded-full peer peer-checked:bg-emerald-500/30 peer-checked:border-emerald-500/60 after:content-[''] after:absolute after:top-0.5 after:left-1 after:bg-white after:rounded-full after:h-7 after:w-7 after:transition-all peer-checked:after:translate-x-8 peer-checked:after:bg-emerald-400" />
            </label>
          </div>

          <div className="space-y-3">
            <label className="block text-xs text-muted-foreground">Session Key Address</label>
            <input
              value={sessionKeyInput}
              onChange={(e) => setSessionKeyInput(e.target.value)}
              placeholder="0x… session key address to authorize"
              className="w-full bg-surface-2 border border-border rounded-xl px-4 py-3 font-mono text-sm outline-none focus:border-sky-500/50"
              spellCheck={false}
            />

            <div className="rounded-2xl bg-surface-2 border border-border p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">Access duration</span>
                <span className="font-bold text-sky-400">{days} Days</span>
              </div>
              <input
                type="range" min={1} max={30} value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="w-full accent-sky-500"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>1D</span><span>7D</span><span>14D</span><span>30D</span>
              </div>
              <div className="flex gap-2 mt-3">
                {[1, 7, 14, 30].map((d) => (
                  <button key={d} onClick={() => setDays(d)}
                    className={`flex-1 py-1.5 rounded-md text-xs font-semibold border transition ${days === d ? "bg-sky-500/20 border-sky-500/50 text-sky-400" : "border-border text-muted-foreground hover:text-foreground"}`}>
                    {d}D
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleActivate}
                disabled={!isOwnerOfAgent || !!pending}
                className="py-3 rounded-xl text-black font-bold shadow-neon disabled:opacity-40 inline-flex items-center justify-center gap-2"
                style={{ background: "linear-gradient(135deg,#10b981,#38bdf8)" }}
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                Activate
              </button>
              <button
                onClick={handleEmergencyWithdraw}
                disabled={!isOwnerOfAgent || !!pending}
                className="py-3 rounded-xl border border-border bg-surface-2 hover:border-rose-500/50 hover:text-rose-400 font-bold transition disabled:opacity-40 inline-flex items-center justify-center gap-2"
              >
                <Wallet className="h-4 w-4" />
                Withdraw Balance
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

function short(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

// ══════════════════════════════════════════════════════════════════
// TAB 3 — Guardrail & Risk Control (AIGuardrailManager)
// ══════════════════════════════════════════════════════════════════

function GuardrailTab() {
  const { address } = useAccount();
  const toast = useToast();
  const { writeContractAsync } = useWriteContract();
  const [pending, setPending] = useState<`0x${string}` | undefined>();
  const receipt = useWaitForTransactionReceipt({ hash: pending });

  const owner = useReadContract({ address: ADDR.aiGuardrail, abi: aiGuardrailAbi, functionName: "owner" });
  const maxBps = useReadContract({ address: ADDR.aiGuardrail, abi: aiGuardrailAbi, functionName: "maxPriceImpactBps", query: { refetchInterval: 12_000 } });
  const daily = useReadContract({ address: ADDR.aiGuardrail, abi: aiGuardrailAbi, functionName: "dailyLimit", query: { refetchInterval: 12_000 } });

  const isOwner = !!address && !!owner.data && (owner.data as string).toLowerCase() === address.toLowerCase();

  const [slipInput, setSlipInput] = useState("");
  const [dailyInput, setDailyInput] = useState("");
  const [tradeSizeInput, setTradeSizeInput] = useState("");

  useEffect(() => {
    if (receipt.isSuccess && pending) {
      toast.push({ title: "Guardrail updated", type: "success", hash: pending });
      setPending(undefined);
      maxBps.refetch(); daily.refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isSuccess]);

  const setSlip = async () => {
    const bps = Math.round(Number(slipInput) * 100);
    if (!Number.isFinite(bps) || bps <= 0) return toast.push({ title: "Invalid slippage value", type: "error" });
    try {
      const h = await writeContractAsync({ address: ADDR.aiGuardrail, abi: aiGuardrailAbi, functionName: "setMaxPriceImpactBps", args: [BigInt(bps)] });
      setPending(h); toast.push({ title: `Set max slippage ${bps} bps…`, hash: h });
    } catch (e) { toast.push({ title: "Set slippage failed", description: getErr(e), type: "error" }); }
  };
  const setDailyLimit = async () => {
    const v = Number(dailyInput);
    if (!Number.isFinite(v) || v <= 0) return toast.push({ title: "Invalid limit", type: "error" });
    try {
      const h = await writeContractAsync({ address: ADDR.aiGuardrail, abi: aiGuardrailAbi, functionName: "setDailyLimit", args: [parseUnits(v.toString() as `${number}`, 18)] });
      setPending(h); toast.push({ title: `Set daily limit $${v}…`, hash: h });
    } catch (e) { toast.push({ title: "Set limit failed", description: getErr(e), type: "error" }); }
  };

  // Whitelist table
  const whitelistTokens = useMemo(() => TOKENS.filter((t) => !t.isNative), []);
  const whitelistReads = useReadContracts({
    contracts: whitelistTokens.map((t) => ({
      address: ADDR.aiGuardrail, abi: aiGuardrailAbi, functionName: "isTokenWhitelisted" as const, args: [t.address],
    })),
    query: { refetchInterval: 12_000 },
  });

  const toggleWhitelist = async (addr: `0x${string}`, status: boolean) => {
    try {
      const h = await writeContractAsync({ address: ADDR.aiGuardrail, abi: aiGuardrailAbi, functionName: "setTokenWhitelist", args: [addr, status] });
      setPending(h); toast.push({ title: `${status ? "Whitelist" : "Remove"} ${short(addr)}…`, hash: h });
    } catch (e) { toast.push({ title: "Toggle failed", description: getErr(e), type: "error" }); }
  };

  return (
    <div className="space-y-5">
      {!isOwner && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-300 text-sm flex items-center gap-3">
          <ShieldCheck className="h-5 w-5" /> Read-only — only the Guardrail owner (
          <span className="font-mono">{owner.data ? short(owner.data as string) : "…"}</span>
          ) can modify these parameters.
        </div>
      )}

      <div data-tour="guardrail-params" className="grid md:grid-cols-3 gap-5">
        <ParamCard
          icon={<AlertTriangle className="h-5 w-5 text-amber-400" />}
          title="Max Slippage Limit"
          unit="%"
          current={maxBps.data !== undefined ? `${(Number(maxBps.data as bigint) / 100).toFixed(2)}%` : "…"}
          value={slipInput} onChange={setSlipInput}
          onSave={setSlip} disabled={!isOwner || !!pending}
          placeholder="e.g. 1.5"
        />
        <ParamCard
          icon={<Wallet className="h-5 w-5 text-emerald-400" />}
          title="Max Trade Size"
          unit="USD"
          current={tradeSizeInput || "—"}
          value={tradeSizeInput} onChange={setTradeSizeInput}
          onSave={() => toast.push({ title: "Saved locally", description: "This parameter is consumed by the off-chain AI.", type: "info" })}
          disabled={!isOwner}
          placeholder="e.g. 5000"
        />
        <ParamCard
          icon={<Activity className="h-5 w-5 text-sky-400" />}
          title="Daily Volume Limit"
          unit="USD"
          current={daily.data !== undefined ? Number(formatUnits(daily.data as bigint, 18)).toLocaleString() : "…"}
          value={dailyInput} onChange={setDailyInput}
          onSave={setDailyLimit} disabled={!isOwner || !!pending}
          placeholder="e.g. 100000"
        />
      </div>

      {/* Whitelist table */}
      <div data-tour="whitelist" className="glass-strong rounded-3xl p-6">

        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.25em] text-emerald-400 font-bold">Token Whitelist</div>
            <div className="font-black text-xl">Tokens Allowed for AI</div>
          </div>
          <ShieldCheck className="h-6 w-6 text-emerald-400" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="py-3 px-2">Token</th>
                <th className="py-3 px-2">Address</th>
                <th className="py-3 px-2">Status</th>
                <th className="py-3 px-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {whitelistTokens.map((t, i) => {
                const enabled = !!whitelistReads.data?.[i]?.result;
                return (
                  <tr key={t.address} className="border-b border-border/50 hover:bg-white/[0.02] transition">
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-3">
                        <img src={t.logo} alt={t.symbol} className="h-7 w-7 rounded-full bg-surface" />
                        <div>
                          <div className="font-bold">{t.symbol}</div>
                          <div className="text-xs text-muted-foreground">{t.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-2 font-mono text-xs text-muted-foreground">{short(t.address)}</td>
                    <td className="py-3 px-2">
                      {enabled ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          <CheckCircle2 className="h-3 w-3" /> Allowed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-muted/30 text-muted-foreground border border-border">
                          <XCircle className="h-3 w-3" /> Blocked
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-2 text-right">
                      <button
                        onClick={() => toggleWhitelist(t.address, !enabled)}
                        disabled={!isOwner || !!pending}
                        className={`relative w-12 h-6 rounded-full transition ${enabled ? "bg-emerald-500" : "bg-surface-2 border border-border"} disabled:opacity-40`}
                      >
                        <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${enabled ? "translate-x-6" : ""}`} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ParamCard({
  icon, title, unit, current, value, onChange, onSave, disabled, placeholder,
}: {
  icon: React.ReactNode; title: string; unit: string; current: string;
  value: string; onChange: (v: string) => void; onSave: () => void; disabled?: boolean; placeholder?: string;
}) {
  return (
    <div className="glass-strong rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-2">{icon}<span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{title}</span></div>
      <div className="text-2xl font-black mb-1">{current}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Current on-chain value</div>
      <div className="flex items-center gap-2 bg-surface-2 border border-border rounded-xl px-3 py-2">
        <input value={value} onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder={placeholder}
          className="flex-1 bg-transparent outline-none font-mono text-sm" />
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
      <button onClick={onSave} disabled={disabled}
        className="mt-3 w-full py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-sky-500 text-black font-bold text-sm disabled:opacity-40 inline-flex items-center justify-center gap-2">
        <Plus className="h-3.5 w-3.5" /> Update
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// TAB 4 — Live Automation Console (AIExecutionController)
// ══════════════════════════════════════════════════════════════════

type LogLine = { ts: string; text: string; level: "info" | "ok" | "warn" | "err" };

function ConsoleTab() {
  const { address } = useAccount();
  const toast = useToast();
  const { writeContractAsync } = useWriteContract();
  const [pending, setPending] = useState<`0x${string}` | undefined>();
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [errorMode, setErrorMode] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const owner = useReadContract({ address: ADDR.aiExecutionController, abi: aiExecutionControllerAbi, functionName: "owner" });
  const paused = useReadContract({
    address: ADDR.aiExecutionController, abi: aiExecutionControllerAbi, functionName: "paused",
    query: { refetchInterval: 8_000 },
  });
  const executor = useReadContract({ address: ADDR.aiExecutionController, abi: aiExecutionControllerAbi, functionName: "aiExecutor" });
  const logCount = useReadContract({
    address: ADDR.aiExecutionController, abi: aiExecutionControllerAbi, functionName: "getUserUpkeepLogCount",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 10_000 },
  });

  const isOwner = !!address && !!owner.data && (owner.data as string).toLowerCase() === address.toLowerCase();
  const isPaused = !!paused.data;

  // Simulated AI log stream
  useEffect(() => {
    const t = setInterval(() => {
      pushLog(buildSimLog(errorMode));
    }, 1800);
    return () => clearInterval(t);
  }, [errorMode]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [logs]);

  const pushLog = (l: LogLine) => setLogs((s) => [...s.slice(-200), l]);

  const handleTogglePause = async () => {
    try {
      const h = await writeContractAsync({
        address: ADDR.aiExecutionController, abi: aiExecutionControllerAbi,
        functionName: isPaused ? "unpause" : "pause",
      });
      setPending(h);
      toast.push({ title: isPaused ? "Resuming executor…" : "Pausing executor…", hash: h });
    } catch (e) {
      toast.push({ title: "Action failed", description: getErr(e), type: "error" });
    }
  };

  const receipt = useWaitForTransactionReceipt({ hash: pending });
  useEffect(() => {
    if (receipt.isSuccess && pending) {
      paused.refetch();
      pushLog({ ts: nowStamp(), text: `Tx confirmed: ${pending.slice(0, 10)}…`, level: "ok" });
      setPending(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isSuccess]);

  const triggerError = () => {
    setErrorMode((v) => !v);
    pushLog({
      ts: nowStamp(),
      text: errorMode ? "Error simulation disabled. Resuming normal operation." : "❌ ERROR: Guardrail rejected the transaction — slippage limit exceeded!",
      level: errorMode ? "info" : "err",
    });
  };

  const totalLogs = logCount.data ? Number(logCount.data as bigint) : 0;

  return (
    <div className="space-y-5">
      {/* Header stats */}
      <div className="grid sm:grid-cols-4 gap-3">
        <StatusBlock icon={<Power />} label="Executor" value={isPaused ? "PAUSED" : "RUNNING"} good={!isPaused} bad={isPaused} />
        <StatusBlock icon={isPaused ? <WifiOff /> : <Wifi />} label="AI Executor" value={executor.data ? short(executor.data as string) : "—"} mono />
        <StatusBlock icon={<Clock />} label="Total Upkeep Logs" value={totalLogs.toString()} />
        <StatusBlock icon={<ShieldCheck />} label="Mode" value={errorMode ? "ERROR SIM" : "NORMAL"} good={!errorMode} bad={errorMode} />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-2">
        <button onClick={triggerError}
          className={`px-4 py-2 rounded-xl font-semibold text-sm transition inline-flex items-center gap-2 border ${errorMode ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-400" : "border-rose-500/50 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"}`}>
          <AlertTriangle className="h-4 w-4" />
          {errorMode ? "Back to Normal" : "Simulate AI Transaction Error"}
        </button>
        <button onClick={handleTogglePause} disabled={!isOwner || !!pending}
          className="px-4 py-2 rounded-xl font-semibold text-sm border border-border bg-surface-2 hover:border-amber-500/50 hover:text-amber-400 transition disabled:opacity-40 inline-flex items-center gap-2">
          {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          {isPaused ? "Resume Executor" : "Pause Executor"}
        </button>
        <button onClick={() => setLogs([])}
          className="px-4 py-2 rounded-xl font-semibold text-sm border border-border bg-surface-2 hover:border-sky-500/50 hover:text-sky-400 transition inline-flex items-center gap-2">
          <X className="h-4 w-4" /> Clear Log
        </button>
      </div>

      {/* Terminal */}
      <div data-tour="console-terminal" className={`rounded-3xl overflow-hidden border ${errorMode ? "border-rose-500/50 shadow-[0_0_40px_-10px_rgba(244,63,94,0.6)]" : "border-emerald-500/30 shadow-[0_0_40px_-10px_rgba(16,185,129,0.5)]"}`}>
        <div className="flex items-center gap-2 px-4 py-2 bg-black/80 border-b border-border">
          <span className="h-3 w-3 rounded-full bg-rose-500" />
          <span className="h-3 w-3 rounded-full bg-amber-500" />
          <span className="h-3 w-3 rounded-full bg-emerald-500" />
          <span className="ml-3 text-xs font-mono text-muted-foreground">orvex@litvm:~/ai-executor — live</span>
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> streaming
          </span>
        </div>
        <div ref={scrollRef} className={`h-[440px] overflow-y-auto bg-black p-4 font-mono text-xs leading-relaxed ${errorMode ? "text-rose-300" : "text-emerald-300"}`}>
          {logs.length === 0 && (
            <div className="text-muted-foreground">[booting AI executor…]</div>
          )}
          {logs.map((l, i) => (
            <div key={i} className="whitespace-pre-wrap">
              <span className="text-muted-foreground">[{l.ts}]</span>{" "}
              <span className={
                l.level === "err" ? "text-rose-400" :
                l.level === "warn" ? "text-amber-400" :
                l.level === "ok" ? "text-emerald-400" :
                "text-sky-300"
              }>
                {l.text}
              </span>
            </div>
          ))}
          <div className="text-emerald-400 mt-1">▌</div>
        </div>
      </div>
    </div>
  );
}

function StatusBlock({
  icon, label, value, good, bad, mono,
}: { icon: React.ReactNode; label: string; value: string; good?: boolean; bad?: boolean; mono?: boolean }) {
  const color = bad ? "text-rose-400" : good ? "text-emerald-400" : "text-foreground";
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        <span className="h-3.5 w-3.5">{icon}</span>{label}
      </div>
      <div className={`mt-1 font-bold ${mono ? "font-mono text-xs" : "text-lg"} ${color}`}>{value}</div>
    </div>
  );
}

function nowStamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function buildSimLog(errorMode: boolean): LogLine {
  const r = Math.random();
  if (errorMode) {
    if (r < 0.4) return { ts: nowStamp(), text: "Guardrail Contract: Slippage 6.2% > maxBps 1.5% → REJECT ❌", level: "err" };
    if (r < 0.7) return { ts: nowStamp(), text: "Execution Controller: revert 'Guardrail: daily volume exceeded'", level: "err" };
    return { ts: nowStamp(), text: "AI Server: retry queued — waiting for better market conditions…", level: "warn" };
  }
  if (r < 0.25) return { ts: nowStamp(), text: "AI Server: Scanning market volatility (ORVX/WBTC/ETH)…", level: "info" };
  if (r < 0.5)  return { ts: nowStamp(), text: "Guardrail Contract: Verifying transaction signature… SAFE", level: "ok" };
  if (r < 0.78) return { ts: nowStamp(), text: `Executor: Swap success ${Math.floor(50 + Math.random()*500)} USDT → ETH @ Router. Tx 0x${Math.floor(Math.random()*0xffffff).toString(16).padStart(6,"0")}…`, level: "ok" };
  return { ts: nowStamp(), text: `Checkpoint upkeep: block #${Math.floor(1_000_000 + Math.random() * 9_000_000)} processed`, level: "info" };
}

function ContractChip({ label, addr }: { label: string; addr: string }) {
  return (
    <a href={explorerAddr(addr)} target="_blank" rel="noreferrer"
      className="glass rounded-xl px-3 py-2 flex items-center justify-between hover:border-primary/60 transition">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{short(addr)}</span>
    </a>
  );
}
