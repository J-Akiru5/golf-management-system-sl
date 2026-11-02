"use client";

import { Download } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/context";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const DISMISS_KEY = "teeline-install-dismissed";
const DISMISS_MS = 30 * 24 * 60 * 60 * 1000;
const SKIP_PREFIXES = [
  "/enter",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/offline",
];

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iOS Safari is the one browser that installs through Share, not an install event. */
function isIosSafari(): boolean {
  const ua = window.navigator.userAgent;
  const ios =
    /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && window.navigator.maxTouchPoints > 1);
  const safari = /safari/i.test(ua) && !/crios|fxios|edgios|opios/i.test(ua);
  return ios && safari;
}

function dismissedRecently(): boolean {
  try {
    const at = Number(window.localStorage.getItem(DISMISS_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < DISMISS_MS;
  } catch {
    return false;
  }
}

/**
 * A small, dismissible install prompt for the player app. Android and other
 * Chromium browsers use the platform event; iOS Safari gets the Share steps.
 * It is deliberately not shown inside the entry form, auth screens or offline
 * page, where it would sit over the task the person came to do.
 */
export function InstallPrompt() {
  const { t } = useI18n();
  const pathname = usePathname();
  const skip = SKIP_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (skip || isStandalone() || dismissedRecently()) return;

    let timer: number | undefined;
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const onInstalled = () => {
      setVisible(false);
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if (isIosSafari()) {
      timer = window.setTimeout(() => setVisible(true), 6000);
    }
    return () => {
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [skip]);

  function dismiss() {
    setVisible(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // A blocked storage write only means the prompt can appear again.
    }
  }

  async function install() {
    if (!deferred) return;
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") setVisible(false);
    } catch {
      // The platform can reject a prompt that is no longer valid; hide it.
      setVisible(false);
    } finally {
      setDeferred(null);
    }
  }

  if (!visible) return null;

  return (
    <aside
      className="install-prompt"
      role="region"
      aria-label={t("install.title")}
      data-testid="install-prompt"
    >
      <span className="install-prompt-icon">
        <Download className="size-5" aria-hidden="true" />
      </span>
      <div className="install-prompt-body">
        <p className="install-prompt-title">{t("install.title")}</p>
        <p className="install-prompt-copy">{deferred ? t("install.body") : t("install.ios")}</p>
      </div>
      <div className="install-prompt-actions">
        {deferred && (
          <button type="button" className="btn gold" onClick={install}>
            {t("install.action")}
          </button>
        )}
        <button
          type="button"
          className="install-prompt-dismiss"
          onClick={dismiss}
          aria-label={t("install.close")}
        >
          {t("install.dismiss")}
        </button>
      </div>
    </aside>
  );
}
