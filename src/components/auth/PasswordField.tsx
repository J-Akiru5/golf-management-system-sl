"use client";

import { useState } from "react";

/**
 * A password input with a Show/Hide control. The button sits outside the label so pressing it never
 * activates the field, and `aria-controls` ties it to the input it changes.
 */
export function PasswordField({
  id,
  name,
  label,
  autoComplete,
  minLength,
  hint,
}: {
  id: string;
  name: string;
  label: string;
  autoComplete?: string;
  minLength?: number;
  hint?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="password-field">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          minLength={minLength}
          required
          data-testid={`${id}-input`}
        />
        <button
          type="button"
          className="password-toggle"
          aria-controls={id}
          aria-pressed={visible}
          aria-label={visible ? "Hide password" : "Show password"}
          onClick={() => setVisible((current) => !current)}
          data-testid={`${id}-toggle`}
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}
