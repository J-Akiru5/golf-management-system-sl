"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { markHelpSeen, welcomeId } from "@/lib/help/seen";
import { useI18n } from "@/lib/i18n/context";
import { isLocale, LOCALE_COOKIE, type Locale } from "@/lib/i18n/locales";
import { type ChecklistState, toggleChecklist } from "@/lib/onboarding/checklist";
import { detectInstallPlatform, type InstallPlatform } from "@/lib/onboarding/install";
import {
  clampStep,
  isLastStep,
  nextStep,
  previousStep,
  stepAt,
  stepsFor,
} from "@/lib/onboarding/steps";
import {
  readChecklist,
  readProgress,
  saveProgress,
  scopeKey,
  writeChecklist,
} from "@/lib/onboarding/storage";
import type { OnboardingRole } from "@/lib/onboarding/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { OnboardingSheet, type SpotlightRect } from "./OnboardingSheet";
import styles from "./onboarding.module.css";
import { PlayerTour } from "./PlayerTour";
import { StaffTour } from "./StaffTour";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const HOME: Record<OnboardingRole, string> = {
  player: "/my",
  staff: "/staff",
};

/**
 * Where each anchor lives today, before the screens that own it add `data-onboard`. The data
 * attribute still wins; these selectors only keep the coach marks useful in the meantime. A missing
 * control is not an error, the step becomes a plain panel.
 */
const SELECTOR_FALLBACKS: Record<string, string[]> = {
  "staff-day-pills": ['[role="group"][aria-label="Playing day"]'],
  "staff-arrivals": ['section[aria-label="Arrivals"]'],
  "staff-arrive": ["[data-arrived]", "[aria-label^='Mark ']"],
  "staff-next-up": ['a[href^="/staff/schedule/"]', '[data-testid="staff-bar-schedule"]'],
  "staff-jump-now": ["[data-jump-now]", '[aria-label*="now" i]'],
  "staff-score": ['a[href^="/staff/score"]', 'a[href*="tab=scan"]'],
};

function findAnchor(name: string): Element | null {
  const named = document.querySelector(`[data-onboard="${name}"]`);
  if (named) return named;
  for (const selector of SELECTOR_FALLBACKS[name] ?? []) {
    const found = document.querySelector(selector);
    if (found) return found;
  }
  return null;
}

/** The longest the welcome waits for the page to hydrate. Past this it opens anyway. */
const HYDRATION_WAIT_MS = 3000;

function hasReactFiber(element: Element): boolean {
  for (const key of Object.keys(element)) {
    if (key.startsWith("__reactFiber$")) return true;
  }
  return false;
}

/**
 * True once React has attached to the top-level nodes of the page content. The player and staff
 * layouts render the page inside `<main>`, behind its loading skeleton, so those nodes hydrate after
 * the layout does. A page with no `<main>` has nothing to wait for.
 */
function pageContentHydrated(): boolean {
  const main = document.querySelector("main");
  if (!main) return true;
  return Array.from(main.children)
    .filter((node) => !["SCRIPT", "STYLE", "TEMPLATE"].includes(node.tagName))
    .every(hasReactFiber);
}

/**
 * Runs `run` once the page content has hydrated, and returns a way to cancel it.
 *
 * Radix marks everything outside its dialog aria-hidden while it is open. On the player home that
 * mutation used to land on nodes React had not hydrated yet, because the page streams in behind
 * its loading skeleton, and React then reported an attribute mismatch on the hero. The window `load`
 * event is not enough (it fires before that hydration), and opening in a transition did not change
 * the order, so this checks the nodes themselves, giving up after 3s so a failed check only delays
 * the welcome. A client navigation has no hydration left to wait for, so it opens at once.
 */
