"use client";

import { Flag, ScrollText, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { RoleGate } from "@/components/desk";
import { PageHeader, SectionCard } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useDesk } from "@/lib/store/desk-store";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { AuditLogRow, ScoringAuditRow } from "@/lib/supabase/types";

const PAGE = 100;

const RESULT_TONE: Record<AuditLogRow["result"], string> = {
  ok: "ok",
  refused: "warn",
  failed: "bad",
};

/**
 * Read-only audit trail. The database grants this table to owners and organizers only, so the role
 * gate here is cosmetic; a desk account that reaches the page still gets no rows from RLS.
 */
export default function AuditPage() {
  const { state, member } = useDesk();
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [scoringRows, setScoringRows] = useState<ScoringAuditRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);

  const load = async (offset: number) => {
    if (!isSupabaseConfigured() || !state.clubId) {
      setLoading(false);
      return;
    }
    const client = createSupabaseBrowserClient();
    const [{ data, error: queryError }, { data: scoringData, error: scoringError }] =
      await Promise.all([
        client
          .from("audit_log")
          .select("*")
          .eq("club_id", state.clubId)
          .order("created_at", { ascending: false })
          .range(offset, offset + PAGE - 1),
        client
          .from("scoring_audit")
          .select("*")
          .eq("club_id", state.clubId)
          .order("at", { ascending: false })
          .range(offset, offset + PAGE - 1),
      ]);
    if (scoringError) setError(`Scoring activity: ${scoringError.message}`);
    if (queryError) {
      setError(queryError.message);
      setLoading(false);
      return;
    }
    const next = (data ?? []) as AuditLogRow[];
    setRows((current) => (offset === 0 ? next : [...current, ...next]));
    const scoringPage = (scoringData ?? []) as ScoringAuditRow[];
    setScoringRows((current) => (offset === 0 ? scoringPage : [...current, ...scoringPage]));
    setHasMore(next.length === PAGE);
    setLoading(false);
  };

  useEffect(() => {
    void load(0);
    // The club is the only input that changes the audit source.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.clubId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (row) =>
        row.action.toLowerCase().includes(q) ||
        row.entity.toLowerCase().includes(q) ||
        (row.entity_id ?? "").toLowerCase().includes(q) ||
        (row.actor_id ?? "").toLowerCase().includes(q),
    );
  }, [rows, query]);

  return (
    <div className="grid gap-6">
      <PageHeader overline="Accountability" title="Audit log">
        Every guarded write in this club is recorded with the actor, action, record and changed
        columns. Passwords, tokens and private photo paths are never recorded.
      </PageHeader>

      <RoleGate
        role={member?.role}
        allow={["owner", "organizer"]}
        mode="hide"
        disabledReason="Only an owner or organizer can read the audit log."
      >
        <SectionCard
          id="audit"
          icon={<ScrollText />}
          title="Recent activity"
          subtitle="Newest first. The table is read-only; entries cannot be edited or deleted here."
        >
          <div className="row">
            <label className="field grow">
              <span className="sr">Filter audit entries</span>
              <span className="relative block">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter by action, entity, record or actor"
                  className="w-full pl-9"
                />
              </span>
            </label>
          </div>

          {!isSupabaseConfigured() ? (
            <div className="notice" role="status">
              Demo mode has no audit database. Connected mode writes every guarded action to
              <code> audit_log</code>.
            </div>
          ) : error ? (
            <div className="notice bad" role="alert">
              Could not read the audit log: {error}
            </div>
          ) : loading ? (
            <p className="muted">Loading audit entries…</p>
          ) : filtered.length === 0 ? (
            <div className="notice" role="status">
              No audit entries match this view.
            </div>
          ) : (
            <div className="table-wrap !shadow-none">
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>Record</th>
                    <th>Changed columns</th>
                    <th>Actor</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.id}>
                      <td className="whitespace-nowrap text-[13px]">
                        {new Date(row.created_at).toLocaleString("en-PH", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </td>
                      <td>
                        <b>{row.action}</b>
                      </td>
                      <td>{row.entity}</td>
                      <td className="font-mono text-[12px]">
                        {row.entity_id ? `${row.entity_id.slice(0, 8)}…` : "—"}
                      </td>
                      <td className="max-w-[260px] text-[13px]">
                        {row.changed_columns?.length ? row.changed_columns.join(", ") : "—"}
                      </td>
                      <td className="font-mono text-[12px]">
                        {row.actor_id ? `${row.actor_id.slice(0, 8)}…` : "System"}
                      </td>
                      <td>
                        <span className={`pill ${RESULT_TONE[row.result]}`}>{row.result}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {hasMore && !query && (
            <Button variant="secondary" size="sm" onClick={() => void load(rows.length)}>
              Load more
            </Button>
          )}
        </SectionCard>

        <SectionCard
          id="scoring-audit"
          icon={<Flag />}
          title="Scoring activity"
          subtitle="Cards, corrections, revocations, resolutions and publications. Append-only; entries cannot be edited or deleted here."
        >
          {!isSupabaseConfigured() ? (
            <div className="notice" role="status">
              Demo mode has no scoring audit table.
            </div>
          ) : scoringRows.length === 0 ? (
            <p className="muted">No scoring activity recorded yet.</p>
          ) : (
            <div className="table-wrap !shadow-none">
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>Record</th>
                    <th>Reason</th>
                    <th>Actor</th>
                  </tr>
                </thead>
                <tbody>
                  {scoringRows.map((row) => (
                    <tr key={row.id}>
                      <td className="whitespace-nowrap text-[13px]">
                        {new Date(row.at).toLocaleString("en-PH", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </td>
                      <td>
                        <b>{row.action}</b>
                      </td>
                      <td>{row.entity}</td>
                      <td className="font-mono text-[12px]">
                        {row.entity_id ? `${row.entity_id.slice(0, 8)}…` : "—"}
                      </td>
                      <td className="max-w-[260px] text-[13px]">{row.reason ?? "—"}</td>
                      <td className="font-mono text-[12px]">
                        {row.actor_id ? `${row.actor_id.slice(0, 8)}…` : "System"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </RoleGate>
    </div>
  );
}
