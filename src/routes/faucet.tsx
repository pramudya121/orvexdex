import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ADDR } from "@/lib/chain";
import { faucetAbi } from "@/lib/abis/faucet";
import { FAUCET_TOKENS } from "@/lib/tokens";
import { fmt } from "@/lib/format";
import { useToast } from "@/components/ui/toaster";

export const Route = createFileRoute("/faucet")({
  component: FaucetPage,
  head: () => ({ meta: [{ title: "Faucet — ORVEX" }] }),
});

function FaucetPage() {
  const { address } = useAccount();
  const toast = useToast();
  const cooldown = useReadContract({ address: ADDR.faucet, abi: faucetAbi, functionName: "cooldown", query: { refetchInterval: 30000 } });

  const calls = useMemo(() => {
    const out: any[] = [];
    FAUCET_TOKENS.forEach((t) => {
      const idx = t.faucetIndex!;
      out.push({ address: ADDR.faucet, abi: faucetAbi, functionName: "claimAmounts", args: [BigInt(idx)] });
      out.push({ address: ADDR.faucet, abi: faucetAbi, functionName: "maxClaims", args: [BigInt(idx)] });
      if (address) {
        out.push({ address: ADDR.faucet, abi: faucetAbi, functionName: "lastClaimed", args: [address, idx] });
        out.push({ address: ADDR.faucet, abi: faucetAbi, functionName: "userClaimCount", args: [address, idx] });
      }
    });
    return out;
  }, [address]);

  const reads = useReadContracts({ contracts: calls, query: { enabled: calls.length > 0, refetchInterval: 12000 } });

  const { writeContractAsync, isPending } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const receipt = useWaitForTransactionReceipt({ hash });

  // ───── Anti-bot captcha ─────
  const [captcha, setCaptcha] = useState(() => genCaptcha());
  const [captchaInput, setCaptchaInput] = useState("");
  const [verified, setVerified] = useState(false);
  const captchaOk = verified && Number(captchaInput) === captcha.answer;

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

  const claim = async (idx: number) => {
    if (!captchaOk) {
      toast.push({ title: "Verifikasi captcha terlebih dahulu", type: "error" });
      return;
    }
    try {
      const h = await writeContractAsync({ address: ADDR.faucet, abi: faucetAbi, functionName: "claim", args: [idx] });
      setHash(h); toast.push({ title: "Claiming…", hash: h });
    } catch (e: any) {
      toast.push({ title: "Claim failed", description: e?.shortMessage || e?.message, type: "error" });
    }
  };

  const claimAll = async () => {
    if (!captchaOk) {
      toast.push({ title: "Verifikasi captcha terlebih dahulu", type: "error" });
      return;
    }
    try {
      const h = await writeContractAsync({ address: ADDR.faucet, abi: faucetAbi, functionName: "claimAll" });
      setHash(h); toast.push({ title: "Claiming all…", hash: h });
    } catch (e: any) {
      toast.push({ title: "Failed", description: e?.shortMessage || e?.message, type: "error" });
    }
  };

  const cd = (cooldown.data as bigint | undefined) ?? 0n;

  const totalDistributed = FAUCET_TOKENS.reduce((acc, _t, i) => {
    const off = (address ? 4 : 2) * i;
    const amt = (reads.data?.[off]?.result as bigint | undefined) ?? 0n;
    const max = (reads.data?.[off + 1]?.result as bigint | undefined) ?? 0n;
    return acc + amt * max;
  }, 0n);
  const totalDistFmt = totalDistributed > 0n
    ? `${(Number(totalDistributed / 10n ** 18n) / 1e6).toFixed(2)}M`
    : "—";

  return (
    <div className="relative max-w-6xl mx-auto px-4 py-10">
      {/* Aurora backdrop */}
      <div className="pointer-events-none absolute inset-x-0 -top-10 h-[520px] overflow-hidden -z-10">
        <div className="absolute -top-32 left-1/4 h-80 w-80 rounded-full blur-3xl animate-aurora" style={{ background: "var(--gradient-luxe)" }} />
        <div className="absolute top-10 right-10 h-96 w-96 rounded-full blur-3xl animate-aurora-2" style={{ background: "var(--gradient-brand)" }} />
        <div className="absolute inset-0 grid-bg opacity-30" />
      </div>

      {/* HERO */}
      <div className="relative glass-strong rounded-[2rem] p-8 md:p-12 mb-8 overflow-hidden animate-rise">
        <div className="absolute inset-0 -z-0 opacity-40 grid-bg" />
        <FloatingCoins />
        <div className="relative text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/10 border border-accent/30 text-accent text-xs font-semibold tracking-[0.25em] uppercase mb-6">
            💧 Claim Free Crypto Every Hour
          </div>
          <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-[1.05]">
            Get <span className="text-gradient-luxe">Free Tokens</span><br/>Instantly
          </h1>
          <p className="text-muted-foreground mt-4 text-lg">Real on-chain test tokens on LitVM LiteForge Testnet</p>
        </div>
      </div>

      {/* STATS + CLAIM PANEL */}
      <div className="grid lg:grid-cols-3 gap-4 mb-8">
        <div className="space-y-4 animate-rise" style={{ animationDelay: "60ms" }}>
          <StatCard label="Total Distributed" value={totalDistFmt} unit="Tokens" icon="📦" />
          <StatCard label="Active Tokens" value={String(FAUCET_TOKENS.length)} unit="Assets" icon="🪙" />
          <StatCard label="Cooldown" value={`${Number(cd)}s`} unit="Per claim" icon="⏱" />
        </div>

        <div className="lg:col-span-2 glass-strong rounded-3xl p-6 md:p-8 animated-border animate-rise" style={{ animationDelay: "120ms" }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">Faucet Claim</h2>
            <span className="text-[10px] uppercase tracking-[0.2em] text-accent px-3 py-1 rounded-full bg-accent/10 border border-accent/30">Live</span>
          </div>
          <div className="flex flex-wrap gap-2 mb-5">
            {FAUCET_TOKENS.map((t) => (
              <div key={t.address} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-2 border border-border text-sm">
                <img src={t.logo} alt={t.symbol} className="h-5 w-5 rounded-full" />
                <span className="font-semibold">{t.symbol}</span>
              </div>
            ))}
          </div>
          <div className="rounded-2xl bg-surface-2 border border-border p-4 mb-5">
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-2">Recipient address</div>
            <div className="font-mono text-sm break-all">{address ?? "Connect a wallet to receive tokens…"}</div>
          </div>

          {/* Captcha */}
          <div className="rounded-2xl bg-surface-2 border border-border p-4 mb-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Human verification</div>
              {captchaOk && <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30">✓ Verified</span>}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div
                className="select-none px-4 py-2 rounded-xl bg-gradient-brand text-primary-foreground font-mono text-lg tracking-[0.4em] font-bold"
                style={{ textShadow: "0 0 12px rgba(255,255,255,0.4)", letterSpacing: "0.4em" }}
              >
                {captcha.a} + {captcha.b} = ?
              </div>
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="Jawaban"
                value={captchaInput}
                onChange={(e) => { setCaptchaInput(e.target.value.replace(/\D/g, "")); setVerified(false); }}
                className="w-28 px-3 py-2 rounded-xl bg-surface border border-border outline-none focus:border-primary text-center font-mono"
              />
              <button
                onClick={() => {
                  if (Number(captchaInput) === captcha.answer) setVerified(true);
                  else { setVerified(false); refreshCaptcha(); toast.push({ title: "Captcha salah", type: "error" }); }
                }}
                disabled={!captchaInput}
                className="px-4 py-2 rounded-xl bg-surface-2 border border-border hover:border-primary/60 text-sm font-semibold transition disabled:opacity-40"
              >Verifikasi</button>
              <button
                onClick={refreshCaptcha}
                className="ml-auto h-9 w-9 rounded-xl bg-surface border border-border hover:border-primary/60 transition"
                aria-label="Refresh captcha"
                title="Ganti soal"
              >↻</button>
            </div>
            <div className="text-[10px] text-muted-foreground mt-2">Lindungi faucet dari bot — selesaikan soal sederhana untuk meng-claim.</div>
          </div>

          <button
            onClick={claimAll}
            disabled={!address || isPending || !!hash || !captchaOk}
            className="w-full py-4 rounded-2xl bg-gradient-luxe text-primary-foreground font-bold text-lg shadow-neon hover:shadow-gold hover:-translate-y-0.5 transition-all disabled:opacity-40 disabled:translate-y-0"
          >
            {!address ? "Connect Wallet" : isPending || hash ? "Confirming…" : !captchaOk ? "🔒 Verifikasi captcha" : "💧 Claim All Now"}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-xl font-bold tracking-tight">Per-token Claims</h2>
        <div className="flex-1 h-px bg-gradient-to-r from-border to-transparent" />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {FAUCET_TOKENS.map((t, i) => {
          const off = (address ? 4 : 2) * i;
          const amt = reads.data?.[off]?.result as bigint | undefined;
          const max = reads.data?.[off + 1]?.result as bigint | undefined;
          const last = address ? (reads.data?.[off + 2]?.result as bigint | undefined) : undefined;
          const userCnt = address ? (reads.data?.[off + 3]?.result as bigint | undefined) : undefined;
          const now = BigInt(Math.floor(Date.now() / 1000));
          const ready = !last || now >= last + cd;
          const wait = ready ? 0 : Number((last! + cd) - now);
          const remaining = max && userCnt !== undefined ? max - userCnt : undefined;
          return (
            <div key={t.address} className="glass rounded-2xl p-5 card-hover animate-rise" style={{ animationDelay: `${Math.min(i * 50, 320)}ms` }}>
              <div className="flex items-center gap-3 mb-3">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full blur-md opacity-60" style={{ background: "var(--gradient-brand)" }} />
                  <img src={t.logo} alt={t.symbol} className="relative h-12 w-12 rounded-full ring-2 ring-background" />
                </div>
                <div>
                  <div className="font-bold text-lg">{t.symbol}</div>
                  <div className="text-xs text-muted-foreground">{t.name}</div>
                </div>
              </div>
              <div className="text-sm space-y-1 mb-4">
                <div className="flex justify-between"><span className="text-muted-foreground">Per claim</span><span className="font-mono">{fmt(amt, t.decimals)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Max claims</span><span className="font-mono">{max?.toString() ?? "—"}</span></div>
                {address && (
                  <>
                    <div className="flex justify-between"><span className="text-muted-foreground">Your claims</span><span className="font-mono">{userCnt?.toString() ?? "0"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Remaining</span><span className="font-mono">{remaining?.toString() ?? "—"}</span></div>
                  </>
                )}
              </div>
              <button
                onClick={() => claim(t.faucetIndex!)}
                disabled={!address || isPending || !!hash || !ready || !captchaOk}
                className="w-full py-3 rounded-xl bg-surface-2 hover:bg-gradient-brand hover:text-primary-foreground border border-border hover:border-transparent transition font-semibold disabled:opacity-40"
              >
                {!address ? "Connect wallet" : !ready ? `Wait ${wait}s` : !captchaOk ? "Verifikasi captcha" : "Claim"}
              </button>
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

function StatCard({ label, value, unit, icon }: { label: string; value: string; unit: string; icon: string }) {
  return (
    <div className="glass rounded-2xl p-5 card-hover">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
        <div className="h-9 w-9 rounded-xl bg-surface-2 border border-border flex items-center justify-center text-lg">{icon}</div>
      </div>
      <div className="text-3xl font-black text-gradient-luxe tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{unit}</div>
    </div>
  );
}

function FloatingCoins() {
  const coins = ["💎", "🪙", "💰", "✨", "💧", "🌟"];
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {coins.map((c, i) => (
        <div
          key={i}
          className="absolute text-3xl md:text-4xl opacity-40 animate-float"
          style={{
            left: `${(i * 17 + 6) % 95}%`,
            top: `${(i * 23 + 10) % 80}%`,
            animationDelay: `${i * 0.7}s`,
            animationDuration: `${5 + (i % 4)}s`,
          }}
        >{c}</div>
      ))}
    </div>
  );
}

function Faucet3DUnused() {
  return (
    <div className="relative inline-block" style={{ perspective: "1000px" }}>
      <div className="relative h-32 w-32 mx-auto" style={{ transformStyle: "preserve-3d", transform: "rotateX(15deg) rotateY(-10deg)" }}>
        <div className="absolute inset-0 rounded-3xl bg-gradient-brand shadow-neon animate-pulse-glow" />
        <div className="absolute inset-2 rounded-2xl glass-strong flex items-center justify-center text-5xl">💧</div>
        {[0, 1, 2].map((i) => (
          <div key={i}
            className="absolute left-1/2 top-full -translate-x-1/2 h-3 w-3 rounded-full bg-accent shadow-cyan animate-drip"
            style={{ animationDelay: `${i * 0.8}s` }}
          />
        ))}
      </div>
    </div>
  );
}
