"use client";

import { useRef, useState } from "react";
import {
  CONCERN_KINDS,
  CONCERN_LABELS,
  CONCERN_TEXT_MAX,
  type ConcernKind,
  HOLE_MAX,
  HOLE_MIN,
  TEE_COLOUR_LABELS,
  TEE_COLOURS,
  type TeeColour,
} from "@/lib/data/concerns";
import {
  FEEDBACK_CONCERN_CATEGORY,
  FEEDBACK_CONTACT_EMAIL_MAX,
  FEEDBACK_HONEYPOT_FIELD,
  FEEDBACK_MESSAGE_MAX,
  type FeedbackProblem,
  normalizeFeedbackTournamentId,
  normalizePagePath,
  validateFeedback,
} from "@/lib/data/feedback";
import { type FeedbackSubmitCode, submitFeedback } from "@/lib/data/supabase/feedback";
import { addDemoFeedback } from "@/lib/demo/feedback";
import { useI18n } from "@/lib/i18n/context";
import type { TranslationKey } from "@/lib/i18n/t";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/** Which control a problem belongs beside. */
type Field = "concerns" | "hole" | "tee" | "other" | "message" | "contact" | "consent";

const PROBLEM_FIELD: Record<FeedbackProblem, Field> = {
  category: "concerns",
  noConcern: "concerns",
  unknownConcern: "concerns",
  badSource: "concerns",
  badTranscript: "concerns",
  pagePathInvalid: "concerns",
  locale: "concerns",
  holeRequired: "hole",
  holeOutOfRange: "hole",
  teeRequired: "tee",
  teeUnknown: "tee",
  otherRequired: "other",
  concernTooLong: "other",
  messageRequired: "message",
  messageTooShort: "message",
  messageTooLong: "message",
  contactNameTooLong: "contact",
  contactEmailInvalid: "contact",
  consentRequired: "consent",
};

/**
 * The problems in plain words. The list is the same vocabulary the database answers with, so the
 * form and the function cannot describe the same refusal in two different ways.
 */
const PROBLEM_TEXT: Record<FeedbackProblem, string> = {
  category: "Choose what your note is about.",
  noConcern: "Tick at least one concern.",
  unknownConcern: "One of the ticked concerns is not on the list. Reload the page and try again.",
  badSource: "The note did not say where it came from. Reload the page and try again.",
  badTranscript: "The conversation could not be read. Reload the page and try again.",
  pagePathInvalid: "The page address is not valid. Reload the page and try again.",
  locale: "Choose a language.",
  holeRequired: "Enter the hole number.",
  holeOutOfRange: "Enter a hole number from 1 to 18.",
  teeRequired: "Choose the tee colour.",
  teeUnknown: "Choose Blue, Silver, White or Red.",
  otherRequired: "Write what the other concern is.",
  concernTooLong: "Keep each answer to 200 characters or fewer.",
  messageRequired: "Write your message.",
  messageTooShort: "Write a little more so the organizer can understand it.",
  messageTooLong: "Keep the message to 2000 characters or fewer.",
  contactNameTooLong: "Keep the name to 120 characters or fewer.",
  contactEmailInvalid: "That email address looks incomplete. Check it and try again.",
  consentRequired: "Tick the box if the club may contact you, or remove your email address.",
};

/** The refusal codes this page can describe itself, in the same words as the field problems. */
const SERVER_TEXT: Partial<Record<FeedbackSubmitCode, string>> = {
  no_concern: "Tick at least one concern.",
  unknown_concern: "One of the ticked concerns is not on the list. Reload the page and try again.",
  hole_required: "Enter the hole number.",
  hole_out_of_range: "Enter a hole number from 1 to 18.",
  tee_required: "Choose the tee colour.",
  tee_unknown: "Choose Blue, Silver, White or Red.",
  other_required: "Write what the other concern is.",
  too_long: "Keep each answer to 200 characters or fewer.",
  bad_source: "The note did not say where it came from. Reload the page and try again.",
  bad_transcript: "The conversation could not be read. Reload the page and try again.",
  contact_email_required: "Enter an email address so the club can reply.",
};

