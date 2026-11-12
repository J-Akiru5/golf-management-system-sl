"use client";

import { PairingsSheet } from "@/components/print/PairingsSheet";
import styles from "@/components/print/print.module.css";
import { Scorecards } from "@/components/print/Scorecards";
import { StartSheet } from "@/components/print/StartSheet";
import type { PrintGroup, PrintHole } from "@/components/print/types";
import type { PublicPairings } from "@/lib/data/types";

const PREVIEW_PLAYERS: PrintGroup["players"] = [
  {
    id: "preview-player-1",
    name: "Alex Example",
    handicapIndex: 13.7,
    playingHandicap: 14,
    teeName: "White · sample",
  },
  {
    id: "preview-player-2",
    name: "Jordan Sample",
    handicapIndex: 18.8,
    playingHandicap: 19,
    teeName: "White · sample",
  },
  {
    id: "preview-player-3",
    name: "Casey Practice",
    handicapIndex: 31.2,
    playingHandicap: 36,
    teeName: "White · sample",
  },
  {
    id: "preview-player-4",
    name: "Taylor Demo",
    handicapIndex: -1.5,
    playingHandicap: -2,
    teeName: "White · sample",
  },
];

const PREVIEW_GROUPS: PrintGroup[] = [
  {
    number: 1,
    flight: "Preview Flight A",
    startHole: 1,
    time: "07:00",
    players: PREVIEW_PLAYERS,
  },
  {
    number: 2,
    flight: "Preview Flight A",
    startHole: 10,
    time: "07:00",
    players: PREVIEW_PLAYERS.slice(0, 2),
  },
  {
    number: 3,
    flight: "Preview Flight B",
    startHole: 1,
    time: "12:00",
    players: PREVIEW_PLAYERS.slice(2),
  },
];

const PREVIEW_HOLES: PrintHole[] = [
  { number: 1, par: 4, strokeIndex: 9 },
  { number: 2, par: 4, strokeIndex: 3 },
  { number: 3, par: 3, strokeIndex: 15 },
  { number: 4, par: 5, strokeIndex: 1 },
  { number: 5, par: 4, strokeIndex: 11 },
  { number: 6, par: 4, strokeIndex: 5 },
  { number: 7, par: 3, strokeIndex: 17 },
  { number: 8, par: 5, strokeIndex: 7 },
  { number: 9, par: 4, strokeIndex: 13 },
  { number: 10, par: 4, strokeIndex: 4 },
  { number: 11, par: 4, strokeIndex: 10 },
  { number: 12, par: 3, strokeIndex: 18 },
  { number: 13, par: 5, strokeIndex: 2 },
  { number: 14, par: 4, strokeIndex: 12 },
  { number: 15, par: 4, strokeIndex: 6 },
  { number: 16, par: 3, strokeIndex: 16 },
  { number: 17, par: 5, strokeIndex: 8 },
  { number: 18, par: 4, strokeIndex: 14 },
];

const PREVIEW_PAIRINGS: PublicPairings = {
  tournamentName: "Print Preview Invitational (fictional)",
  dateLabel: "Saturday, 14 November 2026 · sample date",
  startFormat: "shotgun",
  firstTeeTime: "07:00",
  groups: PREVIEW_GROUPS.map((group) => ({
    number: group.number,
    startHole: group.startHole,
    time: group.time,
    flight: group.flight,
    players: group.players.map((player) => ({
      id: player.id,
      name: player.name,
      photoPath: null,
    })),
  })),
};

/** Fictional, local-only print examples. This component never reads desk or database state. */
export default function PrintPreview() {
  const courseDataStatus = "placeholder" as const;
  const previewGroup = PREVIEW_GROUPS[0];

  return (
    <div className={styles.previewPage}>
      <header className={`${styles.previewToolbar} no-print`}>
        <div>
          <h1>Print component preview</h1>
          <p>Fictional players and sample course values only. Not IGCC course data.</p>
        </div>
        <button type="button" onClick={() => window.print()}>
          Print preview
        </button>
      </header>

      {previewGroup && (
        <Scorecards
          title="Print Preview Invitational (fictional)"
          subtitle="Print Preview Invitational (fictional) · sample event"
          groups={[previewGroup]}
          holes={PREVIEW_HOLES}
          startFormat="shotgun"
          courseDataStatus={courseDataStatus}
          courseName="Practice course · fictional"
        />
      )}

      <StartSheet
        title="Start sheet · preview"
        eventName="Print Preview Invitational (fictional)"
        subtitle="Print Preview Invitational (fictional) · Saturday, 14 November 2026"
        groups={PREVIEW_GROUPS}
        startFormat="shotgun"
        courseDataStatus={courseDataStatus}
      />

      <PairingsSheet pairings={PREVIEW_PAIRINGS} />
    </div>
  );
}
