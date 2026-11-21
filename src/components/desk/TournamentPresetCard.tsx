"use client";

import { Bookmark, CheckCircle2, Pencil, Trash2, TriangleAlert, Wand2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { SectionCard } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import {
  PRESETS_UNAVAILABLE,
  type PresetLine,
  replacementLines,
  type SavedPreset,
  settingsFromTournament,
  settingsSummary,
  type TournamentSettings,
} from "@/lib/data/presets";
import {
  applyPreset,
  deletePreset,
  loadPresets,
  type PresetApplyResult,
  renamePreset,
  savePreset,
} from "@/lib/data/supabase/presets";
import type { Tournament } from "@/lib/data/types";
import type { Tee } from "@/lib/routing";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * The desk's preset controls.
 *
 * A preset is a saved standard: tees, categories, classes and the rules the event runs on. The
 * organizer can start an event from one, save the settings on screen as one, and rename or delete
 * one. Applying a preset copies it into this event and never links to it, so either side can be
 * changed afterwards without touching the other.
 *
 * The migration that holds the presets is not applied on every project. When it is missing the
 * card says so and every other setting on the screen keeps working.
 */
export function TournamentPresetCard({
  tournament,
  tees,
  entries,
  canEdit,
  demo,
  onApplied,
}: {
  tournament: Tournament;
  tees: Tee[];
  /** Entries already filed for this event. A category or class one of them uses is kept. */
  entries: number;
  canEdit: boolean;
  demo: boolean;
  /** Called after a preset is applied, so the screen reloads the event and drops its draft. */
  onApplied: () => void;
}) {
  // Demo mode, and a build with no Supabase at all, have nothing to read or write.
  const demoMode = demo || !isSupabaseConfigured();

  const [presets, setPresets] = useState<SavedPreset[]>([]);
  const [brokenPresets, setBrokenPresets] = useState<{ name: string; problems: string[] }[]>([]);
  const [loading, setLoading] = useState(!demoMode);
  const [unavailable, setUnavailable] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [selectedId, setSelectedId] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [applyResult, setApplyResult] = useState<PresetApplyResult | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState("");

  const [presetName, setPresetName] = useState("");
  const [presetDescription, setPresetDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");

  const [renaming, setRenaming] = useState<{
    id: string;
    name: string;
    description: string;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState(false);
  const [rowError, setRowError] = useState("");

  // The settings this event runs on, built the same way a saved preset is, so the confirm can say
  // what the event is about to lose. A tee whose name does not say a colour stops the save rather
  // than storing a colour nobody chose, and that is shown instead of the save button.
  const current = useMemo(() => settingsFromTournament(tournament, tees), [tournament, tees]);
  const currentSettings = current.ok ? current.settings : null;

  const selected = presets.find((preset) => preset.id === selectedId) ?? null;
  const preview: PresetLine[] = selected ? settingsSummary(selected.settings) : [];

  useEffect(() => {
    if (demoMode) return;
    let active = true;
    setLoading(true);
    setUnavailable(false);
    setLoadError("");
    (async () => {
      try {
        const client = createSupabaseBrowserClient();
        const list = await loadPresets(client, tournament.clubId);
        if (!active) return;
        setPresets(list.presets);
        setBrokenPresets(list.problems);
        setUnavailable(list.unavailable);
      } catch (error) {
        if (!active) return;
        setLoadError(error instanceof Error ? error.message : "Could not load the presets.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [tournament.clubId, demoMode]);

  const reload = async () => {
    const client = createSupabaseBrowserClient();
    const list = await loadPresets(client, tournament.clubId);
    setPresets(list.presets);
    setBrokenPresets(list.problems);
    setUnavailable(list.unavailable);
  };

  const choose = (id: string) => {
    setSelectedId(id);
    setConfirming(false);
    setApplyError("");
    setApplyResult(null);
  };

  const apply = async () => {
    if (!selected || applying) return;
    setApplying(true);
    setApplyError("");
    setApplyResult(null);
    try {
      const client = createSupabaseBrowserClient();
      const result = await applyPreset(client, tournament.id, selected.id);
      setApplyResult(result);
      setConfirming(false);
      setSelectedId("");
      // The event now holds the preset's rules, so the screen reloads them and the draft built on
      // the old rules is dropped rather than saved over the top.
      onApplied();
      await reload();
    } catch (error) {
      setApplyError(error instanceof Error ? error.message : "The preset could not be applied.");
    } finally {
      setApplying(false);
    }
  };

  const save = async () => {
    if (!currentSettings || saving) return;
    const name = presetName.trim();
    if (!name) {
      setSaveError("Give the preset a name.");
      return;
    }
    setSaving(true);
    setSaveError("");
    setSaveMessage("");
    try {
      const client = createSupabaseBrowserClient();
      const saved = await savePreset(
        client,
        tournament.clubId,
        name,
        presetDescription.trim() || null,
        currentSettings,
      );
      setSaveMessage(`Saved as “${saved.name}”.`);
      setPresetName("");
      setPresetDescription("");
      await reload();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "The preset could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const rename = async () => {
    if (!renaming || rowBusy) return;
    const name = renaming.name.trim();
    if (!name) {
      setRowError("Give the preset a name.");
      return;
    }
    setRowBusy(true);
    setRowError("");
    try {
      const client = createSupabaseBrowserClient();
      await renamePreset(client, renaming.id, name, renaming.description.trim() || null);
      setRenaming(null);
      await reload();
    } catch (error) {
      setRowError(error instanceof Error ? error.message : "The preset could not be renamed.");
    } finally {
      setRowBusy(false);
    }
  };

  const remove = async (preset: SavedPreset) => {
    if (rowBusy) return;
    setRowBusy(true);
    setRowError("");
    try {
      const client = createSupabaseBrowserClient();
      await deletePreset(client, preset.id);
      if (selectedId === preset.id) choose("");
      setConfirmDelete(null);
      await reload();
    } catch (error) {
      setRowError(error instanceof Error ? error.message : "The preset could not be deleted.");
    } finally {
      setRowBusy(false);
    }
  };

  const replacements = selected
    ? currentSettings
      ? replacementLines(currentSettings, selected.settings, entries)
      : [
          "The event's tees, categories, classes, handicap allowance, group sizes and start settings are replaced by the preset's.",
          "The event keeps its own name and dates.",
        ]
    : [];

  return (
    <SectionCard
      id="presets"
      icon={<Bookmark className="size-5" aria-hidden="true" />}
      title="Tournament presets"
      subtitle="Save the standard once, then start every event from it. Any rule can still be changed for the event afterwards."
    >
      {demoMode && (
        <p className="notice m-0" role="note">
          Connect the live database to use presets. This demo shell keeps one event&rsquo;s settings
          in this browser only.
        </p>
      )}

      {!demoMode && loading && (
        <p className="hint m-0" role="status">
          Loading the presets…
        </p>
      )}

      {!demoMode && !loading && unavailable && (
        <p className="notice warn m-0" role="status">
          {PRESETS_UNAVAILABLE}
        </p>
      )}

      {loadError && (
        <p className="notice bad m-0" role="alert">
          {loadError}
        </p>
      )}

      {!demoMode && !loading && !unavailable && (
        <div className="grid gap-5">
          {/* Start from a preset ---------------------------------------------------------------- */}
          <div className="grid gap-3">
            <label className="field">
              <span>Start from a preset</span>
              <select
                value={selectedId}
                onChange={(event) => choose(event.target.value)}
                aria-label="Preset to apply to this event"
              >
                <option value="">Choose a preset</option>
                {presets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
              <span className="hint">
                The preview below is what applying it writes into this event. The preset itself is
                never changed by the event, and the event is never changed by the preset again.
              </span>
            </label>

            {presets.length === 0 && brokenPresets.length === 0 && (
              <p className="hint m-0">
                No presets yet. Save these settings below, or run{" "}
                <code>seed_preset_from_tournament</code> on the live event to keep its standard.
              </p>
            )}

            {selected && (
              <div className="grid gap-3 rounded-[12px] border border-line bg-surface-sunken p-3">
                <div className="grid gap-1">
                  <b className="text-[14px]">{selected.name}</b>
                  {selected.description && <p className="hint m-0">{selected.description}</p>}
                </div>
                <dl className="grid gap-1.5">
                  {preview.map((line) => (
                    <div
                      key={line.label}
                      className="grid gap-0.5 sm:grid-cols-[7rem_minmax(0,1fr)]"
                    >
                      <dt className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
                        {line.label}
                      </dt>
                      <dd className="hint m-0">{line.detail}</dd>
                    </div>
                  ))}
                </dl>

                {!confirming && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="primary"
                      className="h-11"
                      disabled={!canEdit || applying}
                      onClick={() => {
                        setConfirming(true);
                        setApplyError("");
                        setApplyResult(null);
                      }}
                    >
                      <Wand2 aria-hidden="true" /> Apply preset
                    </Button>
                    <span className="hint">
                      {entries > 0
                        ? `${entries} ${entries === 1 ? "entry is" : "entries are"} already filed. A category one of them uses is kept; a tee or class one of them still uses stops the replacement.`
                        : "Nothing is filed yet, so the whole set can be replaced."}
                    </span>
                  </div>
                )}

                {confirming && (
                  <div className="notice warn grid gap-2.5" role="alert">
                    <div className="flex items-start gap-2.5">
                      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      <p className="m-0 text-[13px]">
                        <b>Replace this event&rsquo;s rules with “{selected.name}”?</b> This writes
                        the preset into {tournament.name}. It is a copy: the preset does not change,
                        and the event can be edited afterwards.
                      </p>
                    </div>
                    <ul className="plain m-0 grid gap-1 text-[13px]">
                      {replacements.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="primary"
                        className="h-11"
                        disabled={applying}
                        onClick={() => void apply()}
                      >
                        {applying ? "Applying…" : "Apply and replace"}
                      </Button>
                      <Button
                        variant="ghost"
                        className="h-11"
                        disabled={applying}
                        onClick={() => setConfirming(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {applyError && (
                  <p className="notice bad m-0" role="alert">
                    {applyError}
                  </p>
                )}
              </div>
            )}

            {applyResult && (
              <div className="notice ok flex items-start gap-2.5" role="status">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                <div className="grid gap-1 text-[13px]">
                  <p className="m-0">
                    <b>Applied.</b> {applyResult.applied.tees} tees,{" "}
                    {applyResult.applied.categories} categories, {applyResult.applied.flights}{" "}
                    classes and {applyResult.applied.days} playing days now follow the preset. The
                    draw is out of date until it is run again.
                  </p>
                  {applyResult.ignoredDays.length > 0 && (
                    <p className="m-0">
                      The preset lists{" "}
                      {applyResult.ignoredDays.map((day) => `day ${day}`).join(", ")}, which this
                      event does not have. Its dates were not changed.
                    </p>
                  )}
                  {applyResult.notes.map((note) => (
                    <p key={note} className="m-0">
                      {note}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Save these settings as a preset ---------------------------------------------------- */}
          <div className="grid gap-3 border-t border-line pt-4">
            <b className="text-[14px]">Save these settings as a preset</b>
            <p className="hint m-0">
              Stores the rules on this screen: tees and their numbers, categories, classes, the
              handicap allowance, the index limit, group sizes, the start format, the session starts
              and the gaps. The event name, dates and entry questions stay with the event.
            </p>
            {current.ok ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="field">
                  <span>Preset name</span>
                  <input
                    type="text"
                    value={presetName}
                    onChange={(event) => setPresetName(event.target.value)}
                    placeholder="For example: Bamboo Tee standard"
                    aria-label="Preset name"
                  />
                </label>
                <label className="field">
                  <span>Description (optional)</span>
                  <input
                    type="text"
                    value={presetDescription}
                    onChange={(event) => setPresetDescription(event.target.value)}
                    placeholder="What this standard is for"
                    aria-label="Preset description"
                  />
                </label>
              </div>
            ) : (
              <div className="notice warn m-0" role="note">
                <p className="m-0 text-[13px]">
                  <b>These settings cannot be saved as a preset yet.</b> Fix this first, in Course
                  &amp; tees or Categories:
                </p>
                <ul className="plain m-0 mt-1 grid gap-1 text-[13px]">
                  {current.problems.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                className="h-11"
                disabled={!canEdit || saving || !current.ok || presetName.trim() === ""}
                onClick={() => void save()}
              >
                <Bookmark aria-hidden="true" /> {saving ? "Saving…" : "Save as a preset"}
              </Button>
              {saveMessage && (
                <span className="hint" role="status">
                  {saveMessage}
                </span>
              )}
            </div>
            {saveError && (
              <p className="notice bad m-0" role="alert">
                {saveError}
              </p>
            )}
          </div>

          {/* The list --------------------------------------------------------------------------- */}
          <div className="grid gap-2 border-t border-line pt-4">
            <b className="text-[14px]">Saved presets</b>
            {presets.length === 0 ? (
              <p className="hint m-0">Nothing saved yet.</p>
            ) : (
              <ul className="plain grid gap-2">
                {presets.map((preset) => (
                  <li
                    key={preset.id}
                    className="grid gap-2 rounded-[12px] border border-line p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
                  >
                    {renaming?.id === preset.id ? (
                      <div className="grid gap-2">
                        <label className="field">
                          <span>Name</span>
                          <input
                            type="text"
                            value={renaming.name}
                            onChange={(event) =>
                              setRenaming({ ...renaming, name: event.target.value })
                            }
                            aria-label="Preset name"
                          />
                        </label>
                        <label className="field">
                          <span>Description (optional)</span>
                          <input
                            type="text"
                            value={renaming.description}
                            onChange={(event) =>
                              setRenaming({ ...renaming, description: event.target.value })
                            }
                            aria-label="Preset description"
                          />
                        </label>
                      </div>
                    ) : (
                      <div className="min-w-0">
                        <b className="block text-[14px]">{preset.name}</b>
                        {preset.description && <p className="hint m-0">{preset.description}</p>}
                        <p className="hint m-0">
                          {preset.settings.tees.length} tees · {preset.settings.categories.length}{" "}
                          categories · {preset.settings.flights.length} classes ·{" "}
                          {preset.settings.days.length} playing days
                        </p>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1.5 sm:justify-self-end">
                      {renaming?.id === preset.id ? (
                        <>
                          <Button
                            variant="secondary"
                            className="h-11"
                            disabled={rowBusy}
                            onClick={() => void rename()}
                          >
                            Save name
                          </Button>
                          <Button
                            variant="ghost"
                            className="h-11"
                            disabled={rowBusy}
                            onClick={() => {
                              setRenaming(null);
                              setRowError("");
                            }}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            className="h-11"
                            disabled={!canEdit || rowBusy}
                            onClick={() => {
                              setRenaming({
                                id: preset.id,
                                name: preset.name,
                                description: preset.description ?? "",
                              });
                              setRowError("");
                            }}
                            aria-label={`Rename ${preset.name}`}
                          >
                            <Pencil aria-hidden="true" /> Rename
                          </Button>
                          {confirmDelete === preset.id ? (
                            <>
                              <Button
                                variant="danger"
                                className="h-11"
                                disabled={rowBusy}
                                onClick={() => void remove(preset)}
                              >
                                Delete preset
                              </Button>
                              <Button
                                variant="ghost"
                                className="h-11"
                                disabled={rowBusy}
                                onClick={() => setConfirmDelete(null)}
                              >
                                Keep
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="ghost"
                              className="h-11 text-ink-muted hover:text-danger"
                              disabled={!canEdit || rowBusy}
                              onClick={() => {
                                setConfirmDelete(preset.id);
                                setRowError("");
                              }}
                              aria-label={`Delete ${preset.name}`}
                            >
                              <Trash2 aria-hidden="true" /> Delete
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                    {confirmDelete === preset.id && renaming?.id !== preset.id && (
                      <p className="hint m-0 sm:col-span-2">
                        An event that already copied “{preset.name}” keeps its own settings.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {rowError && (
              <p className="notice bad m-0" role="alert">
                {rowError}
              </p>
            )}
            {brokenPresets.length > 0 && (
              <div className="notice warn m-0" role="note">
                <p className="m-0 text-[13px]">
                  <b>These presets cannot be applied until they are corrected:</b>
                </p>
                <ul className="plain m-0 mt-1 grid gap-1 text-[13px]">
                  {brokenPresets.map((preset) => (
                    <li key={preset.name}>
                      {preset.name}: {preset.problems.join(" ")}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!canEdit && !demoMode && (
              <p className="hint m-0" role="note">
                Only the owner or an organizer can save, rename or delete a preset. Everyone at the
                club can read the list.
              </p>
            )}
          </div>
        </div>
      )}
    </SectionCard>
  );
}
