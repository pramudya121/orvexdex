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
                preload="intent"
                className={`relative px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-300 ${
                  active
                    ? "bg-gradient-brand text-primary-foreground shadow-neon"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <a
            href="https://x.com/ORVEX_LitVM"
            target="_blank"
            rel="noreferrer"
            aria-label="ORVEX on X (Twitter)"
            className="hidden sm:inline-flex h-9 w-9 items-center justify-center rounded-full glass hover:border-primary/60 transition group"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-foreground/80 group-hover:fill-primary transition">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>
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
                preload="intent"
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300 ${
                  active ? "bg-gradient-brand text-primary-foreground shadow-neon" : "text-muted-foreground"
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
