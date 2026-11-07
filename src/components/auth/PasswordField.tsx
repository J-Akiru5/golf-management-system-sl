"use client";

import { useState } from "react";

/**
 * A password input with a Show/Hide control. The button sits outside the label so pressing it never
 * activates the field, and `aria-controls` ties it to the input it changes.
 *
 * The toggle keeps the 44px target the auth stylesheet gives `.password-toggle`. Other pages can
 * hand in their own words; the defaults stay English so nothing that does not pass them changes.
 */
export function PasswordField({
  id,
  name,
  label,
  autoComplete,
  minLength,
  hint,
  enterKeyHint,
  showLabel = "Show",
  hideLabel = "Hide",
}: {
  id: string;
  name: string;
  label: string;
  autoComplete?: string;
  minLength?: number;
  hint?: string;
  enterKeyHint?: "go" | "next" | "done";
  showLabel?: string;
  hideLabel?: string;
}) {
  const [visible, setVisible] = useState(false);
  const action = visible ? hideLabel : showLabel;

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="password-field">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint={enterKeyHint}
          minLength={minLength}
          required
          className="scroll-mb-24"
          data-testid={`${id}-input`}
        />
        <button
          type="button"
          className="password-toggle"
          aria-controls={id}
          aria-pressed={visible}
          aria-label={`${action} ${label.toLowerCase()}`}
          onClick={() => setVisible((current) => !current)}
          data-testid={`${id}-toggle`}
        >
          {action}
        </button>
      </div>
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}
