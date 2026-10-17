"use client";

import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleAlert,
  ClipboardList,
  Download,
  Flag,
  Lock,
  OctagonAlert,
  Printer,
  Send,
  TriangleAlert,
  Trophy,
  Unlock,
  UserPlus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import { PublishDialog } from "@/components/draw/PublishDialog";
import { Button } from "@/components/ui/button";
import type { Issue } from "@/lib/draw/validate";
import { type ActivityEntry, ago, useActivity } from "@/lib/ui/activity";
import type { useBoard } from "@/lib/ui/board";
import { cn } from "@/lib/ui/cn";

type Board = ReturnType<typeof useBoard>;
export type PanelVariant = "glass" | "card";

/** A titled panel: glass over the course, an ordinary card on plain ground. */
export function Panel({
  title,
  subtitle,
  action,
  variant = "glass",
  className,
  children,
  labelledBy,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  variant?: PanelVariant;
  className?: string;
  children: ReactNode;
  labelledBy?: string;
}) {
  return (
    <section
      aria-labelledby={labelledBy}
      className={cn(variant === "glass" ? "glass p-4" : "card", "min-w-0", className)}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={labelledBy} className="text-[17px]">
            {title}
          </h3>
          {subtitle && <p className="mt-0.5 text-[12.5px] text-ink-muted">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function GoLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="grid size-[34px] shrink-0 place-items-center rounded-[10px] border border-glass-line text-ink hover:bg-[rgba(238,240,234,0.08)]"
    >
      <ArrowUpRight className="size-4" aria-hidden="true" />
    </Link>
  );
}

function Tile({
  label,
  badge,
  value,
  total,
  foot,
  tone,
}: {
  label: string;
  badge?: ReactNode;
  value: ReactNode;
  total?: ReactNode;
  foot?: ReactNode;
  tone?: "danger";
}) {
  return (
    <div className="relative min-h-[104px] overflow-hidden rounded-[14px] border border-glass-line bg-[color-mix(in_srgb,var(--surface-raised)_55%,transparent)] p-3">
      <div className="flex items-center justify-between gap-2 text-xs whitespace-nowrap text-ink-muted">
        {label}
        {badge}
      </div>
      <div
        className={cn(
          "mt-1 font-display text-[26px] leading-8 font-bold tnum",
          tone === "danger" && "text-danger",
        )}
      >
        {value}
        {total !== undefined && (
          <small className="text-sm font-semibold text-ink-muted"> {total}</small>
        )}
      </div>
      {foot && <div className="absolute inset-x-3 bottom-3 text-xs">{foot}</div>}
    </div>
  );
}

function Bar({ pct }: { pct: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-[rgba(238,240,234,0.1)]">
      <i
        className="block h-full rounded-full"
        style={{
          width: `${Math.max(0, Math.min(100, pct))}%`,
          background:
            "repeating-linear-gradient(90deg,var(--fairway) 0 3px,color-mix(in srgb,var(--fairway) 55%,transparent) 3px 6px)",
        }}
      />
    </div>
  );
}

export function ReadinessPanel({ b, variant }: { b: Board; variant?: PanelVariant }) {
  const total = b.registrations.length;
  const maxIndex = b.tournament?.config.maxIndex ?? 0;
  if (!b.draw) {
    return (
      <Panel
        title="Draw readiness"
        variant={variant}
        labelledBy="ready-h"
        action={<GoLink href="/players" label="Open players" />}
      >
        <div className="grid grid-cols-2 gap-2.5">
          <Tile
            label="Ready to play"
            value={b.ready.length}
            total={`/ ${total}`}
            foot={<Bar pct={(b.ready.length / Math.max(1, total)) * 100} />}
          />
          <Tile
            label="Need review"
            badge={b.review.length ? <span className="pill warn">Check</span> : undefined}
            value={b.review.length}
            foot={<span className="text-ink-muted">Missing index or no flight</span>}
          />
          <Tile
            label="Handicaps"
            badge={<span className="pill ok">NGAP</span>}
            value={b.withIndex}
            total={`/ ${total}`}
            foot={
              <span className="text-ink-muted">
                {b.state.importedCount
                  ? `${b.state.importedCount} records written by import`
                  : "Not imported yet"}
              </span>
            }
          />
          <Tile
            label="Not eligible"
            value={b.ineligible.length}
            foot={<span className="text-ink-muted">Index above {maxIndex}</span>}
          />
        </div>
      </Panel>
    );
  }
  const groups = b.draw.length;
  const left = b.ready.length - b.placed;
  return (
    <Panel
      title="Draw readiness"
      variant={variant}
      labelledBy="ready-h"
      action={<GoLink href="/draw" label="Open the draw" />}
    >
      <div className="grid grid-cols-2 gap-2.5">
        <Tile
          label="Assigned"
          badge={
            left > 0 ? (
              <span className="pill warn">{left} left</span>
            ) : (
              <span className="pill ok">All in</span>
            )
          }
          value={b.placed}
          total={`/ ${b.ready.length}`}
          foot={<Bar pct={(b.placed / Math.max(1, b.ready.length)) * 100} />}
        />
        <Tile
          label="Groups"
          badge={<span className="pill">{groups}</span>}
          value={b.full}
          total="full"
          foot={
            <span className={b.short || b.over ? "text-warning" : "text-ink-muted"}>
              {b.short} short · {b.over} over
            </span>
          }
        />
        <Tile
          label="Handicaps"
          badge={<span className="pill ok">NGAP</span>}
          value={b.withIndex}
          total={`/ ${b.registrations.length}`}
          foot={
            <span className="text-ink-muted">
              {b.state.importedCount
                ? `${b.state.importedCount} records written by import`
                : "Not imported yet"}
            </span>
          }
        />
        <Tile
          label="Blocking"
          badge={
            b.blocking.length ? (
              <span className="pill bad">{b.blocking.length}</span>
            ) : (
              <span className="pill ok">None</span>
            )
          }
          value={b.blocking.length}
          tone={b.blocking.length ? "danger" : undefined}
          foot={<span className="text-ink-muted">Must clear to publish</span>}
        />
      </div>
    </Panel>
  );
}

const ISSUE_ICON = {
  blocking: <OctagonAlert className="mt-px size-4 shrink-0 text-danger" aria-hidden="true" />,
  warning: <TriangleAlert className="mt-px size-4 shrink-0 text-warning" aria-hidden="true" />,
  info: <CircleAlert className="mt-px size-4 shrink-0 text-info" aria-hidden="true" />,
};

function IssueList({ issues }: { issues: Issue[] }) {
  if (issues.length === 0) {
    return (
      <p className="mt-3 flex items-center gap-2 text-[13px] text-success">
        <Check className="size-4" aria-hidden="true" /> No problems found
      </p>
    );
  }
  return (
    <ul className="mt-3 grid gap-2">
      {issues.slice(0, 3).map((i) => (
        <li key={i.id} className="flex items-start gap-2.5 text-[13px] leading-[18px]">
          {ISSUE_ICON[i.severity]}
          <span>
            <b className="font-semibold">{i.message}</b>
            <small className="block text-xs text-ink-muted">
              {i.severity === "blocking"
                ? "Blocks publishing"
                : i.severity === "warning"
                  ? "Warning · review before publishing"
                  : "Note"}
            </small>
          </span>
        </li>
      ))}
      {issues.length > 3 && (
        <li className="text-xs text-ink-muted">
          <Link href="/draw">+{issues.length - 3} more in the draw</Link>
        </li>
      )}
    </ul>
  );
}

/** PublishState pill: unsaved, draft, published, or published with newer changes. */
export function PublishState({ b }: { b: Board }) {
  const { isPublished, changedSincePublish } = b;
  const tone = !b.draw
    ? "bg-surface-sunken text-ink-muted"
    : !isPublished
      ? "bg-info-soft text-info"
      : changedSincePublish
        ? "bg-warning-soft text-warning"
        : "bg-success-soft text-success";
  const label = !b.draw
    ? "No draw yet"
    : !isPublished
      ? "Draft · players can’t see it"
      : changedSincePublish
        ? "Published · newer changes"
        : "Published";
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-bold whitespace-nowrap",
        tone,
      )}
    >
      ● {label}
    </span>
  );
}

