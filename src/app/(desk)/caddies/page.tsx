"use client";

import { Contact, Mail, Pencil, Phone, Plus, Power, Search, Trash2 } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { RoleGate } from "@/components/desk";
import { PageHeader, SectionCard } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { Caddie } from "@/lib/data/types";
import { useDesk } from "@/lib/store/desk-store";

interface CaddieDraft {
  id?: string;
  fullName: string;
  nickname: string;
  phone: string;
  email: string;
  notes: string;
  active: boolean;
}

const EMPTY: CaddieDraft = {
  fullName: "",
  nickname: "",
  phone: "",
  email: "",
  notes: "",
  active: true,
};

/** Club caddie directory. A caddie is a person, not a login account. */
export default function CaddiesPage() {
  const { caddies, adapters, member } = useDesk();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CaddieDraft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canManage = !member || member.role === "owner" || member.role === "organizer";

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...caddies]
      .filter(
        (caddie) =>
          !q ||
          caddie.fullName.toLowerCase().includes(q) ||
          (caddie.nickname ?? "").toLowerCase().includes(q) ||
          (caddie.phone ?? "").toLowerCase().includes(q),
      )
      .sort((a, b) => Number(b.active) - Number(a.active) || a.fullName.localeCompare(b.fullName));
  }, [caddies, query]);

  const startAdd = () => {
    setDraft(EMPTY);
    setError("");
    setOpen(true);
  };

  const startEdit = (caddie: Caddie) => {
    setDraft({
      id: caddie.id,
      fullName: caddie.fullName,
      nickname: caddie.nickname ?? "",
      phone: caddie.phone ?? "",
      email: caddie.email ?? "",
      notes: caddie.notes ?? "",
      active: caddie.active,
    });
    setError("");
    setOpen(true);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!canManage || busy) return;
    if (!draft.fullName.trim()) {
      setError("A caddie needs a name.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (draft.id) {
        await adapters.caddies.update(draft.id, {
          fullName: draft.fullName.trim(),
          nickname: draft.nickname.trim() || null,
          phone: draft.phone.trim() || null,
          email: draft.email.trim() || null,
          notes: draft.notes.trim() || null,
          active: draft.active,
        });
      } else {
        const created = adapters.caddies.add({
          fullName: draft.fullName.trim(),
          nickname: draft.nickname.trim() || null,
          phone: draft.phone.trim() || null,
          email: draft.email.trim() || null,
          notes: draft.notes.trim() || null,
        });
        // Wait for the row: closing on the queued write would claim a save that may still fail.
        await created.saved;
      }
      setOpen(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not save the caddie. The sheet keeps what you typed.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6">
      <PageHeader overline="Club people" title="Caddies">
        Caddie profiles live here. Assign a caddie to a player&apos;s day on the Tee times screen,
        so the assignment survives every draw re-run.
      </PageHeader>

      <SectionCard id="caddie-directory" icon={<Contact />} title="Caddie directory">
        <div className="row">
          <label className="field grow">
            <span className="sr">Search caddies</span>
            <span className="relative block">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or phone"
                className="w-full pl-9"
              />
            </span>
          </label>
          <RoleGate role={member?.role} allow={["owner", "organizer"]} mode="hide">
            <Button variant="primary" onClick={startAdd}>
              <Plus aria-hidden="true" /> Add caddie
            </Button>
          </RoleGate>
        </div>

        {rows.length === 0 ? (
          <div className="notice" role="status">
            {caddies.length === 0
              ? "No caddies yet. Add the club's caddies before assigning them to players."
              : "No caddie matches that search."}
          </div>
        ) : (
          <div className="table-wrap !shadow-none">
            <table>
              <thead>
                <tr>
                  <th>Caddie</th>
                  <th>Contact</th>
                  <th>Status</th>
                  <th>Notes</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((caddie) => (
                  <tr key={caddie.id}>
                    <td>
                      <b>{caddie.fullName}</b>
                      {caddie.nickname && <span className="muted"> · {caddie.nickname}</span>}
                    </td>
                    <td>
                      <span className="grid gap-0.5 text-[13px]">
                        {caddie.phone ? (
                          <span className="flex items-center gap-1.5">
                            <Phone className="size-3.5" aria-hidden="true" /> {caddie.phone}
                          </span>
                        ) : (
                          <span className="muted">No phone</span>
                        )}
                        {caddie.email && (
                          <span className="flex items-center gap-1.5">
                            <Mail className="size-3.5" aria-hidden="true" /> {caddie.email}
                          </span>
                        )}
                      </span>
                    </td>
                    <td>
                      <span className={`pill ${caddie.active ? "ok" : "bad"}`}>
                        {caddie.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="max-w-[260px] truncate text-[13px] text-ink-muted">
                      {caddie.notes ?? "—"}
                    </td>
                    <td>
                      <RoleGate role={member?.role} allow={["owner", "organizer"]} mode="hide">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <Button variant="ghost" size="sm" onClick={() => startEdit(caddie)}>
                            <Pencil aria-hidden="true" /> Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              try {
                                adapters.caddies.update(caddie.id, { active: !caddie.active });
                              } catch (err) {
                                setError(
                                  err instanceof Error
                                    ? err.message
                                    : "Could not change the caddie status.",
                                );
                              }
                            }}
                          >
                            <Power aria-hidden="true" /> {caddie.active ? "Deactivate" : "Activate"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (!window.confirm(`Remove ${caddie.fullName}?`)) return;
                              try {
                                adapters.caddies.remove(caddie.id);
                              } catch (err) {
                                setError(
                                  err instanceof Error
                                    ? err.message
                                    : "Could not remove the caddie.",
                                );
                              }
                            }}
                          >
                            <Trash2 aria-hidden="true" /> Remove
                          </Button>
                        </span>
                      </RoleGate>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {error && (
          <p className="hint !text-danger" role="alert">
            {error}
          </p>
        )}
      </SectionCard>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          title={draft.id ? "Edit caddie" : "Add caddie"}
          description="Club people only. Caddies do not sign in and cannot see player data."
          className="w-[min(520px,calc(100vw-24px))] sm:p-5"
        >
          <form className="grid gap-4" onSubmit={save}>
            <label className="field">
              <span>Full name (required)</span>
              <input
                value={draft.fullName}
                onChange={(e) => setDraft({ ...draft, fullName: e.target.value })}
                required
              />
            </label>
            <label className="field">
              <span>Nickname</span>
              <input
                value={draft.nickname}
                onChange={(e) => setDraft({ ...draft, nickname: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Phone</span>
              <input
                type="tel"
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Notes</span>
              <textarea
                rows={3}
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </label>
            {draft.id && (
              <label className="check text-[13px]">
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
                />
                <span>Active and available for assignment</span>
              </label>
            )}
            {error && (
              <p className="hint !text-danger" role="alert">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={busy}>
                {busy ? "Saving…" : error ? "Try save again" : "Save caddie"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
