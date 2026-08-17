/**
 * Shared, wallet-scoped portfolio brief.
 *
 * The Portfolio → AI Analyzer tab writes a compact plain-text summary of the
 * connected wallet (holdings + P&L) here; the ORVEX Copilot reads it so chat
 * answers can reference the user's real on-chain position.
 */

const KEY = "orvex.portfolio.brief.v1";

export type PortfolioBrief = { at: number; address: string; text: string };

export function savePortfolioBrief(address: string, text: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), address, text } satisfies PortfolioBrief));
  } catch {
    /* quota — ignore */
  }
}

export function loadPortfolioBrief(): PortfolioBrief | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PortfolioBrief;
    if (!parsed?.text) return null;
    // Ignore briefs older than 6 hours — stale on-chain data is worse than none.
    if (Date.now() - parsed.at > 6 * 60 * 60 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPortfolioBrief() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}
