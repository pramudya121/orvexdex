import { useCallback, useEffect, useState } from "react";

/**
 * Small SSR-safe localStorage hook. Reads after mount to avoid hydration mismatch.
 */
export function useLocalStorage<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    try {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
      if (raw != null) setValue(JSON.parse(raw) as T);
    } catch {
      /* noop */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = useCallback(
    (v: T | ((p: T) => T)) => {
      setValue((prev) => {
        const next = typeof v === "function" ? (v as (p: T) => T)(prev) : v;
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          /* noop */
        }
        return next;
      });
    },
    [key],
  );

  return [value, set];
}
