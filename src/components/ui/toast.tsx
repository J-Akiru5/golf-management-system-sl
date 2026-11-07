"use client";

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
import { cn } from "@/lib/ui/cn";

/**
 * Short confirmations for what just happened, shown in one place so no screen has to invent its
 * own. The store pushes a toast after every draw action, which is why the desk can say "nothing
 * moved" when a re-run proposes exactly what was already on the board.
 *
 * A screen outside the provider still works: `useToast` hands back a no-op instead of throwing, so
 * a missing provider can never break a page.
 */
export type ToastTone = "ok" | "info" | "bad";

export interface ToastInput {
  title: string;
  detail?: string;
  tone?: ToastTone;
}

interface Toast extends Required<Omit<ToastInput, "tone">> {
  id: number;
  tone: ToastTone;
}

export interface ToastApi {
  push: (toast: ToastInput) => void;
}

const noop: ToastApi = { push: () => undefined };
const Ctx = createContext<ToastApi>(noop);

/** How long a toast stays. A failure stays long enough to read. */
const LIFETIME_MS: Record<ToastTone, number> = { ok: 4500, info: 4500, bad: 9000 };
/** At most this many on screen; the oldest goes first. */
const MAX_VISIBLE = 3;

const TONE: Record<ToastTone, string> = {
  ok: "border-[rgba(123,191,138,.55)] text-[#eef0ea]",
  info: "border-[rgba(215,181,104,.5)] text-[#eef0ea]",
  bad: "border-[rgba(255,123,112,.6)] text-[#eef0ea]",
};

const DOT: Record<ToastTone, string> = {
  ok: "bg-[#7bbf8a]",
  info: "bg-[#d7b568]",
  bad: "bg-[#ff7b70]",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (toast: ToastInput) => {
      const id = ++seq.current;
      const tone = toast.tone ?? "info";
      setItems((list) => [
        ...list.slice(-(MAX_VISIBLE - 1)),
        { id, tone, title: toast.title, detail: toast.detail ?? "" },
      ]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), LIFETIME_MS[tone]),
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
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[90] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              "pointer-events-auto flex w-full max-w-[min(360px,100%)] items-start gap-2.5 rounded-xl border bg-[rgba(14,22,18,.94)] px-3.5 py-2.5 shadow-lift backdrop-blur-[10px]",
              TONE[t.tone],
            )}
          >
            <span
              className={cn("mt-[6px] size-1.5 shrink-0 rounded-full", DOT[t.tone])}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
              <b className="block text-[13px] leading-[18px] font-semibold">{t.title}</b>
              {t.detail && (
                <span className="mt-0.5 block text-[12px] leading-[17px] text-[#c9d3cc]">
                  {t.detail}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="-my-2 -mr-2 grid size-11 shrink-0 place-items-center rounded-md text-[15px] leading-5 text-[#c9d3cc] hover:text-[#eef0ea]"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
