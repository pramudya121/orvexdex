import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import { ADDR } from "@/lib/chain";
import { faucetAbi } from "@/lib/abis/faucet";
import { FAUCET_TOKENS } from "@/lib/tokens";
import { useToast } from "@/components/ui/toaster";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
  head: () => ({ meta: [{ title: "Admin — ORVEX" }] }),
});

function AdminPage() {
  const { address } = useAccount();
  const toast = useToast();
  const owner = useReadContract({ address: ADDR.faucet, abi: faucetAbi, functionName: "owner" });
  const isOwner = address && owner.data && (owner.data as string).toLowerCase() === address.toLowerCase();

  const { writeContractAsync, isPending } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const receipt = useWaitForTransactionReceipt({ hash });
  useEffect(() => {
    if (receipt.isSuccess && hash) {
      toast.push({ title: "Confirmed", type: "success", hash });
      setHash(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isSuccess]);

  const exec = async (label: string, args: any) => {
    try {
      const h = await writeContractAsync({ address: ADDR.faucet, abi: faucetAbi, ...args });
      setHash(h); toast.push({ title: label, hash: h });
    } catch (e: any) {
      toast.push({ title: "Failed", description: e?.shortMessage || e?.message, type: "error" });
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Faucet Admin</h1>
        <p className="text-sm text-muted-foreground">Owner-only controls for the ORVEX faucet contract</p>
      </div>

      <div className={`glass rounded-2xl p-4 text-sm ${isOwner ? "border-accent/50" : "border-destructive/50"}`}>
        <div>Connected: <span className="font-mono">{address ?? "—"}</span></div>
        <div>Owner: <span className="font-mono">{(owner.data as string | undefined) ?? "loading…"}</span></div>
        <div className={`mt-1 font-semibold ${isOwner ? "text-accent" : "text-destructive"}`}>
          {!address ? "Connect wallet" : isOwner ? "✓ Owner access granted" : "✗ Not the owner — actions will revert"}
        </div>
      </div>

      <Card title="Set Cooldown (seconds)">
        <SingleInput placeholder="3600" onSubmit={(v: string) => exec("Setting cooldown…", { functionName: "setCooldown", args: [BigInt(v)] })} disabled={isPending || !!hash} />
      </Card>

      <Card title="Set Claim Amount">
        <TokenAmountForm
          onSubmit={(idx: number, amt: string) => exec("Setting claim amount…", { functionName: "setClaimAmount", args: [idx, parseUnits(amt as `${number}`, 18)] })}
          disabled={isPending || !!hash}
        />
      </Card>

      <Card title="Set Max Claims (per user)">
        <TokenAmountForm
          amountLabel="max" placeholder="100"
          onSubmit={(idx: number, amt: string) => exec("Setting max claims…", { functionName: "setMaxClaims", args: [idx, BigInt(amt)] })}
          disabled={isPending || !!hash}
        />
      </Card>

      <Card title="Refill (transfers tokens INTO faucet — requires prior approval)">
        <TokenAmountForm
          onSubmit={(idx: number, amt: string) => exec("Refilling…", { functionName: "refill", args: [idx, parseUnits(amt as `${number}`, 18)] })}
          disabled={isPending || !!hash}
        />
      </Card>

      <Card title="Set Token Address">
        <SetTokenForm onSubmit={(idx: number, addr: string) => exec("Setting token…", { functionName: "setToken", args: [idx, addr as `0x${string}`] })} disabled={isPending || !!hash} />
      </Card>

      <Card title="Admin Withdraw">
        <AdminWithdrawForm onSubmit={(idx: number, amt: string, to: string) => exec("Withdrawing…", { functionName: "adminWithdraw", args: [idx, parseUnits(amt as `${number}`, 18), to as `0x${string}`] })} disabled={isPending || !!hash} />
      </Card>

      <Card title="Reset User Claim Count">
        <UserClaimForm onSubmit={(user: string, idx: number, count: string) => exec("Setting user count…", { functionName: "setUserClaimCount", args: [user as `0x${string}`, idx, BigInt(count)] })} disabled={isPending || !!hash} />
      </Card>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass rounded-2xl p-5">
      <h3 className="font-semibold mb-3">{title}</h3>
      {children}
    </div>
  );
}

function SingleInput({ placeholder, onSubmit, disabled }: { placeholder?: string; onSubmit: (v: string) => void; disabled?: boolean }) {
  const [v, setV] = useState("");
  return (
    <div className="flex gap-2">
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} className="flex-1 bg-surface-2 rounded-xl px-3 py-2 outline-none border border-border focus:border-primary" />
      <button onClick={() => onSubmit(v)} disabled={disabled || !v} className="px-4 py-2 rounded-xl bg-gradient-brand text-primary-foreground font-semibold disabled:opacity-40">Submit</button>
    </div>
  );
}

function TokenSelectIdx({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(+e.target.value)} className="bg-surface-2 rounded-xl px-3 py-2 border border-border">
      {FAUCET_TOKENS.map((t) => (
        <option key={t.faucetIndex} value={t.faucetIndex}>#{t.faucetIndex} {t.symbol}</option>
      ))}
    </select>
  );
}

function TokenAmountForm({ onSubmit, disabled, placeholder = "100", amountLabel = "amount" }: { onSubmit: (idx: number, amt: string) => void; disabled?: boolean; placeholder?: string; amountLabel?: string }) {
  const [idx, setIdx] = useState(FAUCET_TOKENS[0].faucetIndex!);
  const [amt, setAmt] = useState("");
  return (
    <div className="flex gap-2 flex-wrap">
      <TokenSelectIdx value={idx} onChange={setIdx} />
      <input value={amt} onChange={(e) => setAmt(e.target.value)} placeholder={`${amountLabel} (${placeholder})`} className="flex-1 min-w-[8rem] bg-surface-2 rounded-xl px-3 py-2 outline-none border border-border focus:border-primary" />
      <button onClick={() => onSubmit(idx, amt)} disabled={disabled || !amt} className="px-4 py-2 rounded-xl bg-gradient-brand text-primary-foreground font-semibold disabled:opacity-40">Submit</button>
    </div>
  );
}

function SetTokenForm({ onSubmit, disabled }: { onSubmit: (idx: number, addr: string) => void; disabled?: boolean }) {
  const [idx, setIdx] = useState(0);
  const [addr, setAddr] = useState("");
  return (
    <div className="flex gap-2 flex-wrap">
      <input type="number" value={idx} onChange={(e) => setIdx(+e.target.value)} className="w-24 bg-surface-2 rounded-xl px-3 py-2 border border-border" />
      <input value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="0x…" className="flex-1 bg-surface-2 rounded-xl px-3 py-2 border border-border font-mono" />
      <button onClick={() => onSubmit(idx, addr)} disabled={disabled || !addr} className="px-4 py-2 rounded-xl bg-gradient-brand text-primary-foreground font-semibold disabled:opacity-40">Submit</button>
    </div>
  );
}

function AdminWithdrawForm({ onSubmit, disabled }: { onSubmit: (idx: number, amt: string, to: string) => void; disabled?: boolean }) {
  const [idx, setIdx] = useState(FAUCET_TOKENS[0].faucetIndex!);
  const [amt, setAmt] = useState("");
  const [to, setTo] = useState("");
  return (
    <div className="grid sm:grid-cols-4 gap-2">
      <TokenSelectIdx value={idx} onChange={setIdx} />
      <input value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="amount" className="bg-surface-2 rounded-xl px-3 py-2 border border-border" />
      <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="to 0x…" className="bg-surface-2 rounded-xl px-3 py-2 border border-border font-mono sm:col-span-1" />
      <button onClick={() => onSubmit(idx, amt, to)} disabled={disabled || !amt || !to} className="px-4 py-2 rounded-xl bg-gradient-brand text-primary-foreground font-semibold disabled:opacity-40">Withdraw</button>
    </div>
  );
}

function UserClaimForm({ onSubmit, disabled }: { onSubmit: (user: string, idx: number, count: string) => void; disabled?: boolean }) {
  const [user, setUser] = useState("");
  const [idx, setIdx] = useState(FAUCET_TOKENS[0].faucetIndex!);
  const [count, setCount] = useState("");
  return (
    <div className="grid sm:grid-cols-4 gap-2">
      <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="user 0x…" className="bg-surface-2 rounded-xl px-3 py-2 border border-border font-mono sm:col-span-2" />
      <TokenSelectIdx value={idx} onChange={setIdx} />
      <input type="number" value={count} onChange={(e) => setCount(e.target.value)} placeholder="count" className="bg-surface-2 rounded-xl px-3 py-2 border border-border" />
      <button onClick={() => onSubmit(user, idx, count)} disabled={disabled || !user || !count} className="px-4 py-2 rounded-xl bg-gradient-brand text-primary-foreground font-semibold disabled:opacity-40 sm:col-span-4">Submit</button>
    </div>
  );
}
