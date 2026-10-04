import { useEffect, useMemo, useState } from "react";

export type GameId = "coinflip" | "dice" | "roulette" | "rps" | "highlow";

type Props = {
  game: GameId;
  choice: number;
  busy: boolean;
  /** Settled outcome mapped to the game's own space (side, face, pocket, house hand, card) */
  outcome: number | null;
  won?: boolean;
  settleKey?: string;
};

export const HANDS = ["✊", "✋", "✌️"];
export const ROULETTE_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const pocketColor = (n: number) => (n === 0 ? "emerald" : RED.has(n) ? "red" : "black");

export function GameVisual(p: Props) {
  return (
    <div className="relative h-72 sm:h-80 w-full overflow-hidden rounded-3xl border border-border bg-background/70 grid-bg">
      <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_40%,color-mix(in_oklab,var(--casino-violet)_30%,transparent),transparent_70%)]" aria-hidden />
      <div className="relative h-full flex items-center justify-center">
        {p.game === "coinflip" && <Coin {...p} />}
        {p.game === "dice" && <Dice {...p} />}
        {p.game === "roulette" && <Wheel {...p} />}
        {p.game === "rps" && <Rps {...p} />}
        {p.game === "highlow" && <HiLo {...p} />}
      </div>
      {p.won && p.outcome !== null && <Particles key={p.settleKey} />}
    </div>
  );
}

function Particles() {
  const parts = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => {
        const a = (i / 28) * Math.PI * 2;
        const d = 120 + (i % 4) * 40;
        return { dx: Math.cos(a) * d, dy: Math.sin(a) * d, c: ["var(--casino-emerald)", "var(--casino-violet)", "var(--casino-blaze)", "var(--gold)"][i % 4] };
      }),
    [],
  );
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center casino-anim" aria-hidden>
      {parts.map((x, i) => (
        <span
          key={i}
          className="absolute h-2.5 w-2.5 rounded-full casino-anim"
          style={{ background: x.c, boxShadow: `0 0 12px ${x.c}`, ["--dx" as any]: `${x.dx}px`, ["--dy" as any]: `${x.dy}px`, animation: `particle 1.2s ease-out ${i * 12}ms forwards` }}
        />
      ))}
    </div>
  );
}

/* ---------------- Coin ---------------- */
function Coin({ busy, outcome, choice, settleKey }: Props) {
  const side = outcome ?? choice;
  const [turns, setTurns] = useState(0);
  useEffect(() => {
    if (outcome !== null) setTurns((t) => t + 5);
  }, [settleKey, outcome]);
  const rot = turns * 360 + (side === 1 ? 180 : 0);
  return (
    <div className="[perspective:900px]">
      <div
        className="relative h-44 w-44 preserve-3d casino-anim"
        style={busy ? { animation: "coin-spin 0.9s linear infinite" } : { transform: `rotateY(${rot}deg)`, transition: "transform 2.2s cubic-bezier(.17,.84,.32,1)" }}
      >
        <Face className="bg-[conic-gradient(from_0deg,var(--casino-emerald),var(--gold),var(--casino-emerald))] glow-emerald" label="ORVEX" icon="👑" />
        <Face className="bg-[conic-gradient(from_0deg,var(--casino-violet),var(--casino-blaze),var(--casino-violet))] glow-volt [transform:rotateY(180deg)]" label="SKULL" icon="💀" />
      </div>
    </div>
  );
}
function Face({ className, label, icon }: { className: string; label: string; icon: string }) {
  return (
    <div className={`absolute inset-0 rounded-full backface-hidden flex flex-col items-center justify-center border-4 border-foreground/20 ${className}`}>
      <div className="absolute inset-3 rounded-full border-2 border-dashed border-foreground/30" />
      <span className="text-5xl drop-shadow-lg">{icon}</span>
      <span className="mt-1 text-xs font-black tracking-[0.3em] text-background">{label}</span>
    </div>
  );
}

