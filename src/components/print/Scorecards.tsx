"use client";

import styles from "./print.module.css";
import { Scorecard } from "./Scorecard";
import type { CourseDataStatus, PrintGroup, PrintHole, PrintStartFormat } from "./types";

export interface ScorecardsProps {
  title: string;
  subtitle: string;
  groups: readonly PrintGroup[];
  holes: readonly PrintHole[];
  startFormat: PrintStartFormat;
  courseDataStatus: CourseDataStatus;
  courseName?: string | null;
}

/** Renders one scorecard per non-empty group, preserving the per-player handicap allocation. */
export function Scorecards({
  title,
  subtitle,
  groups,
  holes,
  startFormat,
  courseDataStatus,
  courseName,
}: ScorecardsProps) {
  const groupsWithPlayers = groups.filter((group) => group.players.length > 0);

  return (
    <section className={styles.scorecards} aria-label="Scorecards">
      {groupsWithPlayers.map(({ players, ...group }) => (
        <Scorecard
          key={`${group.wave ?? "two-tee"}-${group.number}`}
          eventTitle={title}
          eventSubtitle={subtitle}
          courseName={courseName}
          group={group}
          players={players}
          holes={holes}
          startFormat={startFormat}
          courseDataStatus={courseDataStatus}
        />
      ))}
      {groupsWithPlayers.length === 0 && <p>No groups to print yet.</p>}
    </section>
  );
}
