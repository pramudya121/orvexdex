import { useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TrendingUp, TrendingDown, LineChart, Trash2 } from "lucide-react";
import { clearHistory, sliceRange, summarize, type PnlPoint, type RangeKey } from "@/lib/pnlHistory";

const RANGES: RangeKey[] = ["24h", "7d", "30d", "all"];

export function PnlChart({
  points,
  address,
  onCleared,
}: {
  points: PnlPoint[];
  address: string;
  onCleared: () => void;
}) {
  const [range, setRange] = useState<RangeKey>("24h");
  const data = useMemo(() => sliceRange(points, range), [points, range]);
  const stats = useMemo(() => summarize(data), [data]);

  const chartData = useMemo(
    () =>
      data.map((p) => ({
        t: p.t,
        label: new Date(p.t).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
        value: p.total,
      })),
    [data],
  );

  const up = (stats?.absChange ?? 0) >= 0;
  const stroke = up ? "hsl(var(--accent))" : "hsl(var(--destructive))";

  if (points.length < 2 || !stats) {
    return (
      <div className="glass rounded-2xl p-6 text-sm text-muted-foreground flex items-start gap-3">
        <LineChart className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold text-foreground mb-1">Building your P&amp;L history</div>
          Portfolio value is snapshotted from live on-chain balances and pool reserves each time you
          open this tab. Come back later (or keep the page open) and the performance chart appears
          here.
        </div>
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
            <LineChart className="h-3.5 w-3.5" /> Portfolio P&amp;L
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black tabular-nums">{stats.last.toFixed(4)}</span>
            <span className="text-xs text-muted-foreground font-mono">wzkLTC</span>
            <span
              className={`inline-flex items-center gap-1 text-sm font-bold tabular-nums ${up ? "text-accent" : "text-destructive"}`}
            >
              {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              {up ? "+" : ""}
              {stats.absChange.toFixed(4)} ({up ? "+" : ""}
              {stats.pctChange.toFixed(2)}%)
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider transition ${
                range === r
                  ? "bg-gradient-luxe text-primary-foreground shadow-neon"
                  : "text-muted-foreground hover:text-foreground hover:bg-surface-2"
              }`}
            >
              {r}
            </button>
          ))}
          <button
            onClick={() => {
              clearHistory(address);
              onCleared();
            }}
            title="Reset history"
            className="px-2 py-1 rounded-lg text-muted-foreground hover:text-destructive transition"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="h-52 -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="pnlFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stroke} stopOpacity={0.45} />
                <stop offset="100%" stopColor={stroke} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" hide />
            <YAxis
              domain={["auto", "auto"]}
              width={56}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={(v: number) => v.toFixed(2)}
            />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 12,
                fontSize: 12,
              }}
              formatter={(v: number) => [`${v.toFixed(4)} wzkLTC`, "Value"]}
              labelFormatter={(l) => String(l)}
            />
            <Area type="monotone" dataKey="value" stroke={stroke} strokeWidth={2} fill="url(#pnlFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
        <Mini label="High" value={`${stats.high.toFixed(4)}`} />
        <Mini label="Low" value={`${stats.low.toFixed(4)}`} />
        <Mini
          label="Best asset"
          value={stats.best ? `${stats.best.symbol} ${stats.best.pct >= 0 ? "+" : ""}${stats.best.pct.toFixed(1)}%` : "—"}
          tone={stats.best && stats.best.pct >= 0 ? "pos" : "neg"}
        />
        <Mini
          label="Worst asset"
          value={stats.worst ? `${stats.worst.symbol} ${stats.worst.pct >= 0 ? "+" : ""}${stats.worst.pct.toFixed(1)}%` : "—"}
          tone={stats.worst && stats.worst.pct >= 0 ? "pos" : "neg"}
        />
      </div>
      <div className="text-[10px] text-muted-foreground mt-3">
        {stats.points} snapshots · since {new Date(stats.since ?? Date.now()).toLocaleString()}
      </div>
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  const color = tone === "pos" ? "text-accent" : tone === "neg" ? "text-destructive" : "";
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className={`text-sm font-bold tabular-nums mt-0.5 ${color}`}>{value}</div>
    </div>
  );
}
