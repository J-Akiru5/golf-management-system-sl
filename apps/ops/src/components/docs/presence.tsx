"use client";

import { Avatar } from "@/components/ui/avatar";
import type { PresenceUser } from "@/lib/docs/collab";

const SHOWN = 4;

/**
 * The people in the document right now. The ring around each avatar is the same colour as that
 * person's cursor, so a cursor in the text can be matched to a face.
 */
export function Presence({ users }: { users: PresenceUser[] }) {
  if (users.length === 0) return <span className="hint">Just you here</span>;

  const shown = users.slice(0, SHOWN);
  const extra = users.length - shown.length;
  const names = users.map((user) => user.name).join(", ");

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center -space-x-1" aria-hidden="true">
        {shown.map((user) => (
          <span
            key={user.clientId}
            className="rounded-full bg-surface"
            style={{ boxShadow: `0 0 0 2px ${user.color}` }}
          >
            <Avatar id={`presence-${user.clientId}`} name={user.name} size="sm" />
          </span>
        ))}
      </div>
      {extra > 0 ? <span className="hint">+{extra}</span> : null}
      <span className="sr-only">
        In this document: {names}. Each cursor uses that person's colour.
      </span>
      <span className="hint hidden max-w-40 truncate sm:inline" title={names}>
        {names}
      </span>
    </div>
  );
}
