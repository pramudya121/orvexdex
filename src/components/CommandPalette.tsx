import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { TOKENS } from "@/lib/tokens";
import { explorerAddr } from "@/lib/chain";

const PAGES: { to: string; label: string; hint: string }[] = [
  { to: "/swap", label: "Swap", hint: "Trade tokens" },
  { to: "/liquidity", label: "Liquidity", hint: "Add or remove" },
  { to: "/pools", label: "Pools", hint: "Browse pairs" },
  { to: "/analytics", label: "Analytics", hint: "Protocol metrics" },
  { to: "/portfolio", label: "Portfolio", hint: "Your positions" },
  { to: "/faucet", label: "Faucet", hint: "Claim test tokens" },
  { to: "/brand", label: "Brand", hint: "Press kit" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
      const target = e.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (!typing && e.key === "/") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("orvex:open-palette" as any, onOpen);
    return () => window.removeEventListener("orvex:open-palette" as any, onOpen);
  }, []);

  const go = (path: string) => {
    setOpen(false);
    navigate({ to: path as any });
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search pages, tokens, actions…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Pages">
          {PAGES.map((p) => (
            <CommandItem key={p.to} value={`${p.label} ${p.hint}`} onSelect={() => go(p.to)}>
              <span className="font-medium">{p.label}</span>
              <span className="ml-auto text-xs text-muted-foreground">{p.hint}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Swap into">
          {TOKENS.filter((t) => !t.isNative).map((t) => (
            <CommandItem
              key={t.address}
              value={`swap ${t.symbol} ${t.name}`}
              onSelect={() => go("/swap")}
            >
              <img src={t.logo} alt="" className="h-4 w-4 rounded-full" />
              <span className="font-medium">{t.symbol}</span>
              <span className="text-xs text-muted-foreground">{t.name}</span>
              <span className="ml-auto text-[10px] text-muted-foreground">Swap →</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Quick actions">
          <CommandItem value="claim faucet" onSelect={() => go("/faucet")}>
            Claim test tokens
            <span className="ml-auto text-xs text-muted-foreground">Faucet</span>
          </CommandItem>
          <CommandItem value="add liquidity" onSelect={() => go("/liquidity")}>
            Add liquidity
            <span className="ml-auto text-xs text-muted-foreground">Liquidity</span>
          </CommandItem>
          <CommandItem
            value="open explorer"
            onSelect={() => {
              setOpen(false);
              window.open(explorerAddr(TOKENS[0].address), "_blank", "noopener");
            }}
          >
            Open LitVM explorer
            <span className="ml-auto text-xs text-muted-foreground">External ↗</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

export const openPalette = () =>
  window.dispatchEvent(new CustomEvent("orvex:open-palette"));
