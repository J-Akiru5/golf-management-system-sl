/**
 * Today, as the server sees it, in the club's timezone.
 *
 * Read once per page and passed down. A page that read the clock in a component would render one
 * date on the server and another in the browser after midnight, and React would report a mismatch.
 * en-CA gives YYYY-MM-DD, the form the database and the helpers both use.
 */
export function todayInManila(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}
