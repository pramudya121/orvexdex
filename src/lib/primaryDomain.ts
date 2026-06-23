import { useEffect, useState } from "react";
import { DOMAIN_TLD } from "@/lib/chain";

const PRIMARY_KEY = "orvex.domain.primary.v1";
const OWNED_KEY = "orvex.domain.owned.";

/**
 * Resolve the preferred display name for an address.
 * Priority: explicit primary set via Domains page → first cached owned domain → null.
 * Returns the full name including the `.orvex` TLD.
 */
export function usePrimaryDomain(address?: string | null): string | null {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (!address || typeof window === "undefined") {
      setName(null);
      return;
    }
    const compute = () => {
      const addr = address.toLowerCase();
      try {
        const explicit = localStorage.getItem(PRIMARY_KEY + ":" + addr);
        if (explicit) return setName(`${explicit}.${DOMAIN_TLD}`);
        const owned = JSON.parse(localStorage.getItem(OWNED_KEY + addr) || "[]") as string[];
        if (owned.length > 0) return setName(`${owned[0]}.${DOMAIN_TLD}`);
      } catch {
        /* noop */
      }
      setName(null);
    };
    compute();
    const onStorage = (e: StorageEvent) => {
      if (!e.key) return;
      if (e.key.startsWith(PRIMARY_KEY) || e.key.startsWith(OWNED_KEY)) compute();
    };
    const onCustom = () => compute();
    window.addEventListener("storage", onStorage);
    window.addEventListener("orvex:domain-updated", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("orvex:domain-updated", onCustom);
    };
  }, [address]);

  return name;
}

/** Notify same-tab listeners that the user's domain cache changed. */
export function notifyDomainUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("orvex:domain-updated"));
  }
}
