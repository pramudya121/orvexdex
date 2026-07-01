import { useEffect, useState } from "react";
import {
  useAccount,
  useSendTransaction,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseUnits, isAddress } from "viem";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { erc20Abi } from "@/lib/abis/wzkltc";
import { useToast } from "@/components/ui/toaster";
import { fmt } from "@/lib/format";
import { Send, Loader2 } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  symbol: string;
  logo: string;
  decimals: number;
  balance?: bigint;
  /** ERC20 contract address. Omit for native token (uses sendTransaction). */
  tokenAddress?: string;
};

const getErr = (e: unknown) => {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null) {
    const m = e as { shortMessage?: string; message?: string };
    return m.shortMessage || m.message;
  }
  return String(e);
};

export function SendTokenDialog({ open, onOpenChange, symbol, logo, decimals, balance, tokenAddress }: Props) {
  const { address } = useAccount();
  const toast = useToast();
  const { sendTransactionAsync } = useSendTransaction();
  const { writeContractAsync } = useWriteContract();

  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const receipt = useWaitForTransactionReceipt({ hash });
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) {
      setTo("");
      setAmount("");
      setHash(undefined);
      setSending(false);
    }
  }, [open]);

  useEffect(() => {
    if (receipt.isSuccess && hash) {
      toast.push({ title: `Sent ${amount} ${symbol}`, type: "success", hash });
      onOpenChange(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isSuccess]);

  const toValid = isAddress(to);
  let amountWei: bigint | undefined;
  try { amountWei = amount ? parseUnits(amount, decimals) : undefined; } catch { amountWei = undefined; }
  const overBal = amountWei !== undefined && balance !== undefined && amountWei > balance;
  const canSend = !!address && toValid && amountWei !== undefined && amountWei > 0n && !overBal && !sending && !hash;

  const handleSend = async () => {
    if (!canSend || !amountWei) return;
    setSending(true);
    try {
      let h: `0x${string}`;
      if (tokenAddress) {
        h = await writeContractAsync({
          address: tokenAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: "transfer",
          args: [to as `0x${string}`, amountWei],
        });
      } else {
        h = await sendTransactionAsync({ to: to as `0x${string}`, value: amountWei });
      }
      setHash(h);
      toast.push({ title: `Sending ${amount} ${symbol}…`, hash: h });
    } catch (e) {
      toast.push({ title: "Send failed", description: getErr(e), type: "error" });
      setSending(false);
    }
  };

  const setMax = () => {
    if (balance === undefined) return;
    // For native, leave a tiny buffer for gas.
    const safe = tokenAddress ? balance : (balance > 1000000000000000n ? balance - 1000000000000000n : 0n);
    // Convert to string with full decimals precision.
    const s = safe.toString().padStart(decimals + 1, "0");
    const int = s.slice(0, s.length - decimals) || "0";
    const dec = s.slice(s.length - decimals).replace(/0+$/, "");
    setAmount(dec ? `${int}.${dec}` : int);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <img src={logo} alt="" className="h-6 w-6 rounded-full" />
            Send {symbol}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Recipient address</label>
            <Input
              value={to}
              onChange={(e) => setTo(e.target.value.trim())}
              placeholder="0x…"
              className="font-mono mt-1"
              spellCheck={false}
            />
            {to && !toValid && <div className="text-xs text-destructive mt-1">Invalid address</div>}
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Amount</label>
              <button onClick={setMax} className="text-[10px] text-accent hover:underline uppercase tracking-wider" type="button">
                Max
              </button>
            </div>
            <div className="relative mt-1">
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                placeholder="0.0"
                inputMode="decimal"
                className="font-mono pr-16"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{symbol}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1 flex justify-between">
              <span>Balance: <span className="font-mono">{fmt(balance, decimals, 6)}</span> {symbol}</span>
              {overBal && <span className="text-destructive">Exceeds balance</span>}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSend} disabled={!canSend}>
            {sending || hash ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : <><Send className="h-4 w-4" /> Send</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
