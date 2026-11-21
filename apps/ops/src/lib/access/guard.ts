import { notFound } from "next/navigation";
import { type AccessLevel, type AccessMap, levelAtLeast, levelFor, type PageId } from "./pages";
import { currentAccess } from "./server";

/**
 * The route guard. Every page under (app) asks this before it renders, so the menu is not the only
 * thing keeping a page private: opening the address of a page you cannot see gives the app's
 * not-found page, with no hint that the page exists.
 */

export type PageDecision = "allow" | "not_found";

/** Pure, so every branch is tested without a request. A missing map is refused. */
export function decidePageAccess(
  access: AccessMap | null,
  page: PageId,
  level: AccessLevel = "view",
): PageDecision {
  if (access === null) return "not_found";
  return levelAtLeast(levelFor(access, page), level) ? "allow" : "not_found";
}

export async function requirePageAccess(page: PageId, level: AccessLevel = "view"): Promise<void> {
  const access = await currentAccess();
  if (decidePageAccess(access, page, level) === "not_found") notFound();
}
