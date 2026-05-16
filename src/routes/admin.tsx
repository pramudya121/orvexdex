import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  useReadContract,
  useReadContracts,
  useSwitchChain,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { formatUnits, parseUnits } from "viem";
import { ADDR, explorerAddr, litvm } from "@/lib/chain";
import { faucetAbi } from "@/lib/abis/faucet";
import { erc20Abi } from "@/lib/abis/wzkltc";
import { FAUCET_TOKENS, WZKLTC, type Token } from "@/lib/tokens";
import { useToast } from "@/components/ui/toaster";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
  head: () => ({
    meta: [
      { title: "Admin — ORVEX" },
      { name: "description", content: "Internal admin panel for ORVEX faucet operators on LitVM LiteForge — configure claim amounts, cooldowns, refills, and per-token controls." },
      { property: "og:title", content: "Admin — ORVEX" },
      { property: "og:description", content: "Internal admin panel for ORVEX faucet operators on LitVM LiteForge — configure claim amounts, cooldowns, refills, and per-token controls." },
      { property: "og:url", content: "https://orvexdex.lovable.app/admin" },
      { name: "robots", content: "noindex, nofollow" },
    ],
    links: [{ rel: "canonical", href: "https://orvexdex.lovable.app/admin" }],
  }),
});

// Admin manages every faucet slot (index 0 wzkLTC + 1..6 ERC20s), even if
// user-facing /faucet hides the wrapper.
const ADMIN_TOKENS: Token[] = [
  { ...WZKLTC, faucetIndex: 0 },
  ...FAUCET_TOKENS,
];

function fmt(n: bigint | undefined, decimals = 18, max = 4) {
  if (n === undefined) return "—";
  const s = formatUnits(n, decimals);
  const [i, d] = s.split(".");
  return d ? `${i}.${d.slice(0, max)}` : i;
}

function shortAddr(a?: string) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—";
}

function AdminPage() {
  const { address } = useAccount();
  const owner = useReadContract({ address: ADDR.faucet, abi: faucetAbi, functionName: "owner" });
  const cooldown = useReadContract({ address: ADDR.faucet, abi: faucetAbi, functionName: "cooldown" });
  const isOwner =
    !!address && !!owner.data && (owner.data as string).toLowerCase() === address.toLowerCase();

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Faucet Admin</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Owner-only controls for the ORVEX faucet contract
          </p>
        </div>
        <div className={`glass rounded-2xl p-3 text-xs space-y-1 min-w-[260px] border ${isOwner ? "border-accent/40" : "border-destructive/40"}`}>
          <Row label="Faucet" value={
            <a href={explorerAddr(ADDR.faucet)} target="_blank" rel="noreferrer" className="font-mono text-primary hover:underline">{shortAddr(ADDR.faucet)}</a>
          } />
          <Row label="Owner" value={<span className="font-mono">{shortAddr(owner.data as string | undefined)}</span>} />
          <Row label="You" value={<span className="font-mono">{shortAddr(address)}</span>} />
          <div className={`mt-1 font-semibold ${isOwner ? "text-accent" : "text-destructive"}`}>
            {!address ? "Connect wallet" : isOwner ? "✓ Owner access" : "✗ Not the owner — actions will revert"}
          </div>
        </div>
      </header>

      <CooldownCard current={cooldown.data as bigint | undefined} disabled={!isOwner} />

      <BulkOpsCard adminAddress={address} disabled={!isOwner} />

      <BulkConfigCard disabled={!isOwner} />

      <section className="space-y-3">
        <h2 className="font-semibold text-lg">Tokens</h2>
        <div className="space-y-3">
          {ADMIN_TOKENS.map((t) => (
            <TokenRow key={t.address} token={t} adminAddress={address} disabled={!isOwner} />
          ))}
        </div>
      </section>

      <ResetUserCard disabled={!isOwner} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      {value}
    </div>
  );
}

function useEnsureLitvmChain() {
  const toast = useToast();
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();

  return async () => {
    if (!address) {
      toast.push({ title: "Connect wallet first", type: "error" });
      return false;
    }
    if (chainId === litvm.id) return true;

    try {
      await switchChainAsync({ chainId: litvm.id });
      return true;
    } catch (e: any) {
      toast.push({
        title: "Switch network failed",
        description: e?.shortMessage || e?.message || "Please switch your wallet to LitVM LiteForge",
        type: "error",
      });
      return false;
    }
  };
}

