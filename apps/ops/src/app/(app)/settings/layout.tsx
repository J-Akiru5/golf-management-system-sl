import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { settingsTabsFor } from "@/lib/access/pages";
import { currentAccess } from "@/lib/access/server";

export const metadata: Metadata = { title: "Settings" };

/** The Settings area: a heading, the tabs this person may open, then the page. */
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const tabs = settingsTabsFor(await currentAccess());

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="overline">Settings</p>
        <h1 className="mt-1 text-2xl">Your profile and the workspace</h1>
      </div>
      <SettingsTabs tabs={tabs} />
      {children}
    </div>
  );
}
