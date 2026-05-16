import { Link, useRouterState } from "@tanstack/react-router";
import { ConnectButton } from "@/components/wallet/ConnectButton";

import { BrandMark } from "@/components/brand/BrandMark";
import { useAccount, useReadContract } from "wagmi";
import { ADDR } from "@/lib/chain";
import { faucetAbi } from "@/lib/abis/faucet";

const NAV = [
  { to: "/swap", label: "Swap" },
  { to: "/liquidity", label: "Liquidity" },
  { to: "/pools", label: "Pools" },
  { to: "/analytics", label: "Analytics" },
  { to: "/portfolio", label: "Portfolio" },
  { to: "/faucet", label: "Faucet" },
];

export function Header() {
  const { location } = useRouterState();
  const { address } = useAccount();
  const owner = useReadContract({ address: ADDR.faucet, abi: faucetAbi, functionName: "owner" });
  const isOwner = !!address && !!owner.data && (owner.data as string).toLowerCase() === address.toLowerCase();
  const nav = isOwner ? [...NAV, { to: "/admin", label: "Admin" }] : NAV;
  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/60 border-b border-border">
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-luxe opacity-50" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link to="/" className="group" aria-label="ORVEX home">
          <BrandMark size="md" />
        </Link>
        <nav className="hidden md:flex items-center gap-1 glass rounded-full px-2 py-1.5">
          {nav.map((n) => {
            const active = location.pathname.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
                  active
                    ? "bg-gradient-brand text-primary-foreground shadow-neon"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <ConnectButton />
        </div>
      </div>
      <div className="md:hidden border-t border-border overflow-x-auto">
        <div className="flex gap-1 px-4 py-2 min-w-max">
          {nav.map((n) => {
            const active = location.pathname.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                  active ? "bg-gradient-brand text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </div>
      </div>
    </header>
  );
}
