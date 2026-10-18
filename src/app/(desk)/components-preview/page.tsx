"use client";

/**
 * Dev-only preview of the desk components (src/components/desk).
 *
 * Not linked in the navigation and not reachable in a production build. It exists so the assembler
 * can see every component in every state with fake players before wiring anything.
 *
 * Note on the path: the task asked for `(desk)/_components-preview`, but Next's App Router treats a
 * folder whose name starts with an underscore as private and never routes it, so the page would be
 * unreachable. This folder keeps the intent (dev only, out of the nav, fake data only) and works.
 */
import { notFound } from "next/navigation";
import { type ReactNode, useState } from "react";
import {
  DataStatusBanner,
  DEMO_DATA_NOTICE,
  OverriddenBadge,
  PlayerQuickPick,
  RegisterConfirm,
  RegisteredBy,
  RegistrationRow,
  RoleGate,
  SaveTruth,
  SessionBar,
} from "@/components/desk";
import { FAKE_EVENT, FAKE_FIELDS, FAKE_PICKS, pick } from "@/components/desk/fixtures";
import type {
  DeskRole,
  PaymentStatus,
  PlayerPickItem,
  RegistrationAudit,
} from "@/components/desk/types";
import { CheatSheet, FirstRunWelcome, HelpButton, HelpSheet } from "@/components/help";

const NOW = new Date(2026, 9, 18, 16, 0); // 18 Oct 2026, 4:00 PM
const at = {
  justNow: new Date(2026, 9, 18, 15, 59, 30).toISOString(),
  minutes: new Date(2026, 9, 18, 15, 56).toISOString(),
  thisMorning: new Date(2026, 9, 18, 9, 5).toISOString(),
  lastWeek: new Date(2026, 9, 12, 7, 30).toISOString(),
};

const ROUTING_READY = {
  categoryName: "Regular",
  teeName: "White (sample ratings)",
  flightName: "Regular A",
  playingHandicap: 14,
  index: 12.4,
  indexNote: "NGAP record dated 2026-10-15, frozen at the cut-off.",
  previewLabel:
    "Course handicap preview only: the tee ratings are samples, not the IGCC scorecard.",
};

function Panel({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: ReactNode;
}) {
  return (
    <section className="card grid gap-4">
      <header className="grid gap-1">
        <h2 className="text-[19px] leading-6">{title}</h2>
        {caption && <p className="hint">{caption}</p>}
      </header>
      <div className="grid gap-5">{children}</div>
    </section>
  );
}

function State({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <p className="overline">{label}</p>
      {children}
    </div>
  );
}

/* Interactive wrappers, so the preview behaves like the real screen. */

function PickDemo({ initialStatus }: { initialStatus?: "ready" }) {
  const [query, setQuery] = useState("a");
  const [selected, setSelected] = useState<PlayerPickItem | null>(null);
  const [status, setStatus] = useState<"ready" | "error">(initialStatus ?? "ready");
  if (status === "error") {
    return (
      <PlayerQuickPick
        items={FAKE_PICKS}
        status="error"
        errorMessage="The directory could not be reached."
        onRetry={() => setStatus("ready")}
        onSelect={setSelected}
      />
    );
  }
  return (
    <>
      <PlayerQuickPick
        items={FAKE_PICKS}
        query={query}
        onQueryChange={setQuery}
        onSelect={setSelected}
        selectedId={selected?.player.id ?? null}
        hint="Names, nicknames and NGAP IDs match. Arrows move, Enter confirms, Escape clears."
      />
      {selected && (
        <p className="hint" role="status">
          Selected: <b>{selected.player.name}</b>
        </p>
      )}
    </>
  );
}

