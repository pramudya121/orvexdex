import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, usePublicClient, useWatchContractEvent, useWriteContract } from "wagmi";
import { ADDR } from "@/lib/chain";
import { casinoAbi } from "@/lib/abis/casino";
import { decodeEventLog, parseAbi } from "viem";

/** `fulfill` exists only on the fixed (two-step) randomness contract. */
const fulfillAbi = parseAbi(["function fulfill(uint256 requestId)", "function fulfilled(uint256) view returns (bool)"]);

export type CasinoFn = "playCoinFlip" | "playDice" | "playRoulette" | "playRPS" | "playHighLow";
/** idle → approve (wallet) → hashing (tx mining) → vrf (waiting randomness) → settled */
export type CasinoPhase = "idle" | "approve" | "hashing" | "vrf" | "settled";
export type CasinoResult = { won: boolean; payout: bigint; randomResult: bigint; requestId: bigint };
export type FeedItem = { id: string; player: string; won: boolean; payout: bigint; amount?: bigint; at: number };

const casino = { address: ADDR.casino as `0x${string}`, abi: casinoAbi } as const;
const VRF_TIMEOUT = 90_000;

export function useCasino(opts: { onSettled?: (r: CasinoResult) => void; onError?: (msg: string) => void } = {}) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [phase, setPhase] = useState<CasinoPhase>("idle");
  const [hash, setHash] = useState<`0x${string}`>();
  const [result, setResult] = useState<CasinoResult | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [pendingId, setPendingId] = useState<bigint>();
  const [canSettle, setCanSettle] = useState(false);
  const [settling, setSettling] = useState(false);
  const amounts = useRef(new Map<string, bigint>());
  const cbs = useRef(opts);
  cbs.current = opts;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  useWatchContractEvent({
    ...casino,
    eventName: "BetPlaced",
    onLogs(logs) {
      for (const log of logs) {
        const a = (log as any).args as { requestId?: bigint; amount?: bigint };
        if (a?.requestId !== undefined && a.amount !== undefined) amounts.current.set(a.requestId.toString(), a.amount);
      }
    },
  });

  useWatchContractEvent({
    ...casino,
    eventName: "BetSettled",
    onLogs(logs) {
      for (const log of logs) {
        const a = (log as any).args as { player?: string; won?: boolean; payout?: bigint; randomResult?: bigint; requestId?: bigint };
        if (!a?.player) continue;
        const rid = (a.requestId ?? 0n).toString();
        setFeed((f) =>
          [{ id: `${log.transactionHash}-${rid}`, player: a.player!, won: !!a.won, payout: a.payout ?? 0n, amount: amounts.current.get(rid), at: Date.now() }, ...f].slice(0, 40),
        );
        if (address && a.player.toLowerCase() === address.toLowerCase()) {
          clearTimeout(timer.current);
          const r = { won: !!a.won, payout: a.payout ?? 0n, randomResult: a.randomResult ?? 0n, requestId: a.requestId ?? 0n };
          setResult(r);
          setPhase("settled");
          setPendingId(undefined);
          setCanSettle(false);
          cbs.current.onSettled?.(r);
        }
      }
    },
  });

  const placeBet = useCallback(
    async (fn: CasinoFn, prediction: number, value: bigint) => {
      if (!address || !publicClient) return;
      setResult(null);
      setPhase("approve");
      try {
        let gas: bigint | undefined;
        try {
          const est = await publicClient.estimateContractGas({ ...casino, functionName: fn, args: [prediction], value, account: address });
          gas = (est * 12n) / 10n;
        } catch (e: any) {
          throw new Error(e?.shortMessage || "This bet would be rejected by the contract.");
        }
        const h = await writeContractAsync({ ...casino, functionName: fn, args: [prediction], value, gas });
        setHash(h);
        setPhase("hashing");
        const rc = await publicClient.waitForTransactionReceipt({ hash: h });
        if (rc.status !== "success") throw new Error("Transaction reverted.");
        setPhase((p) => (p === "settled" ? p : "vrf"));
        // Two-step randomness: detect the request id and whether the coordinator supports `fulfill`.
        for (const log of rc.logs) {
          try {
            const ev = decodeEventLog({ abi: casinoAbi, data: log.data, topics: log.topics });
            if (ev.eventName === "BetPlaced") {
              const rid = (ev.args as { requestId: bigint }).requestId;
              setPendingId(rid);
              const vrf = (await publicClient.readContract({ ...casino, functionName: "vrfCoordinator" })) as `0x${string}`;
              const done = await publicClient.readContract({ address: vrf, abi: fulfillAbi, functionName: "fulfilled", args: [rid] }).catch(() => null);
              setCanSettle(done === false);
            }
          } catch { /* not a casino event */ }
        }
        timer.current = setTimeout(() => {
          setPhase((p) => (p === "vrf" ? "idle" : p));
          cbs.current.onError?.("Randomness is taking longer than usual — your result will appear in the feed once settled.");
        }, VRF_TIMEOUT);
        return h;
      } catch (e: any) {
        setPhase("idle");
        const raw = String(e?.shortMessage || e?.message || "");
        const msg = /reject|denied/i.test(raw) ? "You rejected the transaction." : /Invalid bet/.test(raw) ? "The randomness engine settles bets before they are saved, so the contract rejects every bet. The house must deploy the fixed randomness contract." : /Only casino can request/.test(raw) ? "The randomness engine is not linked to the casino yet." : raw || "Bet failed";
        cbs.current.onError?.(msg);
      }
    },
    [address, publicClient, writeContractAsync],
  );

  /** Second transaction for the fixed randomness contract: reveals the result. */
  const settle = useCallback(async () => {
    if (pendingId === undefined || !publicClient) return;
    setSettling(true);
    try {
      const vrf = (await publicClient.readContract({ ...casino, functionName: "vrfCoordinator" })) as `0x${string}`;
      const h = await writeContractAsync({ address: vrf, abi: fulfillAbi, functionName: "fulfill", args: [pendingId] });
      await publicClient.waitForTransactionReceipt({ hash: h });
    } catch (e: any) {
      const raw = String(e?.shortMessage || e?.message || "");
      cbs.current.onError?.(/reject|denied/i.test(raw) ? "You rejected the transaction." : raw || "Could not reveal the result");
    } finally {
      setSettling(false);
    }
  }, [pendingId, publicClient, writeContractAsync]);

  const reset = useCallback(() => {
    setPhase("idle");
    setResult(null);
  }, []);

  return { phase, hash, result, feed, placeBet, reset, settle, canSettle, settling, busy: phase === "approve" || phase === "hashing" || phase === "vrf" };
}
