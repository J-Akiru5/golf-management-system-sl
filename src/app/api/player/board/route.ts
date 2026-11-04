import { NextResponse } from "next/server";
import { playerBoard, playerRounds } from "@/lib/player/board-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const fail = (error: string, status: number) =>
  NextResponse.json({ error }, { status, headers: NO_STORE });

/**
 * The live board's poll.
 *
 * It is a signed-in player's read of a published round, so it is capped at what the public page
 * already shows. A round the club has not published answers 404, which is what the client treats
 * as "nothing new".
 */
export async function GET(request: Request) {
  const roundId = new URL(request.url).searchParams.get("round") ?? "";
  if (!UUID.test(roundId)) return fail("bad_round", 400);

  let client: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    client = await createSupabaseServerClient();
  } catch {
    return fail("not_configured", 503);
  }

  const { data: user } = await client.auth.getUser();
  if (!user.user) return fail("sign_in_required", 401);

  try {
    const rounds = await playerRounds(client);
    const round = rounds.find((item) => item.roundId === roundId);
    if (!round) return fail("not_published", 404);

    const board = await playerBoard(client, round);
    if (!board) return fail("not_published", 404);
    return NextResponse.json(board, { headers: NO_STORE });
  } catch {
    return fail("unavailable", 500);
  }
}
