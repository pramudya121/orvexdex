import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useBalance, useChainId, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { formatEther, parseEther } from "viem";
import { ADDR, explorerAddr, explorerTx, litvm } from "@/lib/chain";
import { casinoAbi } from "@/lib/abis/casino";
import { useToast } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { useCasino, type CasinoFn, type CasinoPhase, type CasinoResult } from "@/lib/useCasino";
import { GameVisual, HANDS, pocketColor, type GameId } from "@/components/casino/GameVisuals";

export const Route = createFileRoute("/casino")({
  component: CasinoPage,
  head: () => ({
    meta: [
      { title: "ORVEX Casino — Provably Random On-Chain Games" },
      { name: "description", content: "Play Coin Flip, Dice, Roulette, Rock-Paper-Scissors and Hi-Lo on LitVM with on-chain randomness and instant payouts." },
      { property: "og:title", content: "ORVEX Casino — On-Chain Games" },
      { property: "og:description", content: "Five neon on-chain casino games powered by VRF randomness on LitVM LiteForge." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

type Tone = "emerald" | "volt" | "blaze";
type GameDef = { id: GameId; name: string; fn: CasinoFn; emoji: string; tagline: string; mult: string; tone: Tone; choices: { value: number; label: string; emoji?: string }[] };

const GAMES: GameDef[] = [
  { id: "coinflip", name: "Coin Flip", fn: "playCoinFlip", emoji: "🪙", tagline: "ORVEX crown vs crypto skull. 50/50, pure vibes.", mult: "2x", tone: "emerald", choices: [{ value: 0, label: "Crown", emoji: "👑" }, { value: 1, label: "Skull", emoji: "💀" }] },
  { id: "dice", name: "Dice Roll", fn: "playDice", emoji: "🎲", tagline: "Call your face, roll the chain.", mult: "6x", tone: "volt", choices: [1, 2, 3, 4, 5, 6].map((n) => ({ value: n, label: String(n), emoji: ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][n - 1] })) },
  { id: "roulette", name: "Roulette", fn: "playRoulette", emoji: "🎡", tagline: "European wheel. Pick a pocket 0–36.", mult: "36x", tone: "blaze", choices: Array.from({ length: 37 }, (_, i) => ({ value: i, label: String(i) })) },
  { id: "rps", name: "Rock Paper Scissors", fn: "playRPS", emoji: "✊", tagline: "Cyber hands. Beat the house.", mult: "3x", tone: "emerald", choices: [{ value: 0, label: "Rock", emoji: "✊" }, { value: 1, label: "Paper", emoji: "✋" }, { value: 2, label: "Scissors", emoji: "✌️" }] },
  { id: "highlow", name: "Hi-Lo", fn: "playHighLow", emoji: "🃏", tagline: "Higher or lower than the 7?", mult: "2x", tone: "volt", choices: [{ value: 0, label: "Lower", emoji: "▼" }, { value: 1, label: "Higher", emoji: "▲" }] },
];

const TONE: Record<Tone, { text: string; glow: string; bg: string }> = {
  emerald: { text: "text-emerald", glow: "glow-emerald", bg: "bg-emerald" },
  volt: { text: "text-volt", glow: "glow-volt", bg: "bg-volt" },
  blaze: { text: "text-blaze", glow: "glow-blaze", bg: "bg-blaze" },
};

const VIP = [
  { name: "Bronze", min: 0 },
  { name: "Silver", min: 0.5 },
  { name: "Gold", min: 2 },
  { name: "Platinum", min: 10 },
  { name: "Diamond", min: 50 },
];

function fmtEth(v?: bigint, max = 4) {
  if (v === undefined) return "—";
  const [i, d] = formatEther(v).split(".");
  return d ? `${i}.${d.slice(0, max)}` : i;
}
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Map the settled result into the game's visual space, always consistent with the won flag. */
function outcomeFor(game: GameId, choice: number, r: CasinoResult): number {
  const n = r.randomResult;
  switch (game) {
    case "coinflip": return r.won ? choice : 1 - choice;
    case "dice": return r.won ? choice : ((choice + Number(n % 5n)) % 6) + 1;
    case "roulette": return r.won ? choice : (choice + 1 + Number(n % 36n)) % 37;
    case "rps": return r.won ? (choice + 2) % 3 : n % 2n === 0n ? (choice + 1) % 3 : choice;
    case "highlow": {
      const hi = 8 + Number(n % 6n), lo = 1 + Number(n % 6n);
      return (choice === 1) === r.won ? hi : lo;
    }
  }
}

function useSfx(on: boolean) {
  const ctx = useRef<AudioContext | null>(null);
  return useCallback(
    (kind: "click" | "win" | "lose" | "spin") => {
      if (!on || typeof window === "undefined") return;
      ctx.current ??= new AudioContext();
      const c = ctx.current;
      const notes = { click: [660], spin: [330, 440], win: [523, 659, 784, 1046], lose: [300, 220] }[kind];
      notes.forEach((f, i) => {
        const o = c.createOscillator(), g = c.createGain();
        o.type = kind === "lose" ? "sawtooth" : "triangle";
        o.frequency.value = f;
        const t = c.currentTime + i * 0.09;
        g.gain.setValueAtTime(0.08, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        o.connect(g).connect(c.destination);
        o.start(t);
        o.stop(t + 0.2);
      });
    },
    [on],
  );
}

function CasinoPage() {
  const toast = useToast();
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const balance = useBalance({ address });

  const [game, setGame] = useState<GameDef>(GAMES[0]);
  const [choice, setChoice] = useState(0);
  const [amount, setAmount] = useState("0.01");
  const [sound, setSound] = useState(false);
  const [wagered, setWagered] = useState(0);
  const [tab, setTab] = useState<"all" | "mine" | "high">("all");
  const [outcome, setOutcome] = useState<number | null>(null);
  const gameRef = useRef({ game, choice });
  gameRef.current = { game, choice };
  const sfx = useSfx(sound);

  useEffect(() => {
    setSound(localStorage.getItem("orvex-casino-sound") === "1");
    setWagered(Number(localStorage.getItem("orvex-casino-wagered") || 0));
  }, []);
  useEffect(() => localStorage.setItem("orvex-casino-sound", sound ? "1" : "0"), [sound]);

  const read = { address: ADDR.casino as `0x${string}`, abi: casinoAbi } as const;
  const minBet = useReadContract({ ...read, functionName: "minBet", query: { refetchInterval: 20_000 } });
  const maxBet = useReadContract({ ...read, functionName: "maxBet", query: { refetchInterval: 20_000 } });
  const houseEdge = useReadContract({ ...read, functionName: "houseEdge" });
  const paused = useReadContract({ ...read, functionName: "paused", query: { refetchInterval: 15_000 } });
  const bank = useReadContract({ ...read, functionName: "getContractBalance", query: { refetchInterval: 12_000 } });
  const owner = useReadContract({ ...read, functionName: "owner" });
  const pending = useReadContract({ ...read, functionName: "pendingWithdrawals", args: address ? [address] : undefined, query: { enabled: !!address, refetchInterval: 12_000 } });
  const isOwner = !!address && !!owner.data && (owner.data as string).toLowerCase() === address.toLowerCase();
  const { writeContractAsync } = useWriteContract();

  const { phase, hash, result, feed, placeBet, reset, busy } = useCasino({
    onSettled: (r) => {
      const { game: g, choice: c } = gameRef.current;
      setOutcome(outcomeFor(g.id, c, r));
      sfx(r.won ? "win" : "lose");
      toast.push({ title: r.won ? `You won ${fmtEth(r.payout)} zkLTC 🎉` : "House wins this round 😵", type: r.won ? "success" : "error" });
      pending.refetch(); bank.refetch(); balance.refetch();
    },
    onError: (msg) => toast.push({ title: "Bet not completed", description: msg, type: "error" }),
  });

  const value = useMemo(() => { try { return amount ? parseEther(amount) : 0n; } catch { return 0n; } }, [amount]);
  const min = minBet.data as bigint | undefined, max = maxBet.data as bigint | undefined;
  const belowMin = min !== undefined && value > 0n && value < min;
  const aboveMax = max !== undefined && max > 0n && value > max;
  const insufficient = balance.data ? value > balance.data.value : false;
  const isPaused = paused.data === true;
  const disabled = !address || busy || value <= 0n || belowMin || aboveMax || insufficient || isPaused;

  const vipIdx = VIP.reduce((acc, l, i) => (wagered >= l.min ? i : acc), 0);
  const next = VIP[vipIdx + 1];
  const vipPct = next ? Math.min(100, ((wagered - VIP[vipIdx].min) / (next.min - VIP[vipIdx].min)) * 100) : 100;

  const play = async () => {
    if (disabled) return;
    if (chainId !== litvm.id) {
      try { await switchChainAsync({ chainId: litvm.id }); } catch { toast.push({ title: "Please switch to LitVM", type: "error" }); return; }
    }
    setOutcome(null);
    sfx("spin");
    const h = await placeBet(game.fn, choice, value);
    if (h) {
      const w = wagered + Number(formatEther(value));
      setWagered(w);
      localStorage.setItem("orvex-casino-wagered", String(w));
    }
  };

  const claim = async () => {
    try {
      const h = await writeContractAsync({ ...read, functionName: "withdrawPending" });
      toast.push({ title: "Withdraw submitted", hash: h });
    } catch (e: any) {
      toast.push({ title: "Withdraw failed", description: e?.shortMessage || e?.message, type: "error" });
    }
  };

  const selectGame = (g: GameDef) => {
    if (busy) return;
    sfx("click");
    setGame(g);
    setChoice(g.choices[0].value);
    setOutcome(null);
    reset();
    document.getElementById("casino-table")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const setChip = (k: "half" | "double" | "max" | string) => {
    sfx("click");
    const cur = Number(amount) || 0;
    if (k === "half") setAmount(String(+(cur / 2).toFixed(6)));
    else if (k === "double") setAmount(String(+(cur * 2).toFixed(6)));
    else if (k === "max") {
      const bal = balance.data ? Number(formatEther(balance.data.value)) * 0.95 : 0;
      const cap = max && max > 0n ? Number(formatEther(max)) : bal;
      setAmount(String(+Math.min(bal, cap).toFixed(4)));
    } else setAmount(k);
  };

  const tone = TONE[game.tone];
  const shownFeed = feed.filter((f) => (tab === "mine" ? address && f.player.toLowerCase() === address.toLowerCase() : tab === "high" ? (f.amount ?? 0n) >= parseEther("0.05") || f.payout >= parseEther("0.1") : true));

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(50%_60%_at_20%_0%,color-mix(in_oklab,var(--casino-violet)_28%,transparent),transparent),radial-gradient(40%_50%_at_90%_10%,color-mix(in_oklab,var(--casino-emerald)_18%,transparent),transparent)]" aria-hidden />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Casino bar */}
        <section className="rounded-3xl glass-strong p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center gap-4 justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-casino-cta flex items-center justify-center text-2xl glow-volt">🎰</div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight leading-none">ORVEX <span className="text-emerald">CASINO</span></h1>
              <p className="text-xs text-muted-foreground mt-1">On-chain randomness · LitVM LiteForge testnet</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-2xl glass px-4 py-2">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Balance</div>
              <div className="font-bold font-mono">{address ? `${fmtEth(balance.data?.value)} zkLTC` : "Not connected"}</div>
            </div>
            <div className="rounded-2xl glass px-4 py-2 min-w-48">
              <div className="flex justify-between text-[10px] uppercase tracking-widest">
                <span className="text-blaze font-bold">VIP {VIP[vipIdx].name}</span>
                <span className="text-muted-foreground">{next ? `${next.name} at ${next.min}` : "Max"}</span>
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-casino-cta transition-all duration-700" style={{ width: `${vipPct}%` }} />
              </div>
            </div>
            <button
              onClick={() => setSound((s) => !s)}
              aria-pressed={sound}
              aria-label={sound ? "Mute sound effects" : "Enable sound effects"}
              className={`h-12 w-12 rounded-2xl glass text-xl press transition ${sound ? "glow-emerald" : ""}`}
            >
              {sound ? "🔊" : "🔇"}
            </button>
            {isOwner && (
              <Link to="/admin-casino">
                <Button variant="outline" className="h-12 rounded-2xl border-gold text-gold">⚙️ Casino Admin</Button>
              </Link>
            )}
          </div>
        </section>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="House bankroll" value={`${fmtEth(bank.data as bigint | undefined)} zkLTC`} tone="emerald" />
          <Stat label="Min bet" value={`${fmtEth(min)} zkLTC`} tone="volt" />
          <Stat label="Max bet" value={`${fmtEth(max)} zkLTC`} tone="volt" />
          <Stat label="House edge" value={houseEdge.data !== undefined ? `${Number(houseEdge.data as bigint)}%` : "—"} tone="blaze" />
        </div>
        {isPaused && <div className="rounded-2xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm">The tables are temporarily closed by the house. Betting is paused.</div>}

        <div className="grid lg:grid-cols-[220px_1fr] gap-6 items-start">
          {/* Sidebar */}
          <nav aria-label="Casino games" className="lg:sticky lg:top-24 flex lg:flex-col gap-2 overflow-x-auto pb-1 rounded-3xl glass p-2">
            {GAMES.map((g) => {
              const active = g.id === game.id;
              const t = TONE[g.tone];
              return (
                <button
                  key={g.id}
                  onClick={() => selectGame(g)}
                  aria-current={active ? "true" : undefined}
                  className={`shrink-0 flex items-center gap-3 rounded-2xl px-3 py-3 text-left press transition ${active ? `bg-background/80 ${t.glow}` : "hover:bg-foreground/5"}`}
                >
                  <span className={`h-10 w-10 rounded-xl flex items-center justify-center text-xl bg-background/60 ${active ? t.glow : ""}`}>{g.emoji}</span>
                  <span>
                    <span className={`block text-sm font-bold ${active ? t.text : ""}`}>{g.name}</span>
                    <span className="block text-[11px] text-muted-foreground">up to {g.mult}</span>
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="space-y-6 min-w-0">
            {/* Game cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
              {GAMES.map((g) => {
                const t = TONE[g.tone];
                return (
                  <button key={g.id} onClick={() => selectGame(g)} className={`group relative overflow-hidden rounded-3xl glass p-4 text-left aspect-[4/5] flex flex-col justify-between transition hover:-translate-y-1 ${g.id === game.id ? t.glow : ""}`}>
                    <span className="text-5xl transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-6">{g.emoji}</span>
                    <span>
                      <span className="block font-black leading-tight">{g.name}</span>
                      <span className={`text-xs font-bold ${t.text}`}>{g.mult} payout</span>
                    </span>
                    <span className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-sm opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition">
                      <span className="rounded-full bg-casino-cta px-4 py-2 text-sm font-black text-background">▶ PLAY NOW</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Table */}
            <section id="casino-table" className="scroll-mt-24 rounded-3xl glass-strong p-5 sm:p-7 space-y-6">
              <header className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-3xl font-black flex items-center gap-2"><span>{game.emoji}</span> {game.name}</h2>
                  <p className="text-sm text-muted-foreground">{game.tagline}</p>
                </div>
                <PhaseBadge phase={phase} hash={hash} />
              </header>

              <GameVisual game={game.id} choice={choice} busy={busy} outcome={phase === "settled" ? outcome : null} won={result?.won} settleKey={result?.requestId.toString()} />

              {phase === "settled" && result && (
                <div className={`rounded-2xl p-4 text-center ${result.won ? "glow-emerald" : "border border-destructive/50 bg-destructive/10"}`} style={{ animation: "bounce-in .5s ease-out" }}>
                  <div className={`text-3xl font-black ${result.won ? "text-emerald" : "text-destructive"}`}>{result.won ? `+${fmtEth(result.payout)} zkLTC` : "HOUSE WINS 💀"}</div>
                  <div className="text-xs text-muted-foreground mt-1">{describeOutcome(game.id, outcome)} · request #{result.requestId.toString()}</div>
                </div>
              )}

              {/* Big choice buttons */}
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Your prediction</div>
                {game.id === "roulette" ? (
                  <div className="grid grid-cols-7 sm:grid-cols-[repeat(13,minmax(0,1fr))] gap-1.5">
                    {game.choices.map((c) => {
                      const col = pocketColor(c.value);
                      const active = choice === c.value;
                      return (
                        <button key={c.value} disabled={busy} onClick={() => { sfx("click"); setChoice(c.value); }} aria-pressed={active}
                          className={`h-11 rounded-xl text-sm font-black press transition ${col === "emerald" ? "bg-emerald text-background sm:col-span-1" : col === "red" ? "bg-destructive text-destructive-foreground" : "bg-background border border-border"} ${active ? "ring-2 ring-blaze scale-110 glow-blaze" : "opacity-80 hover:opacity-100"}`}>
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className={`grid gap-3 ${game.choices.length === 2 ? "grid-cols-2" : game.choices.length === 3 ? "grid-cols-3" : "grid-cols-3 sm:grid-cols-6"}`}>
                    {game.choices.map((c) => {
                      const active = choice === c.value;
                      const odds = game.id === "highlow" ? "~50%" : game.id === "rps" ? "~33%" : game.id === "dice" ? "16.7%" : "50%";
                      return (
                        <button key={c.value} disabled={busy} onClick={() => { sfx("click"); setChoice(c.value); }} aria-pressed={active}
                          className={`rounded-2xl py-5 flex flex-col items-center gap-1 press transition border ${active ? `bg-background/80 ${tone.glow} border-transparent` : "glass border-border hover:-translate-y-0.5"}`}>
                          <span className="text-4xl">{c.emoji}</span>
                          <span className={`text-sm font-black uppercase tracking-wider ${active ? tone.text : ""}`}>{c.label}</span>
                          <span className="text-[10px] text-muted-foreground">win chance {odds}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Amount */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span className="uppercase tracking-widest">Bet amount</span>
                  <span>Potential payout: <span className={`font-bold ${tone.text}`}>{value > 0n ? `${(Number(formatEther(value)) * Number(game.mult.replace("x", "")) * (1 - Number(houseEdge.data ?? 0n) / 100)).toFixed(4)} zkLTC` : "—"}</span></span>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <input inputMode="decimal" value={amount} disabled={busy} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} aria-label="Bet amount in zkLTC"
                      className="w-full h-14 rounded-2xl bg-input/60 border border-border pl-4 pr-20 text-2xl font-black font-mono outline-none focus:border-emerald" />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">zkLTC</span>
                  </div>
                  <div className="grid grid-cols-6 gap-1.5">
                    {[["0.01", "0.01"], ["0.05", "0.05"], ["0.1", "0.1"], ["half", "½"], ["double", "2×"], ["max", "MAX"]].map(([k, l]) => (
                      <button key={k} disabled={busy} onClick={() => setChip(k)} className="h-14 min-w-12 rounded-2xl glass text-xs font-bold press hover:text-blaze">{l}</button>
                    ))}
                  </div>
                </div>
                {belowMin && <p className="text-xs text-destructive">Below the minimum bet of {fmtEth(min)} zkLTC.</p>}
                {aboveMax && <p className="text-xs text-destructive">Above the maximum bet of {fmtEth(max)} zkLTC.</p>}
                {insufficient && <p className="text-xs text-destructive">Not enough zkLTC in your wallet.</p>}
              </div>

              <button onClick={play} disabled={disabled}
                className="relative w-full h-20 rounded-3xl bg-casino-cta text-background text-xl sm:text-2xl font-black uppercase tracking-wider press transition shadow-[0_0_40px_color-mix(in_oklab,var(--casino-violet)_50%,transparent)] hover:shadow-[0_0_70px_color-mix(in_oklab,var(--casino-emerald)_55%,transparent)] disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden">
                {!address ? "Connect wallet to play" : isPaused ? "Tables closed" : busy ? phaseLabel(phase) : `${ctaVerb(game.id)} · ${amount || "0"} zkLTC`}
              </button>

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

            {/* Live bets */}
            <section className="rounded-3xl glass p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-black flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-destructive animate-pulse" /> Live Bets</h3>
                <div className="flex gap-1 rounded-full glass p-1" role="tablist">
                  {([["all", "Global"], ["mine", "My Bets"], ["high", "High Rollers"]] as const).map(([k, l]) => (
                    <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${tab === k ? "bg-casino-cta text-background" : "text-muted-foreground hover:text-foreground"}`}>{l}</button>
                  ))}
                </div>
              </div>
              {shownFeed.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No settled bets yet in this session — be the degen who starts it.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      <tr><th className="text-left py-2">Player</th><th className="text-right">Bet</th><th className="text-right">Result</th><th className="text-right">Payout</th></tr>
                    </thead>
                    <tbody>
                      {shownFeed.map((f) => (
                        <tr key={f.id} className="border-t border-border animate-rise">
                          <td className="py-2 font-mono text-xs"><a href={explorerAddr(f.player)} target="_blank" rel="noreferrer" className="hover:text-emerald">{short(f.player)}</a></td>
                          <td className="text-right font-mono">{f.amount !== undefined ? fmtEth(f.amount) : "—"}</td>
                          <td className={`text-right font-bold ${f.won ? "text-emerald" : "text-destructive"}`}>{f.won ? "WIN" : "rekt"}</td>
                          <td className="text-right font-mono">{f.won ? `+${fmtEth(f.payout)}` : "0"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                Testnet only — grab test funds from the <Link to="/faucet" className="text-emerald hover:underline">faucet</Link>. Contracts: <a className="font-mono hover:text-emerald" href={explorerAddr(ADDR.casino)} target="_blank" rel="noreferrer">Casino {short(ADDR.casino)}</a> · <a className="font-mono hover:text-emerald" href={explorerAddr(ADDR.mockVrf)} target="_blank" rel="noreferrer">VRF {short(ADDR.mockVrf)}</a>
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function ctaVerb(g: GameId) {
  return { coinflip: "Flip Coin", dice: "Roll Dice", roulette: "Spin Wheel", rps: "Shoot!", highlow: "Deal Card" }[g];
}
function phaseLabel(p: CasinoPhase) {
  return { idle: "", approve: "Confirm in wallet…", hashing: "Sending bet…", vrf: "Rolling randomness…", settled: "" }[p];
}
function describeOutcome(g: GameId, o: number | null) {
  if (o === null) return "";
  if (g === "coinflip") return `Landed on ${o === 0 ? "👑 Crown" : "💀 Skull"}`;
  if (g === "dice") return `Rolled a ${o}`;
  if (g === "roulette") return `Ball dropped on ${o}`;
  if (g === "rps") return `House threw ${HANDS[o]}`;
  return `Card drawn: ${["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"][o]}`;
}

function PhaseBadge({ phase, hash }: { phase: CasinoPhase; hash?: `0x${string}` }) {
  const steps: [CasinoPhase, string][] = [["approve", "Wallet"], ["hashing", "Tx"], ["vrf", "VRF"], ["settled", "Settled"]];
  const idx = steps.findIndex(([s]) => s === phase);
  return (
    <div className="flex items-center gap-2" aria-live="polite">
      {steps.map(([s, l], i) => (
        <span key={s} className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${i < idx || phase === "settled" ? "bg-emerald text-background" : i === idx ? "bg-blaze text-background animate-pulse" : "glass text-muted-foreground"}`}>{l}</span>
      ))}
      {hash && <a href={explorerTx(hash)} target="_blank" rel="noreferrer" className="text-[10px] text-muted-foreground hover:text-emerald">tx ↗</a>}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className="rounded-2xl glass px-4 py-3">
      <div className={`text-[10px] uppercase tracking-widest ${TONE[tone].text}`}>{label}</div>
      <div className="text-lg font-black font-mono">{value}</div>
    </div>
  );
}
