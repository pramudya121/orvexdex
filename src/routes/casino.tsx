import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useBalance,
  useChainId,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWatchContractEvent,
  useWriteContract,
} from "wagmi";
import { formatEther, parseEther } from "viem";
import { ADDR, explorerAddr, litvm } from "@/lib/chain";
import { casinoAbi } from "@/lib/abis/casino";
import { useToast } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/casino")({
  component: CasinoPage,
  head: () => ({
    meta: [
      { title: "ORVEX Casino — Provably Random On-Chain Games" },
      { name: "description", content: "Play CoinFlip, Dice, Roulette, Rock-Paper-Scissors and High/Low on LitVM with on-chain randomness and instant payouts." },
      { property: "og:title", content: "ORVEX Casino — On-Chain Games" },
      { property: "og:description", content: "Five on-chain casino games powered by VRF randomness on LitVM LiteForge." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

type GameId = "coinflip" | "dice" | "roulette" | "rps" | "highlow";

type GameDef = {
  id: GameId;
  name: string;
  fn: "playCoinFlip" | "playDice" | "playRoulette" | "playRPS" | "playHighLow";
  emoji: string;
  tagline: string;
  meme: string;
  odds: string;
  choices: { value: number; label: string; emoji?: string }[];
};

const GAMES: GameDef[] = [
  {
    id: "coinflip",
    name: "Coin Flip",
    fn: "playCoinFlip",
    emoji: "🪙",
    tagline: "50/50. No strategy. Pure vibes.",
    meme: "\"It's just a coin bro, how bad can it be\" — anon, 3 flips later",
    odds: "~2x",
    choices: [
      { value: 0, label: "Heads", emoji: "👑" },
      { value: 1, label: "Tails", emoji: "🪶" },
    ],
  },
  {
    id: "dice",
    name: "Dice Roll",
    fn: "playDice",
    emoji: "🎲",
    tagline: "Call your number, roll the chain.",
    meme: "Statistically you're fine. Emotionally, not so much.",
    odds: "~6x",
    choices: [1, 2, 3, 4, 5, 6].map((n) => ({ value: n, label: String(n), emoji: ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][n - 1] })),
  },
  {
    id: "roulette",
    name: "Roulette",
    fn: "playRoulette",
    emoji: "🎡",
    tagline: "Pick a pocket 0–36. Watch it spin.",
    meme: "Red? Black? Nah — I pick 17 because it's my ex's birthday.",
    odds: "up to ~36x",
    choices: Array.from({ length: 37 }, (_, i) => ({ value: i, label: String(i) })),
  },
  {
    id: "rps",
    name: "Rock Paper Scissors",
    fn: "playRPS",
    emoji: "✊",
    tagline: "Beat the house hand.",
    meme: "The blockchain always plays paper. (It doesn't. Probably.)",
    odds: "~3x",
    choices: [
      { value: 0, label: "Rock", emoji: "✊" },
      { value: 1, label: "Paper", emoji: "✋" },
      { value: 2, label: "Scissors", emoji: "✌️" },
    ],
  },
  {
    id: "highlow",
    name: "High / Low",
    fn: "playHighLow",
    emoji: "📈",
    tagline: "Will the roll land high or low?",
    meme: "Number go up. Sometimes. Statistically half the time.",
    odds: "~2x",
    choices: [
      { value: 0, label: "Low", emoji: "📉" },
      { value: 1, label: "High", emoji: "📈" },
    ],
  },
];

function fmtEth(v?: bigint, max = 4) {
  if (v === undefined) return "—";
  const s = formatEther(v);
  const [i, d] = s.split(".");
  return d ? `${i}.${d.slice(0, max)}` : i;
}

type Result = { won: boolean; payout: bigint; randomResult: bigint; requestId: bigint } | null;

function CasinoPage() {
  const toast = useToast();
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const balance = useBalance({ address });

  const [game, setGame] = useState<GameDef>(GAMES[0]);
  const [choice, setChoice] = useState<number>(0);
  const [amount, setAmount] = useState("0.01");
  const [rolling, setRolling] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const [feed, setFeed] = useState<{ player: string; won: boolean; payout: bigint; id: string }[]>([]);

  const read = { address: ADDR.casino as `0x${string}`, abi: casinoAbi } as const;
  const minBet = useReadContract({ ...read, functionName: "minBet", query: { refetchInterval: 20_000 } });
  const maxBet = useReadContract({ ...read, functionName: "maxBet", query: { refetchInterval: 20_000 } });
  const houseEdge = useReadContract({ ...read, functionName: "houseEdge" });
  const paused = useReadContract({ ...read, functionName: "paused", query: { refetchInterval: 15_000 } });
  const bank = useReadContract({ ...read, functionName: "getContractBalance", query: { refetchInterval: 12_000 } });
  const owner = useReadContract({ ...read, functionName: "owner" });
  const pending = useReadContract({
    ...read,
    functionName: "pendingWithdrawals",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 12_000 },
  });

  const isOwner = !!address && !!owner.data && (owner.data as string).toLowerCase() === address.toLowerCase();

  const { writeContractAsync, isPending } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const receipt = useWaitForTransactionReceipt({ hash });

  useWatchContractEvent({
    ...read,
    eventName: "BetSettled",
    onLogs(logs) {
      for (const log of logs) {
        const a = (log as any).args as { player?: string; won?: boolean; payout?: bigint; randomResult?: bigint; requestId?: bigint };
        if (!a?.player) continue;
        setFeed((f) => [{ player: a.player!, won: !!a.won, payout: a.payout ?? 0n, id: `${log.transactionHash}-${a.requestId}` }, ...f].slice(0, 12));
        if (address && a.player.toLowerCase() === address.toLowerCase()) {
          setRolling(false);
          setResult({ won: !!a.won, payout: a.payout ?? 0n, randomResult: a.randomResult ?? 0n, requestId: a.requestId ?? 0n });
          toast.push({
            title: a.won ? `You won ${fmtEth(a.payout)} zkLTC 🎉` : "House wins this round 😵",
            type: a.won ? "success" : "error",
          });
          pending.refetch();
          bank.refetch();
          balance.refetch();
        }
      }
    },
  });

  useEffect(() => {
    if (receipt.isSuccess && hash) {
      toast.push({ title: "Bet confirmed on-chain", type: "success", hash });
      setHash(undefined);
      balance.refetch();
      bank.refetch();
      // settlement arrives via BetSettled; stop spinner after a grace period
      const t = setTimeout(() => setRolling(false), 20_000);
      return () => clearTimeout(t);
    }
    if (receipt.isError && hash) {
      setHash(undefined);
      setRolling(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isSuccess, receipt.isError]);

  const value = useMemo(() => {
    try {
      return amount ? parseEther(amount) : 0n;
    } catch {
      return 0n;
    }
  }, [amount]);

  const belowMin = minBet.data !== undefined && value > 0n && value < (minBet.data as bigint);
  const aboveMax = maxBet.data !== undefined && (maxBet.data as bigint) > 0n && value > (maxBet.data as bigint);
  const insufficient = balance.data ? value > balance.data.value : false;
  const isPaused = paused.data === true;

  const disabled =
    !address || isPending || rolling || !!hash || value <= 0n || belowMin || aboveMax || insufficient || isPaused;

  const ensureChain = async () => {
    if (chainId === litvm.id) return true;
    try {
      await switchChainAsync({ chainId: litvm.id });
      return true;
    } catch (e: any) {
      toast.push({ title: "Switch network failed", description: e?.shortMessage || e?.message, type: "error" });
      return false;
    }
  };

  const play = async () => {
    if (disabled) return;
    if (!(await ensureChain())) return;
    setResult(null);
    setRolling(true);
    try {
      const h = await writeContractAsync({
        address: ADDR.casino as `0x${string}`,
        abi: casinoAbi,
        functionName: game.fn,
        args: [choice],
        value,
      });
      setHash(h);
      toast.push({ title: `${game.name} bet submitted`, hash: h });
    } catch (e: any) {
      setRolling(false);
      toast.push({ title: "Bet failed", description: e?.shortMessage || e?.message, type: "error" });
    }
  };

  const claim = async () => {
    if (!address) return;
    if (!(await ensureChain())) return;
    try {
      const h = await writeContractAsync({ address: ADDR.casino as `0x${string}`, abi: casinoAbi, functionName: "withdrawPending" });
      toast.push({ title: "Withdraw submitted", hash: h });
    } catch (e: any) {
      toast.push({ title: "Withdraw failed", description: e?.shortMessage || e?.message, type: "error" });
    }
  };

  const selectGame = (g: GameDef) => {
    setGame(g);
    setChoice(g.choices[0].value);
    setResult(null);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-10">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl glass-strong p-8 sm:p-12 noise-bg animated-border">
        <div className="absolute -top-24 -left-16 h-72 w-72 rounded-full bg-gradient-brand blur-3xl opacity-30 animate-aurora" aria-hidden />
        <div className="absolute -bottom-28 right-0 h-80 w-80 rounded-full bg-gradient-gold blur-3xl opacity-20 animate-aurora-2" aria-hidden />
        <div className="relative flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="space-y-4 max-w-2xl">
            <span className="inline-flex items-center gap-2 text-xs px-3 py-1 rounded-full glass text-muted-foreground">
              🎰 On-chain randomness · LitVM LiteForge
            </span>
            <h1 className="text-4xl sm:text-6xl font-black tracking-tight">
              <span className="text-gradient-luxe-anim">ORVEX Casino</span>
            </h1>
            <p className="text-muted-foreground text-lg">
              Five games. One bankroll. Every roll settled by the chain — no croupier, no cards up the sleeve.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {GAMES.map((g) => (
                <button
                  key={g.id}
                  onClick={() => selectGame(g)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium press ${
                    game.id === g.id ? "bg-gradient-brand text-primary-foreground shadow-neon" : "glass text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {g.emoji} {g.name}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {isOwner && (
              <Link to="/admin-casino">
                <Button variant="outline" className="rounded-full border-gold text-gold">
                  ⚙️ Casino Admin
                </Button>
              </Link>
            )}
            <a href={explorerAddr(ADDR.casino)} target="_blank" rel="noreferrer">
              <Button variant="ghost" className="rounded-full">View contract ↗</Button>
            </a>
          </div>
        </div>

        <div className="relative grid grid-cols-2 md:grid-cols-4 gap-3 mt-8">
          <Stat label="House bankroll" value={`${fmtEth(bank.data as bigint | undefined)} zkLTC`} />
          <Stat label="Min bet" value={`${fmtEth(minBet.data as bigint | undefined)} zkLTC`} />
          <Stat label="Max bet" value={`${fmtEth(maxBet.data as bigint | undefined)} zkLTC`} />
          <Stat label="House edge" value={houseEdge.data !== undefined ? `${Number(houseEdge.data as bigint) / 100}%` : "—"} />
        </div>
        {isPaused && (
          <div className="relative mt-4 rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm">
            The tables are temporarily closed by the house. Betting is paused.
          </div>
        )}
      </section>

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6 items-start">
        {/* Table */}
        <section className="rounded-3xl glass p-6 sm:p-8 space-y-6 card-hover">
          <header className="space-y-1">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <span className="text-3xl">{game.emoji}</span> {game.name}
            </h2>
            <p className="text-sm text-muted-foreground">{game.tagline}</p>
            <p className="text-xs text-gold italic">{game.meme}</p>
          </header>

          <GameStage game={game} choice={choice} rolling={rolling} result={result} />

          <div className="space-y-3">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Your pick</div>
            <div className={game.id === "roulette" ? "grid grid-cols-7 sm:grid-cols-10 gap-1.5" : "flex flex-wrap gap-2"}>
              {game.choices.map((c) => {
                const active = choice === c.value;
                return (
                  <button
                    key={c.value}
                    onClick={() => setChoice(c.value)}
                    aria-pressed={active}
                    className={`press rounded-xl text-sm font-semibold transition ${
                      game.id === "roulette" ? "py-2" : "px-4 py-2.5"
                    } ${active ? "bg-gradient-brand text-primary-foreground shadow-neon" : "glass text-muted-foreground hover:text-foreground"}`}
                  >
                    {c.emoji ? `${c.emoji} ` : ""}
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="uppercase tracking-widest">Bet amount (zkLTC)</span>
              <span>Balance: {balance.data ? fmtEth(balance.data.value) : "—"}</span>
            </div>
            <div className="flex gap-2">
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                aria-label="Bet amount in zkLTC"
                className="flex-1 rounded-xl bg-input/60 border border-border px-4 py-3 text-lg font-semibold outline-none focus:border-primary"
              />
              {["0.01", "0.05", "0.1"].map((p) => (
                <button key={p} onClick={() => setAmount(p)} className="px-3 rounded-xl glass text-xs press hover:text-foreground text-muted-foreground">
                  {p}
                </button>
              ))}
            </div>
            {belowMin && <p className="text-xs text-destructive">Below the minimum bet of {fmtEth(minBet.data as bigint)} zkLTC.</p>}
            {aboveMax && <p className="text-xs text-destructive">Above the maximum bet of {fmtEth(maxBet.data as bigint)} zkLTC.</p>}
            {insufficient && <p className="text-xs text-destructive">Not enough zkLTC in your wallet.</p>}
          </div>

          <Button onClick={play} disabled={disabled} className="w-full h-14 text-base rounded-2xl bg-gradient-brand shadow-neon press">
            {!address
              ? "Connect wallet to play"
              : isPaused
                ? "Tables closed"
                : rolling || isPending || hash
                  ? "Settling on-chain…"
                  : `Bet ${amount || "0"} zkLTC · payout ${game.odds}`}
          </Button>

          {(pending.data as bigint | undefined) && (pending.data as bigint) > 0n ? (
            <div className="rounded-2xl border border-gold/40 bg-gold/5 p-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-gold">Unclaimed winnings</div>
                <div className="text-xs text-muted-foreground">{fmtEth(pending.data as bigint)} zkLTC waiting for you</div>
              </div>
              <Button onClick={claim} variant="outline" className="rounded-full border-gold text-gold">Withdraw</Button>
            </div>
          ) : null}
        </section>

        {/* Side rail */}
        <aside className="space-y-6">
          <section className="rounded-3xl glass p-6 space-y-3">
            <h3 className="font-bold flex items-center gap-2">🔴 Live table feed</h3>
            {feed.length === 0 ? (
              <p className="text-sm text-muted-foreground">No bets settled yet in this session. Be the degen who starts it.</p>
            ) : (
              <ul className="space-y-2">
                {feed.map((f) => (
                  <li key={f.id} className="flex items-center justify-between text-sm animate-rise">
                    <span className="font-mono text-xs text-muted-foreground">{f.player.slice(0, 6)}…{f.player.slice(-4)}</span>
                    <span className={f.won ? "text-accent font-semibold" : "text-muted-foreground"}>
                      {f.won ? `+${fmtEth(f.payout)}` : "rekt"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-3xl glass p-6 space-y-3">
            <h3 className="font-bold">How it works</h3>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              <li>Pick a game and your outcome.</li>
              <li>Send your bet — it locks into the casino contract.</li>
              <li>The VRF coordinator returns randomness and settles the bet.</li>
              <li>Wins land instantly, or wait in your pending balance to withdraw.</li>
            </ol>
            <p className="text-xs text-muted-foreground">
              Testnet only. Play with LiteForge test funds — grab some from the{" "}
              <Link to="/faucet" className="text-accent hover:underline">faucet</Link>.
            </p>
          </section>

          <section className="rounded-3xl glass p-6 space-y-2">
            <h3 className="font-bold">Contracts</h3>
            <Row label="Casino" href={explorerAddr(ADDR.casino)} value={ADDR.casino} />
            <Row label="VRF" href={explorerAddr(ADDR.mockVrf)} value={ADDR.mockVrf} />
          </section>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <a href={href} target="_blank" rel="noreferrer" className="font-mono text-accent hover:underline">
        {value.slice(0, 8)}…{value.slice(-6)}
      </a>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl glass px-4 py-3">
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  );
}

function GameStage({ game, choice, rolling, result }: { game: GameDef; choice: number; rolling: boolean; result: Result }) {
  const label = game.choices.find((c) => c.value === choice);
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-surface/50 h-56 flex items-center justify-center grid-bg">
      <div className="absolute inset-0 bg-gradient-glow opacity-60 pointer-events-none" aria-hidden />
      {result ? (
        <div className="relative text-center animate-rise space-y-2">
          <div className="text-6xl">{result.won ? "🎉" : "💀"}</div>
          <div className={`text-2xl font-black ${result.won ? "text-accent" : "text-destructive"}`}>
            {result.won ? `WON ${fmtEth(result.payout)} zkLTC` : "HOUSE WINS"}
          </div>
          <div className="text-xs text-muted-foreground font-mono">
            random #{(result.randomResult % 1000n).toString()} · request {result.requestId.toString()}
          </div>
          <div className="text-xs text-gold italic">{result.won ? "Cash out or run it back? 😈" : "It's testnet. Emotional damage only."}</div>
        </div>
      ) : rolling ? (
        <div className="relative text-center space-y-3">
          <div className={`text-7xl ${game.id === "coinflip" ? "animate-spin-slow" : "animate-float"}`}>{game.emoji}</div>
          <div className="text-sm text-muted-foreground animate-pulse">Waiting for on-chain randomness…</div>
        </div>
      ) : (
        <div className="relative text-center space-y-2">
          <div className="text-7xl animate-float">{label?.emoji ?? game.emoji}</div>
          <div className="text-sm text-muted-foreground">
            Betting on <span className="text-foreground font-semibold">{label?.label ?? "—"}</span> · payout {game.odds}
          </div>
        </div>
      )}
    </div>
  );
}
