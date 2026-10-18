type LogoVariant = "light" | "reverse" | "mono";

const COLORS: Record<
  LogoVariant,
  { main: string; accent: string; lower: string; descriptor: string }
> = {
  light: { main: "#073d2e", accent: "#b89550", lower: "#073d2e", descriptor: "#755719" },
  reverse: { main: "#f7f5ee", accent: "#d4b46f", lower: "#8db39b", descriptor: "#d4b46f" },
  mono: { main: "#202522", accent: "#202522", lower: "#202522", descriptor: "#202522" },
};

/** TeeLine's responsive vector wordmark. Use the standalone symbol for compact app surfaces. */
export function TeeLineLogo({
  variant = "light",
  width = 220,
  className,
}: {
  variant?: LogoVariant;
  width?: number;
  className?: string;
}) {
  const colors = COLORS[variant];

  return (
    <svg
      viewBox="0 0 440 128"
      width={width}
      height={Math.round((width * 128) / 440)}
      className={className}
      role="img"
      aria-label="TeeLine GOLF"
      focusable="false"
      style={{ maxWidth: "100%" }}
    >
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M5 73c29-3 49-16 71-29 23-13 42-19 62-10 10 4 20 12 28 21-17-10-31-14-47-10-25 6-49 27-81 29-12 1-23 0-33-1Z"
          fill={colors.main}
        />
        <path
          d="M37 76c24-5 43-20 63-30 19-10 37-12 54-3 8 4 14 9 20 15-15-8-28-10-42-6-23 6-48 26-78 25-6 0-12 0-17-1Z"
          fill={colors.accent}
        />
        <path
          d="M101 81c25-13 45-23 67-21 15 1 27 8 40 8-13 5-27 1-41-3-20-6-37 1-66 16Z"
          fill={colors.lower}
        />
        <path d="M151 10v37" stroke={colors.accent} strokeWidth="4" />
        <path d="m154 12 28 12-28 12Z" fill={colors.accent} />
      </g>
      <text
        x="226"
        y="76"
        fill={colors.main}
        fontFamily="Manrope Variable, Geist Variable, Arial, sans-serif"
        fontSize="59"
        fontWeight="500"
        letterSpacing="-3.6"
      >
        TeeLine
      </text>
      <path d="M229 99h42m119 0h42" stroke={colors.accent} strokeWidth="1.5" />
      <text
        x="334"
        y="105"
        textAnchor="middle"
        fill={colors.descriptor}
        fontFamily="Manrope Variable, Geist Variable, Arial, sans-serif"
        fontSize="14"
        fontWeight="600"
        letterSpacing="8"
      >
        GOLF
      </text>
    </svg>
  );
}
