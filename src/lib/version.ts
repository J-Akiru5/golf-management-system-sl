/**
 * The build's identity, for the footer and for the acceptance form ("Version you tested").
 * Pure so it can be tested; the three inputs are inlined at build time by next.config.ts.
 */
export function versionLabel(input: {
  version?: string;
  commit?: string;
  builtOn?: string;
}): string {
  const version = input.version?.trim() || "dev";
  const parts = [`TeeLine Golf v${version}`];
  if (input.commit?.trim()) parts.push(input.commit.trim());
  if (input.builtOn?.trim()) parts.push(`built ${input.builtOn.trim()}`);
  return parts.join(" · ");
}

/** The label for this build. */
export const APP_VERSION_LABEL = versionLabel({
  version: process.env.NEXT_PUBLIC_APP_VERSION,
  commit: process.env.NEXT_PUBLIC_APP_COMMIT,
  builtOn: process.env.NEXT_PUBLIC_APP_BUILT,
});
