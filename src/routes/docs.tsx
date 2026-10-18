import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { useAccount, useReadContract } from "wagmi";
import { ADDR } from "@/lib/chain";
import { faucetAbi } from "@/lib/abis/faucet";
import { casinoAbi } from "@/lib/abis/casino";
import { ConnectButton } from "@/components/wallet/ConnectButton";

const DocsContent = lazy(() => import("@/components/docs/DocsContent"));

export const Route = createFileRoute("/docs")({
  component: DocsPage,
  head: () => ({
    meta: [
      { title: "Contract Docs (Private) — ORVEX" },
      { name: "description", content: "Private ORVEX contract addresses and ABIs for owners." },
      { property: "og:title", content: "Contract Docs — ORVEX" },
      { property: "og:description", content: "Private contract documentation for ORVEX admins." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function DocsPage() {
  const { address, isConnected } = useAccount();
  const f = useReadContract({ address: ADDR.faucet, abi: faucetAbi, functionName: "owner" });
  const c = useReadContract({ address: ADDR.casino, abi: casinoAbi, functionName: "owner" });
  const me = address?.toLowerCase();
  const owners = [f.data, c.data].filter(Boolean).map((o) => (o as string).toLowerCase());
  const isAdmin = !!me && owners.includes(me);
  const loading = f.isLoading || c.isLoading;

  if (!isConnected || !isAdmin) {
    return (
      <div className="max-w-xl mx-auto px-4 py-24 text-center space-y-4">
        <div className="text-5xl">🔒</div>
        <h1 className="text-2xl font-bold">Private documentation</h1>
        <p className="text-muted-foreground">
          {!isConnected
            ? "Connect the owner/admin wallet to view contract addresses and ABIs."
            : loading
              ? "Checking access on-chain…"
              : "This wallet is not the owner or admin. Access denied."}
        </p>
        {!isConnected && <div className="flex justify-center"><ConnectButton /></div>}
      </div>
    );
  }
  return (
    <Suspense fallback={<div className="p-12 text-center text-muted-foreground">Loading docs…</div>}>
      <DocsContent />
    </Suspense>
  );
}