function whenPageSettled(run: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  let cancelled = false;
  let timer = 0;
  const started = window.performance.now();
  const check = () => {
    if (cancelled) return;
    const loaded = window.document.readyState === "complete";
    if (
      (loaded && pageContentHydrated()) ||
      window.performance.now() - started > HYDRATION_WAIT_MS
    ) {
      run();
      return;
    }
    timer = window.setTimeout(check, 50);
  };
  timer = window.setTimeout(check, 0);
  return () => {
    cancelled = true;
    window.clearTimeout(timer);
  };
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * The first-run gate.
 *
 * It reads the stored progress once on the client (localStorage always; the signed-in user's id
 * scopes it when Supabase has a session), then opens on the role's home screen only when that person
 * has not finished before. `?onboarding=1` replays it from the start for a demo.
 *
 * Closing with Escape, the close button or the backdrop keeps the current step, so a reload resumes
 * where the person stopped. "Skip" and the final action mark it seen and stop it from opening again.
 */
export function OnboardingGate({
  role,
  userId,
}: {
  role: OnboardingRole;
  /** Pass the signed-in user id when the screen already knows it. */
  userId?: string;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const steps = stepsFor(role);
  const home = HOME[role];

  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [seen, setSeen] = useState(false);
  const [scopeUser, setScopeUser] = useState<string | undefined>(userId);
  const [checklist, setChecklist] = useState<ChecklistState>({});
  const [pendingLocale, setPendingLocale] = useState<Locale | null>(null);
  const [platform, setPlatform] = useState<InstallPlatform>("other");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);
  const dismissed = useRef(false);
  // True while the first-load open is waiting for the page to settle. The "arrived later" effect
  // below must not open the sheet in that window, or it skips the wait and Radix's aria-hidden lands
  // on nodes React has not hydrated yet.
  const settling = useRef(false);

  // One read of who this is plus what they have already seen. A build with no Supabase project has
  // no user id, which is exactly right for the demo and for a borrowed phone.
  useEffect(() => {
    let alive = true;
    let cancelOpen: (() => void) | null = null;
    const boot = async () => {
      // The older help welcome says less than this tour. Mark it seen before the help panel reads
      // its storage, so two first-run panels never stack on the same screen.
      if (role === "player") {
        void markHelpSeen(null, welcomeId("player"));
      }
      let uid = userId;
      if (!uid && isSupabaseConfigured()) {
        try {
          const client = createSupabaseBrowserClient();
          const { data } = await client.auth.getUser();
          uid = data.user?.id;
        } catch {
          // A failed session read is not an error here: the browser scope still works.
        }
      }
      if (!alive) return;
      setScopeUser(uid);
      const stored = readProgress(role, uid);
      setSeen(stored.seen);
      setChecklist(readChecklist(scopeKey(role, uid)));
      const replay = new URLSearchParams(window.location.search).get("onboarding") === "1";
      const openWhenSettled = () => {
        settling.current = true;
        const cancel = whenPageSettled(() => {
          settling.current = false;
          if (alive) setOpen(true);
        });
        cancelOpen = () => {
          settling.current = false;
          cancel();
        };
      };
      if (replay) {
        setStep(0);
        openWhenSettled();
      } else if (!stored.seen && window.location.pathname === home) {
        setStep(clampStep(role, stored.step));
        openWhenSettled();
      }
      setReady(true);
    };
    void boot();
    return () => {
      alive = false;
      cancelOpen?.();
    };
  }, [role, userId, home]);

  // Arriving at the home screen later in the same visit still gets the welcome, unless the person
  // closed it on this screen or finished it.
  useEffect(() => {
    if (!ready || open || dismissed.current || settling.current) return;
    if (pathname !== home) return;
    const stored = readProgress(role, scopeUser);
    if (stored.seen) {
      setSeen(true);
      return;
    }
    setStep(clampStep(role, stored.step));
    setOpen(true);
  }, [pathname, ready, open, role, scopeUser, home]);

  // Remember the step while it is open. Seen is written only by skip/finish, so a reload resumes.
  useEffect(() => {
    if (!ready || !open) return;
    const stored = readProgress(role, scopeUser);
    saveProgress(role, scopeUser, {
      seen: stored.seen,
      step,
      updatedAt: new Date().toISOString(),
    });
  }, [ready, open, step, role, scopeUser]);

  // Detection and install capture for the player's last step.
  useEffect(() => {
    if (role !== "player") return;
    setPlatform(
      detectInstallPlatform({
        userAgent: window.navigator.userAgent,
        standalone:
          window.matchMedia("(display-mode: standalone)").matches ||
          (window.navigator as Navigator & { standalone?: boolean }).standalone === true,
        iPadDesktop:
          window.navigator.maxTouchPoints > 1 && /macintosh/i.test(window.navigator.userAgent),
      }),
    );
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [role]);

  // Coach marks: find the control another stream marks with data-onboard, scroll it into view and
  // ring it. A missing anchor is not an error; the step becomes a plain panel.
  const current = stepAt(role, step);
  const anchor = current?.anchor ?? "";
  const fallbacks = current?.anchorFallbacks?.join("|") ?? "";
  useEffect(() => {
    if (!open || role !== "staff" || !anchor) {
      setSpotlight(null);
      return;
    }
    const names = [anchor, ...(fallbacks ? fallbacks.split("|") : [])].filter(Boolean);
    let element: Element | null = null;
    for (const name of names) {
      element = findAnchor(name);
      if (element) break;
    }
    if (!element) {
      setSpotlight(null);
      return;
    }
    const target = element;
    try {
      target.scrollIntoView({
        block: "center",
        inline: "nearest",
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
    } catch {
      // Older browsers: the ring still draws where the control is now.
    }
    const measure = () => {
      const rect = target.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      setSpotlight({
        top: Math.max(6, rect.top - 8),
        left: Math.max(6, rect.left - 8),
        width: Math.min(window.innerWidth - 12, rect.width + 16),
        height: rect.height + 16,
      });
    };
    measure();
    const first = window.setTimeout(measure, 140);
    const second = window.setTimeout(measure, 420);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearTimeout(first);
      window.clearTimeout(second);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, role, anchor, fallbacks]);

  const markSeen = () => {
    setSeen(true);
    saveProgress(role, scopeUser, {
      seen: true,
      step: 0,
      updatedAt: new Date().toISOString(),
    });
    dismissed.current = true;
    setOpen(false);
  };

  const dismiss = () => {
    dismissed.current = true;
    setOpen(false);
  };

  const advance = () => {
    if (isLastStep(role, step)) {
      markSeen();
      return;
    }
    setStep(nextStep(role, step));
  };

  const goBack = () => setStep(previousStep(role, step));

  const chooseLocale = (code: Locale) => {
    if (!isLocale(code)) return;
    setPendingLocale(code);
    try {
      document.cookie = `${LOCALE_COOKIE}=${code}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      // A browser that refuses cookies still gets the labels for this sheet; the rest of the app
      // stays on the language the server rendered.
    }
    router.refresh();
  };

  const install = async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
    } catch {
      // The platform can reject a prompt that is no longer valid; the hint still explains the steps.
    } finally {
      setDeferred(null);
    }
  };

  const findEntry = () => {
    markSeen();
    if (pathname !== "/my") {
      router.push("/my");
      return;
    }
    window.setTimeout(() => {
      const target = document.querySelector('[data-help="my-claim"], [data-onboard="claim"]');
      target?.scrollIntoView({
        block: "start",
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
    }, 220);
  };

  const navigate = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const toggleItem = (id: string) => {
    const next = toggleChecklist(checklist, id);
    setChecklist(next);
    writeChecklist(scopeKey(role, scopeUser), next);
  };

  if (!ready) return null;

  const last = isLastStep(role, step);
  const findStep = role === "player" && current?.kind === "find";
  const installStep = role === "player" && current?.kind === "install";
  const place: "top" | "bottom" =
    spotlight &&
    typeof window !== "undefined" &&
    spotlight.top + spotlight.height / 2 > window.innerHeight * 0.55
      ? "top"
      : "bottom";
  const primaryLabel = findStep
    ? t("onboard.player.find.skip")
    : installStep
      ? t("onboard.player.install.notNow")
      : last
        ? t("onboard.common.done")
        : t("onboard.common.next");

  return (
    <>
      <OnboardingSheet
        open={open}
        onOpenChange={(next) => {
          if (!next) dismiss();
        }}
        tone={role}
        title={current ? t(current.titleKey) : t("common.close")}
        description={current ? t(current.bodyKey) : ""}
        descriptionVisible={role !== "staff"}
        stepLabel={t("onboard.common.step", { current: step + 1, total: steps.length })}
        closeLabel={t("onboard.common.close")}
        step={step}
        stepCount={steps.length}
        spotlight={spotlight}
        place={place}
        footer={
          <>
            <button type="button" className={styles.textBtn} onClick={markSeen}>
              {t("onboard.common.skip")}
            </button>
            <span className={styles.spacer} />
            {step > 0 && (
              <button type="button" className={styles.ghostBtn} onClick={goBack}>
                {t("onboard.common.back")}
              </button>
            )}
            <button
              type="button"
              className={
                findStep || (installStep && deferred !== null && !installed)
                  ? styles.ghostBtn
                  : styles.primaryBtn
              }
              onClick={advance}
            >
              {primaryLabel}
            </button>
          </>
        }
      >
        {role === "player" ? (
          <PlayerTour
            step={step}
            locale={locale}
            pendingLocale={pendingLocale}
            onChooseLocale={chooseLocale}
            onFindEntry={findEntry}
            platform={platform}
            canInstall={deferred !== null}
            installed={installed}
            onInstall={() => void install()}
          />
        ) : (
          <StaffTour
            step={step}
            checklist={checklist}
            onToggleChecklist={toggleItem}
            onNavigate={navigate}
          />
        )}
      </OnboardingSheet>

      {seen && !open && pathname === home && (
        <div className={styles.replayRow} data-role={role}>
          <button
            type="button"
            className={styles.replay}
            onClick={() => {
              setStep(0);
              dismissed.current = false;
              setOpen(true);
            }}
          >
            {t("onboard.common.replay")}
          </button>
        </div>
      )}
    </>
  );
}
