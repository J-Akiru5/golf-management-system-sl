import type { Issue, Severity } from "@/lib/draw/validate";

const META: Record<Severity, { label: string; cls: string; hint: string }> = {
  blocking: {
    label: "Must fix",
    cls: "bad",
    hint: "Publishing is switched off until these are fixed.",
  },
  warning: { label: "Check", cls: "warn", hint: "Allowed, but look at them before you publish." },
  info: { label: "Note", cls: "info", hint: "" },
};

export function IssuesPanel({ issues, onShow }: { issues: Issue[]; onShow: (i: Issue) => void }) {
  const by = (s: Severity) => issues.filter((i) => i.severity === s);
  const counts = (["blocking", "warning", "info"] as const).map((s) => [s, by(s).length] as const);

  if (issues.length === 0) {
    return (
      <div className="notice ok" role="status">
        <b>No problems found.</b> Every ready player has a group and every group is within the
        limits.
      </div>
    );
  }

  return (
    <details className="issues" open={by("blocking").length > 0}>
      <summary>
        <b>Checks</b>
        {counts.map(([s, n]) =>
          n > 0 ? (
            <span key={s} className={`pill ${META[s].cls}`}>
              {n} {META[s].label.toLowerCase()}
            </span>
          ) : null,
        )}
      </summary>
      {(["blocking", "warning", "info"] as const).map((s) =>
        by(s).length === 0 ? null : (
          <section key={s} className="issue-block">
            <h3>
              <span className={`pill ${META[s].cls}`}>{META[s].label}</span>
              {META[s].hint && <span className="hint">{META[s].hint}</span>}
            </h3>
            <ul>
              {by(s).map((i) => (
                <li key={i.id}>
                  <span>{i.message}</span>
                  {(i.group || i.playerId) && (
                    <button type="button" className="btn small ghost" onClick={() => onShow(i)}>
                      Show
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ),
      )}
    </details>
  );
}
