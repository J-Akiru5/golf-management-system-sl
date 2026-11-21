import type { AdminActionResult, BulkAdminResult } from "@/lib/admin/types";
import { cn } from "@/lib/ui/cn";

function isBulk(result: AdminActionResult | BulkAdminResult): result is BulkAdminResult {
  return "failures" in result;
}

/** One plain sentence after an action, with the per-row failures when a bulk action had any. */
export function ResultBanner({
  result,
  className,
}: {
  result: AdminActionResult | BulkAdminResult | null;
  className?: string;
}) {
  if (result === null || (!result.message && !isBulk(result))) return null;

  const failures = isBulk(result) ? result.failures : [];

  return (
    <div
      role={result.ok ? "status" : "alert"}
      className={cn(
        "rounded-md border px-3 py-2 text-sm",
        result.ok
          ? "border-success bg-success-soft text-ink"
          : "border-danger bg-danger-soft text-ink",
        className,
      )}
    >
      <p>{result.message}</p>
      {failures.length > 0 ? (
        <ul className="mt-1 list-disc pl-5 text-[13px]">
          {failures.map((failure) => (
            <li key={failure.userId}>
              {failure.email ?? failure.userId}: {failure.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
