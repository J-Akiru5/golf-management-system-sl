import { fmtTime } from "@/lib/format";
import { sortStartGroups } from "@/lib/print/start-sheet";
import styles from "./p2-sheets.module.css";
import type { PrintGroup } from "./types";

export interface P2SheetProps {
  title: string;
  eventName: string;
  dayLabel: string;
  formatLine: string;
  versionLine: string;
  groups: readonly PrintGroup[];
  startFormat: "shotgun" | "two_tee";
}

const FIRST_HOLE = 1;
const HOLES_PER_HALF = 9;
const LAST_HOLE = 18;
/** Two groups can share a hole, so each hole has an A cell and a B cell. */
const SLOTS_PER_HOLE = 2;

/**
 * Groups keyed by the hole or tee they start on. Sorted by tee time, then hole, then group number,
 * so the first group at a hole is the one that goes out first.
 */
function groupsByStart(
  groups: readonly PrintGroup[],
  startFormat: P2SheetProps["startFormat"],
): Map<number, PrintGroup[]> {
  const byStart = new Map<number, PrintGroup[]>();

  for (const group of sortStartGroups(groups, startFormat)) {
    const existing = byStart.get(group.startHole);
    if (existing) {
      existing.push(group);
    } else {
      byStart.set(group.startHole, [group]);
    }
  }

  return byStart;
}

/** One start slot: the group number, its tee time and the player names. */
function GroupCell({ group }: { group: PrintGroup | undefined }) {
  if (!group) {
    return (
      <td className={styles.groupCell}>
        <span className={styles.slotEmpty}>No group</span>
      </td>
    );
  }

  return (
    <td className={styles.groupCell}>
      <p className={styles.groupHead}>
        <span className={styles.groupNumber}>Group {group.number}</span>
        <time className={styles.groupTime} dateTime={group.time}>
          {fmtTime(group.time)}
        </time>
      </p>
      <ul className={styles.groupNames}>
        {group.players.length === 0 ? (
          <li>No players named</li>
        ) : (
          group.players.map((player) => <li key={player.id}>{player.name}</li>)
        )}
      </ul>
    </td>
  );
}

/**
 * The hole grid the starters carry: A4 landscape, one row per hole, with an A cell and a B cell
 * for the two groups that can share a hole. Holes 1 to 9 sit on the left half, 10 to 18 on the
 * right. Print-only; every value is passed in and nothing is fetched.
 */
