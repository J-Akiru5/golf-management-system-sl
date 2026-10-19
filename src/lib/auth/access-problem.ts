/**
 * Why a signed-in account cannot use the desk at all, as opposed to a read that failed.
 *
 * The distinction matters because the two need different copy. A failed read is worth retrying; none
 * of these are. Offering "Retry" to an account that simply has no club membership sends the person
 * round a loop that cannot end, so the copy here never suggests one.
 */
export type DeskAccessProblem = "no-club" | "multi-club" | "bad-role";

export interface AccessProblemCopy {
  title: string;
  /** States what is actually true, so nobody goes looking for a network fault. */
  body: string;
  /** What moves the situation forward, and who has to do it. */
  next: string;
}

export function accessProblemCopy(problem: DeskAccessProblem): AccessProblemCopy {
  switch (problem) {
    case "no-club":
      return {
        title: "This account is not in a club yet",
        body: "You are signed in, but this account has no club membership, so there is no tournament desk to show. Nothing failed to load.",
        next: "Ask the club to add this account, or sign in with the account the club set up for you.",
      };
    case "multi-club":
      return {
        title: "This account belongs to more than one club",
        body: "TeeLine opens one club at a time, and switching between clubs is not built yet, so the desk cannot choose which one to show.",
        next: "Use an account that belongs to one club, or ask the club which membership to keep.",
      };
    case "bad-role":
      return {
        title: "This account has a role TeeLine does not recognise",
        body: "The club membership exists, but its role is not one TeeLine knows, so the desk cannot decide what this account may do.",
        next: "Ask the club to set the role to owner, organizer or desk.",
      };
  }
}
