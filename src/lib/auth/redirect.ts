/** Allows only same-site path redirects after authentication. */
export function safeRedirectPath(value: FormDataEntryValue | null): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return "/";
  }
  try {
    const target = new URL(value, "https://starter.invalid");
    return target.origin === "https://starter.invalid"
      ? `${target.pathname}${target.search}${target.hash}`
      : "/";
  } catch {
    return "/";
  }
}
