"use client";

import { Check, Info, Undo2, X } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import styles from "./staff.module.css";

export type StaffToastTone = "ok" | "info" | "bad";

export interface StaffToastInput {
  title: string;
  detail?: string;
  tone?: StaffToastTone;
  /** A reversible action, such as undoing an arrival. */
  actionLabel?: string;
  onAction?: () => void;
}

interface StaffToast extends StaffToastInput {
  id: number;
  tone: StaffToastTone;
}

interface StaffToastApi {
  push: (toast: StaffToastInput) => void;
}

const noop: StaffToastApi = { push: () => undefined };
const Ctx = createContext<StaffToastApi>(noop);

/** A toast with an action stays long enough to reach with a thumb. */
const LIFETIME: Record<StaffToastTone, number> = { ok: 5000, info: 5000, bad: 9000 };
const WITH_ACTION = 9000;
const MAX_VISIBLE = 2;

/**
 * Staff confirmations that sit above the tab bar instead of over it. The shared toast is anchored
 * to the bottom of the viewport, which on the staff app is exactly where the four destinations are,
 * so these screens use their own viewport with the safe-area and bar height built in.
 */
export function StaffToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<StaffToast[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setItems((list) => list.filter((item) => item.id !== id));
  }, []);

  const push = useCallback(
    (toast: StaffToastInput) => {
      const id = ++seq.current;
      const tone = toast.tone ?? "info";
      setItems((list) => [...list.slice(-(MAX_VISIBLE - 1)), { ...toast, id, tone }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), toast.onAction ? WITH_ACTION : LIFETIME[tone]),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const api = useMemo(() => ({ push }), [push]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className={styles.toastViewport} aria-live="polite" aria-atomic="false">
        {items.map((item) => (
          <div key={item.id} role="status" className={styles.toast} data-tone={item.tone}>
            <span className={styles.toastIcon} aria-hidden="true">
              {item.tone === "ok" ? (
                <Check size={18} />
              ) : item.tone === "bad" ? (
                <X size={18} />
              ) : (
                <Info size={18} />
              )}
            </span>
            <span className={styles.toastMain}>
              <b>{item.title}</b>
              {item.detail ? <span>{item.detail}</span> : null}
            </span>
            {item.actionLabel && item.onAction ? (
              <button
                type="button"
                className={styles.toastAction}
                onClick={() => {
                  item.onAction?.();
                  dismiss(item.id);
                }}
              >
                <Undo2 size={16} aria-hidden="true" />
                {item.actionLabel}
              </button>
            ) : (
              <button
                type="button"
                className={styles.toastClose}
                aria-label="Dismiss"
                onClick={() => dismiss(item.id)}
              >
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useStaffToast(): StaffToastApi {
  return useContext(Ctx);
}
