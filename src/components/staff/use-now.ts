"use client";

import { useEffect, useState } from "react";
import { type ManilaNow, manilaNow } from "@/lib/staff/schedule";

/**
 * The club's clock, refreshed on a slow tick. A tee sheet only needs to know the minute, and a
 * minute-long interval is kind to a phone in a pocket.
 */
export function useManilaNow(intervalMs = 30_000): ManilaNow {
  const [now, setNow] = useState<ManilaNow>(() => manilaNow(new Date()));

  useEffect(() => {
    const tick = () => setNow(manilaNow(new Date()));
    tick();
    const timer = setInterval(tick, intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
