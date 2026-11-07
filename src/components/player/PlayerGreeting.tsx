import { Avatar } from "@/components/bits";
import type { Translate } from "@/lib/i18n/t";

/** The player's name and TeeLine context, before the round they care about now. */
export function PlayerGreeting({
  name,
  ngapId,
  t,
}: {
  name: string;
  ngapId: string | null;
  t: Translate;
}) {
  return (
    <header className="player-greeting">
      <Avatar name={name} large />
      <div className="grid min-w-0 gap-0.5">
        <p className="overline">TeeLine Golf · {t("player.title")}</p>
        <h1 className="player-greeting-name">{name}</h1>
        <p className="hint">{ngapId ? `NGAP ${ngapId}` : t("player.profile.noNgap")}</p>
      </div>
    </header>
  );
}
