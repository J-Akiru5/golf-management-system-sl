"use client";

import { useRef, useState } from "react";
import {
  FEEDBACK_CONTACT_EMAIL_MAX,
  FEEDBACK_CONTACT_NAME_MAX,
  FEEDBACK_HONEYPOT_FIELD,
  FEEDBACK_MESSAGE_MAX,
  isValidFeedbackEmail,
} from "@/lib/data/feedback";
import { submitFeedback } from "@/lib/data/supabase/feedback";
import { addDemoFeedback } from "@/lib/demo/feedback";
import { useI18n } from "@/lib/i18n/context";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

const SUCCESS = "Thank you. We will be in touch about a demo.";
const FAILED = "The request could not be sent. Check your connection and try again.";

/**
 * The demo request form.
 *
 * It sends one note through the same public path as the feedback form, with the category `demo`.
 * The note lands in the organizer's private inbox; the visitor never sees a stored row. The name,
 * club and email are required because the point of the request is a reply. Role, phone and the
 * message are optional.
 *
 * The hidden honeypot field is off-screen and out of the tab order. If a bot fills it, the form
 * shows the normal thank-you and nothing is sent.
 */
export function DemoRequestForm() {
  const { locale } = useI18n();
  const [name, setName] = useState("");
  const [club, setClub] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const configured = isSupabaseConfigured();

  function show(tone: "ok" | "bad", text: string) {
    setNotice({ tone, text });
    window.requestAnimationFrame(() => noticeRef.current?.focus());
  }

  function clear() {
    setName("");
    setClub("");
    setRole("");
    setEmail("");
    setPhone("");
    setMessage("");
    setConsent(false);
    setHoneypot("");
  }

  function problem(): string | null {
    if (name.trim() === "") return "Enter your name.";
    if (club.trim() === "") return "Enter your club.";
    if (!isValidFeedbackEmail(email)) return "Enter an email address so the club can reply.";
    if (!consent) return "Tick the box so the club may contact you.";
    if (message.length > FEEDBACK_MESSAGE_MAX) {
      return `Keep the message to ${FEEDBACK_MESSAGE_MAX} characters or fewer.`;
    }
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    // A filled honeypot is a bot. Answer exactly like a real request and send nothing.
    if (honeypot.trim() !== "") {
      show("ok", SUCCESS);
      return;
    }

    const invalid = problem();
    if (invalid) {
      show("bad", invalid);
      return;
    }

    // The contact fields are separate for the inbox; the club, role and phone are plain lines in
    // the note so the organizer reads one message rather than hunting through fields.
    const lines = [`Club: ${club.trim()}`];
    if (role.trim() !== "") lines.push(`Role: ${role.trim()}`);
    if (phone.trim() !== "") lines.push(`Phone: ${phone.trim()}`);
    const body =
      message.trim() === "" ? lines.join("\n") : `${lines.join("\n")}\n\n${message.trim()}`;

    const submission = {
      category: "demo" as const,
      message: body,
      contactName: name.trim(),
      contactEmail: email.trim().toLowerCase(),
      contactConsent: true,
      pagePath: "/demo",
      locale,
    };

    if (!configured) {
      // The local preview has no database. Keep the same shape and let the shared demo inbox show
      // the request, rather than pretending it reached the live organizer.
      addDemoFeedback(submission);
      show("ok", SUCCESS);
      clear();
      return;
    }

    setBusy(true);
    try {
      const result = await submitFeedback(createSupabaseBrowserClient(), {
        ...submission,
        honeypot,
      });
      show(result.ok ? "ok" : "bad", result.ok ? SUCCESS : result.message || FAILED);
      if (result.ok) clear();
    } catch {
      show("bad", FAILED);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card grid gap-4" onSubmit={submit} noValidate>
      <p className="notice m-0" role="note">
        Your details go to the club's private desk. They are not shown on this site.
      </p>

      {!configured && (
        <p className="notice warn m-0" role="status">
          This preview has no database, so the request is kept in this browser only.
        </p>
      )}

      <div className="form-grid">
        <label className="field">
          <span>Your name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={FEEDBACK_CONTACT_NAME_MAX}
            autoComplete="name"
            required
          />
        </label>
        <label className="field">
          <span>Club</span>
          <input
            type="text"
            value={club}
            onChange={(e) => setClub(e.target.value)}
            autoComplete="organization"
            required
          />
        </label>
      </div>

      <div className="form-grid">
        <label className="field">
          <span>Role (optional)</span>
          <input
            type="text"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            autoComplete="organization-title"
          />
        </label>
        <label className="field">
          <span>Phone (optional)</span>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
          />
        </label>
      </div>

      <label className="field">
        <span>Email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={FEEDBACK_CONTACT_EMAIL_MAX}
          autoComplete="email"
          required
        />
        <span className="hint">The club replies to this address.</span>
      </label>

      <label className="field">
        <span>Message (optional)</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          maxLength={FEEDBACK_MESSAGE_MAX}
          placeholder="What would you like to see?"
        />
      </label>

      <label className="check">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>The club may contact me about a demo.</span>
      </label>

      {/*
        The honeypot. A person never sees it, never tabs into it, and a screen reader skips it. A bot
        that fills every input is answered with the ordinary thank-you and no row is written.
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
          {busy ? "Sending…" : "Request a demo"}
        </button>
      </div>
    </form>
  );
}
