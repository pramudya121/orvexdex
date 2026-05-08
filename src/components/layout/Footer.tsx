import { Link } from "@tanstack/react-router";
import logo from "@/assets/orvex-logo.png";

export function Footer() {
  return (
    <footer className="border-t border-border mt-20">
      <div className="max-w-7xl mx-auto px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <img src={logo} alt="ORVEX" className="h-7 w-7" />
          <span className="font-bold tracking-widest text-gradient-brand">ORVEX</span>
          <span className="text-xs text-muted-foreground ml-2">on LitVM LiteForge</span>
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-4">
          <Link to="/admin" className="hover:text-foreground transition">Admin</Link>
          <a href="https://liteforge.explorer.caldera.xyz" target="_blank" rel="noreferrer" className="hover:text-foreground transition">Explorer</a>
        </div>
      </div>
    </footer>
  );
}
