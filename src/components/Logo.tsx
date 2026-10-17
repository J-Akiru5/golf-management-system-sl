/** Starter mark: a flag on a pin above the cup, in navy with a brass pennant. Original artwork. */
export function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label="Starter"
      focusable="false"
    >
      <rect width="48" height="48" rx="11" fill="#ffffff" fillOpacity="0.14" />
      <ellipse cx="24" cy="36" rx="11" ry="4" fill="#0b1c38" />
      <ellipse cx="24" cy="35" rx="8" ry="2.6" fill="#ffffff" fillOpacity="0.9" />
      <rect x="23" y="10" width="2" height="25" rx="1" fill="#ffffff" />
      <path d="M25 10 L37 15 L25 20 Z" fill="#d9ab3b" />
    </svg>
  );
}
