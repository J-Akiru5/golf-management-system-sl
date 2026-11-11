"use client";

import { ArrowLeft, Phone, ScanLine, Users } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/staff/BottomSheet";
import { useStaffDay } from "@/components/staff/day-context";
import { RosterRow } from "@/components/staff/RosterRow";
import rosterStyles from "@/components/staff/roster.module.css";
import staffStyles from "@/components/staff/staff.module.css";
import { useStaffRows } from "@/components/staff/use-rows";
import type { ScoringRoundView } from "@/lib/data/scoring";
import { fmtIndex, fmtTime } from "@/lib/format";
import { clearClaim, type GroupClaim, readClaim, writeClaim } from "@/lib/staff/claim";
import { parseStaffGroupId, rowsInGroup } from "@/lib/staff/rows";
import { groupSession } from "@/lib/staff/schedule";
import { useDesk } from "@/lib/store/desk-store";

/** Plain words for the card states a volunteer may see on the roster. */
const CARD_LABELS: Record<string, string> = {
  submitted: "Card submitted",
  in_review: "Card in review",
  approved: "Card approved",
  superseded: "Card replaced",
};

function BackToSchedule() {
  return (
    <Link href="/staff/schedule" className={rosterStyles.back}>
      <ArrowLeft size={18} aria-hidden="true" />
      Schedule
    </Link>
  );
}

/** A stored arrival stamp at the club's clock. */
function arrivedText(iso: string | null): string {
  if (!iso) return "Not arrived";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "Arrived";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila",
      hour: "numeric",
      minute: "2-digit",
    }).format(at);
  } catch {
    return at.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
  }
}

/** The page shape while the desk loads a day, so the roster does not flash empty first. */
function LoadingGroup() {
  return (
    <div>
      <BackToSchedule />
      <div className={staffStyles.skeletonStack} aria-busy="true" aria-label="Loading group">
        <div className={`${staffStyles.skeleton} ${staffStyles.skeletonTitle}`} />
        <div className={`${staffStyles.skeleton} ${staffStyles.skeletonLine}`} />
        <div className={`${staffStyles.skeleton} ${staffStyles.skeletonCard}`} />
        <div className={`${staffStyles.skeleton} ${staffStyles.skeletonCard}`} />
        <div className={`${staffStyles.skeleton} ${staffStyles.skeletonCard}`} />
      </div>
    </div>
  );
}

/**
 * One group: who walks with it, who has arrived, and the two ways to score it.
 *
 * The roster row is the arrival control. The info button beside it opens the player's details
 * without marking anything, which matters when a thumb is doing the work. Claiming is a fact about
 * this phone, so the group can put its score sheet first next time.
 */
