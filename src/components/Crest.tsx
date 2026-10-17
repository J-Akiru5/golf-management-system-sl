import Image from "next/image";

/**
 * The official Iloilo Golf and Country Club crest, used exactly as the club supplied it: never
 * redrawn, recoloured or cropped. Minimum 40px; 56px in the top bar, 76px on display screens.
 */
export function Crest({ size = 56, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/brand/igcc-crest.png"
      alt="Iloilo Golf and Country Club crest"
      width={size}
      height={size}
      className={className}
      style={{ filter: "drop-shadow(0 4px 10px rgba(0,0,0,.35))" }}
      priority
    />
  );
}
