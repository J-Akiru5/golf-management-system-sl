"use client";

import { FileText, Flag, Printer, Smartphone, TableProperties } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { NeedsTournament } from "@/components/NeedsTournament";
import { PageHeader } from "@/components/PageHeader";
import { PairingsSheet } from "@/components/print/PairingsSheet";
import { Scorecards } from "@/components/print/Scorecards";
import { StartSheet } from "@/components/print/StartSheet";
import type { CourseDataStatus, PrintGroup } from "@/components/print/types";
import { Button } from "@/components/ui/button";
import { fmtDateLabel } from "@/lib/data/labels";
import { toPublicPairings } from "@/lib/data/public";
import { useDesk } from "@/lib/store/desk-store";
import { cn } from "@/lib/ui/cn";

type Tab = "start" | "pairings" | "scorecards";

const TABS: { id: Tab; label: string; icon: typeof FileText }[] = [
  { id: "start", label: "Start sheet", icon: TableProperties },
  { id: "pairings", label: "Pairings", icon: Flag },
  { id: "scorecards", label: "Scorecards", icon: FileText },
];

export default function PrintCenter() {
  const { tournament, draw, players, regById, names, holes, published, changedSincePublish } =
    useDesk();
  const [tab, setTab] = useState<Tab>("start");

  const pairings = useMemo(() => {
    if (!tournament) return null;
    const source = published ?? null;
    if (!source) return null;
    return toPublicPairings({
      published: source,
      tournamentName: tournament.name,
      dateLabel: fmtDateLabel(tournament.dates),
      startFormat: tournament.config.startFormat,
      firstTeeTime: tournament.config.firstTeeTime,
    });
  }, [tournament, published]);

  if (!tournament) return <NeedsTournament what="The print center" />;

  const playerById = new Map(players.map((p) => [p.id, p]));
  const shotgun = tournament.config.startFormat === "shotgun";
  const groups = draw ?? [];
  // This existing route remains the assembler: adapt the desk's domain objects into plain print props here.
  const printGroups: PrintGroup[] = groups.map((group) => ({
    number: group.number,
    startHole: group.startHole,
    wave: group.wave,
    time: group.time,
    flight: names.flight(group.flightId),
    players: group.playerIds.map((id) => {
      const player = playerById.get(id);
      const registration = regById.get(id);
      return {
        id,
        name: player?.name ?? "Unknown player",
        handicapIndex: registration?.frozenIndex ?? null,
        playingHandicap: registration?.playingHandicap ?? null,
        teeName: registration?.teeId ? names.tee(registration.teeId) : null,
      };
    }),
  }));

  // The current desk provider is explicitly wired to DEMO_TEES/DEMO_HOLES. Keep the watermark
  // enabled until the future data adapter supplies authoritative course-data provenance.
  const courseDataStatus: CourseDataStatus = "placeholder";
  const subtitle = `${tournament.name} · ${fmtDateLabel(tournament.dates)} · ${
    shotgun ? "Shotgun start" : "Two-tee start"
  } · first tee ${tournament.config.firstTeeTime}${
    groups[0] ? ` · ${groups.length} groups` : " · no draw yet"
  }`;

  return (
    <div className="grid gap-6">
      <PageHeader
        overline="Print center"
        title="Print sheets"
        crumbs={[{ label: tournament.name, href: "/tournaments" }, { label: "Print center" }]}
        actions={
          <>
            <Button variant="secondary" asChild>
              <Link href="/pairings">
                <Smartphone aria-hidden="true" /> Public preview
              </Link>
            </Button>
            <Button variant="gold" onClick={() => window.print()} className="no-print">
              <Printer aria-hidden="true" /> Print this sheet
            </Button>
          </>
        }
      >
        Built from the current board. Use the browser's print dialog: the sheets are laid out for A4
        or Letter, with the navigation left off. Printing on the club's own printer has not been
        tested.
      </PageHeader>

      <div className="no-print flex flex-wrap items-center gap-3">
        <div className="tabs !w-auto grid-cols-3">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-2 px-4"
            >
              <t.icon className="size-4" aria-hidden="true" />
              {t.label}
            </button>
          ))}
        </div>
        <span className={cn("pill", published ? "ok" : "info")}>
          {published
            ? changedSincePublish
              ? "Published, with newer changes on the board"
              : "Matches the published list"
            : "Draft · not published"}
        </span>
      </div>

      <div className="print-sheet-scope">
        {!draw ? (
          <div className="card grid min-h-[220px] place-items-center text-center">
            <div className="grid justify-items-center gap-2">
              <FileText className="size-6 text-ink-muted" aria-hidden="true" />
              <h2>Nothing to print yet</h2>
              <p className="muted">
                Make the draw first; the start sheet, pairings and scorecards all come from it.
              </p>
              <Button variant="primary" asChild className="mt-2 no-print">
                <Link href="/draw">Open the draw</Link>
              </Button>
            </div>
          </div>
        ) : tab === "start" ? (
          <StartSheet
            title="Start sheet"
            subtitle={subtitle}
            groups={printGroups}
            startFormat={tournament.config.startFormat}
            courseDataStatus={courseDataStatus}
          />
        ) : tab === "pairings" ? (
          <section className="grid gap-3">
            <h2 className="text-[20px]">Pairings</h2>
            {pairings ? (
              <PairingsSheet pairings={pairings} />
            ) : (
              <p className="muted">
                The player view reads the published list. Publish the draw to print the same list
                players see.
              </p>
            )}
          </section>
        ) : (
          <Scorecards
            title={tournament.name}
            subtitle={subtitle}
            groups={printGroups}
            holes={holes}
            startFormat={tournament.config.startFormat}
            courseDataStatus={courseDataStatus}
          />
        )}
      </div>
    </div>
  );
}