export function PublishPanel({ b, variant }: { b: Board; variant?: PanelVariant }) {
  const { dispatch, isPublished, changedSincePublish } = b;
  const [open, setOpen] = useState(false);
  const ordered = [...b.blocking, ...b.warnings];
  return (
    <section className={cn(variant === "card" ? "card" : "glass p-4")} aria-label="Publish">
      <div className="flex items-center gap-2.5">
        <PublishState b={b} />
        <span className="flex-1" />
        <span className="text-xs text-ink-muted">
          {b.published
            ? `Published ${new Date(b.published.at).toLocaleTimeString("en-PH", { timeStyle: "short" })}`
            : "Not saved · demo"}
        </span>
      </div>
      {!b.draw ? (
        <div className="mt-3 grid gap-2">
          <p className="text-[13px] text-ink-muted">
            The draw puts each ready player in a flight and a group, and gives the group a hole and
            a time. You can move anyone afterwards.
          </p>
          <Button
            variant="gold"
            disabled={b.ready.length === 0}
            onClick={() => dispatch({ type: "generate", preserveLocks: true })}
          >
            <Flag aria-hidden="true" /> Make the draw
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-2.5 flex items-center gap-2.5">
            <Button variant="glass" className="flex-1" asChild>
              <Link href="/pairings">Player view</Link>
            </Button>
            <Button
              variant="gold"
              className="flex-[1.4]"
              disabled={isPublished && !changedSincePublish}
              onClick={() => setOpen(true)}
            >
              <Send aria-hidden="true" />
              {isPublished ? "Publish changes" : "Publish draw"}
            </Button>
          </div>
          <IssueList issues={ordered} />
        </>
      )}
      <PublishDialog open={open} issues={b.issues} onClose={() => setOpen(false)} />
    </section>
  );
}