function ConfirmDemo({
  variant,
}: {
  variant: "ready" | "missing" | "blocked" | "review" | "duplicate" | "saving";
}) {
  const [role, setRole] = useState<"member" | "guest">("member");
  const [payment, setPayment] = useState<PaymentStatus>("pending");
  const [values, setValues] = useState<Record<string, string>>({});

  const routing =
    variant === "blocked"
      ? { ...ROUTING_READY, index: 31.4, flightName: null, playingHandicap: null }
      : variant === "review"
        ? {
            ...ROUTING_READY,
            index: null,
            indexNote: "No NGAP record on or before the cut-off (2026-11-01).",
            categoryName: null,
            flightName: null,
            playingHandicap: null,
          }
        : ROUTING_READY;

  const eligibility =
    variant === "blocked"
      ? {
          status: "ineligible" as const,
          reasons: ["Index 31.4 is above the maximum of 30."],
          maxIndex: 30,
        }
      : variant === "review"
        ? {
            status: "needs_review" as const,
            reasons: [
              "No NGAP index was on or before the cut-off (2026-11-01), so nothing could be frozen.",
            ],
            maxIndex: 30,
          }
        : { status: "ok" as const, maxIndex: 30 };

  return (
    <RegisterConfirm
      event={FAKE_EVENT}
      participant={{ item: pick("p1"), role, onRoleChange: setRole }}
      routing={routing}
      eligibility={eligibility}
      duplicate={
        variant === "duplicate"
          ? {
              name: pick("p6").player.name,
              detail: "Entry 42 was taken at 9:05 AM today.",
            }
          : null
      }
      missingFields={variant === "missing" ? FAKE_FIELDS : []}
      fieldValues={values}
      onFieldChange={(id, value) => setValues((current) => ({ ...current, [id]: value }))}
      paymentStatus={payment}
      onPaymentStatusChange={setPayment}
      paymentNote="Bank transfer instruction from the event config is shown here at wiring time."
      saveTarget="session"
      onConfirm={() => undefined}
      onCancel={() => undefined}
      saving={variant === "saving"}
    />
  );
}

const ROW_AUDIT: RegistrationAudit = {
  addedByName: "Ana Reyes",
  addedAt: at.minutes,
  overridden: true,
  overrideReason: "Organizer request: same flight as their club-mates.",
};

