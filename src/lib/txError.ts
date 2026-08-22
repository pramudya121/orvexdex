/** Normalise wallet/RPC errors into short, human messages. */
export function txErrorMessage(e: unknown): { title: string; description?: string; rejected: boolean } {
  const err = e as { shortMessage?: string; message?: string; name?: string; cause?: unknown } | undefined;
  const raw = err?.shortMessage || err?.message || "";
  const lower = raw.toLowerCase();

  const rejected =
    lower.includes("user rejected") ||
    lower.includes("user denied") ||
    lower.includes("rejected the request") ||
    err?.name === "UserRejectedRequestError";

  if (rejected) return { title: "Transaction rejected", description: "You cancelled the request in your wallet.", rejected: true };

  if (lower.includes("insufficient funds")) {
    return { title: "Insufficient funds", description: "Not enough native zkLTC to cover the amount plus gas.", rejected: false };
  }
  if (lower.includes("insufficient_output_amount")) {
    return { title: "Slippage too low", description: "Price moved beyond your slippage tolerance. Increase it and retry.", rejected: false };
  }
  if (lower.includes("insufficient_input_amount") || lower.includes("excessive_input_amount")) {
    return { title: "Amount out of range", description: "The router rejected the input amount for this route.", rejected: false };
  }
  if (lower.includes("expired")) {
    return { title: "Deadline expired", description: "The transaction took too long. Try again with a longer deadline.", rejected: false };
  }
  if (lower.includes("insufficient_liquidity")) {
    return { title: "Not enough liquidity", description: "This pool cannot fill your trade size.", rejected: false };
  }

  const first = raw.split("\n")[0]?.slice(0, 180);
  return { title: "Transaction failed", description: first || "Unknown error", rejected: false };
}
