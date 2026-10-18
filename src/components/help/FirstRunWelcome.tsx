"use client";

import { Check, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { welcomeFor } from "@/lib/help/guides";
import { loadHelpSeen, markHelpSeen, welcomeId } from "@/lib/help/seen";
import { type HelpAudience, helpText } from "@/lib/help/types";
import { useI18n } from "@/lib/i18n/context";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * The first-run welcome, once per person.
 *
 * "Once" means: the `help_seen` row when the database has it (migration 20261028000000), and this
 * browser's localStorage always. With no Supabase project at all, localStorage is the whole record,
 * which is what the demo build needs. Nothing here blocks the screen behind it: it is dismissible,
 * Escape closes it, and the button says what it does.
 *
 * It is deliberately **not modal**. A modal marks the rest of the page `aria-hidden` the moment it
 * opens; on a big page that lands while React is still hydrating and the attributes it changed are
 * reported as a mismatch. This panel is advice, not a gate, so it opens non-modally: Escape still
 * closes it, focus still moves into it, and the page behind stays reachable.
 */
export function FirstRunWelcome({
  audience,
  force = false,
}: {
  audience: HelpAudience;
  /** Previews only: show it even when this browser has already dismissed it. */
  force?: boolean;
}) {
  const { t } = useI18n();
  const panel = welcomeFor(audience);
  const id = welcomeId(audience);
  const [show, setShow] = useState(force);

  useEffect(() => {
    if (force) return;
    let alive = true;
    const client = isSupabaseConfigured() ? createSupabaseBrowserClient() : null;
    void (async () => {
      const seen = await loadHelpSeen(client);
      if (alive) setShow(!seen.has(id));
    })();
    return () => {
      alive = false;
    };
  }, [id, force]);

  const done = () => {
    setShow(false);
    const client = isSupabaseConfigured() ? createSupabaseBrowserClient() : null;
    void markHelpSeen(client, id);
  };

  // Nothing is mounted until the answer is in. The dialog marks the rest of the page aria-hidden
  // while it is open, and mounting it closed on the server upsets hydration.
  if (!show) return null;

  return (
    <Dialog.Root
      open={show}
      modal={false}
      onOpenChange={(next) => {
        if (!next) done();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-[rgb(12_18_15/0.62)]" />
        <Dialog.Content
          className="on-surface fixed top-1/2 left-1/2 z-[60] grid w-[min(540px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 gap-3 rounded-[16px] border border-line bg-surface p-5 text-ink shadow-lift outline-none"
          data-help="help-welcome"
        >
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="font-serif text-[24px] leading-7 font-semibold">
              {helpText(panel.title, t)}
            </Dialog.Title>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("common.close")}
              onClick={done}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
          <Dialog.Description className="hint">{helpText(panel.body, t)}</Dialog.Description>
          <ul className="grid gap-2 text-[14px] leading-5">
            {panel.bullets.map((bullet, index) => (
              <li key={index} className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden="true" />
                <span>{helpText(bullet, t)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-1 flex justify-end">
            <Button type="button" variant="primary" onClick={done}>
              {helpText(panel.button, t)}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
