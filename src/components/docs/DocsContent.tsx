import { useState } from "react";
import { ADDR, explorerAddr } from "@/lib/chain";
import { aggregatorRouterAbi } from "@/lib/abis/aggregatorRouter";
import { aiExecutionControllerAbi } from "@/lib/abis/aiExecutionController";
import { aiGuardrailAbi } from "@/lib/abis/aiGuardrail";
import { aiTradingAgentAbi } from "@/lib/abis/aiTradingAgent";
import { casinoAbi, mockVrfAbi } from "@/lib/abis/casino";
import { domainControllerAbi } from "@/lib/abis/domainController";
import { domainRegistrarAbi } from "@/lib/abis/domainRegistrar";
import { domainRegistryAbi } from "@/lib/abis/domainRegistry";
import { domainResolverAbi } from "@/lib/abis/domainResolver";
import { factoryAbi } from "@/lib/abis/factory";
import { farmAbi } from "@/lib/abis/farm";
import { faucetAbi } from "@/lib/abis/faucet";
import { multicallAbi } from "@/lib/abis/multicall";
import { multiTokenVaultAbi } from "@/lib/abis/multiTokenVault";
import { pairAbi } from "@/lib/abis/pair";
import { routerAbi } from "@/lib/abis/router";
import { wzkltcAbi, erc20Abi } from "@/lib/abis/wzkltc";

type Doc = { group: string; name: string; address?: string; abi: readonly unknown[] };

const DOCS: Doc[] = [
  { group: "DEX", name: "Factory", address: ADDR.factory, abi: factoryAbi },
  { group: "DEX", name: "Router", address: ADDR.router, abi: routerAbi },
  { group: "DEX", name: "Pair (template)", abi: pairAbi },
  { group: "DEX", name: "wzkLTC", address: ADDR.wzkLTC, abi: wzkltcAbi },
  { group: "DEX", name: "AggregatorRouter (not deployed)", abi: aggregatorRouterAbi },
  { group: "Infrastructure", name: "Multicall", address: ADDR.multicall, abi: multicallAbi },
  { group: "Tokens", name: "TRX", address: ADDR.TRX, abi: erc20Abi },
  { group: "Tokens", name: "XRP", address: ADDR.XRP, abi: erc20Abi },
  { group: "Tokens", name: "ADA", address: ADDR.ADA, abi: erc20Abi },
  { group: "Tokens", name: "ZEC", address: ADDR.ZEC, abi: erc20Abi },
  { group: "Tokens", name: "XMR", address: ADDR.XMR, abi: erc20Abi },
  { group: "Tokens", name: "ORVX", address: ADDR.ORVX, abi: erc20Abi },
  { group: "Faucet & Farm", name: "Faucet", address: ADDR.faucet, abi: faucetAbi },
  { group: "Faucet & Farm", name: "Yield Farm", address: ADDR.farm, abi: farmAbi },
  { group: "Domains", name: "DomainRegistrarController", address: ADDR.domainController, abi: domainControllerAbi },
  { group: "Domains", name: "BaseRegistrar", address: ADDR.domainRegistrar, abi: domainRegistrarAbi },
  { group: "Domains", name: "PublicResolver", address: ADDR.domainResolver, abi: domainResolverAbi },
  { group: "Domains", name: "Registry", address: ADDR.domainRegistry, abi: domainRegistryAbi },
  { group: "AI Hub", name: "AIGuardrailManager", address: ADDR.aiGuardrail, abi: aiGuardrailAbi },
  { group: "AI Hub", name: "AIExecutionController", address: ADDR.aiExecutionController, abi: aiExecutionControllerAbi },
  { group: "AI Hub", name: "MultiTokenVault", address: ADDR.multiTokenVault, abi: multiTokenVaultAbi },
  { group: "AI Hub", name: "AITradingAgent", address: ADDR.aiTradingAgent, abi: aiTradingAgentAbi },
  { group: "Casino", name: "FinalCasinoNoOZ", address: ADDR.casino, abi: casinoAbi },
  { group: "Casino", name: "MockVRF", address: ADDR.mockVrf, abi: mockVrfAbi },
];

function CopyBtn({ text, label }: { text: string; label: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); }}
      className="px-3 py-1.5 rounded-full text-xs font-medium glass hover:border-primary/60 transition"
    >
      {ok ? "Copied ✓" : label}
    </button>
  );
}

function DocCard({ d }: { d: Doc }) {
  const [open, setOpen] = useState(false);
  const json = JSON.stringify(d.abi, null, 2);
  const fns = d.abi.filter((x) => (x as { type?: string }).type === "function").length;
  return (
    <div className="glass rounded-2xl p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">{d.name}</h3>
          <p className="text-xs text-muted-foreground">{fns} functions · {d.abi.length} ABI entries</p>
        </div>
        <div className="flex gap-2">
          {d.address && <CopyBtn text={d.address} label="Copy address" />}
          <CopyBtn text={json} label="Copy ABI" />
          <button type="button" onClick={() => setOpen(!open)} className="px-3 py-1.5 rounded-full text-xs glass">
            {open ? "Hide ABI" : "View ABI"}
          </button>
        </div>
      </div>
      {d.address ? (
        <a href={explorerAddr(d.address)} target="_blank" rel="noreferrer" className="block font-mono text-xs text-primary break-all hover:underline">
          {d.address}
        </a>
      ) : (
        <p className="text-xs text-muted-foreground">No fixed address</p>
      )}
      {open && (
        <pre className="max-h-96 overflow-auto rounded-xl bg-background/70 border border-border p-3 text-[11px] font-mono">{json}</pre>
      )}
    </div>
  );
}

export default function DocsContent() {
  const [q, setQ] = useState("");
  const list = DOCS.filter((d) => (d.name + d.group + (d.address ?? "")).toLowerCase().includes(q.toLowerCase()));
  const groups = [...new Set(list.map((d) => d.group))];
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div className="space-y-2">
        <span className="text-xs px-2 py-1 rounded-full bg-primary/15 text-primary">🔒 Owner only</span>
        <h1 className="text-3xl font-bold">Contract Documentation</h1>
        <p className="text-muted-foreground">LitVM LiteForge (chain 4441) — all ORVEX contract addresses and ABIs.</p>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search contract or address…"
          className="w-full sm:w-96 h-10 px-4 rounded-full glass bg-transparent text-sm outline-none focus:border-primary/60"
        />
      </div>
      {groups.map((g) => (
        <section key={g} className="space-y-3">
          <h2 className="text-lg font-semibold text-muted-foreground">{g}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {list.filter((d) => d.group === g).map((d) => <DocCard key={d.name} d={d} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
