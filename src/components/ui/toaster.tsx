import { createContext, useCallback, useContext, useState } from "react";
import { explorerTx } from "@/lib/chain";
import { useAccount } from "wagmi";
import { addTx } from "@/lib/txHistory";

type Toast = {
  id: number;
  title: string;
  description?: string;
  hash?: string;
  type?: "info" | "success" | "error";
};

const Ctx = createContext<{
  push: (t: Omit<Toast, "id">) => void;
}>({ push: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const { address } = useAccount();
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { ...t, id }]);
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 7000);
    if (t.hash && address) {
      addTx({ hash: t.hash, title: t.title, account: address });
    }
  }, [address]);
  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="fixed top-20 right-4 z-50 space-y-2 max-w-sm">
        {items.map((t) => (
          <div
            key={t.id}
            className={`glass-strong rounded-xl p-4 shadow-neon border-l-4 animate-in slide-in-from-right ${
              t.type === "error" ? "border-l-destructive" : t.type === "success" ? "border-l-accent" : "border-l-primary"
            }`}
          >
            <div className="font-semibold text-sm">{t.title}</div>
            {t.description && <div className="text-xs text-muted-foreground mt-1 break-all">{t.description}</div>}
            {t.hash && (
              <a
                href={explorerTx(t.hash)}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-accent hover:underline mt-2 inline-block"
              >
                View on explorer ↗
              </a>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