const RESULT_KEYS: Partial<Record<FeedbackSubmitCode, TranslationKey>> = {
  accepted: "feedback.success",
  invalid_category: "feedback.errorCategory",
  message_required: "feedback.errorMessageRequired",
  message_too_short: "feedback.errorMessageShort",
  message_too_long: "feedback.errorMessageLong",
  contact_name_too_long: "feedback.errorContactName",
  contact_email_invalid: "feedback.errorContactEmail",
  consent_required: "feedback.errorConsent",
  invalid_page: "feedback.errorPage",
  invalid_locale: "feedback.errorLocale",
  invalid_event: "feedback.errorEvent",
  rate_limited: "feedback.rateLimited",
  not_configured: "feedback.notReady",
  not_ready: "feedback.notReady",
  error: "feedback.failed",
};

/**
 * The public concerns form.
 *
 * The organizer's major concerns are tick boxes, not a drop-down, because most players at the desk
 * are seniors. Three kinds ask one follow-up question: Score asks for the hole, Tee off asks for the
 * tee colour as radios, Others asks for a line. The rest of the form is the player's own name,
 * handicap and schedule, an optional message and an optional contact address.
 *
 * Validation is `normaliseConcern` through `validateFeedback`, the same rules the database function
 * applies, so a note this form accepts is a note `submit_feedback` accepts. The hidden honeypot field
 * is off-screen and out of the tab order; a bot that fills it gets the ordinary success and nothing
 * is sent.
 */
