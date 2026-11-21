import type { Metadata } from "next";
import { type TimelineTab, TimelineView } from "@/components/timeline/timeline-view";
import { requirePageAccess } from "@/lib/access/guard";
import { demoMode } from "@/lib/flags";
import { todayKey } from "@/lib/timeline/dates";
import { loadTimelineSources } from "@/lib/timeline/sources";

export const metadata: Metadata = { title: "Timeline" };

/**
 * The Timeline route. The menu hides it at `none`; this guard refuses the address, like every other
 * page. `?tab=gantt` opens the chart, so either view can be linked.
 *
 * All the data is read on the server with the signed-in person's own session: the workspace
 * repositories for cards and tasks, and the public event function for tournaments. There is no
 * service role here and no database write.
 */
export default async function TimelinePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const initialTab: TimelineTab = params.tab === "gantt" ? "gantt" : "calendar";

  await requirePageAccess("timeline");

  const today = todayKey();
  const data = await loadTimelineSources(today);

  return (
    <TimelineView
      items={data.items}
      members={data.members}
      today={today}
      github={data.github}
      tournamentsFailed={data.tournamentsFailed}
      demo={demoMode()}
      initialTab={initialTab}
    />
  );
}
