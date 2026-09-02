import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { ADDR } from "@/lib/chain";
import { faucetAbi } from "@/lib/abis/faucet";
import { FAUCET_TOKENS } from "@/lib/tokens";
import { fmt } from "@/lib/format";
import { useToast } from "@/components/ui/toaster";
import { txErrorMessage } from "@/lib/txError";
import { factoryAbi } from "@/lib/abis/factory";
import { pairAbi } from "@/lib/abis/pair";
import { fmtWzk } from "@/lib/poolStats";
import { Tilt, HeroParallax } from "@/components/landing/HeroFx";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, CheckCircle2, Droplets, LoaderCircle, ShieldCheck } from "lucide-react";
import type { Token } from "@/lib/tokens";

type FaucetReadCall = {
  address: typeof ADDR.faucet;
  abi: typeof faucetAbi;
  functionName: "tokens" | "claimAmounts" | "maxClaims" | "lastClaimed" | "userClaimCount";
  args: readonly [bigint] | readonly [`0x${string}`, number];
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export const Route = createFileRoute("/faucet")({
  component: FaucetPage,
  head: () => ({
    meta: [
      { title: "Faucet — ORVEX" },
      {
        name: "description",
        content:
          "Claim free LitVM testnet tokens to try ORVEX. Captcha-protected, one claim per cycle.",
      },
      { property: "og:title", content: "Faucet — ORVEX" },
      {
        property: "og:description",
        content:
          "Claim free LitVM testnet tokens to try ORVEX. Captcha-protected, one claim per cycle.",
      },
      { property: "og:url", content: "https://orvexdex.lovable.app/faucet" },
      { name: "twitter:title", content: "Faucet — ORVEX" },
      {
        name: "twitter:description",
        content:
          "Claim free LitVM testnet tokens to try ORVEX. Captcha-protected, one claim per cycle.",
      },
    ],
    links: [{ rel: "canonical", href: "https://orvexdex.lovable.app/faucet" }],
  }),
});

function FaucetPage() {
  const { address } = useAccount();
  const toast = useToast();
  const cooldown = useReadContract({
    address: ADDR.faucet,
    abi: faucetAbi,
    functionName: "cooldown",
    query: { refetchInterval: 30000 },
  });
  const calls = useMemo(() => {
    const out: FaucetReadCall[] = [];
    FAUCET_TOKENS.forEach((t) => {
      const idx = t.faucetIndex!;
      out.push({
        address: ADDR.faucet,
        abi: faucetAbi,
        functionName: "tokens",
        args: [BigInt(idx)],
      });
      out.push({
        address: ADDR.faucet,
        abi: faucetAbi,
        functionName: "claimAmounts",
        args: [BigInt(idx)],
      });
      out.push({
        address: ADDR.faucet,
        abi: faucetAbi,
        functionName: "maxClaims",
        args: [BigInt(idx)],
      });
      if (address) {
        out.push({
          address: ADDR.faucet,
          abi: faucetAbi,
          functionName: "lastClaimed",
          args: [address, idx],
        });
        out.push({
          address: ADDR.faucet,
          abi: faucetAbi,
          functionName: "userClaimCount",
          args: [address, idx],
        });
      }
    });
    return out;
  }, [address]);

  const reads = useReadContracts({
    contracts: calls,
    query: { enabled: calls.length > 0, refetchInterval: 12000 },
  });

  const { writeContractAsync, isPending } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const [claimLabel, setClaimLabel] = useState<string>("");
  const receipt = useWaitForTransactionReceipt({ hash });

  // 1s ticker so cooldown countdowns update live (client-only)
  const [nowSec, setNowSec] = useState<number | null>(null);
  useEffect(() => {
    setNowSec(Math.floor(Date.now() / 1000));
    const id = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  const readsPerToken = address ? 5 : 3;
  const faucetTokenAddress = (tokenListIndex: number) =>
    reads.data?.[readsPerToken * tokenListIndex]?.result as string | undefined;
  const configuredTokenCount = FAUCET_TOKENS.filter((_, i) => {
    const tokenAddress = faucetTokenAddress(i);
    return !!tokenAddress && tokenAddress.toLowerCase() !== ZERO_ADDRESS;
  }).length;
  const faucetReady = configuredTokenCount === FAUCET_TOKENS.length;

  // ───── Anti-bot captcha (client-only to avoid SSR hydration mismatch) ─────
  const [captcha, setCaptcha] = useState<{ a: number; b: number; answer: number } | null>(null);
  const [captchaInput, setCaptchaInput] = useState("");
  const [verified, setVerified] = useState(false);
  const captchaOk = !!captcha && verified && Number(captchaInput) === captcha.answer;

  useEffect(() => {
    if (!captcha) setCaptcha(genCaptcha());
  }, [captcha]);

  function refreshCaptcha() {
    setCaptcha(genCaptcha());
    setCaptchaInput("");
    setVerified(false);
  }

  useEffect(() => {
    if (receipt.isSuccess && hash) {
      toast.push({ title: "Claim successful", type: "success", hash });
      setHash(undefined);
      reads.refetch();
      refreshCaptcha();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isSuccess]);

  useEffect(() => {
    if (receipt.isError && hash) {
      toast.push({ title: "Claim reverted", description: "The network rejected this claim.", type: "error", hash });
      setHash(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isError]);

  const claim = async (idx: number) => {
    const tokenListIndex = FAUCET_TOKENS.findIndex((t) => t.faucetIndex === idx);
    const tokenAddress = faucetTokenAddress(tokenListIndex);
    if (!tokenAddress || tokenAddress.toLowerCase() === ZERO_ADDRESS) {
      toast.push({
        title: "Faucet token not set",
        description: "The owner needs to run setToken for this token index in the Admin page.",
        type: "error",
      });
      return;
    }
    if (!captchaOk) {
      toast.push({ title: "Please verify the captcha first", type: "error" });
      return;
    }
    try {
      const h = await writeContractAsync({
        address: ADDR.faucet,
        abi: faucetAbi,
        functionName: "claim",
        args: [idx],
      });
      setHash(h);
      setClaimLabel(FAUCET_TOKENS[tokenListIndex]?.symbol ?? "token");
      toast.push({ title: "Claiming…", hash: h });
    } catch (e: unknown) {
      const { title, description, rejected } = txErrorMessage(e);
      toast.push({ title, description, type: rejected ? "info" : "error" });
    }
  };

  const claimAll = async () => {
    if (!faucetReady) {
      toast.push({
        title: "Faucet not ready",
        description:
          "All token indexes must be set via Admin before Claim All can succeed.",
        type: "error",
      });
      return;
    }
    if (!captchaOk) {
      toast.push({ title: "Please verify the captcha first", type: "error" });
      return;
    }
    try {
      const h = await writeContractAsync({
        address: ADDR.faucet,
        abi: faucetAbi,
        functionName: "claimAll",
      });
      setHash(h);
      setClaimLabel("all tokens");
      toast.push({ title: "Claiming all…", hash: h });
    } catch (e: unknown) {
      const { title, description, rejected } = txErrorMessage(e);
      toast.push({ title, description, type: rejected ? "info" : "error" });
    }
  };

  const cd = (cooldown.data as bigint | undefined) ?? 0n;

  const totalDistributed = FAUCET_TOKENS.reduce((acc, _t, i) => {
    const off = readsPerToken * i;
    const amt = (reads.data?.[off + 1]?.result as bigint | undefined) ?? 0n;
    const max = (reads.data?.[off + 2]?.result as bigint | undefined) ?? 0n;
    return acc + amt * max;
  }, 0n);
  const totalDistFmt =
    totalDistributed > 0n ? `${(Number(totalDistributed / 10n ** 18n) / 1e6).toFixed(2)}M` : "—";

  return (
    <div className="relative max-w-6xl mx-auto px-4 py-8 md:py-12">
      {/* Aurora backdrop */}
      <div className="pointer-events-none absolute inset-x-0 -top-10 h-[520px] overflow-hidden -z-10">
        <div
          className="absolute -top-32 left-1/4 h-80 w-80 rounded-full blur-3xl animate-aurora"
          style={{ background: "var(--gradient-luxe)" }}
        />
        <div
          className="absolute top-10 right-10 h-96 w-96 rounded-full blur-3xl animate-aurora-2"
          style={{ background: "var(--gradient-brand)" }}
        />
        <div className="absolute inset-0 grid-bg opacity-30" />
      </div>

      {/* HERO */}
      <div id="faucet-hero" className="relative glass-strong rounded-3xl p-7 md:p-12 mb-8 overflow-hidden animate-rise isolate">
        <HeroParallax targetSelector="#faucet-hero" />
        <div className="absolute inset-0 -z-0 opacity-40 grid-bg" />
        <FloatingCoins />
        <div className="relative grid items-center gap-8 md:grid-cols-[1fr_220px]">
          <div className="text-center md:text-left">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/10 border border-accent/30 text-accent text-xs font-semibold tracking-[0.2em] uppercase mb-6">
              <Droplets className="h-3.5 w-3.5" aria-hidden="true" /> Testnet token station
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-7xl font-black leading-[1.05]">
              Fuel your next
              <br />
              <span className="text-gradient-luxe">on-chain move</span>
            </h1>
            <p className="text-muted-foreground mt-4 text-base md:text-lg max-w-2xl">
              Claim test assets, inspect their live ORVEX liquidity, then trade or provide liquidity on LitVM.
            </p>
          </div>
          <Tilt className="hidden md:block faucet-tilt">
            <Faucet3D />
          </Tilt>
        </div>
      </div>

      {/* STATS + CLAIM PANEL */}
      <div className="grid lg:grid-cols-3 gap-4 mb-8">
        <div className="space-y-4 animate-rise" style={{ animationDelay: "60ms" }}>
          <StatCard label="Total Distributed" value={totalDistFmt} unit="Tokens" icon="📦" />
          <StatCard
            label="Active Tokens"
            value={String(FAUCET_TOKENS.length)}
            unit="Assets"
            icon="🪙"
          />
          <StatCard label="Cooldown" value={`${Number(cd)}s`} unit="Per claim" icon="⏱" />
        </div>

        <div
          className="lg:col-span-2 glass-strong rounded-3xl p-6 md:p-8 animated-border animate-rise"
          style={{ animationDelay: "120ms" }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">Faucet Claim</h2>
            <span className="text-[10px] uppercase tracking-[0.2em] text-accent px-3 py-1 rounded-full bg-accent/10 border border-accent/30">
              Live
            </span>
          </div>
          <div className="flex flex-wrap gap-2 mb-5">
            {FAUCET_TOKENS.map((t) => (
              <div
                key={t.address}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-2 border border-border text-sm"
              >
                <img src={t.logo} alt={`${t.symbol} token logo`} className="h-5 w-5 rounded-full" />
                <span className="font-semibold">{t.symbol}</span>
              </div>
            ))}
          </div>
          <div className="rounded-2xl bg-surface-2 border border-border p-4 mb-5">
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
              Recipient address
            </div>
            <div className="font-mono text-sm break-all">
              {address ?? "Connect a wallet to receive tokens…"}
            </div>
          </div>
          {!faucetReady && (
            <div className="rounded-2xl bg-destructive/10 border border-destructive/30 p-4 mb-5 text-sm text-destructive">
              Faucet not ready: {FAUCET_TOKENS.length - configuredTokenCount} token index(es) are still
              empty in the contract. The owner must call `setToken` in the Admin page, then refill the
              faucet token balances.
            </div>
          )}

          {hash && (
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 mb-5" role="status" aria-live="polite">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Transaction status</div>
                  <div className="font-semibold mt-1">Claiming {claimLabel}</div>
                </div>
                {receipt.isSuccess ? (
                  <CheckCircle2 className="h-5 w-5 text-accent" aria-hidden="true" />
                ) : (
                  <LoaderCircle className="h-5 w-5 text-primary animate-spin" aria-hidden="true" />
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <TxStep label="Signed" done />
                <TxStep label="Pending" done={receipt.isLoading || receipt.isSuccess} active={receipt.isLoading} />
                <TxStep label="Mined" done={receipt.isSuccess} active={receipt.isSuccess} />
              </div>
            </div>
          )}

          {/* Captcha */}
          <div className="rounded-2xl bg-surface-2 border border-border p-4 mb-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                Human verification
              </div>
              {captchaOk && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30">
                  ✓ Verified
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div
                className="select-none px-4 py-2 rounded-xl bg-gradient-brand text-primary-foreground font-mono text-lg tracking-[0.4em] font-bold"
                style={{ textShadow: "0 0 12px rgba(255,255,255,0.4)", letterSpacing: "0.4em" }}
                suppressHydrationWarning
              >
                {captcha ? `${captcha.a} + ${captcha.b} = ?` : "··· + ··· = ?"}
              </div>
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="Answer"
                value={captchaInput}
                onChange={(e) => {
                  setCaptchaInput(e.target.value.replace(/\D/g, ""));
                  setVerified(false);
                }}
                className="w-28 px-3 py-2 rounded-xl bg-surface border border-border outline-none focus:border-primary text-center font-mono"
                aria-label="Captcha answer"
              />
              <button
                onClick={() => {
                  if (captcha && Number(captchaInput) === captcha.answer) setVerified(true);
                  else {
                    setVerified(false);
                    refreshCaptcha();
                    toast.push({ title: "Wrong captcha", type: "error" });
                  }
                }}
                disabled={!captchaInput}
                className="px-4 py-2 rounded-xl bg-surface-2 border border-border hover:border-primary/60 text-sm font-semibold transition disabled:opacity-40"
              >
                Verify
              </button>
              <button
                onClick={refreshCaptcha}
                className="ml-auto h-9 w-9 rounded-xl bg-surface border border-border hover:border-primary/60 transition"
                aria-label="Refresh captcha"
                title="New challenge"
              >
                ↻
              </button>
            </div>
            <div className="text-[10px] text-muted-foreground mt-2">
              Protects the faucet from bots — solve the simple challenge to claim.
            </div>
          </div>

          <Button
            onClick={claimAll}
            disabled={!address || isPending || !!hash || !captchaOk || !faucetReady}
            className="w-full h-14 rounded-xl bg-gradient-luxe text-primary-foreground font-bold text-base shadow-neon hover:shadow-gold hover:-translate-y-0.5 transition-all disabled:translate-y-0"
          >
            {!address
              ? "Connect Wallet"
              : isPending || hash
                ? "Confirming…"
                : !faucetReady
                  ? "Faucet not set"
                  : !captchaOk
                    ? "🔒 Verify captcha"
                    : "💧 Claim All Now"}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-xl font-bold tracking-tight">Per-token Claims</h2>
        <div className="flex-1 h-px bg-gradient-to-r from-border to-transparent" />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {FAUCET_TOKENS.map((t, i) => {
          const off = readsPerToken * i;
          const contractToken = reads.data?.[off]?.result as string | undefined;
          const tokenReady = !!contractToken && contractToken.toLowerCase() !== ZERO_ADDRESS;
          const amt = reads.data?.[off + 1]?.result as bigint | undefined;
          const max = reads.data?.[off + 2]?.result as bigint | undefined;
          const last = address ? (reads.data?.[off + 3]?.result as bigint | undefined) : undefined;
          const userCnt = address
            ? (reads.data?.[off + 4]?.result as bigint | undefined)
            : undefined;
          const now = BigInt(nowSec ?? 0);
          const ready = nowSec === null ? false : !last || last === 0n || now >= last + cd;
          const cooldownEnd = (last ?? 0n) + cd;
          const wait = ready || nowSec === null ? 0 : Math.max(0, Number(cooldownEnd - now));
          const cdTotal = Number(cd) || 1;
          const progress = ready ? 100 : Math.min(100, ((cdTotal - wait) / cdTotal) * 100);
          const remaining = max && userCnt !== undefined ? max - userCnt : undefined;
          return (
            <div
              key={t.address}
              className="glass rounded-2xl p-5 card-hover animate-rise"
              style={{ animationDelay: `${Math.min(i * 50, 320)}ms` }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="relative">
                  <div
                    className="absolute inset-0 rounded-full blur-md opacity-60"
                    style={{ background: "var(--gradient-brand)" }}
                  />
                  <img
                    src={t.logo}
                    alt={`${t.symbol} token logo`}
                    className="relative h-12 w-12 rounded-full ring-2 ring-background"
                  />
                </div>
                <div>
                  <div className="font-bold text-lg">{t.symbol}</div>
                  <div className="text-xs text-muted-foreground">{t.name}</div>
                </div>
              </div>
              <div className="text-sm space-y-1 mb-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Contract token</span>
                  <span
                    className={tokenReady ? "font-mono text-accent" : "font-mono text-destructive"}
                  >
                    {tokenReady ? "Set" : "Unset"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Per claim</span>
                  <span className="font-mono">{fmt(amt, t.decimals)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Max claims</span>
                  <span className="font-mono">{max?.toString() ?? "—"}</span>
                </div>
                {address && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Your claims</span>
                      <span className="font-mono">{userCnt?.toString() ?? "0"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Remaining</span>
                      <span className="font-mono">{remaining?.toString() ?? "—"}</span>
                    </div>
                  </>
                )}
              </div>
              <FaucetReserve token={t} perClaim={amt as bigint | undefined} />
              {address && (
                <div className="mb-4" aria-label={ready ? "Claim cooldown complete" : `Claim cooldown ${formatWait(wait)} remaining`}>
                  <div className="flex justify-between text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1.5">
                    <span>Wallet cooldown</span>
                    <span className={ready ? "text-accent" : "text-foreground"}>{ready ? "Ready" : formatWait(wait)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-luxe transition-[width] duration-700" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              )}
              <Button
                onClick={() => {
                  if (t.faucetIndex !== undefined) claim(t.faucetIndex);
                }}
                disabled={!address || isPending || !!hash || !ready || !captchaOk || !tokenReady}
                variant="secondary"
                className="w-full h-11 rounded-xl border border-border hover:bg-primary hover:text-primary-foreground hover:border-primary transition font-semibold"
              >
                {!address
                  ? "Connect wallet"
                  : !tokenReady
                    ? "Token not set"
                    : !ready
                      ? `Wait ${formatWait(wait)}`
                      : !captchaOk
                        ? "Verify captcha"
                        : "Claim"}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function genCaptcha() {
  const a = Math.floor(Math.random() * 9) + 2;
  const b = Math.floor(Math.random() * 9) + 2;
  return { a, b, answer: a + b };
}

function formatWait(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds.toString().padStart(2, "0")}s` : `${seconds}s`;
}

function StatCard({
  label,
  value,
  unit,
  icon,
}: {
  label: string;
  value: string;
  unit: string;
  icon: string;
}) {
  return (
    <div className="glass rounded-2xl p-5 card-hover">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
        <div className="h-9 w-9 rounded-xl bg-surface-2 border border-border flex items-center justify-center text-lg">
          {icon}
        </div>
      </div>
      <div className="text-3xl font-black text-gradient-luxe tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{unit}</div>
    </div>
  );
}

function FloatingCoins() {
  const coins = ["◇", "◈", "✦", "◆", "●", "✧"];
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {coins.map((c, i) => (
        <div
          key={i}
          className="absolute text-xl md:text-3xl text-primary/25 animate-float faucet-parallax-particle"
          style={{
            left: `${(i * 17 + 6) % 95}%`,
            top: `${(i * 23 + 10) % 80}%`,
            animationDelay: `${i * 0.7}s`,
            animationDuration: `${5 + (i % 4)}s`,
          }}
        >
          {c}
        </div>
      ))}
    </div>
  );
}

function Faucet3D() {
  return (
    <div className="relative h-52 w-52 mx-auto" aria-hidden="true">
      <div className="absolute inset-5 rounded-full border border-accent/30 animate-spin-slow" />
      <div className="absolute inset-0 rounded-full border border-primary/20 faucet-orbit-reverse" />
      <div
        className="absolute inset-10 faucet-cube"
        style={{ transformStyle: "preserve-3d", transform: "rotateX(14deg) rotateY(-12deg)" }}
      >
        <div className="absolute inset-0 rounded-2xl bg-gradient-luxe shadow-neon animate-pulse-glow" />
        <div className="absolute inset-2 rounded-xl glass-strong flex flex-col items-center justify-center">
          <Droplets className="h-10 w-10 text-accent" />
          <span className="mt-2 text-[9px] uppercase tracking-[0.24em] text-muted-foreground">ORVEX fuel</span>
        </div>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="absolute left-1/2 top-full -translate-x-1/2 h-2.5 w-2.5 rounded-full bg-accent shadow-cyan animate-drip"
            style={{ animationDelay: `${i * 0.8}s` }}
          />
        ))}
      </div>
    </div>
  );
}

function PoolLiquidity({ token }: { token: Token }) {
  const isWrapped = token.address.toLowerCase() === ADDR.wzkLTC.toLowerCase();
  const pair = useReadContract({
    address: ADDR.factory,
    abi: factoryAbi,
    functionName: "getPair",
    args: [token.address, ADDR.wzkLTC],
    query: { enabled: !isWrapped, refetchInterval: 15_000 },
  });
  const pairAddress = pair.data as `0x${string}` | undefined;
  const hasPool = !!pairAddress && pairAddress.toLowerCase() !== ZERO_ADDRESS;
  const pool = useReadContracts({
    contracts: hasPool
      ? [
          { address: pairAddress, abi: pairAbi, functionName: "token0" as const },
          { address: pairAddress, abi: pairAbi, functionName: "getReserves" as const },
        ]
      : [],
    query: { enabled: hasPool, refetchInterval: 15_000 },
  });
  const token0 = pool.data?.[0]?.result as string | undefined;
  const reserves = pool.data?.[1]?.result as readonly [bigint, bigint, number] | undefined;
  const wrappedReserve = reserves && token0
    ? (token0.toLowerCase() === ADDR.wzkLTC.toLowerCase() ? reserves[0] : reserves[1])
    : undefined;
  const liquidity = wrappedReserve !== undefined ? wrappedReserve * 2n : undefined;

  return (
    <div className="rounded-xl border border-accent/20 bg-accent/5 p-3 mb-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-8 w-8 shrink-0 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center">
            <Droplets className="h-4 w-4 text-accent" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">ORVEX pool liquidity</div>
            <div className="font-semibold tabular-nums">
              {isWrapped ? "Base routing asset" : pool.isLoading || pair.isLoading ? "Loading on-chain…" : hasPool ? `${fmtWzk(liquidity)} wzkLTC` : "Pool not created"}
            </div>
          </div>
        </div>
        <Button asChild size="icon" variant="ghost" className="shrink-0 rounded-lg" title="View liquidity pools">
          <Link to="/pools" aria-label={`View ${token.symbol} liquidity pool`}>
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

function TxStep({ label, done, active }: { label: string; done: boolean; active?: boolean }) {
  return (
    <div className={`rounded-lg border px-2 py-2 text-center ${done ? "border-accent/30 bg-accent/10 text-accent" : "border-border text-muted-foreground"}`}>
      <span className="inline-flex items-center gap-1.5">
        {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : active ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
        {label}
      </span>
    </div>
  );
}