export function FeedbackForm({
  sourcePath = null,
  tournamentId = null,
}: {
  sourcePath?: string | null;
  tournamentId?: string | null;
}) {
  const { t, locale } = useI18n();
  // The page validated the query parameter; normalise again so this component cannot pass a
  // malformed value if it is used from another page later.
  const eventId = normalizeFeedbackTournamentId(tournamentId);
  const [concerns, setConcerns] = useState<ConcernKind[]>([]);
  const [holeNo, setHoleNo] = useState("");
  const [teeColour, setTeeColour] = useState<TeeColour | "">("");
  const [otherText, setOtherText] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [handicap, setHandicap] = useState("");
  const [schedule, setSchedule] = useState("");
  const [message, setMessage] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactConsent, setContactConsent] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<FeedbackProblem | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const configured = isSupabaseConfigured();

  const ticksScore = concerns.includes("score");
  const ticksTeeOff = concerns.includes("tee_off");
  const ticksOther = concerns.includes("other");

  function show(tone: "ok" | "bad", text: string) {
    setNotice({ tone, text });
    // The live region announces the change. Moving the focus there puts a screen reader on the
    // sentence instead of leaving it on a button that is now disabled.
    window.requestAnimationFrame(() => noticeRef.current?.focus());
  }

  function clearProblem() {
    if (problem) setProblem(null);
  }

  function toggleConcern(kind: ConcernKind, on: boolean) {
    // Kept in the organizer's list order, not the order the player happened to tick them.
    setConcerns((current) =>
      CONCERN_KINDS.filter((entry) => (entry === kind ? on : current.includes(entry))),
    );
    clearProblem();
  }

  function resetAnswers() {
    setConcerns([]);
    setHoleNo("");
    setTeeColour("");
    setOtherText("");
    setPlayerName("");
    setHandicap("");
    setSchedule("");
    setMessage("");
    setContactEmail("");
    setContactConsent(false);
    setHoneypot("");
  }

  function fieldError(field: Field) {
    if (!problem || PROBLEM_FIELD[problem] !== field) return null;
    // The notice at the end of the form announces the same sentence once; this line puts it next to
    // the control that needs fixing without opening a second live region.
    return <p className="hint m-0">{PROBLEM_TEXT[problem]}</p>;
  }

  /** The concern the form would send, checked by `normaliseConcern` on the way in. */
  function draftDetails() {
    return {
      concerns,
      holeNo: ticksScore && holeNo.trim() !== "" ? holeNo.trim() : undefined,
      teeColour: ticksTeeOff && teeColour !== "" ? teeColour : undefined,
      otherText: ticksOther ? otherText : undefined,
      playerName,
      handicap,
      schedule,
      source: "form" as const,
    };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const validation = validateFeedback({
      category: FEEDBACK_CONCERN_CATEGORY,
      message,
      contactName: "",
      contactEmail,
      contactConsent,
      pagePath: sourcePath,
      locale,
      honeypot,
      details: draftDetails(),
    });

    if (!validation.ok) {
      setProblem(validation.error);
      show("bad", PROBLEM_TEXT[validation.error]);
      return;
    }

    setProblem(null);

    if (validation.kind === "honeypot") {
      show("ok", t("feedback.success"));
      return;
    }

    // The page path is context, never a person: the server strips a query string and refuses
    // anything that is not a single absolute path.
    const pagePath =
      sourcePath ??
      (typeof window === "undefined" ? null : normalizePagePath(window.location.pathname));

    if (!configured) {
      // The local preview has no database. Keep the same validation and the same success state,
      // then hand the note to the shared demo inbox so the whole loop can be reviewed.
      addDemoFeedback({ ...validation.value, pagePath }, undefined, eventId);
      show("ok", t("feedback.demoSuccess"));
      resetAnswers();
      return;
    }

    setBusy(true);
    try {
      const result = await submitFeedback(createSupabaseBrowserClient(), {
        ...validation.value,
        pagePath,
        honeypot,
        tournamentId: eventId,
      });
      if (result.ok) {
        show("ok", t("feedback.success"));
        resetAnswers();
      } else {
        const key = RESULT_KEYS[result.code];
        show("bad", SERVER_TEXT[result.code] ?? (key ? t(key) : t("feedback.failed")));
      }
    } catch {
      show("bad", t("feedback.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="tl-pub-card grid gap-5" onSubmit={submit} noValidate>
      <p className="hint m-0" role="note">
        {t("feedback.privacy")}
      </p>

      {!configured && (
        <p className="hint m-0" role="status">
          {t("feedback.demo")}
        </p>
      )}

      <fieldset className="tl-field border-0 p-0">
        <legend className="tl-concern-legend">What is your concern? Tick all that apply</legend>
        <p className="hint m-0">You can tick more than one.</p>
        <div className="tl-check-grid">
          {CONCERN_KINDS.map((kind) => (
            <div className="tl-concern-item" key={kind}>
              <label className="tl-check-option">
                <input
                  className="tl-check-control"
                  type="checkbox"
                  checked={concerns.includes(kind)}
                  onChange={(e) => toggleConcern(kind, e.target.checked)}
                  aria-invalid={problem !== null && PROBLEM_FIELD[problem] === "concerns"}
                />
                <span>{CONCERN_LABELS[kind]}</span>
              </label>
              {kind === "score" && ticksScore && (
                <div className="tl-reveal-field tl-field">
                  <label htmlFor="feedback-hole">Hole no.</label>
                  <input
                    id="feedback-hole"
                    className="tl-input"
                    type="number"
                    inputMode="numeric"
                    min={HOLE_MIN}
                    max={HOLE_MAX}
                    step={1}
                    value={holeNo}
                    onChange={(e) => {
                      setHoleNo(e.target.value);
                      clearProblem();
                    }}
                    aria-invalid={problem === "holeRequired" || problem === "holeOutOfRange"}
                  />
                  {fieldError("hole")}
                </div>
              )}
              {kind === "tee_off" && ticksTeeOff && (
                <fieldset className="tl-reveal-field tl-field border-0 p-0">
                  <legend>Tee colour</legend>
                  <div className="tl-radio-grid">
                    {TEE_COLOURS.map((colour) => (
                      <label className="tl-radio-option" key={colour}>
                        <input
                          className="tl-radio-control"
                          type="radio"
                          name="teeColour"
                          value={colour}
                          checked={teeColour === colour}
                          onChange={() => {
                            setTeeColour(colour);
                            clearProblem();
                          }}
                          aria-invalid={problem === "teeRequired" || problem === "teeUnknown"}
                        />
                        <span>{TEE_COLOUR_LABELS[colour]}</span>
                      </label>
                    ))}
                  </div>
                  {fieldError("tee")}
                </fieldset>
              )}
              {kind === "other" && ticksOther && (
                <div className="tl-reveal-field tl-field">
                  <label htmlFor="feedback-other">What is the other concern?</label>
                  <input
                    id="feedback-other"
                    className="tl-input"
                    type="text"
                    maxLength={CONCERN_TEXT_MAX}
                    value={otherText}
                    onChange={(e) => {
                      setOtherText(e.target.value);
                      clearProblem();
                    }}
                    aria-invalid={problem === "otherRequired" || problem === "concernTooLong"}
                  />
                  {fieldError("other")}
                </div>
              )}
            </div>
          ))}
        </div>
        {fieldError("concerns")}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="tl-field">
          <label htmlFor="feedback-player-name">Your name</label>
          <input
            id="feedback-player-name"
            className="tl-input"
            type="text"
            maxLength={CONCERN_TEXT_MAX}
            autoComplete="name"
            value={playerName}
            onChange={(e) => {
              setPlayerName(e.target.value);
              clearProblem();
            }}
          />
        </div>
        <div className="tl-field">
          <label htmlFor="feedback-handicap">Handicap</label>
          <input
            id="feedback-handicap"
            className="tl-input"
            type="text"
            maxLength={CONCERN_TEXT_MAX}
            value={handicap}
            onChange={(e) => {
              setHandicap(e.target.value);
              clearProblem();
            }}
          />
        </div>
        <div className="tl-field">
          <label htmlFor="feedback-schedule">Schedule (day and tee time)</label>
          <input
            id="feedback-schedule"
            className="tl-input"
            type="text"
            maxLength={CONCERN_TEXT_MAX}
            value={schedule}
            onChange={(e) => {
              setSchedule(e.target.value);
              clearProblem();
            }}
          />
        </div>
      </div>

      <div className="tl-field">
        <label htmlFor="feedback-message">Anything else? (optional)</label>
        <textarea
          id="feedback-message"
          className="tl-input"
          rows={5}
          maxLength={FEEDBACK_MESSAGE_MAX}
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            clearProblem();
          }}
          aria-invalid={
            problem === "messageRequired" ||
            problem === "messageTooShort" ||
            problem === "messageTooLong"
          }
          aria-describedby="feedback-message-hint"
        />
        <span id="feedback-message-hint" className="hint">
          {t("feedback.messageHint", { max: FEEDBACK_MESSAGE_MAX })}
        </span>
        {fieldError("message")}
      </div>

      <div className="tl-field">
        <label htmlFor="feedback-contact-email">Your email, for a reply (optional)</label>
        <input
          id="feedback-contact-email"
          className="tl-input"
          type="email"
          maxLength={FEEDBACK_CONTACT_EMAIL_MAX}
          autoComplete="email"
          value={contactEmail}
          onChange={(e) => {
            setContactEmail(e.target.value);
            clearProblem();
          }}
          aria-invalid={problem === "contactEmailInvalid" || problem === "consentRequired"}
        />
        {fieldError("contact")}
      </div>

      <div className="tl-field">
        <label className="tl-check-option">
          <input
            className="tl-check-control"
            type="checkbox"
            checked={contactConsent}
            onChange={(e) => {
              setContactConsent(e.target.checked);
              clearProblem();
            }}
            aria-invalid={problem === "consentRequired"}
          />
          <span>{t("feedback.consent")}</span>
        </label>
        <p className="hint m-0">{t("feedback.contactHint")}</p>
        {fieldError("consent")}
      </div>

      {/*
        The honeypot. A person never sees it, never tabs into it, and a screen reader skips it. A bot
        that fills every input is answered with the ordinary success and no row is written.
      */}
      <div
        aria-hidden="true"
        style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}
      >
        <label>
          {FEEDBACK_HONEYPOT_FIELD}
          <input
            type="text"
            name={FEEDBACK_HONEYPOT_FIELD}
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </label>
      </div>

      {notice && (
        <p
          ref={noticeRef}
          tabIndex={-1}
          className={notice.tone === "ok" ? "notice m-0" : "notice bad m-0"}
          role={notice.tone === "ok" ? "status" : "alert"}
        >
          {notice.text}
        </p>
      )}

      <div className="row">
        <button type="submit" className="btn gold" disabled={busy}>
          {busy ? t("feedback.sending") : t("feedback.send")}
        </button>
      </div>
    </form>
  );
}
