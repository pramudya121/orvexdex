import { tokenColor, type TokenMeta } from "@/lib/tokenMeta";

export function TokenIcon({ meta, size = 24 }: { meta?: TokenMeta; size?: number }) {
  const s = { height: size, width: size };
  if (!meta) {
    return <div className="rounded-full bg-surface-2 ring-2 ring-background" style={s} />;
  }
  if (meta.logo) {
    return (
      <img
        src={meta.logo}
        alt={`${meta.symbol} token logo`}
        className="rounded-full ring-2 ring-background object-cover"
        style={s}
      />
    );
  }
  return (
    <div
      className="rounded-full ring-2 ring-background flex items-center justify-center font-bold text-primary-foreground"
      style={{ ...s, background: tokenColor(meta.address), fontSize: Math.max(8, size * 0.38) }}
      title={meta.symbol}
    >
      {meta.symbol.slice(0, 2).toUpperCase()}
    </div>
  );
}
