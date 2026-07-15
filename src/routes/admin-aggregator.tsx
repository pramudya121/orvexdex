import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  useReadContract,
  useReadContracts,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { aggregatorRouterAbi } from "@/lib/abis/aggregatorRouter";
import { explorerAddr, litvm } from "@/lib/chain";
import { useToast } from "@/components/ui/toaster";
import { useLocalStorage } from "@/hooks/useLocalStorage";

export const Route = createFileRoute("/admin-aggregator")({
  component: AdminAggregatorPage,
  head: () => ({
    meta: [
      { title: "Aggregator Admin — ORVEX" },
      { name: "description", content: "Owner-only registry for the ORVEX multi-DEX aggregator router on LitVM LiteForge." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const ZERO = "0x0000000000000000000000000000000000000000";
const isAddr = (s: string) => /^0x[a-fA-F0-9]{40}$/.test(s);
const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");

function AdminAggregatorPage() {
  const [aggAddr, setAggAddr] = useLocalStorage<string>("orvex.aggregator.addr", "");
  const [draftAddr, setDraftAddr] = useState(aggAddr);
  useEffect(() => setDraftAddr(aggAddr), [aggAddr]);
  const address = isAddr(aggAddr) ? (aggAddr as `0x${string}`) : undefined;

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Aggregator Router — Admin</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage the multi-DEX <code className="font-mono">AggregatorRouter</code> registry.
        </p>
      </header>

      <div className="glass rounded-2xl p-5 space-y-3">
        <label className="text-xs uppercase tracking-wider text-muted-foreground">Deployed contract address</label>
        <div className="flex gap-2 flex-wrap">
          <input
            value={draftAddr}
            onChange={(e) => setDraftAddr(e.target.value.trim())}
            placeholder="0x… (deploy contracts/AggregatorRouter.sol first)"
            className="flex-1 min-w-[18rem] font-mono text-xs bg-surface-2 rounded-xl px-3 py-2 outline-none border border-border focus:border-primary"
          />
          <button
            onClick={() => setAggAddr(draftAddr)}
            disabled={!isAddr(draftAddr)}
            className="px-4 py-2 rounded-xl bg-gradient-brand text-primary-foreground font-semibold disabled:opacity-40"
          >
            Save
          </button>
          {address && (
            <a href={explorerAddr(address)} target="_blank" rel="noreferrer" className="px-3 py-2 rounded-xl border border-border text-xs hover:border-primary">
              Explorer ↗
            </a>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Stored locally. Deploy <code className="font-mono">contracts/AggregatorRouter.sol</code>, paste the resulting address, then manage routers below.
        </p>
      </div>

      {address ? (
        <AggregatorPanel address={address} />
      ) : (
        <div className="glass rounded-2xl p-6 text-sm text-muted-foreground">
          Save a valid contract address to load the registry.
        </div>
      )}
    </div>
  );
}

function useTxRunner(label: string) {
  const toast = useToast();
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync, isPending } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const receipt = useWaitForTransactionReceipt({ hash });
  useEffect(() => {
    if (receipt.isSuccess && hash) {
      toast.push({ title: `${label} confirmed`, type: "success", hash });
      setHash(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isSuccess]);

  const run = async (args: Parameters<typeof writeContractAsync>[0]) => {
    if (!address) return toast.push({ title: "Connect wallet", type: "error" });
    if (chainId !== litvm.id) {
      try { await switchChainAsync({ chainId: litvm.id }); } catch { return; }
    }
    try {
      const h = await writeContractAsync(args);
      setHash(h);
      toast.push({ title: `${label} submitted`, hash: h });
    } catch (e: any) {
      toast.push({ title: `${label} failed`, description: e?.shortMessage || e?.message, type: "error" });
    }
  };
  return { run, busy: isPending || receipt.isLoading };
}

function AggregatorPanel({ address }: { address: `0x${string}` }) {
  const { address: user } = useAccount();
  const owner = useReadContract({ address, abi: aggregatorRouterAbi, functionName: "nextRouterId" });
  // read owner via a separate call — aggregatorRouterAbi doesn't include owner(), so we skip; treat any connected wallet as attempting owner ops.
  const nextId = (owner.data as bigint | undefined) ?? 0n;
  const total = Number(nextId);

  const contracts = useMemo(() => {
    const arr: any[] = [];
    for (let i = 0; i < total; i++) {
      arr.push({ address, abi: aggregatorRouterAbi, functionName: "dexRouters", args: [BigInt(i)] });
      arr.push({ address, abi: aggregatorRouterAbi, functionName: "dexNames", args: [BigInt(i)] });
    }
    return arr;
  }, [address, total]);

  const reads = useReadContracts({ contracts, query: { enabled: total > 0, refetchInterval: 15_000 } });

  const rows = useMemo(() => {
    if (!reads.data) return [];
    const out: { id: number; router: string; name: string }[] = [];
    for (let i = 0; i < total; i++) {
      const r = reads.data[i * 2]?.result as string | undefined;
      const n = reads.data[i * 2 + 1]?.result as string | undefined;
      out.push({ id: i, router: r ?? ZERO, name: n ?? "" });
    }
    return out;
  }, [reads.data, total]);

  const [newAddr, setNewAddr] = useState("");
  const [newName, setNewName] = useState("");
  const add = useTxRunner("Add router");
  const update = useTxRunner("Update router");
  const remove = useTxRunner("Remove router");

  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Add router</h2>
          <span className="text-xs text-muted-foreground">Next ID: <b className="text-foreground">{total}</b></span>
        </div>
        <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2">
          <input
            value={newAddr}
            onChange={(e) => setNewAddr(e.target.value.trim())}
            placeholder="Router address 0x…"
            className="font-mono text-xs bg-surface-2 rounded-xl px-3 py-2 outline-none border border-border focus:border-primary"
          />
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name (e.g. OrvexSwap)"
            className="bg-surface-2 rounded-xl px-3 py-2 outline-none border border-border focus:border-primary text-sm"
          />
          <button
            disabled={!isAddr(newAddr) || !newName || add.busy || !user}
            onClick={() =>
              add.run({ address, abi: aggregatorRouterAbi, functionName: "addRouter", args: [newAddr as `0x${string}`, newName] })
            }
            className="px-4 py-2 rounded-xl bg-gradient-brand text-primary-foreground font-semibold disabled:opacity-40"
          >
            {add.busy ? "…" : "Add"}
          </button>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="font-semibold text-lg">Registered routers ({total})</h2>
        {total === 0 && (
          <div className="glass rounded-2xl p-6 text-sm text-muted-foreground">
            No routers yet. Add one above to start routing swaps through it.
          </div>
        )}
        {rows.map((row) => (
          <RouterRow key={row.id} contract={address} row={row} update={update} remove={remove} />
        ))}
      </section>
    </div>
  );
}

function RouterRow({
  contract,
  row,
  update,
  remove,
}: {
  contract: `0x${string}`;
  row: { id: number; router: string; name: string };
  update: ReturnType<typeof useTxRunner>;
  remove: ReturnType<typeof useTxRunner>;
}) {
  const [val, setVal] = useState(row.router === ZERO ? "" : row.router);
  useEffect(() => setVal(row.router === ZERO ? "" : row.router), [row.router]);
  const empty = row.router === ZERO;

  return (
    <div className={`glass rounded-2xl p-4 ${empty ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <div className="text-xs text-muted-foreground">ID #{row.id}</div>
          <div className="font-semibold">{row.name || <span className="text-muted-foreground italic">(removed)</span>}</div>
          {!empty && (
            <a href={explorerAddr(row.router)} target="_blank" rel="noreferrer" className="text-[11px] font-mono text-primary hover:underline">
              {row.router}
            </a>
          )}
        </div>
      </div>
      <div className="grid sm:grid-cols-[1fr_auto_auto] gap-2">
        <input
          value={val}
          onChange={(e) => setVal(e.target.value.trim())}
          placeholder="New router address 0x…"
          className="font-mono text-xs bg-surface-2 rounded-xl px-3 py-2 outline-none border border-border focus:border-primary"
        />
        <button
          disabled={!isAddr(val) || update.busy || empty}
          onClick={() =>
            update.run({ address: contract, abi: aggregatorRouterAbi, functionName: "updateRouter", args: [BigInt(row.id), val as `0x${string}`] })
          }
          className="px-4 py-2 rounded-xl bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 text-sm font-semibold disabled:opacity-40"
        >
          {update.busy ? "…" : "Update"}
        </button>
        <button
          disabled={remove.busy || empty}
          onClick={() => remove.run({ address: contract, abi: aggregatorRouterAbi, functionName: "removeRouter", args: [BigInt(row.id)] })}
          className="px-4 py-2 rounded-xl bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/25 text-sm font-semibold disabled:opacity-40"
        >
          {remove.busy ? "…" : "Remove"}
        </button>
      </div>
      {short(row.router)}
    </div>
  );
}
