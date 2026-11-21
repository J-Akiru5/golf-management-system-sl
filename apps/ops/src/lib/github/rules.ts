/**
 * Rules about a GitHub login, kept in one place.
 *
 * GitHub treats a login case-insensitively and allows letters, digits and single hyphens, not
 * starting or ending with one, up to 39 characters. The database stores the lower-case form for
 * matching (see github_user_map), so the screen normalises before it saves.
 */

const LOGIN_SHAPE = /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/;

/** The stored form of a login, or null when the value is not shaped like one. */
export function normaliseLogin(value: string): string | null {
  const login = value.trim().toLowerCase();
  return LOGIN_SHAPE.test(login) ? login : null;
}

export function isGithubLogin(value: string): boolean {
  return normaliseLogin(value) !== null;
}