export default function ComponentsPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const roleStates: (DeskRole | null | undefined)[] = [
    "owner",
    "organizer",
    "desk",
    null,
    undefined,
  ];

  return (
    <div className="mx-auto grid max-w-[1100px] gap-6 pb-16">
      <header className="grid gap-2">
        <p className="overline">Dev only · not linked in the nav</p>
        <h1>Desk components preview</h1>
        <p className="max-w-[60ch] text-ink-muted">
          Every registration-desk and shell component in its states, using fake players only. This
          page exists to wire and review the components before the data layer is connected. Nothing
          here is fetched, saved or real.
        </p>
        <DataStatusBanner status="demo" />
      </header>

      <Panel
        title="PlayerQuickPick"
        caption="Props-driven search over saved players. Photo shows only with recorded consent."
      >
        <State label="Ready, with results">
          <PickDemo />
        </State>
        <State label="Loading">
          <PlayerQuickPick items={[]} status="loading" onSelect={() => undefined} />
        </State>
        <State label="Error with retry">
          <PlayerQuickPick
            items={[]}
            status="error"
            errorMessage="The directory could not be reached."
            onRetry={() => undefined}
            onSelect={() => undefined}
          />
        </State>
        <State label="No results for the query">
          <PlayerQuickPick
            items={FAKE_PICKS}
            query="zzz"
            onSelect={() => undefined}
            onQueryChange={() => undefined}
          />
        </State>
        <State label="Untouched (idle)">
          <PlayerQuickPick items={[]} status="idle" onSelect={() => undefined} />
        </State>
        <State label="Disabled">
          <PlayerQuickPick items={FAKE_PICKS} disabled onSelect={() => undefined} />
        </State>
      </Panel>

      <Panel
        title="RegisterConfirm"
        caption="Search, select, confirm. The save button follows eligibility and the required event questions."
      >
        <State label="Eligible, nothing missing">
          <ConfirmDemo variant="ready" />
        </State>
        <State label="Required event questions still missing">
          <ConfirmDemo variant="missing" />
        </State>
        <State label="Blocked: index above the maximum">
          <ConfirmDemo variant="blocked" />
        </State>
        <State label="Needs review: no index on or before the cut-off">
          <ConfirmDemo variant="review" />
        </State>
        <State label="Duplicate warning">
          <ConfirmDemo variant="duplicate" />
        </State>
        <State label="Saving">
          <ConfirmDemo variant="saving" />
        </State>
      </Panel>

      <Panel
        title="RegistrationRow / RegisteredBy / OverriddenBadge"
        caption="Audit facts are optional, so a row still renders before the columns exist."
      >
        <State label="Member, audited, overridden, with actions">
          <RegistrationRow
            name="Antonio Alcantara"
            role="member"
            status="ok"
            index={12.4}
            playingHandicap={14}
            flightName="Regular A"
            paymentStatus="pending"
            shirt="XL"
            teePreferenceNote="prefers 6:30 AM"
            audit={ROW_AUDIT}
            now={NOW}
            profileHref="/players"
            actions={
              <button type="button" className="btn small ghost">
                Re-freeze
              </button>
            }
          />
        </State>
        <State label="Guest, no audit columns yet, unconsented photo hidden">
          <RegistrationRow
            name="Gregorio Padilla"
            role="guest"
            status="needs_review"
            index={21.5}
            paymentStatus="not_recorded"
            photo="data:image/png;base64,ignored-without-consent"
            now={NOW}
          />
        </State>
        <State label="Consented photo, ineligible">
          <RegistrationRow
            name="Pedro Villanueva"
            role="member"
            status="ineligible"
            index={31.4}
            flightName={null}
            audit={{ addedByName: "Ana Reyes", addedAt: at.lastWeek }}
            now={NOW}
            actions={
              <button type="button" className="btn small ghost">
                Remove
              </button>
            }
          />
        </State>
        <State label="RegisteredBy and OverriddenBadge on their own">
          <div className="flex flex-wrap items-center gap-3">
            <RegisteredBy name="Ana Reyes" at={at.minutes} now={NOW} />
            <RegisteredBy at={at.lastWeek} now={NOW} />
            <RegisteredBy name="Cara Lim" now={NOW} />
            <RegisteredBy now={NOW} />
            <OverriddenBadge reason="Organizer request: same flight as their club-mates." />
            <OverriddenBadge />
          </div>
        </State>
      </Panel>

      <Panel
        title="SessionBar"
        caption="Optional props only: it renders in demo mode, signed-out, and under a member."
      >
        <State label="Demo build (auth not configured)">
          <SessionBar lastSavedAt={null} now={NOW} />
        </State>
        <State label="Signed in as owner">
          <SessionBar
            member={{ displayName: "Ana Reyes", role: "owner" }}
            lastSavedAt={at.justNow}
            now={NOW}
            signOutSlot={
              <button type="button" className="btn small ghost">
                Sign out
              </button>
            }
          />
        </State>
        <State label="Organizer, saved 4 minutes ago">
          <SessionBar
            member={{ displayName: "Ben Cruz", role: "organizer" }}
            lastSavedAt={at.minutes}
            now={NOW}
          />
        </State>
        <State label="Desk role, saved this morning">
          <SessionBar
            member={{ displayName: "Cara Lim", role: "desk" }}
            lastSavedAt={at.thisMorning}
            now={NOW}
          />
        </State>
        <State label="Signed in without a membership row">
          <SessionBar member={null} lastSavedAt={null} now={NOW} />
        </State>
        <State label="Saving">
          <SessionBar
            member={{ displayName: "Ana Reyes", role: "owner" }}
            saving
            lastSavedAt={at.justNow}
            now={NOW}
          />
        </State>
        <State label="Write error with retry">
          <SessionBar
            member={{ displayName: "Ana Reyes", role: "owner" }}
            error="Could not save the change."
            onRetry={() => undefined}
            lastSavedAt={at.minutes}
            now={NOW}
          />
        </State>
      </Panel>

      <Panel
        title="RoleGate"
        caption="Cosmetic only: it hides or disables controls. Real enforcement is server-side and in RLS."
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Role</th>
                <th>hide (owner only)</th>
                <th>disable (owner only)</th>
                <th>allow all</th>
              </tr>
            </thead>
            <tbody>
              {roleStates.map((role) => (
                <tr key={String(role)}>
                  <td className="mono">
                    {role === undefined ? "undefined (demo)" : role === null ? "null" : role}
                  </td>
                  <td>
                    <RoleGate role={role} allow={["owner"]} mode="hide">
                      <button type="button" className="btn small">
                        Publish draw
                      </button>
                    </RoleGate>
                    <span className="hint"> </span>
                  </td>
                  <td>
                    <RoleGate
                      role={role}
                      allow={["owner"]}
                      mode="disable"
                      disabledReason="Only the owner can publish."
                    >
                      <button type="button" className="btn small">
                        Publish draw
                      </button>
                    </RoleGate>
                  </td>
                  <td>
                    <RoleGate role={role} allow={["owner", "organizer", "desk"]}>
                      <button type="button" className="btn small ghost">
                        Take a registration
                      </button>
                    </RoleGate>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="DataStatus banners"
        caption="One place for the truth about the data behind a screen."
      >
        <State label="Demo (session only)">
          <DataStatusBanner status="demo" />
        </State>
        <State label="Loading">
          <DataStatusBanner status="loading" />
        </State>
        <State label="Error with retry">
          <DataStatusBanner
            status="error"
            errorMessage="Could not load the tournament desk."
            detail="Check the connection, then try again."
            onRetry={() => undefined}
          />
        </State>
        <State label="Ready (renders nothing)">
          <DataStatusBanner status="ready" />
          <p className="hint">Nothing above this line: a healthy screen says nothing.</p>
        </State>
        <State label="Inline variants">
          <DataStatusBanner status="demo" variant="inline" detail="not saved" />
          <DataStatusBanner status="loading" variant="inline" />
          <DataStatusBanner
            status="error"
            variant="inline"
            errorMessage="Not saved"
            onRetry={() => undefined}
          />
        </State>
        <State label="SaveTruth">
          <SaveTruth target="session" />
          <SaveTruth target="database" detail="Saved 4 minutes ago." />
        </State>
        <State label="Notice text used app-wide">
          <p className="hint">
            <b>{DEMO_DATA_NOTICE}</b> is exported from the components package so every screen shows
            the same wording.
          </p>
        </State>
      </Panel>

      <Panel title="Help centre">
        <State label="The ? button, on the shell's band and in glass">
          <div className="band flex flex-wrap items-center gap-3 rounded-[14px] p-3">
            <HelpButton audience="desk" screen="/draw" />
            <HelpButton audience="desk" screen="/draw" overlay />
            <HelpButton audience="player" screen="pairings" />
          </div>
        </State>

        <State label="Help sheets, opened for real">
          <HelpDemo />
        </State>

        <State label="First-run welcome">
          <p className="hint">
            Forced open here so it can be looked at. In the app it shows once per person: the
            <b> help_seen</b> row when the migration is applied, and this browser's
            <b> teeline-help-seen</b> key always.
          </p>
          <FirstRunWelcome audience="desk" force />
        </State>

        <State label="Printable cheat sheet (Print center's fourth tab)">
          <CheatSheet />
        </State>
      </Panel>
    </div>
  );
}

/** Opens each help sheet on demand, so the preview shows the real panel and a working close. */
function HelpDemo() {
  const [open, setOpen] = useState<"desk" | "player" | null>(null);
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className="btn ghost" onClick={() => setOpen("desk")}>
        Desk sheet, on the draw screen
      </button>
      <button type="button" className="btn ghost" onClick={() => setOpen("player")}>
        Player sheet, on the pairings screen
      </button>
      <HelpSheet
        open={open === "desk"}
        onOpenChange={(next) => setOpen(next ? "desk" : null)}
        audience="desk"
        screen="/draw"
      />
      <HelpSheet
        open={open === "player"}
        onOpenChange={(next) => setOpen(next ? "player" : null)}
        audience="player"
        screen="pairings"
      />
    </div>
  );
}
