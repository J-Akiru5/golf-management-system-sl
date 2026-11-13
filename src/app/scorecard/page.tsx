import { redirect } from "next/navigation";

/**
 * The editable scorecard is a self-contained HTML page under `public/scorecard`.
 * Keep the friendly URL and send the browser to the static asset.
 */
export default function ScorecardEntryPage() {
  redirect("/scorecard/index.html");
}
