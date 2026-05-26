type Props = {
  className?: string;
  withHalo?: boolean;
  title?: string;
};

/**
 * ORVEX Monogram — pure-vector "O" with diamond aperture and beveled inner ring.
 * Sharp at any scale; uses currentColor + brand gradients for theming.
 */
export function OrvexMonogram({ className = "", withHalo = true, title = "ORVEX" }: Props) {
  const gid = "orvex-mono-grad";
  const gid2 = "orvex-mono-grad-2";
  const gid3 = "orvex-mono-grad-stroke";
  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="oklch(0.78 0.18 220)" />
          <stop offset="55%" stopColor="oklch(0.65 0.27 295)" />
          <stop offset="100%" stopColor="oklch(0.55 0.27 320)" />
        </linearGradient>
        <linearGradient id={gid2} x1="0" y1="0" x2="0" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="oklch(0.92 0.14 90)" />
          <stop offset="100%" stopColor="oklch(0.84 0.16 85)" />
        </linearGradient>
        <linearGradient id={gid3} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="oklch(0.96 0.04 270)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="oklch(0.78 0.18 220)" stopOpacity="0.4" />
        </linearGradient>
        <radialGradient id="orvex-halo" cx="32" cy="32" r="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="oklch(0.65 0.27 295)" stopOpacity="0.75" />
          <stop offset="70%" stopColor="oklch(0.65 0.27 295)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {withHalo && <circle cx="32" cy="32" r="30" fill="url(#orvex-halo)" />}

      {/* Outer hex-octagon "O" */}
      <path
        d="M32 6 L52 14 L58 32 L52 50 L32 58 L12 50 L6 32 L12 14 Z"
        fill="none"
        stroke="url(#orvex-mono-grad)"
        strokeWidth="3.2"
        strokeLinejoin="round"
      />
      {/* Inner thin ring for jewel effect */}
      <path
        d="M32 13 L46 19 L51 32 L46 45 L32 51 L18 45 L13 32 L18 19 Z"
        fill="none"
        stroke="url(#orvex-mono-grad-stroke)"
        strokeWidth="0.9"
        strokeLinejoin="round"
        opacity="0.7"
      />
      {/* Diamond aperture — the "X" / Orvex jewel core */}
      <path
        d="M32 22 L42 32 L32 42 L22 32 Z"
        fill="url(#orvex-mono-grad-2)"
      />
      {/* Aperture inner shadow */}
      <path
        d="M32 26 L38 32 L32 38 L26 32 Z"
        fill="oklch(0.08 0.02 280)"
        opacity="0.85"
      />
      {/* Spark */}
      <circle cx="32" cy="32" r="1.6" fill="oklch(0.96 0.04 270)" />
    </svg>
  );
}

export default OrvexMonogram;
