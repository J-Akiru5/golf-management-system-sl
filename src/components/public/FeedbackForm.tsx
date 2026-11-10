"use client";

import { useRef, useState } from "react";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_KEYS,
  FEEDBACK_CONTACT_EMAIL_MAX,
  FEEDBACK_CONTACT_NAME_MAX,
  FEEDBACK_HONEYPOT_FIELD,
  FEEDBACK_MESSAGE_MAX,
  type FeedbackProblem,
  normalizePagePath,
  validateFeedback,
} from "@/lib/data/feedback";
import { type FeedbackSubmitCode, submitFeedback } from "@/lib/data/supabase/feedback";
import { addDemoFeedback } from "@/lib/demo/feedback";
import { useI18n } from "@/lib/i18n/context";
import type { TranslationKey } from "@/lib/i18n/t";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

const PROBLEM_KEYS: Record<FeedbackProblem, TranslationKey> = {
  category: "feedback.errorCategory",
  messageRequired: "feedback.errorMessageRequired",
  messageTooShort: "feedback.errorMessageShort",
  messageTooLong: "feedback.errorMessageLong",
  contactNameTooLong: "feedback.errorContactName",
  contactEmailInvalid: "feedback.errorContactEmail",
  consentRequired: "feedback.errorConsent",
  pagePathInvalid: "feedback.errorPage",
  locale: "feedback.errorLocale",
};

const RESULT_KEYS: Record<FeedbackSubmitCode, TranslationKey> = {
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
  rate_limited: "feedback.rateLimited",
  not_configured: "feedback.notReady",
  not_ready: "feedback.notReady",
  error: "feedback.failed",
};

/**
 * The public feedback form.
 *
 * It validates with the same pure rules the database function uses, sends the note through
 * `submit_feedback`, and shows only a short success or refusal. The visitor's name and email are
 * optional; the form refuses to send them without the consent tick, so contact details never reach
 * the inbox by accident.
 *
 * The hidden honeypot field is off-screen and out of the tab order. If a bot fills it, the client
 * shows the normal success and nothing is sent.
 */
export function FeedbackForm({ sourcePath = null }: { sourcePath?: string | null }) {
  const { t, locale } = useI18n();
  const [category, setCategory] = useState("improvement");
  const [message, setMessage] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactConsent, setContactConsent] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<FeedbackProblem | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const configured = isSupabaseConfigured();

  function show(tone: "ok" | "bad", text: string) {
    setNotice({ tone, text });
    // The live region announces the change. Moving the focus there puts a screen reader on the
    // sentence instead of leaving it on a button that is now disabled.
    window.requestAnimationFrame(() => noticeRef.current?.focus());
  }

  function clearProblem() {
    if (problem) setProblem(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const validation = validateFeedback({
      category,
      message,
      contactName,
      contactEmail,
      contactConsent,
      pagePath: sourcePath,
      locale,
      honeypot,
    });

    if (!validation.ok) {
      setProblem(validation.error);
      show("bad", t(PROBLEM_KEYS[validation.error]));
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
      addDemoFeedback({ ...validation.value, pagePath });
      show("ok", t("feedback.demoSuccess"));
      setMessage("");
      setContactName("");
      setContactEmail("");
      setContactConsent(false);
      setHoneypot("");
      return;
    }

    setBusy(true);
    try {
      const result = await submitFeedback(createSupabaseBrowserClient(), {
        ...validation.value,
        pagePath,
        honeypot,
      });
      show(result.ok ? "ok" : "bad", t(result.ok ? "feedback.success" : RESULT_KEYS[result.code]));
      if (result.ok) {
        setMessage("");
        setContactName("");
        setContactEmail("");
        setContactConsent(false);
        setHoneypot("");
      }
    } catch {
      show("bad", t("feedback.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card grid gap-4" onSubmit={submit} noValidate>
      <p className="notice m-0" role="note">
        {t("feedback.privacy")}
      </p>

      {!configured && (
        <p className="notice warn m-0" role="status">
          {t("feedback.demo")}
        </p>
      )}

      <label className="field">
        <span>{t("feedback.category")}</span>
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            clearProblem();
          }}
          required
          aria-invalid={problem === "category"}
        >
          {FEEDBACK_CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {t(FEEDBACK_CATEGORY_KEYS[value])}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>{t("feedback.message")}</span>
        <textarea
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            clearProblem();
          }}
          rows={6}
          maxLength={FEEDBACK_MESSAGE_MAX}
          placeholder={t("feedback.messagePlaceholder")}
          required
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
      </label>

      <div className="form-grid">
        <label className="field">
          <span>{t("feedback.contactName")}</span>
          <input
            type="text"
            value={contactName}
            onChange={(e) => {
              setContactName(e.target.value);
              clearProblem();
            }}
            maxLength={FEEDBACK_CONTACT_NAME_MAX}
            autoComplete="name"
            aria-invalid={problem === "contactNameTooLong"}
          />
        </label>
        <label className="field">
          <span>{t("feedback.contactEmail")}</span>
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => {
              setContactEmail(e.target.value);
              clearProblem();
            }}
            maxLength={FEEDBACK_CONTACT_EMAIL_MAX}
            autoComplete="email"
            aria-invalid={problem === "contactEmailInvalid" || problem === "consentRequired"}
          />
        </label>
      </div>

      <label className="check">
        <input
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
