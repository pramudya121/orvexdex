import { Link } from "@tanstack/react-router";
import { BrandMark } from "@/components/brand/BrandMark";

export function Footer() {
  return (
    <footer className="relative border-t border-border mt-24 noise-bg">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-luxe opacity-60" />
      <div className="max-w-7xl mx-auto px-6 py-14 grid md:grid-cols-4 gap-10">
        <div className="md:col-span-2">
          <BrandMark size="md" className="mb-3" />
          <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
            A connoisseur-grade decentralized exchange on LitVM LiteForge. Liquidity refined, settlements final, experience uncompromised.
          </p>
          <div className="mt-5 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-2/60 border border-gold text-[10px] tracking-[0.25em] uppercase text-gradient-gold font-semibold">
            Atelier · MMXXVI
          </div>
        </div>
        <div>
          <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground mb-3">Trade</div>
          <ul className="space-y-2 text-sm">
            <li><Link to="/swap" className="hover:text-gradient-luxe transition">Swap</Link></li>
            <li><Link to="/liquidity" className="hover:text-foreground transition">Liquidity</Link></li>
            <li><Link to="/pools" className="hover:text-foreground transition">Pools</Link></li>
            <li><Link to="/portfolio" className="hover:text-foreground transition">Portfolio</Link></li>
          </ul>
        </div>
        <div>
          <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground mb-3">Network</div>
          <ul className="space-y-2 text-sm">
            <li><Link to="/faucet" className="hover:text-foreground transition">Faucet</Link></li>
            <li><Link to="/brand" className="hover:text-foreground transition">Brand & Style Guide</Link></li>
            <li><a href="https://liteforge.explorer.caldera.xyz" target="_blank" rel="noreferrer" className="hover:text-foreground transition">Explorer ↗</a></li>
            <li><a href="https://liteforge.rpc.caldera.xyz/http" target="_blank" rel="noreferrer" className="hover:text-foreground transition">RPC ↗</a></li>
            <li><Link to="/admin" className="hover:text-foreground transition">Admin</Link></li>
          </ul>
          <div className="mt-5 flex items-center gap-2">
            <a
              href="https://x.com/ORVEX_LitVM"
              target="_blank"
              rel="noreferrer"
              aria-label="ORVEX on X (Twitter)"
              className="group inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-2/60 border border-border hover:border-primary/60 hover:bg-surface-2 transition"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-foreground group-hover:fill-primary transition">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              <span className="text-xs font-medium">@ORVEX_LitVM</span>
            </a>
          </div>
        </div>
      </div>
      <div className="border-t border-border/60">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <div>© {new Date().getFullYear()} ORVEX · All settlements final on-chain.</div>
          <div className="font-mono tracking-wider">LitVM LiteForge · Chain 4441</div>
        </div>
      </div>
    </footer>
  );
}