/* ---------------- Dice ---------------- */
const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
};
function Dice({ busy, outcome, choice, settleKey }: Props) {
  const [face, setFace] = useState(choice);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setFace(1 + Math.floor(Math.random() * 6)), 110);
    return () => clearInterval(t);
  }, [busy]);
  useEffect(() => {
    if (!busy) setFace(outcome ?? choice);
  }, [busy, outcome, choice]);
  return (
    <div className="flex flex-col items-center gap-4">
      <div
        key={settleKey}
        className="h-36 w-36 rounded-[28px] bg-foreground/95 glow-emerald grid grid-cols-3 grid-rows-3 p-5 casino-anim"
        style={busy ? { animation: "dice-tumble 0.6s ease-in-out infinite" } : outcome !== null ? { animation: "bounce-in 0.6s ease-out" } : undefined}
      >
        {Array.from({ length: 9 }, (_, i) => {
          const r = Math.floor(i / 3), c = i % 3;
          const on = PIPS[face]?.some(([a, b]) => a === r && b === c);
          return <span key={i} className={`m-auto h-5 w-5 rounded-full ${on ? "bg-volt shadow-[0_0_12px_var(--casino-violet)]" : ""}`} />;
        })}
      </div>
      <div className="text-xs font-mono text-muted-foreground">Your number: <span className="text-emerald font-bold">{choice}</span></div>
    </div>
  );
}

/* ---------------- Roulette ---------------- */
function Wheel({ busy, outcome, settleKey }: Props) {
  const seg = 360 / 37;
  const [rot, setRot] = useState(0);
  useEffect(() => {
    if (outcome === null) return;
    const idx = ROULETTE_ORDER.indexOf(outcome);
    setRot((r) => Math.ceil(r / 360) * 360 + 360 * 4 - idx * seg - seg / 2);
  }, [settleKey, outcome, seg]);
  const R = 120;
  return (
    <div className="relative h-64 w-64">
      <div className="absolute left-1/2 -top-1 z-10 -translate-x-1/2 h-0 w-0 border-x-8 border-x-transparent border-t-[14px] border-t-blaze drop-shadow-[0_0_6px_var(--casino-blaze)]" />
      <svg
        viewBox="-130 -130 260 260"
        className="h-full w-full casino-anim"
        style={busy ? { animation: "wheel-spin 1.4s linear infinite" } : { transform: `rotate(${rot}deg)`, transition: "transform 3.2s cubic-bezier(.12,.8,.24,1)" }}
      >
        <circle r="128" fill="var(--gold-deep)" />
        {ROULETTE_ORDER.map((n, i) => {
          const a0 = ((i * seg - 90) * Math.PI) / 180, a1 = (((i + 1) * seg - 90) * Math.PI) / 180;
          const col = pocketColor(n);
          const fill = col === "emerald" ? "var(--casino-emerald)" : col === "red" ? "var(--destructive)" : "var(--background)";
          const am = (a0 + a1) / 2;
          return (
            <g key={n}>
              <path d={`M0 0 L${R * Math.cos(a0)} ${R * Math.sin(a0)} A${R} ${R} 0 0 1 ${R * Math.cos(a1)} ${R * Math.sin(a1)} Z`} fill={fill} stroke="var(--gold)" strokeWidth="0.6" />
              <text x={104 * Math.cos(am)} y={104 * Math.sin(am)} fill="var(--foreground)" fontSize="9" fontWeight="700" textAnchor="middle" dominantBaseline="middle" transform={`rotate(${(am * 180) / Math.PI + 90} ${104 * Math.cos(am)} ${104 * Math.sin(am)})`}>
                {n}
              </text>
            </g>
          );
        })}
        <circle r="70" fill="var(--surface)" stroke="var(--gold)" strokeWidth="2" />
        <circle r="22" fill="var(--gold)" />
      </svg>
      {busy && (
        <div className="absolute inset-0 casino-anim" style={{ animation: "wheel-spin-rev 0.9s linear infinite" }}>
          <span className="absolute left-1/2 top-3 h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-foreground shadow-[0_0_14px_var(--foreground)]" />
        </div>
      )}
      {!busy && outcome !== null && <span className="absolute left-1/2 top-4 h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-foreground shadow-[0_0_14px_var(--foreground)]" />}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className="text-2xl font-black text-background">{!busy && outcome !== null ? outcome : "🎡"}</span>
      </div>
    </div>
  );
}

