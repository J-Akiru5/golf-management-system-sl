"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { PlayerSpotlight } from "@/components/spotlight/PlayerSpotlight";
import { useDesk } from "@/lib/store/desk-store";
import { useSpotlightData } from "@/lib/ui/spotlight";

const HOLD_MS = 12_000;

function useViewportWidth() {
  const [w, setW] = useState(1600);
  useEffect(() => {
    const fit = () => setW(Math.min(window.innerWidth, (window.innerHeight * 16) / 9));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return w;
}

function Card({ id, slot, width }: { id: string; slot: boolean; width: number }) {
  const d = useSpotlightData(id, slot ? "silhouette" : "none");
  if (!d) return <p className="p-8 text-[#a9bfb2]">This player is not on the desk.</p>;
  return <PlayerSpotlight d={d} width={width} />;
}

function Display() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const slot = params.get("slot") !== "none";
  const width = useViewportWidth();
  const { draw, registrations } = useDesk();

  // Rotation: players in draw order (or the ready list), held 12s each, 400ms crossfade.
  const order = draw
    ? draw.flatMap((g) => g.playerIds)
    : registrations.filter((r) => r.status === "ok").map((r) => r.playerId);
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(true);
  const rotate = id === "rotate";
  useEffect(() => {
    if (!rotate || order.length < 2) return;
    const t = setInterval(() => {
      setShown(false);
      setTimeout(() => {
        setI((x) => (x + 1) % order.length);
        setShown(true);
      }, 400);
    }, HOLD_MS);
    return () => clearInterval(t);
  }, [rotate, order.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.push("/spotlight");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  const current = rotate ? order[i % Math.max(1, order.length)] : id;
  return (
    <main className="grid min-h-dvh place-items-center">
      <div style={{ opacity: shown ? 1 : 0, transition: "opacity 400ms" }}>
        {current ? <Card id={current} slot={slot} width={width} /> : null}
      </div>
      <Link
        href="/spotlight"
        className="fixed top-3 right-3 rounded-full bg-[rgba(14,22,18,.7)] px-3 py-1.5 text-xs text-[#c9d3cc] opacity-0 transition-opacity hover:opacity-100 focus:opacity-100"
      >
        Exit display (Esc)
      </Link>
    </main>
  );
}

export default function SpotlightDisplay() {
  return (
    <Suspense>
      <Display />
    </Suspense>
  );
}
