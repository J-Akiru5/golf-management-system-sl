"use client";

import { useState } from "react";
import { MASCOT_ALT, MASCOT_FULL_SRC, MASCOT_HEAD_SRC, MASCOT_NAME } from "@/lib/chat/mascot";
import { cn } from "@/lib/ui/cn";
import "./chat.css";

/**
 * Teeo, in a round ivory badge.
 *
 * One component for every place the mascot appears: the launcher, the panel header and each of his
 * messages. The artwork lives in `public/brand/` and is added by the orchestrator; until a file is
 * there the image fails to load and the placeholder below is drawn instead, so a page never shows a
 * broken image and no call site needs a flag.
 */
export function TeeoAvatar({
  size = 40,
  variant = "head",
  className,
  decorative = true,
}: {
  /** Rendered height in pixels. The badge stays round. */
  size?: number;
  variant?: "head" | "full";
  className?: string;
  /** True when the surrounding text already names Teeo. */
  decorative?: boolean;
}) {
  const [missing, setMissing] = useState(false);
  const src = variant === "head" ? MASCOT_HEAD_SRC : MASCOT_FULL_SRC;

  return (
    <span
      className={cn("tl-chat-avatar", className)}
      style={{ width: size, height: size }}
      data-variant={variant}
      data-missing={missing ? "true" : undefined}
    >
      {missing ? (
        <TeeoPlaceholder size={size} />
      ) : (
        <img
          src={src}
          alt={decorative ? "" : MASCOT_ALT}
          aria-hidden={decorative ? true : undefined}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          className="tl-chat-avatar-img"
          onError={() => setMissing(true)}
        />
      )}
    </span>
  );
}

/**
 * The stand-in drawing: forest cap with the TeeLine flag, a warm gold visor face and a smile, on an
 * ivory ground. It is deliberately simple so it reads at 32 px.
 */
function TeeoPlaceholder({ size }: { size: number }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label={`${MASCOT_NAME} placeholder`}
      focusable="false"
    >
      <rect width="64" height="64" fill="#f7f5ee" />
      <path d="M13 62c0-9.4 8.5-15 19-15s19 5.6 19 15z" fill="#073d2e" />
      <rect x="28" y="43" width="8" height="7" rx="2.5" fill="#b89550" />
      <rect
        x="14"
        y="14"
        width="36"
        height="32"
        rx="11"
        fill="#f7f5ee"
        stroke="#073d2e"
        strokeWidth="2"
      />
      <rect x="19" y="22" width="26" height="16" rx="8" fill="#b89550" />
      <circle cx="26" cy="29" r="2" fill="#073d2e" />
      <circle cx="38" cy="29" r="2" fill="#073d2e" />
      <path
        d="M28 34c1.7 1.7 6.3 1.7 8 0"
        stroke="#073d2e"
        strokeWidth="1.7"
        strokeLinecap="round"
        fill="none"
      />
      <path d="M12 16c2-8 9-11 20-11s18 3 20 11z" fill="#073d2e" />
      <path d="M45 11.5l9-5.5v11z" fill="#b89550" />
    </svg>
  );
}