const ARC_COLORS = ["var(--gold)", "var(--fairway)", "#f7f4eb", "#5d7a69", "#8dbff0", "#c9a34a"];

export function DivisionsPanel({ b, variant }: { b: Board; variant?: PanelVariant }) {
  const counts = new Map<string, number>();
  for (const r of b.registrations) {
    if (r.status !== "ok") continue;
    const k = b.names.category(r.categoryId);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const rows = [...counts.entries()];
  const total = rows.reduce((n, [, c]) => n + c, 0);
  const cx = 134;
  const cy = 74;
  const r = 62;
  let a = Math.PI;
  return (
    <Panel
      title="Divisions"
      variant={variant}
      labelledBy="div-h"
      action={
        <span className="inline-flex h-[22px] items-center rounded-md border border-[rgba(224,188,101,.5)] bg-gold-soft px-2 text-[11.5px] font-bold text-gold-ink">
          {total} ready
        </span>
      }
    >
      {total === 0 ? (
        <p className="hint">No ready players yet.</p>
      ) : (
        <>
          <svg width="100%" height="78" viewBox="0 0 268 78" aria-hidden="true">
            {rows.map(([k, c], i) => {
              const sweep = (Math.PI * c) / total;
              const a2 = a + sweep - (rows.length > 1 ? 0.03 : 0);
              const d = `M${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)} A${r} ${r} 0 0 1 ${cx + r * Math.cos(a2)} ${cy + r * Math.sin(a2)}`;
              a += sweep;
              return (
                <path
                  key={k}
                  d={d}
                  fill="none"
                  stroke={ARC_COLORS[i % ARC_COLORS.length]}
                  strokeWidth="22"
                />
              );
            })}
            <text
              x={cx}
              y={cy - 6}
              textAnchor="middle"
              fill="currentColor"
              fontFamily="Manrope Variable"
              fontWeight="800"
              fontSize="22"
            >
              {total}
            </text>
          </svg>
          <ul className="mt-1.5 grid gap-[3px] text-[12.5px]">
            {rows.map(([k, c], i) => (
              <li key={k} className="flex items-center gap-2">
                <i
                  className="size-2 rounded-[2px]"
                  style={{ background: ARC_COLORS[i % ARC_COLORS.length] }}
                />
                <span className="flex-1">{k}</span>
                <b className="tnum">{c}</b>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

/** Field by Handicap Index, in 3-stroke bins up to the event's maximum. Real counts only. */
export function HandicapHistogram({ b, variant }: { b: Board; variant?: PanelVariant }) {
  const max = b.tournament?.config.maxIndex ?? 30;
  const edges: { label: string; test: (x: number) => boolean }[] = [
    { label: "+", test: (x) => x < 0 },
  ];
  for (let lo = 0; lo < max; lo += 3) {
    const hi = Math.min(lo + 3, max);
    edges.push({
      label: `${lo}–${Math.floor(hi)}`,
      test: (x) => x >= lo && (hi >= max ? x <= hi : x < hi),
    });
  }
  const indexes = b.registrations.map((r) => r.index).filter((x): x is number => x !== null);
  const above = indexes.filter((x) => x > max).length;
  const none = b.registrations.length - indexes.length;
  const bins = edges.map((e) => ({ label: e.label, n: indexes.filter(e.test).length }));
  const top = Math.max(4, ...bins.map((x) => x.n));
  const W = 560;
  const H = 150;
  const base = 128;
  const bw = Math.min(28, (W - 40) / bins.length - 8);
  const gap = (W - 30 - bins.length * bw) / Math.max(1, bins.length - 1);
  const step = Math.max(1, Math.ceil(top / 4));
  return (
    <Panel
      title="Field by Handicap Index"
      subtitle={`${b.registrations.length} registered · ${none} without an index${above ? ` · ${above} above ${max}` : ""}`}
      variant={variant}
      labelledBy="hist-h"
    >
      <svg
        width="100%"
        height="150"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Handicap Index distribution: ${bins.map((x) => `${x.label}: ${x.n}`).join(", ")}`}
      >
        {Array.from({ length: Math.floor(top / step) + 1 }, (_, i) => i * step).map((y) => {
          const gy = base - (y / top) * (base - 10);
          return (
            <g key={y}>
              <line x1="22" x2={W} y1={gy} y2={gy} stroke="currentColor" strokeOpacity=".1" />
              <text x="0" y={gy + 4} fill="var(--ink-muted)" fontSize="10">
                {y}
              </text>
            </g>
          );
        })}
        {bins.map((x, i) => {
          const bx = 30 + i * (bw + gap);
          const bh = (x.n / top) * (base - 10);
          return (
            <g key={x.label}>
              <rect
                x={bx}
                y={base - bh}
                width={bw}
                height={bh}
                rx="6"
                fill={i === 0 ? "var(--gold)" : "var(--fairway)"}
                opacity=".9"
              />
              <text
                x={bx + bw / 2}
                y={H - 4}
                textAnchor="middle"
                fill="var(--ink-muted)"
                fontSize="10"
              >
                {x.label}
              </text>
            </g>
          );
        })}
      </svg>
    </Panel>
  );
}

const ACT_ICON: Record<ActivityEntry["kind"], ReactNode> = {
  move: <ArrowRight className="size-4 text-fairway" aria-hidden="true" />,
  lock: <Lock className="size-4 text-gold-ink" aria-hidden="true" />,
  unlock: <Unlock className="size-4 text-ink-muted" aria-hidden="true" />,
  draw: <Flag className="size-4 text-gold-ink" aria-hidden="true" />,
  publish: <Check className="size-4 text-success" aria-hidden="true" />,
  unpublish: <TriangleAlert className="size-4 text-warning" aria-hidden="true" />,
  import: <Download className="size-4 text-success" aria-hidden="true" />,
  player: <UserPlus className="size-4 text-fairway" aria-hidden="true" />,
  entry: <ClipboardList className="size-4 text-fairway" aria-hidden="true" />,
};

export function ActivityPanel({
  variant,
  className,
}: {
  variant?: PanelVariant;
  className?: string;
}) {
  const log = useActivity();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return (
    <Panel
      title="Recent activity"
      subtitle="This session"
      variant={variant}
      labelledBy="act-h"
      className={className}
    >
      {log.length === 0 ? (
        <p className="hint">
          Nothing yet. Moves, locks, draws and publishing show here as they happen. A saved history
          arrives with the database.
        </p>
      ) : (
        <ul className="grid max-h-[150px] gap-3 overflow-y-auto pr-1">
          {log.map((e) => (
            <li key={e.id} className="flex items-start gap-2.5">
              <span className="grid size-[34px] shrink-0 place-items-center rounded-full bg-[rgba(238,240,234,0.08)]">
                {ACT_ICON[e.kind]}
              </span>
              <div className="min-w-0 flex-1">
                <b className="block truncate text-[13.5px] font-semibold">{e.title}</b>
                <span className="text-xs text-ink-muted">{e.detail}</span>
              </div>
              <time
                className="text-[11.5px] whitespace-nowrap text-ink-muted"
                dateTime={new Date(e.at).toISOString()}
              >
                {ago(e.at, now)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** The open questions and demo assumptions, kept short and linked to where they are set. */
const OPEN_QUESTIONS: { id: string; question: string; state: string; href: string }[] = [
  {
    id: "name",
    question: "Event name",
    state: "“Bamboo Tee” is a sample title until the club confirms it.",
    href: "/setup",
  },
  {
    id: "day4",
    question: "Day 4 tee time",
    state: "“11:30PM Tee Off” was supplied as-is and needs organizer confirmation.",
    href: "/register",
  },
  {
    id: "flights",
    question: "Flights on index or course handicap",
    state: "Built on the handicap index for now; the spec leaves this open.",
    href: "/setup",
  },
  {
    id: "tees",
    question: "Tees for Regular, Senior, Ladies",
    state: "Only Super Senior = Silver is confirmed. The others are demo mappings.",
    href: "/setup",
  },
  {
    id: "partial",
    question: "Groups that do not divide by four",
    state: "Even split, and a group never drops below three players.",
    href: "/setup",
  },
  {
    id: "order",
    question: "Order inside a flight",
    state: "By handicap, lowest first.",
    href: "/setup",
  },
  {
    id: "ratings",
    question: "Real IGCC course data",
    state: "Course Rating, Slope, Par and stroke index are pending; sample numbers are in use.",
    href: "/setup",
  },
  {
    id: "photos",
    question: "Where player photos may appear",
    state: "Organizer screens only, with recorded consent. Never on public pairings.",
    href: "/players",
  },
  {
    id: "results",
    question: "Results and tie-breaks",
    state: "Phase 2. Scoring stays on paper cards.",
    href: "/print",
  },
  {
    id: "schedule",
    question: "Event dates and cut-off",
    state: "Sample dates and cut-off date until the organizer confirms them.",
    href: "/setup",
  },
];

/**
 * The overview's attention panel: the active event, what needs the organizer's eye, quick
 * actions, and the still-open questions. Every count is derived from the demo data on screen.
 */
export function AttentionPanel({
  b,
  variant,
  className,
}: {
  b: Board;
  variant?: PanelVariant;
  className?: string;
}) {
  const maxIndex = b.tournament?.config.maxIndex ?? 0;
  const review = b.registrations.filter((r) => r.status === "needs_review");
  const ineligible = b.registrations.filter((r) => r.status === "ineligible");
  const guests = b.registrations.filter((r) => r.role === "guest").length;
  const pendingPayment = b.registrations.filter((r) => r.paymentStatus === "pending").length;

  const items: {
    id: string;
    tone: "bad" | "warn" | "info";
    icon: ReactNode;
    title: string;
    detail: string;
    href: string;
    cta: string;
  }[] = [];
  if (b.blocking.length > 0) {
    items.push({
      id: "blocking",
      tone: "bad",
      icon: <OctagonAlert className="size-4 text-danger" aria-hidden="true" />,
      title: `${b.blocking.length} must fix before publishing`,
      detail: "The draw has blocking problems.",
      href: "/draw",
      cta: "Open the draw",
    });
  }
  if (ineligible.length > 0) {
    items.push({
      id: "ineligible",
      tone: "bad",
      icon: <OctagonAlert className="size-4 text-danger" aria-hidden="true" />,
      title: `${ineligible.length} over the index limit of ${maxIndex}`,
      detail: "Above the limit cannot register in this event.",
      href: "/players",
      cta: "Check players",
    });
  }
  if (review.length > 0) {
    items.push({
      id: "review",
      tone: "warn",
      icon: <TriangleAlert className="size-4 text-warning" aria-hidden="true" />,
      title: `${review.length} need a review`,
      detail: "Missing index, no flight, or identity details missing.",
      href: "/players",
      cta: "Check players",
    });
  }
  if (b.pendingRefreeze.length > 0) {
    items.push({
      id: "refreeze",
      tone: "warn",
      icon: <TriangleAlert className="size-4 text-warning" aria-hidden="true" />,
      title: `${b.pendingRefreeze.length} registrations need a re-freeze`,
      detail: "Their frozen index no longer matches the imported records.",
      href: "/register",
      cta: "Open the desk",
    });
  }
  if (b.deferred.length > 0) {
    items.push({
      id: "deferred",
      tone: "warn",
      icon: <TriangleAlert className="size-4 text-warning" aria-hidden="true" />,
      title: `${b.deferred.length} import rows were deferred`,
      detail: "Decide link, create new, or keep separate.",
      href: "/import",
      cta: "Resolve imports",
    });
  }
  if (!b.draw && b.ready.length > 0) {
    items.push({
      id: "nodraw",
      tone: "info",
      icon: <CircleAlert className="size-4 text-info" aria-hidden="true" />,
      title: "No draw yet",
      detail: `${b.ready.length} ready players are waiting for a proposal.`,
      href: "/draw",
      cta: "Make the draw",
    });
  }
  if (pendingPayment > 0) {
    items.push({
      id: "payment",
      tone: "info",
      icon: <CircleAlert className="size-4 text-info" aria-hidden="true" />,
      title: `${pendingPayment} payments pending`,
      detail: "Payment status is recorded by hand; nothing is taken online.",
      href: "/register",
      cta: "Open the desk",
    });
  }

  return (
    <Panel
      title="Tournament"
      subtitle={b.tournament ? b.tournament.name : "No event selected"}
      variant={variant}
      labelledBy="attention-h"
      className={className}
      action={<GoLink href="/tournaments" label="Open tournaments" />}
    >
      <div className="rounded-[12px] border border-glass-line bg-[color-mix(in_srgb,var(--surface-raised)_50%,transparent)] p-3">
        <p className="flex items-baseline gap-2">
          <b className="font-display text-[26px] leading-8 tnum">{b.registrations.length}</b>
          <span className="text-xs text-ink-muted">
            registrations · {b.ready.length} ready · {guests} guest{guests === 1 ? "" : "s"}
          </span>
        </p>
        <p className="mt-0.5 text-xs text-ink-muted">
          Demo data only. Nothing here is saved to a server.
        </p>
      </div>

      {items.length === 0 ? (
        <p className="mt-3 flex items-center gap-2 text-[13px] text-success">
          <Check className="size-4" aria-hidden="true" /> Nothing is waiting for you.
        </p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {items.map((i) => (
            <li key={i.id} className="flex items-start gap-2.5 text-[13px] leading-[18px]">
              <span className="mt-px">{i.icon}</span>
              <span className="min-w-0 flex-1">
                <b className="block font-semibold">{i.title}</b>
                <span className="block text-xs text-ink-muted">{i.detail}</span>
              </span>
              <Link href={i.href} className="text-xs font-semibold whitespace-nowrap">
                {i.cta}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-glass-line pt-3">
        <Link href="/register" className="btn small gold">
          <ClipboardList aria-hidden="true" /> Register
        </Link>
        <Link href="/import" className="btn small ghost">
          <Download aria-hidden="true" /> Import
        </Link>
        <Link href="/players" className="btn small ghost">
          <Users aria-hidden="true" /> Players
        </Link>
        <Link href="/print" className="btn small ghost">
          <Printer aria-hidden="true" /> Print
        </Link>
      </div>

      <details className="mt-3 border-t border-glass-line pt-3">
        <summary className="flex min-h-8 cursor-pointer flex-wrap items-center gap-2 text-[13px] font-semibold">
          <Trophy className="size-4 text-gold-ink" aria-hidden="true" />
          Open questions / before publish
          <span className="pill">{OPEN_QUESTIONS.length}</span>
        </summary>
        <ul className="mt-2 grid gap-2">
          {OPEN_QUESTIONS.map((q) => (
            <li key={q.id} className="text-[12.5px] leading-[17px]">
              <b className="font-semibold">{q.question}</b>
              <span className="block text-ink-muted">
                {q.state}{" "}
                <Link href={q.href} className="whitespace-nowrap">
                  Open
                </Link>
              </span>
            </li>
          ))}
        </ul>
      </details>
    </Panel>
  );
}
