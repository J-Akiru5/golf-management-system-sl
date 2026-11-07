"use client";

import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import type { ReactNode } from "react";
import styles from "./onboarding.module.css";

export interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * The onboarding surface: a bottom sheet on a phone and a small card on a wide screen.
 *
 * Radix Dialog is used for the focus trap, Escape, focus restore and the labelled heading. It is
 * modal on purpose: this is a guided step, not a reference panel, and the person should not tab into
 * a page behind it. The sheet only mounts on the client after the stored state is read, so the
 * server never renders an open dialog and React sees no hydration mismatch.
 */
export function OnboardingSheet({
  open,
  onOpenChange,
  tone,
  title,
  description,
  descriptionVisible = true,
  stepLabel,
  closeLabel,
  step,
  stepCount,
  spotlight,
  place,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tone: "player" | "staff";
  title: string;
  description: string;
  /** Staff steps carry their explanation in the body, so the header copy is only for readers. */
  descriptionVisible?: boolean;
  stepLabel: string;
  closeLabel: string;
  step: number;
  stepCount: number;
  spotlight: SpotlightRect | null;
  place: "top" | "bottom";
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange} modal>
      <Dialog.Portal>
        <Dialog.Overlay
          className={styles.overlay}
          data-hole={spotlight ? "true" : undefined}
          data-onboarding-overlay={tone}
        />
        {spotlight && (
          <div
            className={styles.spotlight}
            style={{
              top: spotlight.top,
              left: spotlight.left,
              width: spotlight.width,
              height: spotlight.height,
            }}
            aria-hidden="true"
            data-onboarding-spotlight="true"
          />
        )}
        <Dialog.Content
          className={styles.sheet}
          data-tone={tone}
          data-place={place}
          data-onboarding-sheet={tone}
          aria-describedby="onboarding-desc"
        >
          <div className={styles.handle} aria-hidden="true" />
          <div className={styles.head}>
            <div className={styles.headText}>
              <Dialog.Title className={styles.title}>{title}</Dialog.Title>
              <Dialog.Description
                id="onboarding-desc"
                className={descriptionVisible ? styles.desc : styles.srOnly}
              >
                {description}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" className={styles.close} aria-label={closeLabel}>
                <X size={20} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>

          <div className={styles.stepRow}>
            <div className={styles.progress} aria-hidden="true">
              {Array.from({ length: stepCount }, (_, index) => (
                <span
                  key={index}
                  className={styles.segment}
                  data-on={index <= step ? "true" : "false"}
                />
              ))}
            </div>
            <span className={styles.stepLabel}>{stepLabel}</span>
          </div>

          <div className={styles.body}>{children}</div>
          <div className={styles.srOnly} aria-live="polite">
            {stepLabel}. {title}
          </div>
          <div className={styles.footer}>{footer}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
