import { notFound } from "next/navigation";
import PrintPreview from "../_print-preview/page";

/** Dev-only entry point. The implementation lives in the private, non-routable _print-preview folder. */
export default function PrintPreviewRoute() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <PrintPreview />;
}
