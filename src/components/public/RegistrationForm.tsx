"use client";

import { useState } from "react";
import type {
  RegistrationFormConfig,
  SubmissionAnswers,
  SubmissionPlayer,
} from "@/lib/data/supabase/public-registration";

/**
 * The public entry form. A player fills this in and the desk confirms the entry afterwards, so
 * there is no account, no payment online and no photo. Required fields are the ones a category
 * needs: name, date of birth and category.
 */
export function RegistrationForm({
  config,
  onSubmit,
}: {
  config: RegistrationFormConfig;
  onSubmit: (player: SubmissionPlayer, answers: SubmissionAnswers) => Promise<string>;
}) {
  const [name, setName] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [gender, setGender] = useState<"M" | "F" | "">("");
  const [ngapId, setNgapId] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [homeCourse, setHomeCourse] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "guest">("member");
  const [sponsor, setSponsor] = useState<boolean | null>(null);
  const [shirt, setShirt] = useState("");
  const [teePreferences, setTeePreferences] = useState<Record<string, string>>({});
  const [declaredWshId, setDeclaredWshId] = useState("");
  const [declaredWshHandicap, setDeclaredWshHandicap] = useState("");
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const applicable = config.fields.filter((f) => f.appliesTo === "both" || f.appliesTo === role);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const text = await onSubmit(
        {
          name: name.trim(),
          birthdate,
          gender: gender || "M",
          ngapId: ngapId.trim() || undefined,
          contactNumber: contactNumber.trim() || undefined,
          homeCourse: homeCourse.trim() || undefined,
          email: email.trim() || undefined,
        },
        {
          role,
          sponsor,
          shirt: shirt || null,
          teePreferences: Object.fromEntries(
            Object.entries(teePreferences).map(([day, value]) => [day, value || null]),
          ),
          declaredWshId: declaredWshId.trim() || null,
          declaredWshHandicap: declaredWshHandicap.trim() || null,
          extra,
        },
      );
      setMessage({ tone: "ok", text });
    } catch (error) {
      setMessage({
        tone: "bad",
        text: error instanceof Error ? error.message : "The entry could not be sent.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit} style={{ gap: "1rem" }}>
      {config.instructions && <div className="notice">{config.instructions}</div>}

      <div className="form-grid">
        <label className="field">
          <span>Full name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
          />
        </label>
        <label className="field">
          <span>Date of birth</span>
          <input
            type="date"
            value={birthdate}
            onChange={(e) => setBirthdate(e.target.value)}
            required
          />
          <span className="hint">Used for the age category on the day of play.</span>
        </label>
        <label className="field">
          <span>Category</span>
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value as "M" | "F" | "")}
            required
          >
            <option value="">Choose one</option>
            <option value="M">Male</option>
            <option value="F">Female</option>
          </select>
        </label>
        <label className="field">
          <span>NGAP number (optional)</span>
          <input value={ngapId} onChange={(e) => setNgapId(e.target.value)} inputMode="numeric" />
          <span className="hint">Speeds up matching to your club record.</span>
        </label>
        <label className="field">
          <span>Mobile number (optional)</span>
          <input value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} />
        </label>
        <label className="field">
          <span>Home course (optional)</span>
          <input value={homeCourse} onChange={(e) => setHomeCourse(e.target.value)} />
        </label>
        {config.shirtSizes.length > 0 && (
          <label className="field">
            <span>Shirt size (optional)</span>
            <select value={shirt} onChange={(e) => setShirt(e.target.value)}>
              <option value="">—</option>
              {config.shirtSizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          <span>Playing as</span>
          <select value={role} onChange={(e) => setRole(e.target.value as "member" | "guest")}>
            <option value="member">Member</option>
            <option value="guest">Guest</option>
          </select>
        </label>
      </div>

      {config.sponsorQuestion && (
        <fieldset className="field">
          <legend>{config.sponsorQuestion}</legend>
          <label className="check">
            <input
              type="radio"
              name="sponsor"
              checked={sponsor === true}
              onChange={() => setSponsor(true)}
            />
            <span>Yes</span>
          </label>
          <label className="check">
            <input
              type="radio"
              name="sponsor"
              checked={sponsor === false}
              onChange={() => setSponsor(false)}
            />
            <span>No</span>
          </label>
        </fieldset>
      )}

      {config.teeTimes.length > 0 && (
        <section className="stack" style={{ gap: ".5rem" }}>
          <h2>Preferred tee times</h2>
          {config.teeTimes.map((day) => (
            <label key={day.date || day.day} className="field">
              <span>
                {day.label || `Day ${day.day}`}
                {day.needsConfirmation ? " (to be confirmed)" : ""}
              </span>
              <select
                value={teePreferences[day.date] ?? ""}
                onChange={(e) =>
                  setTeePreferences((prev) => ({ ...prev, [day.date]: e.target.value }))
                }
              >
                <option value="">No preference</option>
                {day.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <p className="hint">A preference, not a confirmed start time.</p>
        </section>
      )}

      <div className="form-grid">
        <label className="field">
          <span>Declared handicap index (optional)</span>
          <input
            value={declaredWshHandicap}
            onChange={(e) => setDeclaredWshHandicap(e.target.value)}
            placeholder="14.2, +2.3 or NH"
          />
          <span className="hint">
            For information only. The official index comes from the club&rsquo;s NGAP export.
          </span>
        </label>
        <label className="field">
          <span>WSH ID (optional)</span>
          <input value={declaredWshId} onChange={(e) => setDeclaredWshId(e.target.value)} />
        </label>
        <label className="field">
          <span>Email (optional)</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
      </div>

      {applicable.length > 0 && (
        <section className="stack" style={{ gap: ".5rem" }}>
          <h2>Extra questions</h2>
          <div className="form-grid">
            {applicable.map((field) => (
              <label key={field.id} className="field">
                <span>
                  {field.label}
                  {field.required ? "" : " (optional)"}
                </span>
                {field.type === "select" ? (
                  <select
                    value={extra[field.id] ?? ""}
                    onChange={(e) => setExtra((p) => ({ ...p, [field.id]: e.target.value }))}
                  >
                    <option value="">—</option>
                    {field.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : field.type === "checkbox" ? (
                  <input
                    type="checkbox"
                    checked={extra[field.id] === "yes"}
                    onChange={(e) =>
                      setExtra((p) => ({ ...p, [field.id]: e.target.checked ? "yes" : "" }))
                    }
                  />
                ) : (
                  <input
                    type={field.type === "number" ? "number" : "text"}
                    value={extra[field.id] ?? ""}
                    onChange={(e) => setExtra((p) => ({ ...p, [field.id]: e.target.value }))}
                  />
                )}
                {field.help && <span className="hint">{field.help}</span>}
              </label>
            ))}
          </div>
        </section>
      )}

      {config.payment && (
        <div className="notice">
          <b>Entry fee</b>
          <p>
            {config.payment.method}
            {config.payment.bank ? ` · ${config.payment.bank}` : ""}
            {config.payment.accountName ? ` · ${config.payment.accountName}` : ""}
            {config.payment.accountNumber ? ` · ${config.payment.accountNumber}` : ""}
          </p>
          <p>{config.payment.note}</p>
          <p className="hint">Payment is recorded by the organizer. Nothing is charged here.</p>
        </div>
      )}

      {message && (
        <p className={message.tone === "ok" ? "notice" : "notice bad"} role="alert">
          {message.text}
        </p>
      )}

      <div className="row">
        <button type="submit" className="btn gold" disabled={busy}>
          {busy ? "Sending…" : "Send my entry"}
        </button>
      </div>
      <p className="hint">
        Your entry is reviewed by the organizer before it counts. You do not need an account.
      </p>
    </form>
  );
}
