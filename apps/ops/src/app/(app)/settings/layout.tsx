import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SettingsTabs } from "@/components/settings/settings-tabs";

export const metadata: Metadata = { title: "Settings" };

/** The Settings area: a heading, the two tabs, then the page. */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="overline">Settings</p>
        <h1 className="mt-1 text-2xl">Your profile and the workspace</h1>
      </div>
      <SettingsTabs />
      {children}
    </div>
  );
}
