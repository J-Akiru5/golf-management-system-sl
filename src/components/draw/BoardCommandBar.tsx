"use client";

import { useMemo, useState } from "react";
import {
  type BoardGroupRef,
  type BoardPlayer,
  nameKey,
  parseBoardCommand,
} from "@/lib/draw/board-command";

export interface BoardCommandBarProps {
  /** The players on the board, as the board names them. */
  players: readonly BoardPlayer[];
  /** The groups on the board, so a hole can be read back to its group number. */
  groups: readonly BoardGroupRef[];
  onSwapPlayers: (a: string, b: string) => void;
  onSwapSets: (setA: string[], setB: string[]) => void;
  onMove: (playerIds: string[], toGroup: number) => void;
}

/**
 * One line above the board: type what you want, read the plan, confirm. A name that fits more than
 * one player never acts; the candidates are offered and the desk's pick is kept against the words
 * they typed, so the same line parses again without retyping.
 */
export function BoardCommandBar(p: BoardCommandBarProps) {
  const [text, setText] = useState("");
  const [pins, setPins] = useState<Record<string, string>>({});
  const result = useMemo(
    () => parseBoardCommand(text, p.players, p.groups, pins),
    [text, p.players, p.groups, pins],
  );

  function apply() {
    if (!result.ok) return;
    const plan = result.plan;
    if (plan.kind === "swapPlayers") p.onSwapPlayers(plan.a, plan.b);
    else if (plan.kind === "swapSets") p.onSwapSets(plan.setA, plan.setB);
    else p.onMove(plan.playerIds, plan.toGroup);
    setText("");
    setPins({});
  }

  function choose(query: string, id: string) {
    setPins((current) => ({ ...current, [nameKey(query)]: id }));
  }

  const empty = text.trim() === "";

  return (
    <form
      className="card stack tight"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <label className="field">
        <span className="overline !text-[10px]">Command</span>
        <input
          type="text"
          value={text}
          autoComplete="off"
          spellCheck={false}
          aria-label="Board command"
          aria-describedby="board-command-help"
          placeholder="swap CELINO with BRIONES"
          onChange={(e) => {
            setText(e.target.value);
            // A pick belongs to the words that were ambiguous, so a new line starts clean.
            setPins({});
          }}
        />
      </label>

      <p className="hint" id="board-command-help">
        swap CELINO with BRIONES · swap CELINO and SANTOS with BRIONES and REYES · move CELINO to
        hole 12 · move CELINO, BRIONES to group 7
      </p>

      {!empty && !result.ok && (
        <div className="stack tight" role="alert">
          <p className="notice bad">{result.error}</p>
          {result.candidates.length > 0 && result.query !== undefined && (
            <div className="row" aria-label="Matching players">
              {result.candidates.map((player) => (
                <button
                  key={player.id}
                  type="button"
                  className="btn small ghost min-h-11 lg:min-h-8"
                  onClick={() => choose(result.query ?? "", player.id)}
                >
                  {player.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!empty && result.ok && (
        <div className="row" aria-live="polite">
          <span className="grow">{result.summary}</span>
          <button type="submit" className="btn">
            Confirm
          </button>
        </div>
      )}
    </form>
  );
}