function useTxRunner(label: string) {
  const toast = useToast();
  const ensureLitvmChain = useEnsureLitvmChain();
  const { writeContractAsync, isPending, reset } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const receipt = useWaitForTransactionReceipt({ hash });
  useEffect(() => {
    if (receipt.isSuccess && hash) {
      toast.push({ title: `${label} confirmed`, type: "success", hash });
      setHash(undefined);
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isSuccess]);
  const run = async (args: Parameters<typeof writeContractAsync>[0], title?: string) => {
    try {
      const ready = await ensureLitvmChain();
      if (!ready) return;
      const h = await writeContractAsync(args);
      setHash(h);
      toast.push({ title: title ?? `${label} submitted`, hash: h });
      return h;
    } catch (e: any) {
      toast.push({ title: `${label} failed`, description: e?.shortMessage || e?.message, type: "error" });
    }
  };
  return { run, isPending, isMining: receipt.isLoading, hash };
}

function CooldownCard({ current, disabled }: { current: bigint | undefined; disabled?: boolean }) {
  const [val, setVal] = useState("");
  const { run, isPending, isMining } = useTxRunner("Cooldown");
  const busy = isPending || isMining || disabled;
  const currentSec = current !== undefined ? Number(current) : undefined;
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold">Global Cooldown</h3>
          <p className="text-xs text-muted-foreground">Time required between consecutive claims (per token)</p>
        </div>
        <div className="text-sm">
          Current: <span className="font-mono font-semibold">{currentSec ?? "—"}s</span>
          {currentSec !== undefined && <span className="text-muted-foreground ml-2">({(currentSec / 3600).toFixed(2)}h)</span>}
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        <input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="seconds (e.g. 3600)"
          inputMode="numeric"
          className="flex-1 min-w-[10rem] bg-surface-2 rounded-xl px-3 py-2 outline-none border border-border focus:border-primary"
        />
        <PresetBtn onClick={() => setVal("60")}>1m</PresetBtn>
        <PresetBtn onClick={() => setVal("3600")}>1h</PresetBtn>
        <PresetBtn onClick={() => setVal("21600")}>6h</PresetBtn>
        <PresetBtn onClick={() => setVal("86400")}>24h</PresetBtn>
        <button
          onClick={() => run({ address: ADDR.faucet, abi: faucetAbi, functionName: "setCooldown", args: [BigInt(val || "0")] })}
          disabled={busy || !val}
          className="px-4 py-2 rounded-xl bg-gradient-brand text-primary-foreground font-semibold disabled:opacity-40"
        >
          {isPending || isMining ? "…" : "Update"}
        </button>
      </div>
    </div>
  );
}

function PresetBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-2 text-xs rounded-xl border border-border hover:border-primary text-muted-foreground hover:text-foreground"
    >
      {children}
    </button>
  );
}

