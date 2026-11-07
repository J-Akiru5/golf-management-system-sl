import type { ReactNode } from "react";

/** The brand line and page title shared by the player's board, card, course and profile. */
export function PlayerPageHeader({
  title,
  intro,
  actions,
}: {
  title: ReactNode;
  intro?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="player-page-head">
      <p className="overline">TeeLine Golf</p>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1>{title}</h1>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {intro && <p className="hint">{intro}</p>}
    </header>
  );
}
