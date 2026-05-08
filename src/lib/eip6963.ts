import { useEffect, useState } from "react";

export type Eip6963ProviderInfo = {
  uuid: string;
  name: string;
  icon: string; // data URI usually
  rdns: string;
};

export type Eip6963Detail = {
  info: Eip6963ProviderInfo;
  provider: any;
};

export function useEip6963Providers(): Eip6963Detail[] {
  const [list, setList] = useState<Eip6963Detail[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<Eip6963Detail>).detail;
      if (!detail?.info?.uuid) return;
      setList((prev) => {
        if (prev.some((p) => p.info.uuid === detail.info.uuid)) return prev;
        return [...prev, detail];
      });
    };
    window.addEventListener("eip6963:announceProvider", handler);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    return () => window.removeEventListener("eip6963:announceProvider", handler);
  }, []);

  return list;
}