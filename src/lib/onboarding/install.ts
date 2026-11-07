import type { TranslationKey } from "@/lib/i18n/t";

/** What the install step should tell this browser. */
export type InstallPlatform = "ios-safari" | "android-chrome" | "other" | "installed";

export interface InstallDetectInput {
  userAgent: string;
  standalone?: boolean;
  /** True when the caller already saw Macintosh plus more than one touch point. */
  iPadDesktop?: boolean;
}

/** Picks the install advice for a browser. Installed wins over everything else. */
export function detectInstallPlatform(input: InstallDetectInput): InstallPlatform {
  if (input.standalone === true) return "installed";

  const ua = input.userAgent;
  const isIos = /iPhone|iPad|iPod/i.test(ua) || input.iPadDesktop === true;
  if (isIos) return "ios-safari";

  const isAndroid = /Android/i.test(ua);
  const isChromium = /Chrome|Chromium|SamsungBrowser/i.test(ua);
  if (isAndroid && isChromium) return "android-chrome";

  return "other";
}

/** The dictionary line that matches the platform. */
export function installHintKey(platform: InstallPlatform): TranslationKey {
  switch (platform) {
    case "installed":
      return "onboard.player.install.installed";
    case "ios-safari":
      return "onboard.player.install.ios";
    case "android-chrome":
      return "onboard.player.install.android";
    case "other":
      return "onboard.player.install.other";
  }
}