export default function StaffGroupPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const parsed = parseStaffGroupId(id);
  const router = useRouter();
  const { tournament, scoring, status } = useDesk();
  const { day, days, setDayNumber, dayIndex, dayCount } = useStaffDay();
  const { schedule, rows: allRows } = useStaffRows();
  const [view, setView] = useState<ScoringRoundView | null>(null);
  const [scoringError, setScoringError] = useState("");
  const [claim, setClaim] = useState<GroupClaim | null>(null);
  const [detailEntryId, setDetailEntryId] = useState<string | null>(null);

  const tournamentId = tournament?.id ?? null;
  const groupDay = parsed?.dayNumber ?? null;

  // A link may come from another day's screen (a shared phone, a bookmark), so the day follows the
  // group in the address rather than the other way round.
  useEffect(() => {
    if (parsed && day && parsed.dayNumber !== day.number) setDayNumber(parsed.dayNumber);
  }, [parsed, day, setDayNumber]);

  useEffect(() => {
    if (!tournament || status === "loading") return;
    let cancelled = false;
    scoring
      .loadRound(tournament.id, groupDay ?? day?.number ?? null)
      .then((next) => {
        if (!cancelled) setView(next);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setScoringError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [tournament, scoring, status, groupDay, day?.number]);

  // The claim is keyed by the day in the link, not by whichever day happens to be on screen.
  useEffect(() => {
    if (!tournamentId || groupDay === null) {
      setClaim(null);
      return;
    }
    setClaim(readClaim(tournamentId, groupDay));
  }, [tournamentId, groupDay]);

  if (!parsed) {
    return (
      <div>
        <BackToSchedule />
        <h1 className={staffStyles.h1}>Group</h1>
        <p className={staffStyles.noticeBad}>That group link is not readable.</p>
        <Link className={staffStyles.linkButton} href="/staff/schedule">
          Back to the schedule
        </Link>
      </div>
    );
  }

  if (status === "loading") return <LoadingGroup />;

  if (!tournament) {
    return <p className={staffStyles.notice}>No event is selected. Open the full desk first.</p>;
  }

  // The day in the link has not replaced the day on screen yet. Only wait when the event really has
  // that playing day, so a stale link still gets the plain "not on this day" answer.
  const dayOnLink = days.some((entry) => entry.number === parsed.dayNumber);
  if (day && dayOnLink && day.number !== parsed.dayNumber) return <LoadingGroup />;

  const group = schedule.find((candidate) => candidate.id === id) ?? null;

  if (!group) {
    return (
      <div>
        <BackToSchedule />
        <h1 className={staffStyles.h1}>Group not on this day</h1>
        <p className={staffStyles.notice}>
          Day {parsed.dayNumber} has no group {parsed.groupNumber} in the saved draw. It may have
          been re-drawn; open the schedule to see the current groups.
        </p>
        <Link className={staffStyles.linkButton} href="/staff/schedule">
          Back to the schedule
        </Link>
      </div>
    );
  }

  const rows = rowsInGroup(allRows, group.id);
  const currentGroup = group;
  const session = groupSession(group.time, dayIndex, dayCount);
  const sessionText = session ? `${session} session` : "Session not set";
  const claimedHere = claim?.groupId === group.id;
  const cardByPlayer = new Map(
    (view?.cards ?? [])
      .filter((card) => card.status !== "rejected" && card.status !== "revoked")
      .map((card) => [card.playerId, card.status]),
  );
  const detailRow = detailEntryId
    ? (rows.find((row) => row.entryId === detailEntryId) ?? null)
    : null;
  const detailCard = detailRow ? cardByPlayer.get(detailRow.playerId) : undefined;
  const detailCardLabel = detailCard ? (CARD_LABELS[detailCard] ?? detailCard) : null;

  function claimAnd(scan: boolean) {
    if (!tournamentId || groupDay === null) return;
    const next: GroupClaim = {
      tournamentId,
      dayNumber: groupDay,
      groupId: currentGroup.id,
      groupNumber: currentGroup.number,
    };
    writeClaim(next);
    setClaim(next);
    router.push(`/staff/groups/${currentGroup.id}/score${scan ? "?tab=scan" : ""}`);
  }

  function stopScoring() {
    if (!tournamentId || groupDay === null) return;
    clearClaim(tournamentId, groupDay);
    setClaim(null);
  }

  return (
    <div className={staffStyles.pageWithAction}>
      <BackToSchedule />
      <h1 className={staffStyles.h1}>Group {group.number}</h1>
      <p className={rosterStyles.facts}>
        <span>{fmtTime(group.time)}</span>
        <span>Hole {group.startHole}</span>
        <span>{group.flightName}</span>
        <span>
          {rows.length} {rows.length === 1 ? "player" : "players"}
        </span>
        <span>{sessionText}</span>
      </p>

      {claimedHere && (
        <p className={staffStyles.claimBanner}>
          <Users size={18} aria-hidden="true" />
          This phone is scoring this group
        </p>
      )}

      {scoringError && (
        <p className={`${staffStyles.notice} ${staffStyles.noticeWarn}`} role="status">
          Card states are not available right now: {scoringError}. Scoring still works; the desk
          checks every card afterwards.
        </p>
      )}

      {rows.length === 0 ? (
        <div className={staffStyles.empty}>
          <p className={staffStyles.emptyTitle}>No players in this group yet</p>
          <p>The draw may have changed. Open the schedule to see the current groups.</p>
        </div>
      ) : (
        <ul className={rosterStyles.roster}>
          {rows.map((row) => (
            <RosterRow
              key={row.entryId}
              row={row}
              dayNumber={parsed.dayNumber}
              onDetails={() => setDetailEntryId(row.entryId)}
            />
          ))}
        </ul>
      )}

      <p className={`${staffStyles.notice} ${rosterStyles.scoringNote}`}>
        Scoring only submits cards. Approving, correcting and publishing stay with the desk.
      </p>

      <div className={staffStyles.stickyActionBar}>
        <button
          type="button"
          className={staffStyles.primary}
          data-onboard="score-entry"
          onClick={() => claimAnd(false)}
        >
          <Users aria-hidden="true" size={20} style={{ marginRight: 8 }} />
          {claimedHere ? "Open the score sheet" : "I am scoring this group"}
        </button>
        <button type="button" className={staffStyles.secondary} onClick={() => claimAnd(true)}>
          <ScanLine aria-hidden="true" size={20} style={{ marginRight: 8 }} />
          Scan a card
        </button>
        {claimedHere && (
          <button type="button" className={staffStyles.secondary} onClick={stopScoring}>
            Stop scoring
          </button>
        )}
      </div>

      <BottomSheet
        open={detailRow !== null}
        onOpenChange={(open) => {
          if (!open) setDetailEntryId(null);
        }}
        title={detailRow?.name ?? "Player"}
        description={`Group ${group.number} · ${fmtTime(group.time)}`}
      >
        {detailRow && (
          <dl className={staffStyles.detailList}>
            <dt>Handicap index</dt>
            <dd>{fmtIndex(detailRow.index)}</dd>
            <dt>Phone</dt>
            <dd>
              {detailRow.phone ? (
                <a
                  className={rosterStyles.phone}
                  href={`tel:${detailRow.phone.replace(/[^\d+]/g, "")}`}
                >
                  <Phone size={16} aria-hidden="true" />
                  {detailRow.phone}
                </a>
              ) : (
                "Not recorded"
              )}
            </dd>
            <dt>Group</dt>
            <dd>
              {group.number} · {group.flightName}
            </dd>
            <dt>Tee</dt>
            <dd>{fmtTime(group.time)}</dd>
            <dt>Hole</dt>
            <dd>{group.startHole}</dd>
            <dt>Session</dt>
            <dd>{sessionText}</dd>
            <dt>Arrival</dt>
            <dd>{arrivedText(detailRow.arrivedAt)}</dd>
            {detailRow.arrived && (
              <>
                <dt>Marked by</dt>
                <dd>{detailRow.arrivedBy ?? "Not recorded"}</dd>
              </>
            )}
            {detailCardLabel && (
              <>
                <dt>Card</dt>
                <dd>{detailCardLabel}</dd>
              </>
            )}
          </dl>
        )}
      </BottomSheet>
    </div>
  );
}
