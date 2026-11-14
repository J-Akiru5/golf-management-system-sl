/**
 * The awarding demo flag.
 *
 * The staging deployment rehearses the whole awarding flow on fixed sample scores, so nobody has to
 * touch real results to show it. Production must never take this path, whatever the environment
 * says: the flag is refused whenever the deployment is Vercel's production environment, and a plain
 * production build without Vercel is refused too. Only a preview deployment, a development
 * deployment, or a local `pnpm dev` can turn it on, and only when the flag itself is set.
 *
 * Kept separate from the demo fixtures so the guard is testable without a database or a browser.
 */

/** The environment this reads. Passed in by the test; the app uses `process.env`. */
export interface AwardingDemoEnv {
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  AWARDING_DEMO?: string;
}

export const DEMO_FLAG = "AWARDING_DEMO";

/**
 * True only when `AWARDING_DEMO=1` **and** the deployment is not production.
 *
 * `VERCEL_ENV` is `production`, `preview` or `development` on Vercel. Production is refused first,
 * before anything else is looked at, so a stray variable on the production project cannot switch
 * sample scores on. A local production build (`next build && next start`) has no `VERCEL_ENV` and
 * reports `NODE_ENV=production`, and is refused as well.
 */
export function awardingDemoEnabled(env: AwardingDemoEnv): boolean {
  if (env[DEMO_FLAG] !== "1") return false;
  if (env.VERCEL_ENV === "production") return false;
  if (env.VERCEL_ENV) return true;
  return env.NODE_ENV !== "production";
}

/** The current deployment, as the server sees it. */
export function awardingDemoOn(): boolean {
  return awardingDemoEnabled({
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
    AWARDING_DEMO: process.env.AWARDING_DEMO,
  });
}
