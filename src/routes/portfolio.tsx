import { createFileRoute } from "@tanstack/react-router";
import { useAccount, useBalance, useReadContract, useReadContracts } from "wagmi";
import { TOKENS } from "@/lib/tokens";
import { ADDR, explorerAddr } from "@/lib/chain";
import { erc20Abi } from "@/lib/abis/wzkltc";
import { factoryAbi } from "@/lib/abis/factory";
import { pairAbi } from "@/lib/abis/pair";
import { fmt } from "@/lib/format";
import { useMemo } from "react";
import { ActivityFeed } from "@/components/ActivityFeed";

export const Route = createFileRoute("/portfolio")({
  component: PortfolioPage,
  head: () => ({ meta: [{ title: "Portfolio — ORVEX" }] }),
});

function PortfolioPage() {
  const { address, isConnected } = useAccount();
  const native = useBalance({ address, query: { refetchInterval: 10000 } });

  const balanceCalls = useMemo(
    () => TOKENS.filter((t) => !t.isNative).map((t) => ({
      address: t.address as `0x${string}`,
      abi: erc20Abi,
      functionName: "balanceOf" as const,
      args: address ? [address] as const : undefined,
    })),
    [address],
  );

  const balances = useReadContracts({ contracts: balanceCalls as any, query: { enabled: !!address, refetchInterval: 10000 } });

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-2">Portfolio</h1>
      <p className="text-sm text-muted-foreground mb-6">{address ? `${address.slice(0, 10)}…${address.slice(-6)}` : "Connect wallet to view"}</p>

      {!isConnected && (
        <div className="glass rounded-2xl p-10 text-center text-muted-foreground">Connect a wallet to see your balances and LP positions.</div>
      )}

      {isConnected && (
        <>
          <h2 className="text-lg font-semibold mb-3 mt-2">Tokens</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <TokenCard logo={TOKENS[0].logo} symbol="zkLTC" name="Native" balance={native.data?.value} decimals={18} />
            {TOKENS.filter((t) => !t.isNative).map((t, i) => {
              const b = balances.data?.[i]?.result as bigint | undefined;
              return <TokenCard key={t.address + t.symbol} logo={t.logo} symbol={t.symbol} name={t.name} balance={b} decimals={t.decimals} address={t.address} />;
            })}
          </div>

          <h2 className="text-lg font-semibold mb-3 mt-8">LP Positions</h2>
          <LPositions owner={address!} />

          <h2 className="text-lg font-semibold mb-3 mt-8">Recent Activity</h2>
          <ActivityFeed owner={address!} />
        </>
      )}
    </div>
  );
}

function TokenCard({ logo, symbol, name, balance, decimals, address }: { logo: string; symbol: string; name: string; balance?: bigint; decimals: number; address?: string }) {
  return (
    <div className="glass rounded-2xl p-4 flex items-center justify-between hover:neon-border transition">
      <div className="flex items-center gap-3">
        <img src={logo} alt={symbol} className="h-10 w-10 rounded-full" />
        <div>
          <div className="font-semibold">{symbol}</div>
          <div className="text-xs text-muted-foreground">{name}</div>
        </div>
      </div>
      <div className="text-right">
        <div className="font-mono font-semibold">{fmt(balance, decimals)}</div>
        {address && (
          <a href={explorerAddr(address)} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline">contract ↗</a>
        )}
      </div>
    </div>
  );
}

function LPositions({ owner }: { owner: `0x${string}` }) {
  const len = useReadContract({ address: ADDR.factory, abi: factoryAbi, functionName: "allPairsLength", query: { refetchInterval: 20000 } });
  const total = Number((len.data as bigint | undefined) ?? 0n);

  const pairCalls = useMemo(
    () => Array.from({ length: total }, (_, i) => ({
      address: ADDR.factory as `0x${string}`,
      abi: factoryAbi,
      functionName: "allPairs" as const,
      args: [BigInt(i)] as const,
    })),
    [total],
  );
  const pairs = useReadContracts({ contracts: pairCalls, query: { enabled: total > 0 } });
  const pairAddrs = (pairs.data ?? []).map((r) => r.result as `0x${string}` | undefined).filter(Boolean) as `0x${string}`[];

  const balCalls = useMemo(
    () => pairAddrs.map((p) => ({ address: p, abi: pairAbi, functionName: "balanceOf" as const, args: [owner] as const })),
    [pairAddrs, owner],
  );
  const bals = useReadContracts({ contracts: balCalls, query: { enabled: pairAddrs.length > 0, refetchInterval: 12000 } });
  const positions = pairAddrs
    .map((p, i) => ({ pair: p, bal: bals.data?.[i]?.result as bigint | undefined }))
    .filter((x) => x.bal && x.bal > 0n);

  if (positions.length === 0) {
    return <div className="glass rounded-2xl p-8 text-center text-muted-foreground text-sm">No LP positions yet.</div>;
  }

  return (
    <div className="space-y-2">
      {positions.map((p) => <LPRow key={p.pair} pair={p.pair} balance={p.bal!} />)}
    </div>
  );
}

function LPRow({ pair, balance }: { pair: `0x${string}`; balance: bigint }) {
  const meta = useReadContracts({
    contracts: [
      { address: pair, abi: pairAbi, functionName: "token0" },
      { address: pair, abi: pairAbi, functionName: "token1" },
    ],
  });
  const t0 = meta.data?.[0]?.result as `0x${string}` | undefined;
  const t1 = meta.data?.[1]?.result as `0x${string}` | undefined;
  const tk0 = t0 ? TOKENS.find((x) => x.address.toLowerCase() === t0.toLowerCase()) : undefined;
  const tk1 = t1 ? TOKENS.find((x) => x.address.toLowerCase() === t1.toLowerCase()) : undefined;
  return (
    <a href={explorerAddr(pair)} target="_blank" rel="noreferrer" className="glass rounded-2xl p-4 flex items-center justify-between hover:neon-border transition">
      <div className="flex items-center gap-3">
        <div className="flex -space-x-2">
          {tk0 && <img src={tk0.logo} className="h-8 w-8 rounded-full ring-2 ring-background" />}
          {tk1 && <img src={tk1.logo} className="h-8 w-8 rounded-full ring-2 ring-background" />}
        </div>
        <div>
          <div className="font-semibold">{tk0?.symbol ?? "?"} / {tk1?.symbol ?? "?"}</div>
          <div className="text-xs text-muted-foreground font-mono">{pair.slice(0, 8)}…</div>
        </div>
      </div>
      <div className="text-right">
        <div className="text-xs text-muted-foreground">LP Tokens</div>
        <div className="font-mono font-semibold">{fmt(balance, 18)}</div>
      </div>
    </a>
  );
}