export function ShotgunGrid({
  title,
  eventName,
  dayLabel,
  formatLine,
  versionLine,
  groups,
  startFormat,
}: P2SheetProps) {
  const noun = startFormat === "shotgun" ? "Hole" : "Tee";
  const byStart = groupsByStart(groups, startFormat);
  const unplaced = [...byStart.entries()]
    .filter(([start]) => start < FIRST_HOLE || start > LAST_HOLE)
    .flatMap(([, list]) => list);
  const crowded = [...byStart.entries()]
    .filter(([start]) => start >= FIRST_HOLE && start <= LAST_HOLE)
    .flatMap(([start, list]) => list.slice(SLOTS_PER_HOLE).map((group) => ({ start, group })));
  const rows = Array.from({ length: HOLES_PER_HALF }, (_, index) => ({
    left: FIRST_HOLE + index,
    right: FIRST_HOLE + HOLES_PER_HALF + index,
  }));

  return (
    <section
      className={`${styles.paper} ${styles.landscapePage}`}
      aria-label={`${title}, ${eventName}, ${dayLabel}`}
    >
      <header className={styles.gridHeader}>
        <div className={styles.headerBlock}>
          <p className={styles.kicker}>{title}</p>
          <h2 className={styles.eventName}>{eventName}</h2>
          <p className={styles.dayLine}>
            <span className={styles.dayLabel}>{dayLabel}</span>
            <span className={styles.formatLine}>{formatLine}</span>
          </p>
          <p className={styles.versionLine}>{versionLine}</p>
        </div>
        <p className={styles.pageStamp}>Page 1 of 1</p>
      </header>

      {groups.length === 0 ? (
        <p className={styles.empty}>No groups to print yet.</p>
      ) : (
        <table
          className={styles.gridTable}
          aria-label={`Groups by starting ${noun.toLowerCase()}, two to a ${noun.toLowerCase()}`}
        >
          <colgroup>
            <col className={styles.holeCol} />
            <col className={styles.groupsCol} />
            <col className={styles.groupsCol} />
            <col className={styles.holeCol} />
            <col className={styles.groupsCol} />
            <col className={styles.groupsCol} />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">{noun}</th>
              <th scope="col">Group A</th>
              <th scope="col">Group B</th>
              <th scope="col">{noun}</th>
              <th scope="col">Group A</th>
              <th scope="col">Group B</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const left = byStart.get(row.left) ?? [];
              const right = byStart.get(row.right) ?? [];
              return (
                <tr key={row.left} className={styles.holeRow}>
                  <th scope="row" className={styles.holeCell}>
                    {noun} {row.left}
                  </th>
                  <GroupCell group={left[0]} />
                  <GroupCell group={left[1]} />
                  <th scope="row" className={styles.holeCell}>
                    {noun} {row.right}
                  </th>
                  <GroupCell group={right[0]} />
                  <GroupCell group={right[1]} />
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {unplaced.length > 0 && (
        <p className={styles.footNote}>
          Not on a {noun.toLowerCase()} yet:{" "}
          {unplaced.map((group) => `Group ${group.number}`).join(", ")}
        </p>
      )}
      {crowded.length > 0 && (
        <p className={styles.footNote}>
          Also on a {noun.toLowerCase()}:{" "}
          {crowded
            .map(({ start, group }) => `Group ${group.number} at ${noun} ${start}`)
            .join(", ")}
        </p>
      )}

      <footer className={styles.sheetFooter}>
        <span>TeeLine Golf</span>
        <span>{versionLine}</span>
      </footer>
    </section>
  );
}

/**
 * The notice board sheet: A4 portrait, two columns of groups with the tee time, the hole and the
 * names only. No handicaps, no tee numbers, nothing that needs explaining at the board.
 */
export function NoticePoster({
  title,
  eventName,
  dayLabel,
  formatLine,
  versionLine,
  groups,
  startFormat,
}: P2SheetProps) {
  const noun = startFormat === "shotgun" ? "Hole" : "Tee";
  const ordered = sortStartGroups(groups, startFormat);

  return (
    <section
      className={`${styles.paper} ${styles.noticePage}`}
      aria-label={`${title}, ${eventName}, ${dayLabel}`}
    >
      <header className={styles.noticeHeader}>
        <div className={styles.headerBlock}>
          <p className={styles.kicker}>{title}</p>
          <h2 className={styles.noticeEvent}>{eventName}</h2>
          <p className={styles.noticeDay}>{dayLabel}</p>
          <p className={styles.noticeMeta}>{formatLine}</p>
          <p className={styles.noticeMeta}>{versionLine}</p>
        </div>
        <p className={styles.pageStamp}>Page 1 of 1</p>
      </header>

      {ordered.length === 0 ? (
        <p className={styles.empty}>No groups to print yet.</p>
      ) : (
        <div className={styles.noticeGroups}>
          {ordered.map((group) => (
            <article
              key={`${group.startHole}-${group.number}-${group.time}`}
              className={styles.noticeGroup}
            >
              <p className={styles.noticeTime}>
                {fmtTime(group.time)} · {noun} {group.startHole}
              </p>
              {group.players.length === 0 ? (
                <p className={styles.noticeNone}>No players named yet.</p>
              ) : (
                <ul className={styles.noticeNames}>
                  {group.players.map((player) => (
                    <li key={player.id}>{player.name}</li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      )}

      <footer className={styles.sheetFooter}>
        <span>TeeLine Golf</span>
        <span>{versionLine}</span>
      </footer>
    </section>
  );
}
