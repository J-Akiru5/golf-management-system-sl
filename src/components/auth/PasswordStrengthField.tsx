"use client";

import { useId, useState } from "react";
import { MIN_PASSWORD_LENGTH, passwordStrength } from "@/lib/auth/password-strength";

/**
 * A password field with a live strength meter.
 *
 * The meter is advice, not a gate: the server decides whether a password is acceptable, because a
 * rule enforced only in the browser is not a rule. What this does is tell the person, while they are
 * typing, whether the password they have chosen is going to be refused and why.
 */
export function PasswordStrengthField({
  name = "password",
  label = "Password",
  autoComplete = "new-password",
}: {
  name?: string;
  label?: string;
  autoComplete?: string;
}) {
  const [value, setValue] = useState("");
  const [shown, setShown] = useState(false);
  const id = useId();
  const meterId = `${id}-meter`;
  const strength = passwordStrength(value);
  const touched = value.length > 0;

  const tone =
    strength.score >= 4
      ? "bg-[#2f7d5b]"
      : strength.score === 3
        ? "bg-[#4f9469]"
        : strength.score === 2
          ? "bg-[#b89550]"
          : "bg-[#a4462f]";

  return (
    <div className="grid gap-2">
      <label className="field">
        <span>{label}</span>
        <span className="password-field">
          <input
            id={id}
            name={name}
            type={shown ? "text" : "password"}
            autoComplete={autoComplete}
            required
            minLength={MIN_PASSWORD_LENGTH}
            aria-describedby={meterId}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <button
            type="button"
            className="password-toggle"
            onClick={() => setShown((current) => !current)}
            aria-pressed={shown}
          >
            {shown ? "Hide" : "Show"}
          </button>
        </span>
      </label>

      <div id={meterId} aria-live="polite" className="grid gap-1.5">
        <div className="flex items-center gap-2">
          <span className="grid flex-1 grid-cols-4 gap-1" aria-hidden="true">
            {[1, 2, 3, 4].map((segment) => (
              <span
                key={segment}
                className={`h-1.5 rounded-full ${
                  touched && strength.score >= segment ? tone : "bg-black/10"
                }`}
              />
            ))}
          </span>
          <span className="text-[12px] font-semibold text-muted tabular-nums">
            {touched ? strength.label : `At least ${MIN_PASSWORD_LENGTH} characters`}
          </span>
        </div>
        <p className="hint m-0">
          {touched
            ? strength.advice
            : "Length matters more than symbols. A short phrase works well."}
        </p>
      </div>
    </div>
  );
}
