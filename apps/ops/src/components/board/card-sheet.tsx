"use client";

import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { formatDate } from "@/lib/board/format";
import type { BoardCard, BoardMember, BoardTournament } from "@/lib/board/repo";
import type { CardFormValues } from "@/lib/board/validation";
import { PIPELINE_STAGES, PRICING_MODELS } from "@/lib/db/constants";

/**
 * The card detail sheet. Every field the database has is editable here, except the ones the
 * database owns (creator and timestamps). The parent gives this a key per card, so the uncontrolled
 * fields start from the right values.
 */
export function CardSheet({
  card,
  canDelete,
  members,
  tournaments,
  onClose,
  onSave,
  onDelete,
}: {
  card: BoardCard;
  canDelete: boolean;
  members: readonly BoardMember[];
  tournaments: readonly BoardTournament[];
  onClose: () => void;
  onSave: (id: string, values: CardFormValues) => Promise<string | null>;
  onDelete: (id: string) => Promise<string | null>;
}) {
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = saving || deleting;
  const tournamentVisible = tournaments.some((entry) => entry.id === card.tournament_id);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values: CardFormValues = {
      title: String(form.get("title") ?? ""),
      clubName: String(form.get("clubName") ?? ""),
      stage: String(form.get("stage") ?? ""),
      ownerId: String(form.get("ownerId") ?? ""),
      startDate: String(form.get("startDate") ?? ""),
      endDate: String(form.get("endDate") ?? ""),
      expectedPlayers: String(form.get("expectedPlayers") ?? ""),
      pricingModel: String(form.get("pricingModel") ?? ""),
      quotedAmount: String(form.get("quotedAmount") ?? ""),
      currency: String(form.get("currency") ?? ""),
      notes: String(form.get("notes") ?? ""),
      tournamentId: String(form.get("tournamentId") ?? ""),
    };

    setSaving(true);
    setError(null);
    const message = await onSave(card.id, values);
    setSaving(false);
    if (message !== null) setError(message);
  }

  async function remove() {
    setDeleting(true);
    setError(null);
    const message = await onDelete(card.id);
    setDeleting(false);
    if (message !== null) setError(message);
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <SheetContent title="Card details" description={card.club_name}>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div>
            <Label htmlFor="card-title" className="mb-1 block">
              Title
            </Label>
            <Input
              id="card-title"
              name="title"
              defaultValue={card.title}
              maxLength={160}
              required
              autoComplete="off"
            />
          </div>

          <div>
            <Label htmlFor="card-club" className="mb-1 block">
              Club
            </Label>
            <Input
              id="card-club"
              name="clubName"
              defaultValue={card.club_name}
              maxLength={160}
              required
              autoComplete="off"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="card-stage" className="mb-1 block">
                Stage
              </Label>
              <Select id="card-stage" name="stage" defaultValue={card.stage}>
                {PIPELINE_STAGES.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.label}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor="card-owner" className="mb-1 block">
                Owner
              </Label>
              <Select id="card-owner" name="ownerId" defaultValue={card.owner_id ?? ""}>
                <option value="">Unassigned</option>
                {members.map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.display_name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor="card-start" className="mb-1 block">
                Start date
              </Label>
              <Input
                id="card-start"
                name="startDate"
                type="date"
                defaultValue={card.start_date ?? ""}
              />
            </div>

            <div>
              <Label htmlFor="card-end" className="mb-1 block">
                End date
              </Label>
              <Input id="card-end" name="endDate" type="date" defaultValue={card.end_date ?? ""} />
            </div>

            <div>
              <Label htmlFor="card-players" className="mb-1 block">
                Expected players
              </Label>
              <Input
                id="card-players"
                name="expectedPlayers"
                type="number"
                inputMode="numeric"
                min={0}
                max={5000}
                step={1}
                defaultValue={card.expected_players ?? ""}
              />
            </div>

            <div>
              <Label htmlFor="card-pricing" className="mb-1 block">
                Pricing model
              </Label>
              <Select id="card-pricing" name="pricingModel" defaultValue={card.pricing_model ?? ""}>
                <option value="">Not set</option>
                {PRICING_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor="card-amount" className="mb-1 block">
                Quoted amount
              </Label>
              <Input
                id="card-amount"
                name="quotedAmount"
                inputMode="decimal"
                defaultValue={card.quoted_amount ?? ""}
                placeholder="0.00"
                autoComplete="off"
              />
            </div>

            <div>
              <Label htmlFor="card-currency" className="mb-1 block">
                Currency
              </Label>
              <Input
                id="card-currency"
                name="currency"
                defaultValue={card.currency}
                maxLength={3}
                required
                autoComplete="off"
                className="uppercase"
              />
            </div>
          </div>

          {tournaments.length === 0 ? null : (
            <div>
              <Label htmlFor="card-tournament" className="mb-1 block">
                Linked tournament
              </Label>
              <Select
                id="card-tournament"
                name="tournamentId"
                defaultValue={card.tournament_id ?? ""}
              >
                <option value="">No tournament</option>
                {!tournamentVisible && card.tournament_id !== null ? (
                  <option value={card.tournament_id}>Linked tournament (not visible)</option>
                ) : null}
                {tournaments.map((tournament) => (
                  <option key={tournament.id} value={tournament.id}>
                    {tournament.name}
                    {tournament.play_date === null
                      ? ""
                      : ` (${formatDate(tournament.play_date) ?? ""})`}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div>
            <Label htmlFor="card-notes" className="mb-1 block">
              Notes
            </Label>
            <Textarea
              id="card-notes"
              name="notes"
              defaultValue={card.notes ?? ""}
              rows={4}
              maxLength={20000}
            />
          </div>

          {error === null ? null : (
            <p
              role="alert"
              className="rounded-md border border-danger px-3 py-2 text-sm text-danger"
            >
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <Button type="submit" variant="primary" disabled={busy}>
              {saving ? "Saving" : "Save changes"}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>

            {canDelete ? (
              <div className="ml-auto flex items-center gap-2">
                {confirmDelete ? (
                  <>
                    <Button type="button" variant="danger" onClick={remove} disabled={busy}>
                      {deleting ? "Deleting" : "Delete"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setConfirmDelete(false)}
                      disabled={busy}
                    >
                      Keep
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-danger"
                    onClick={() => setConfirmDelete(true)}
                    disabled={busy}
                  >
                    Delete card
                  </Button>
                )}
              </div>
            ) : null}
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
