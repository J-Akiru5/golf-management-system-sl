"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { type ContactFormState, saveContact } from "@/app/(player)/my/profile/actions";
import { useI18n } from "@/lib/i18n/context";

/**
 * The starting state of the contact form. It lives here rather than beside the action because a
 * `"use server"` module may only export async functions.
 */
export const EMPTY_CONTACT_STATE: ContactFormState = {
  status: "idle",
  message: "",
  values: { phone: "", email: "", nickname: "" },
  errors: {},
};

type Field = "phone" | "email" | "nickname";

/**
 * Phone, contact email and the nickname on boards: the three things a player may change themselves.
 *
 * The inputs are controlled so a failed save returns exactly what was typed, and the successful
 * answer is copied back so the form shows the trimmed values the club now holds.
 */
export function ContactForm({
  current,
  readOnly = false,
}: {
  current: { phone: string; email: string; nickname: string };
  readOnly?: boolean;
}) {
  const { t } = useI18n();
  const [state, formAction, pending] = useActionState(saveContact, EMPTY_CONTACT_STATE);

  const [phone, setPhone] = useState(current.phone);
  const [email, setEmail] = useState(current.email);
  const [nickname, setNickname] = useState(current.nickname);

  const uid = useId().replace(/:/g, "");
  const hintId = (field: Field) => `${uid}-${field}-hint`;
  const errorId = (field: Field) => `${uid}-${field}-error`;
  const describedBy = (field: Field) =>
    state.errors[field] ? `${hintId(field)} ${errorId(field)}` : hintId(field);

  useEffect(() => {
    if (state.status !== "saved") return;
    setPhone(state.values.phone);
    setEmail(state.values.email);
    setNickname(state.values.nickname);
  }, [state]);

  return (
    <form action={formAction} className="pf-form">
      <label className="field">
        <span>{t("profile.contact.phone")}</span>
        <input
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          enterKeyHint="next"
          maxLength={24}
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          readOnly={readOnly}
          aria-invalid={state.errors.phone ? true : undefined}
          aria-describedby={describedBy("phone")}
        />
        <span className="pf-hint" id={hintId("phone")}>
          {t("profile.contact.phoneHint")}
        </span>
        {state.errors.phone && (
          <span className="pf-error" id={errorId("phone")} role="alert">
            {state.errors.phone}
          </span>
        )}
      </label>

      <label className="field">
        <span>{t("profile.contact.email")}</span>
        <input
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="next"
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          readOnly={readOnly}
          aria-invalid={state.errors.email ? true : undefined}
          aria-describedby={describedBy("email")}
        />
        <span className="pf-hint" id={hintId("email")}>
          {t("profile.contact.emailHint")}
        </span>
        {state.errors.email && (
          <span className="pf-error" id={errorId("email")} role="alert">
            {state.errors.email}
          </span>
        )}
      </label>

      <label className="field">
        <span>
          {t("profile.contact.nickname")} ({t("profile.optional")})
        </span>
        <input
          name="nickname"
          type="text"
          autoComplete="nickname"
          enterKeyHint="done"
          maxLength={24}
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          readOnly={readOnly}
          aria-invalid={state.errors.nickname ? true : undefined}
          aria-describedby={describedBy("nickname")}
        />
        <span className="pf-hint" id={hintId("nickname")}>
          {t("profile.contact.nicknameHint")}
        </span>
        {state.errors.nickname && (
          <span className="pf-error" id={errorId("nickname")} role="alert">
            {state.errors.nickname}
          </span>
        )}
      </label>

      {(state.status === "saved" || state.status === "unchanged") && (
        <p className="pf-status" role="status">
          {state.message}
        </p>
      )}
      {(state.status === "error" || state.status === "unavailable") && (
        <p className="pf-status is-error" role="alert">
          {state.message}
        </p>
      )}

      {!readOnly && (
        <button type="submit" className="btn pf-save" disabled={pending}>
          {pending ? t("profile.contact.saving") : t("profile.contact.save")}
        </button>
      )}

      {readOnly && <p className="pf-hint">{t("profile.contact.readOnly")}</p>}
    </form>
  );
}
