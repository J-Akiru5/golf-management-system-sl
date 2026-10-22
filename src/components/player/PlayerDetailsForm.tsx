"use client";

import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import type { PlayerRecord } from "@/lib/data/types";

export interface PlayerDetailsPatch {
  firstName: string;
  lastName: string;
  nickname: string | null;
  birthdate: string | null;
  gender: "M" | "F" | null;
  homeCourse: string | null;
  contactNumber: string | null;
  email: string | null;
  ngapId: string | null;
  whsId: string | null;
}

/**
 * The editable identity fields of one player. Membership is saved through its own guarded function so
 * the club never ends up with two active membership rows for the same player.
 */
export function PlayerDetailsForm({
  player,
  canEdit,
  onSave,
  onSaveMembership,
}: {
  player: PlayerRecord;
  canEdit: boolean;
  onSave: (patch: PlayerDetailsPatch) => void;
  onSaveMembership: (type: "member" | "guest", memberNumber: string | null) => Promise<void>;
}) {
  const [first, setFirst] = useState(player.firstName);
  const [last, setLast] = useState(player.lastName);
  const [nickname, setNickname] = useState(player.nickname ?? "");
  const [birthdate, setBirthdate] = useState(player.birthdate ?? "");
  const [gender, setGender] = useState<"" | "M" | "F">(player.gender ?? "");
  const [homeCourse, setHomeCourse] = useState(player.homeCourse ?? "");
  const [contact, setContact] = useState(player.contactNumber ?? "");
  const [email, setEmail] = useState(player.email ?? "");
  const [ngapId, setNgapId] = useState(player.ngapId ?? "");
  const [whsId, setWhsId] = useState(player.whsId ?? "");
  const [membership, setMembership] = useState<"" | "member" | "guest">(
    player.membershipType ?? "",
  );
  const [memberNumber, setMemberNumber] = useState(player.memberNumber ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  if (!canEdit) {
    return (
      <p className="muted text-[14px]">
        Only an owner or organizer can edit player details. Ask a club administrator for changes.
      </p>
    );
  }

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!first.trim() || !last.trim()) {
      setError("First and last name are required.");
      return;
    }
    setBusy(true);
    try {
      onSave({
        firstName: first.trim(),
        lastName: last.trim(),
        nickname: nickname.trim() || null,
        birthdate: birthdate || null,
        gender: gender || null,
        homeCourse: homeCourse.trim() || null,
        contactNumber: contact.trim() || null,
        email: email.trim() || null,
        ngapId: ngapId.trim() || null,
        whsId: whsId.trim() || null,
      });
      if (membership) {
        try {
          await onSaveMembership(membership, membership === "member" ? memberNumber : null);
        } catch (err) {
          setError(
            `Player details saved, but the membership was not changed: ${
              err instanceof Error ? err.message : "unknown error"
            }`,
          );
          return;
        }
      }
      setMessage("Player details saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the player details.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="grid gap-4" onSubmit={save}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="field">
          <span>First name</span>
          <input value={first} onChange={(e) => setFirst(e.target.value)} required />
        </label>
        <label className="field">
          <span>Last name</span>
          <input value={last} onChange={(e) => setLast(e.target.value)} required />
        </label>
        <label className="field">
          <span>Nickname</span>
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} />
        </label>
        <label className="field">
          <span>Birthdate</span>
          <input type="date" value={birthdate} onChange={(e) => setBirthdate(e.target.value)} />
        </label>
        <label className="field">
          <span>Gender</span>
          <select value={gender} onChange={(e) => setGender(e.target.value as "" | "M" | "F")}>
            <option value="">Not recorded</option>
            <option value="F">Female</option>
            <option value="M">Male</option>
          </select>
        </label>
        <label className="field">
          <span>Home course</span>
          <input value={homeCourse} onChange={(e) => setHomeCourse(e.target.value)} />
        </label>
        <label className="field">
          <span>Contact number</span>
          <input value={contact} onChange={(e) => setContact(e.target.value)} inputMode="tel" />
        </label>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            inputMode="email"
          />
        </label>
        <label className="field">
          <span>NGAP ID</span>
          <input value={ngapId} onChange={(e) => setNgapId(e.target.value)} />
        </label>
        <label className="field">
          <span>WHS / Golf ID</span>
          <input value={whsId} onChange={(e) => setWhsId(e.target.value)} />
        </label>
        <label className="field">
          <span>Membership</span>
          <select
            value={membership}
            onChange={(e) => setMembership(e.target.value as "" | "member" | "guest")}
          >
            <option value="">Not recorded</option>
            <option value="member">Member</option>
            <option value="guest">Guest</option>
          </select>
        </label>
        {membership === "member" && (
          <label className="field">
            <span>Member number</span>
            <input value={memberNumber} onChange={(e) => setMemberNumber(e.target.value)} />
          </label>
        )}
      </div>
      {error && (
        <p className="hint !text-danger" role="alert">
          {error}
        </p>
      )}
      {message && <p className="hint !text-fairway">{message}</p>}
      <div>
        <Button type="submit" variant="primary" size="sm" disabled={busy}>
          {busy ? "Saving…" : "Save details"}
        </Button>
      </div>
    </form>
  );
}