/* ---------------- RPS ---------------- */
const CALLS = ["Rock…", "Paper…", "Scissors…", "SHOOT!"];
function Rps({ busy, outcome, choice, won }: Props) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!busy) return;
    setStep(0);
    const t = setInterval(() => setStep((s) => (s + 1) % 3), 700);
    return () => clearInterval(t);
  }, [busy]);
  const pump = busy ? { animation: "fist-pump 0.7s ease-in-out infinite" } : undefined;
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center w-full max-w-lg px-4 gap-3">
      <div className="rounded-3xl glass glow-emerald p-5 text-center">
        <div className="text-[10px] uppercase tracking-widest text-emerald">You</div>
        <div className="text-7xl mt-2 casino-anim" style={pump}>{busy ? "✊" : HANDS[choice]}</div>
      </div>
      <div className="text-center">
        <div className="text-lg font-black text-blaze min-w-24">{busy ? CALLS[step] : outcome !== null ? (won ? "WIN" : "LOSS") : "VS"}</div>
      </div>
      <div className="rounded-3xl glass glow-volt p-5 text-center">
        <div className="text-[10px] uppercase tracking-widest text-volt">House</div>
        <div className="text-7xl mt-2 casino-anim [transform:scaleX(-1)]" style={pump}>
          {busy ? "✊" : outcome !== null ? <span className="inline-block" style={{ animation: "bounce-in .5s ease-out" }}>{HANDS[outcome]}</span> : "❓"}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Hi-Lo ---------------- */
const RANKS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
function HiLo({ busy, outcome, settleKey }: Props) {
  const [trail, setTrail] = useState<number[]>([]);
  useEffect(() => {
    if (outcome !== null) setTrail((t) => [outcome, ...t].slice(0, 5));
  }, [settleKey, outcome]);
  return (
    <div className="flex items-center gap-6">
      <div className="hidden sm:flex -space-x-8">
        {trail.slice(1).reverse().map((c, i) => (
          <Card key={i} rank={c} small />
        ))}
      </div>
      <div className="flex flex-col items-center gap-2">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Pivot</div>
        <Card rank={7} />
      </div>
      <div className="[perspective:900px] flex flex-col items-center gap-2">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Next</div>
        {busy || outcome === null ? (
          <div className={`h-40 w-28 rounded-2xl bg-casino-cta glow-volt flex items-center justify-center text-4xl ${busy ? "animate-pulse" : ""}`}>🂠</div>
        ) : (
          <div key={settleKey} className="casino-anim" style={{ animation: "card-in .7s cubic-bezier(.2,.9,.3,1)" }}>
            <Card rank={outcome} glow />
          </div>
        )}
      </div>
    </div>
  );
}
function Card({ rank, small, glow }: { rank: number; small?: boolean; glow?: boolean }) {
  const red = rank % 2 === 1;
  return (
    <div className={`${small ? "h-24 w-16 text-xl opacity-70" : "h-40 w-28 text-4xl"} rounded-2xl bg-foreground flex flex-col items-center justify-center font-black ${red ? "text-destructive" : "text-background"} ${glow ? "glow-blaze" : "shadow-xl"}`}>
      {RANKS[rank]}
      <span className={small ? "text-sm" : "text-2xl"}>{red ? "♥" : "♠"}</span>
    </div>
  );
}