function TokenRow({ token, adminAddress, disabled }: { token: Token; adminAddress?: string; disabled?: boolean }) {
  const idx = token.faucetIndex!;
  const dec = token.decimals;
  const ZERO = "0x0000000000000000000000000000000000000000";

  const reads = useReadContracts({
    contracts: [
      { address: ADDR.faucet, abi: faucetAbi, functionName: "claimAmounts", args: [BigInt(idx)] },
      { address: ADDR.faucet, abi: faucetAbi, functionName: "maxClaims", args: [BigInt(idx)] },
      { address: ADDR.faucet, abi: faucetAbi, functionName: "tokens", args: [BigInt(idx)] },
      { address: token.address, abi: erc20Abi, functionName: "balanceOf", args: [ADDR.faucet] },
      {
        address: token.address,
        abi: erc20Abi,
        functionName: "allowance",
        args: adminAddress ? [adminAddress as `0x${string}`, ADDR.faucet] : undefined,
      },
      { address: token.address, abi: erc20Abi, functionName: "balanceOf", args: adminAddress ? [adminAddress as `0x${string}`] : undefined },
    ],
    query: { refetchInterval: 15_000 },
  });

  const claimAmount = reads.data?.[0]?.result as bigint | undefined;
  const maxClaims = reads.data?.[1]?.result as bigint | undefined;
  const onChainAddr = reads.data?.[2]?.result as string | undefined;
  const faucetBal = reads.data?.[3]?.result as bigint | undefined;
  const allowance = reads.data?.[4]?.result as bigint | undefined;
  const myBal = reads.data?.[5]?.result as bigint | undefined;

  const tokenUnset = !onChainAddr || onChainAddr.toLowerCase() === ZERO;
  const addrMismatch = !tokenUnset && onChainAddr!.toLowerCase() !== token.address.toLowerCase();

  // Editable fields
  const [tokenAddrVal, setTokenAddrVal] = useState("");
  const [claimVal, setClaimVal] = useState("");
  const [maxVal, setMaxVal] = useState("");
  const [refillVal, setRefillVal] = useState("");
  const [withdrawVal, setWithdrawVal] = useState("");
  const [withdrawTo, setWithdrawTo] = useState("");
  const [resetUser, setResetUser] = useState("");

  useEffect(() => {
    if (tokenAddrVal === "") {
      // Pre-fill with on-chain value if set, else config address
      setTokenAddrVal(tokenUnset ? token.address : (onChainAddr as string));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onChainAddr]);
  useEffect(() => {
    if (claimAmount !== undefined && claimVal === "") setClaimVal(formatUnits(claimAmount, dec));
  }, [claimAmount, dec, claimVal]);
  useEffect(() => {
    if (maxClaims !== undefined && maxVal === "") setMaxVal(maxClaims.toString());
  }, [maxClaims, maxVal]);

  const setTokenAddr = useTxRunner(`${token.symbol} set token`);
  const setClaim = useTxRunner(`${token.symbol} claim amount`);
  const setMax = useTxRunner(`${token.symbol} max claims`);
  const refill = useTxRunner(`${token.symbol} refill`);
  const approve = useTxRunner(`${token.symbol} approve`);
  const withdraw = useTxRunner(`${token.symbol} withdraw`);
  const resetCount = useTxRunner(`${token.symbol} reset user`);

  const refillBig = useMemo(() => {
    try { return refillVal ? parseUnits(refillVal as `${number}`, dec) : 0n; } catch { return 0n; }
  }, [refillVal, dec]);
  const needsApprove = refillBig > 0n && (allowance ?? 0n) < refillBig;

  const validAddr = (a: string) => /^0x[a-fA-F0-9]{40}$/.test(a);

  return (
    <div className="glass rounded-2xl p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div className="flex items-center gap-3">
          <img src={token.logo} alt={`${token.symbol} token logo`} className="h-10 w-10 rounded-full" />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg leading-none">{token.symbol}</span>
              <span className="text-xs text-muted-foreground">slot #{idx}</span>
            </div>
            <a
              href={explorerAddr(token.address)} target="_blank" rel="noreferrer"
              className="text-[11px] font-mono text-muted-foreground hover:text-primary hover:underline"
            >{token.address}</a>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Pool</div>
          <div className="font-mono font-bold text-lg">{fmt(faucetBal, dec)}</div>
        </div>
      </div>

      {addrMismatch && (
        <div className="mb-4 text-xs px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/40 text-destructive">
          ⚠ On-chain address (<span className="font-mono">{shortAddr(onChainAddr)}</span>) doesn't match config (<span className="font-mono">{shortAddr(token.address)}</span>).
        </div>
      )}
      {tokenUnset && (
        <div className="mb-4 text-xs px-3 py-2 rounded-lg bg-accent/10 border border-accent/40 text-accent">
          ℹ Token is not set on-chain. Click <b>Set</b> in the Token Address field below to initialize this slot.
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {/* TOKEN ADDRESS */}
        <Field label="TOKEN ADDRESS">
          <div className="flex gap-2">
            <input
              value={tokenAddrVal}
              onChange={(e) => setTokenAddrVal(e.target.value)}
              placeholder="0x…"
              className="flex-1 font-mono bg-surface-2 rounded-xl px-3 py-2 outline-none border border-border focus:border-primary text-xs"
            />
            <button
              disabled={disabled || setTokenAddr.isPending || setTokenAddr.isMining || !validAddr(tokenAddrVal)}
              onClick={() => setTokenAddr.run({ address: ADDR.faucet, abi: faucetAbi, functionName: "setToken", args: [idx, tokenAddrVal as `0x${string}`] })}
              className="px-4 py-2 rounded-xl bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 text-sm font-semibold disabled:opacity-40"
            >
              {setTokenAddr.isPending || setTokenAddr.isMining ? "…" : "Set"}
            </button>
          </div>
        </Field>

        {/* CLAIM AMOUNT */}
        <Field label="CLAIM AMOUNT (PER CLAIM)">
          <div className="flex gap-2">
            <input
              value={claimVal}
              onChange={(e) => setClaimVal(e.target.value)}
              placeholder="0.001"
              className="flex-1 bg-surface-2 rounded-xl px-3 py-2 outline-none border border-border focus:border-primary text-sm"
            />
            <button
              disabled={disabled || setClaim.isPending || setClaim.isMining || !claimVal}
              onClick={() => setClaim.run({ address: ADDR.faucet, abi: faucetAbi, functionName: "setClaimAmount", args: [idx, parseUnits(claimVal as `${number}`, dec)] })}
              className="px-4 py-2 rounded-xl bg-accent/20 text-accent border border-accent/40 hover:bg-accent/30 text-sm font-semibold disabled:opacity-40"
            >
              {setClaim.isPending || setClaim.isMining ? "…" : "Set"}
            </button>
          </div>
        </Field>

        {/* MAX CLAIMS */}
        <Field label="MAX CLAIMS PER USER (0 = UNLIMITED)">
          <div className="flex gap-2">
            <input
              value={maxVal}
              onChange={(e) => setMaxVal(e.target.value)}
              inputMode="numeric"
              placeholder="1000"
              className="flex-1 bg-surface-2 rounded-xl px-3 py-2 outline-none border border-border focus:border-primary text-sm"
            />
            <button
              disabled={disabled || setMax.isPending || setMax.isMining || !maxVal}
              onClick={() => setMax.run({ address: ADDR.faucet, abi: faucetAbi, functionName: "setMaxClaims", args: [idx, BigInt(maxVal)] })}
              className="px-4 py-2 rounded-xl bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 text-sm font-semibold disabled:opacity-40"
            >
              {setMax.isPending || setMax.isMining ? "…" : "Set"}
            </button>
          </div>
        </Field>

        {/* DEPOSIT LIQUIDITY */}
        <Field
          label={
            <div className="flex items-center justify-between">
              <span>DEPOSIT LIQUIDITY</span>
              <span className="text-[10px] normal-case tracking-normal text-muted-foreground">
                Wallet: <span className="text-foreground font-mono">{fmt(myBal, dec)}</span>
              </span>
            </div>
          }
        >
          <div className="flex gap-2">
            <input
              value={refillVal}
              onChange={(e) => setRefillVal(e.target.value)}
              placeholder={`Amount in ${token.symbol}`}
              className="flex-1 bg-surface-2 rounded-xl px-3 py-2 outline-none border border-border focus:border-primary text-sm"
            />
            <button
              type="button"
              onClick={() => myBal !== undefined && setRefillVal(formatUnits(myBal, dec))}
              className="px-3 py-2 text-xs rounded-xl border border-border hover:border-primary text-muted-foreground"
            >
              Max
            </button>
            {needsApprove ? (
              <button
                disabled={disabled || approve.isPending || approve.isMining || refillBig === 0n}
                onClick={() => approve.run({ address: token.address, abi: erc20Abi, functionName: "approve", args: [ADDR.faucet, refillBig] })}
                className="px-4 py-2 rounded-xl bg-accent/20 text-accent border border-accent/40 hover:bg-accent/30 text-sm font-semibold disabled:opacity-40"
              >
                {approve.isPending || approve.isMining ? "…" : "Approve"}
              </button>
            ) : (
              <button
                disabled={disabled || refill.isPending || refill.isMining || refillBig === 0n}
                onClick={() => refill.run({ address: ADDR.faucet, abi: faucetAbi, functionName: "refill", args: [idx, refillBig] })}
                className="px-4 py-2 rounded-xl bg-accent text-accent-foreground text-sm font-semibold disabled:opacity-40"
              >
                {refill.isPending || refill.isMining ? "…" : "Refill"}
              </button>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            Auto-checks balance, approves &amp; transfers tokens into the faucet pool.
          </p>
        </Field>

        {/* ADMIN WITHDRAW */}
        <Field label="ADMIN WITHDRAW">
          <div className="space-y-2">
            <input
              value={withdrawTo}
              onChange={(e) => setWithdrawTo(e.target.value)}
              placeholder="Recipient 0x…"
              className="w-full font-mono bg-surface-2 rounded-xl px-3 py-2 outline-none border border-border focus:border-primary text-xs"
            />
            <div className="flex gap-2">
              <input
                value={withdrawVal}
                onChange={(e) => setWithdrawVal(e.target.value)}
                placeholder={`Max ${fmt(faucetBal, dec)}`}
                className="flex-1 bg-surface-2 rounded-xl px-3 py-2 outline-none border border-border focus:border-primary text-sm"
              />
              <button
                disabled={disabled || withdraw.isPending || withdraw.isMining || !withdrawVal || !validAddr(withdrawTo)}
                onClick={() => withdraw.run({ address: ADDR.faucet, abi: faucetAbi, functionName: "adminWithdraw", args: [idx, parseUnits(withdrawVal as `${number}`, dec), withdrawTo as `0x${string}`] })}
                className="px-4 py-2 rounded-xl bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 text-sm font-semibold disabled:opacity-40"
              >
                {withdraw.isPending || withdraw.isMining ? "…" : "Withdraw"}
              </button>
            </div>
          </div>
        </Field>
      </div>

      {/* RESET USER CLAIM COUNT */}
      <div className="mt-4 pt-4 border-t border-border">
        <Field label="RESET USER CLAIM COUNT">
          <div className="flex gap-2">
            <input
              value={resetUser}
              onChange={(e) => setResetUser(e.target.value)}
              placeholder="User 0x…"
              className="flex-1 font-mono bg-surface-2 rounded-xl px-3 py-2 outline-none border border-border focus:border-primary text-xs"
            />
            <button
              disabled={disabled || resetCount.isPending || resetCount.isMining || !validAddr(resetUser)}
              onClick={() => resetCount.run({ address: ADDR.faucet, abi: faucetAbi, functionName: "setUserClaimCount", args: [resetUser as `0x${string}`, idx, 0n] })}
              className="px-4 py-2 rounded-xl bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 text-sm font-semibold disabled:opacity-40"
            >
              {resetCount.isPending || resetCount.isMining ? "…" : "Reset to 0"}
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            Sets the user's claim counter back to 0 for this token (lets them claim again after hitting max).
          </p>
        </Field>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="text-right">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono font-semibold text-sm">{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5 block font-semibold">{label}</label>
      {children}
    </div>
  );
}

function ResetUserCard({ disabled }: { disabled?: boolean }) {
  const [user, setUser] = useState("");
  const [idx, setIdx] = useState<number>(FAUCET_TOKENS[0].faucetIndex!);
  const [count, setCount] = useState("0");
  const { run, isPending, isMining } = useTxRunner("Reset user count");

  const userClaim = useReadContract({
    address: ADDR.faucet,
    abi: faucetAbi,
    functionName: "userClaimCount",
    args: user && /^0x[a-fA-F0-9]{40}$/.test(user) ? [user as `0x${string}`, idx] : undefined,
  });
  const lastClaim = useReadContract({
    address: ADDR.faucet,
    abi: faucetAbi,
    functionName: "lastClaimed",
    args: user && /^0x[a-fA-F0-9]{40}$/.test(user) ? [user as `0x${string}`, idx] : undefined,
  });
  const lastTs = lastClaim.data ? new Date(Number(lastClaim.data as bigint) * 1000).toLocaleString() : "—";

  // Snapshot across ALL tokens for CSV export
  const allReads = useReadContracts({
    contracts:
      user && /^0x[a-fA-F0-9]{40}$/.test(user)
        ? ADMIN_TOKENS.flatMap((t) => [
            { address: ADDR.faucet, abi: faucetAbi, functionName: "userClaimCount", args: [user as `0x${string}`, t.faucetIndex!] } as const,
            { address: ADDR.faucet, abi: faucetAbi, functionName: "lastClaimed", args: [user as `0x${string}`, t.faucetIndex!] } as const,
          ])
        : [],
  });

  const exportCsv = () => {
    if (!user) return;
    const rows = [["index", "symbol", "claimCount", "lastClaimedUnix", "lastClaimedISO"]];
    ADMIN_TOKENS.forEach((t, i) => {
      const cnt = allReads.data?.[i * 2]?.result as bigint | undefined;
      const ts = allReads.data?.[i * 2 + 1]?.result as bigint | undefined;
      const tsNum = ts ? Number(ts) : 0;
      rows.push([
        String(t.faucetIndex),
        t.symbol,
        cnt?.toString() ?? "0",
        tsNum.toString(),
        tsNum ? new Date(tsNum * 1000).toISOString() : "",
      ]);
    });
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `faucet-${user.slice(0, 10)}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="glass rounded-2xl p-5">
      <h3 className="font-semibold mb-1">Reset user claim count</h3>
      <p className="text-xs text-muted-foreground mb-3">Lookup a user, then override their claim count for a specific token.</p>
      <div className="grid sm:grid-cols-12 gap-2">
        <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="user 0x…"
          className="sm:col-span-6 font-mono bg-surface-2 rounded-xl px-3 py-2 outline-none border border-border focus:border-primary text-sm" />
        <select value={idx} onChange={(e) => setIdx(+e.target.value)}
          className="sm:col-span-3 bg-surface-2 rounded-xl px-3 py-2 border border-border text-sm">
          {FAUCET_TOKENS.map((t) => (
            <option key={t.faucetIndex} value={t.faucetIndex!}>#{t.faucetIndex} {t.symbol}</option>
          ))}
        </select>
        <input value={count} onChange={(e) => setCount(e.target.value)} placeholder="count" inputMode="numeric"
          className="sm:col-span-3 bg-surface-2 rounded-xl px-3 py-2 outline-none border border-border focus:border-primary text-sm" />
      </div>
      <div className="text-xs text-muted-foreground mt-2 flex flex-wrap gap-x-4">
        <span>Current count: <span className="font-mono text-foreground">{(userClaim.data as bigint | undefined)?.toString() ?? "—"}</span></span>
        <span>Last claim: <span className="text-foreground">{lastTs}</span></span>
      </div>
      <button
        disabled={disabled || isPending || isMining || !user || !count}
        onClick={() => run({ address: ADDR.faucet, abi: faucetAbi, functionName: "setUserClaimCount", args: [user as `0x${string}`, idx, BigInt(count)] })}
        className="mt-3 px-4 py-2 rounded-xl bg-gradient-brand text-primary-foreground font-semibold disabled:opacity-40">
        {isPending || isMining ? "Submitting…" : "Apply"}
      </button>
      <button
        type="button"
        onClick={exportCsv}
        disabled={!user || !/^0x[a-fA-F0-9]{40}$/.test(user)}
        className="mt-3 ml-2 px-4 py-2 rounded-xl border border-border hover:border-primary text-sm font-semibold disabled:opacity-40"
      >
        Export CSV (all tokens)
      </button>
    </div>
  );
}

// ─────────────────────── Bulk Config (claim/max) ───────────────────────
// Set claimAmount and/or maxClaims for many tokens in one flow.
function BulkConfigCard({ disabled }: { disabled?: boolean }) {
  const toast = useToast();
  const ensureLitvmChain = useEnsureLitvmChain();
  const { writeContractAsync } = useWriteContract();
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [claim, setClaim] = useState<Record<number, string>>({});
  const [max, setMax] = useState<Record<number, string>>({});

  const reads = useReadContracts({
    contracts: ADMIN_TOKENS.flatMap((t) => [
      { address: ADDR.faucet, abi: faucetAbi, functionName: "claimAmounts", args: [BigInt(t.faucetIndex!)] } as const,
      { address: ADDR.faucet, abi: faucetAbi, functionName: "maxClaims", args: [BigInt(t.faucetIndex!)] } as const,
    ]),
    query: { refetchInterval: 20_000 },
  });

  const append = (s: string) => setLog((l) => [...l, s]);

  const applyAll = async () => {
    setRunning(true);
    setLog([]);
    try {
      const ready = await ensureLitvmChain();
      if (!ready) return;
      for (let i = 0; i < ADMIN_TOKENS.length; i++) {
        const t = ADMIN_TOKENS[i];
        const curClaim = reads.data?.[i * 2]?.result as bigint | undefined;
        const curMax = reads.data?.[i * 2 + 1]?.result as bigint | undefined;
        const cRaw = claim[t.faucetIndex!];
        const mRaw = max[t.faucetIndex!];
        // setClaimAmount
        if (cRaw) {
          try {
            const v = parseUnits(cRaw as `${number}`, t.decimals);
            if (v !== curClaim) {
              append(`→ ${t.symbol}: setClaimAmount ${cRaw}`);
              const h = await writeContractAsync({ address: ADDR.faucet, abi: faucetAbi, functionName: "setClaimAmount", args: [t.faucetIndex!, v] });
              append(`✓ ${t.symbol} claim (${h.slice(0, 10)}…)`);
            }
          } catch (e: any) {
            append(`✗ ${t.symbol} claim: ${e?.shortMessage || e?.message || "failed"}`);
          }
        }
        // setMaxClaims
        if (mRaw) {
          try {
            const v = BigInt(mRaw);
            if (v !== curMax) {
              append(`→ ${t.symbol}: setMaxClaims ${mRaw}`);
              const h = await writeContractAsync({ address: ADDR.faucet, abi: faucetAbi, functionName: "setMaxClaims", args: [t.faucetIndex!, v] });
              append(`✓ ${t.symbol} max (${h.slice(0, 10)}…)`);
            }
          } catch (e: any) {
            append(`✗ ${t.symbol} max: ${e?.shortMessage || e?.message || "failed"}`);
          }
        }
      }
      toast.push({ title: "Bulk config applied", type: "success" });
      reads.refetch();
    } finally {
      setRunning(false);
    }
  };

  const fillAllSame = (kind: "claim" | "max", v: string) => {
    const next: Record<number, string> = {};
    ADMIN_TOKENS.forEach((t) => (next[t.faucetIndex!] = v));
    if (kind === "claim") setClaim(next);
    else setMax(next);
  };

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h3 className="font-semibold">Bulk Config — Claim Amount & Max Claims</h3>
          <p className="text-xs text-muted-foreground">Set per-token limits in one batch. Empty rows are skipped; unchanged values are skipped automatically.</p>
        </div>
        <button
          onClick={applyAll}
          disabled={disabled || running}
          className="px-3 py-2 rounded-xl bg-gradient-brand text-primary-foreground text-sm font-semibold disabled:opacity-40"
        >
          {running ? "Applying…" : "Apply all"}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-3 text-[11px]">
        <span className="text-muted-foreground self-center">Quick fill all rows:</span>
        <input
          placeholder="claim amt"
          onChange={(e) => fillAllSame("claim", e.target.value)}
          className="w-28 bg-surface-2 rounded-lg px-2 py-1 outline-none border border-border focus:border-primary text-xs font-mono"
        />
        <input
          placeholder="max claims"
          onChange={(e) => fillAllSame("max", e.target.value)}
          inputMode="numeric"
          className="w-28 bg-surface-2 rounded-lg px-2 py-1 outline-none border border-border focus:border-primary text-xs font-mono"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left py-1">Token</th>
              <th className="text-right">Current claim</th>
              <th className="text-right pl-2">New claim</th>
              <th className="text-right">Current max</th>
              <th className="text-right pl-2">New max</th>
            </tr>
          </thead>
          <tbody>
            {ADMIN_TOKENS.map((t, i) => {
              const curClaim = reads.data?.[i * 2]?.result as bigint | undefined;
              const curMax = reads.data?.[i * 2 + 1]?.result as bigint | undefined;
              return (
                <tr key={t.address} className="border-t border-border/60">
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <img src={t.logo} alt={`${t.symbol} logo`} className="h-6 w-6 rounded-full" />
                      <span className="font-semibold">{t.symbol}</span>
                      <span className="text-[10px] text-muted-foreground">#{t.faucetIndex}</span>
                    </div>
                  </td>
                  <td className="text-right font-mono">{fmt(curClaim, t.decimals)}</td>
                  <td className="text-right pl-2">
                    <input
                      value={claim[t.faucetIndex!] ?? ""}
                      onChange={(e) => setClaim((s) => ({ ...s, [t.faucetIndex!]: e.target.value }))}
                      placeholder="—"
                      className="w-24 bg-surface-2 rounded-lg px-2 py-1 outline-none border border-border focus:border-primary text-xs text-right font-mono"
                    />
                  </td>
                  <td className="text-right font-mono">{curMax?.toString() ?? "—"}</td>
                  <td className="text-right pl-2">
                    <input
                      value={max[t.faucetIndex!] ?? ""}
                      onChange={(e) => setMax((s) => ({ ...s, [t.faucetIndex!]: e.target.value }))}
                      placeholder="—"
                      inputMode="numeric"
                      className="w-20 bg-surface-2 rounded-lg px-2 py-1 outline-none border border-border focus:border-primary text-xs text-right font-mono"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {log.length > 0 && (
        <div className="mt-3 rounded-xl bg-surface-2 border border-border p-3 max-h-48 overflow-auto text-[11px] font-mono space-y-0.5">
          {log.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Bulk Operations ───────────────────────────
// Refill ALL tokens in one flow (auto approve→refill per row), or withdraw
// the entire faucet balance per token to the admin's own address.
function BulkOpsCard({ adminAddress, disabled }: { adminAddress?: string; disabled?: boolean }) {
  const toast = useToast();
  const ensureLitvmChain = useEnsureLitvmChain();
  const { writeContractAsync } = useWriteContract();
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [running, setRunning] = useState<null | "refill" | "withdraw">(null);
  const [log, setLog] = useState<string[]>([]);

  const reads = useReadContracts({
    contracts: ADMIN_TOKENS.flatMap((t) => [
      { address: t.address, abi: erc20Abi, functionName: "balanceOf", args: [ADDR.faucet] } as const,
      { address: t.address, abi: erc20Abi, functionName: "balanceOf", args: adminAddress ? [adminAddress as `0x${string}`] : undefined } as const,
      { address: t.address, abi: erc20Abi, functionName: "allowance", args: adminAddress ? [adminAddress as `0x${string}`, ADDR.faucet] : undefined } as const,
    ]),
    query: { refetchInterval: 20_000 },
  });

  const append = (s: string) => setLog((l) => [...l, s]);

  const runBulkRefill = async () => {
    if (!adminAddress) return;
    setRunning("refill");
    setLog([]);
    try {
      const ready = await ensureLitvmChain();
      if (!ready) return;
      for (let i = 0; i < ADMIN_TOKENS.length; i++) {
        const t = ADMIN_TOKENS[i];
        const raw = amounts[t.faucetIndex!];
        if (!raw) continue;
        let amt: bigint;
        try { amt = parseUnits(raw as `${number}`, t.decimals); } catch { append(`✗ ${t.symbol}: invalid amount`); continue; }
        if (amt === 0n) continue;
        const off = i * 3;
        const myBal = (reads.data?.[off + 1]?.result as bigint | undefined) ?? 0n;
        const allow = (reads.data?.[off + 2]?.result as bigint | undefined) ?? 0n;
        if (amt > myBal) { append(`✗ ${t.symbol}: insufficient balance (${fmt(myBal, t.decimals)})`); continue; }
        try {
          if (allow < amt) {
            append(`→ ${t.symbol}: approving ${raw}…`);
            const h = await writeContractAsync({ address: t.address, abi: erc20Abi, functionName: "approve", args: [ADDR.faucet, amt] });
            append(`  approve tx ${h.slice(0, 10)}…`);
          }
          append(`→ ${t.symbol}: refilling ${raw}…`);
          const h = await writeContractAsync({ address: ADDR.faucet, abi: faucetAbi, functionName: "refill", args: [t.faucetIndex!, amt] });
          append(`✓ ${t.symbol} refilled (${h.slice(0, 10)}…)`);
        } catch (e: any) {
          append(`✗ ${t.symbol}: ${e?.shortMessage || e?.message || "failed"}`);
        }
      }
      toast.push({ title: "Bulk refill done", type: "success" });
      reads.refetch();
    } finally {
      setRunning(null);
    }
  };

  const runBulkWithdraw = async () => {
    if (!adminAddress) return;
    if (!confirm("Withdraw the FULL faucet balance of every token to your wallet?")) return;
    setRunning("withdraw");
    setLog([]);
    try {
      const ready = await ensureLitvmChain();
      if (!ready) return;
      for (let i = 0; i < ADMIN_TOKENS.length; i++) {
        const t = ADMIN_TOKENS[i];
        const off = i * 3;
        const bal = (reads.data?.[off]?.result as bigint | undefined) ?? 0n;
        if (bal === 0n) { append(`· ${t.symbol}: empty, skip`); continue; }
        try {
          append(`→ ${t.symbol}: withdraw ${fmt(bal, t.decimals)}…`);
          const h = await writeContractAsync({ address: ADDR.faucet, abi: faucetAbi, functionName: "adminWithdraw", args: [t.faucetIndex!, bal, adminAddress as `0x${string}`] });
          append(`✓ ${t.symbol} withdrawn (${h.slice(0, 10)}…)`);
        } catch (e: any) {
          append(`✗ ${t.symbol}: ${e?.shortMessage || e?.message || "failed"}`);
        }
      }
      toast.push({ title: "Bulk withdraw done", type: "success" });
      reads.refetch();
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h3 className="font-semibold">Bulk Operations</h3>
          <p className="text-xs text-muted-foreground">Refill or drain every faucet slot in one click. Each token still triggers its own wallet prompt.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={runBulkWithdraw}
            disabled={disabled || !!running}
            className="px-3 py-2 rounded-xl bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/25 text-sm font-semibold disabled:opacity-40"
          >
            {running === "withdraw" ? "Draining…" : "Drain all → me"}
          </button>
          <button
            onClick={runBulkRefill}
            disabled={disabled || !!running || Object.values(amounts).every((v) => !v)}
            className="px-3 py-2 rounded-xl bg-gradient-brand text-primary-foreground text-sm font-semibold disabled:opacity-40"
          >
            {running === "refill" ? "Refilling…" : "Refill all"}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr><th className="text-left py-1">Token</th><th className="text-right">Faucet bal</th><th className="text-right">Your bal</th><th className="text-right pl-2">Refill amount</th></tr>
          </thead>
          <tbody>
            {ADMIN_TOKENS.map((t, i) => {
              const off = i * 3;
              const bal = reads.data?.[off]?.result as bigint | undefined;
              const my = reads.data?.[off + 1]?.result as bigint | undefined;
              return (
                <tr key={t.address} className="border-t border-border/60">
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <img src={t.logo} alt={`${t.symbol} logo`} className="h-6 w-6 rounded-full" />
                      <span className="font-semibold">{t.symbol}</span>
                      <span className="text-[10px] text-muted-foreground">#{t.faucetIndex}</span>
                    </div>
                  </td>
                  <td className="text-right font-mono">{fmt(bal, t.decimals)}</td>
                  <td className="text-right font-mono">{fmt(my, t.decimals)}</td>
                  <td className="text-right pl-2">
                    <div className="flex gap-1 justify-end">
                      <input
                        value={amounts[t.faucetIndex!] ?? ""}
                        onChange={(e) => setAmounts((s) => ({ ...s, [t.faucetIndex!]: e.target.value }))}
                        placeholder="0.0"
                        className="w-24 bg-surface-2 rounded-lg px-2 py-1 outline-none border border-border focus:border-primary text-xs text-right font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => my !== undefined && setAmounts((s) => ({ ...s, [t.faucetIndex!]: formatUnits(my, t.decimals) }))}
                        className="px-2 text-[10px] rounded-lg border border-border hover:border-primary text-muted-foreground"
                      >MAX</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {log.length > 0 && (
        <div className="mt-3 rounded-xl bg-surface-2 border border-border p-3 max-h-48 overflow-auto text-[11px] font-mono space-y-0.5">
          {log.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
    </div>
  );
}
