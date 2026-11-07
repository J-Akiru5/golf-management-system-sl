"use client";

import { CalendarDays, ClipboardList, Flag, ListChecks, UserRound, Users } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import {
  CHECKLIST_ITEMS,
  type ChecklistState,
  checklistDone,
  checklistTotal,
} from "@/lib/onboarding/checklist";
import styles from "./onboarding.module.css";

/**
 * The staff first run. Five coach marks point at the controls a volunteer uses on the day, then a
 * short "before the first tee" checklist. Anchors are optional: another stream owns those screens,
 * so a missing anchor simply means the step is a plain panel rather than a pointing step.
 */
export function StaffTour({
  step,
  checklist,
  onToggleChecklist,
  onNavigate,
}: {
  step: number;
  checklist: ChecklistState;
  onToggleChecklist: (id: string) => void;
  onNavigate: (href: string) => void;
}) {
  const { t } = useI18n();

  if (step === 0) {
    return (
      <p className={styles.note}>
        <CalendarDays size={18} aria-hidden="true" style={{ verticalAlign: "-3px" }} />{" "}
        {t("onboard.staff.today.body")}
      </p>
    );
  }

  if (step === 1) {
    return (
      <>
        <p className={styles.note}>
          <Users size={18} aria-hidden="true" style={{ verticalAlign: "-3px" }} />{" "}
          {t("onboard.staff.players.body")}
        </p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.actionLink}
            onClick={() => onNavigate("/staff/players")}
          >
            {t("onboard.staff.players.action")}
          </button>
        </div>
      </>
    );
  }

  if (step === 2) {
    return (
      <>
        <p className={styles.note}>
          <Flag size={18} aria-hidden="true" style={{ verticalAlign: "-3px" }} />{" "}
          {t("onboard.staff.schedule.body")}
        </p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.actionLink}
            onClick={() => onNavigate("/staff/schedule")}
          >
            {t("onboard.staff.schedule.action")}
          </button>
        </div>
      </>
    );
  }

  if (step === 3) {
    return (
      <>
        <p className={styles.note}>
          <ClipboardList size={18} aria-hidden="true" style={{ verticalAlign: "-3px" }} />{" "}
          {t("onboard.staff.score.body")}
        </p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.actionLink}
            onClick={() => onNavigate("/staff/score")}
          >
            {t("onboard.staff.score.action")}
          </button>
        </div>
      </>
    );
  }

  if (step === 4) {
    return (
      <p className={styles.note}>
        <UserRound size={18} aria-hidden="true" style={{ verticalAlign: "-3px" }} />{" "}
        {t("onboard.staff.account.body")}
      </p>
    );
  }

  return (
    <>
      <div className={styles.checkCount}>
        <span>
          <ListChecks size={16} aria-hidden="true" style={{ verticalAlign: "-3px" }} />{" "}
          {t("onboard.staff.checklist.body")}
        </span>
        <span>
          {checklistDone(checklist)}/{checklistTotal()}
        </span>
      </div>
      <div className={styles.choices}>
        {CHECKLIST_ITEMS.map((item) => {
          const done = checklist[item.id] === true;
          return (
            <label key={item.id} className={styles.checkItem} data-done={done}>
              <input type="checkbox" checked={done} onChange={() => onToggleChecklist(item.id)} />
              <span>{t(item.key)}</span>
            </label>
          );
        })}
      </div>
    </>
  );
}
