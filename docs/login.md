# Sign-in and password recovery

Status: built on `feat/login-betterment` (20 Oct 2026) for issue #61. The page and the recovery
routes compile and their demo-mode states are covered by the browser harness. The email round trip
itself has **not** been exercised against a live mailbox: that needs the Supabase redirect URL and a
real account, so it is listed under "Setup" below.

## What the page does

- **Split layout on wide screens.** The left panel carries the TeeLine wordmark, the club name and
  the three claims the sign-in protects: entries are reviewed, a person decides the draw, and only
  the published list is public. Below 1024 px the panel collapses to the logo and a club-home link,
  so the form is not pushed below the fold on a phone.
- **Show/Hide password.** The control is a `<button type="button">` outside the label, with
  `aria-controls` and `aria-pressed`, so pressing it never submits or focuses the field by accident.
- **Remember me on this device.** The choice is written to an httpOnly `teeline-remember` cookie and
  applied to every auth cookie by both the server client and the proxy. Unchecked means session
  cookies: closing the browser ends the session. Checked keeps the library's persistent cookie and
  the proxy refreshes it while the person uses the app.
- **Forgot password.** `/forgot-password` asks for the address and always answers the same way, so
  it cannot be used to find out which emails have accounts. The email points at
  `/auth/confirm?next=/reset-password`; that route exchanges the one-time code (or `token_hash`) for
  a session and forwards to `/reset-password`.
- **Choose a new password.** `/reset-password` only shows the form when the recovery session is
  present. Eight-character minimum and a confirmation field, shared with the server action through
  `passwordProblem()`. A successful update signs the recovery session out and returns to sign-in
  with a plain message.
- **Back to the club home** on every auth screen, including the phone header.
- **Create account** stays in the same page as a disclosure, with the existing explanation that a
  new account must claim its club record.

## Benchmark

Reviewed against the sign-in pages people meet most often: GitHub, Stripe, Linear, Vercel and
Google. The patterns worth taking for a single-club app:

| Pattern | Seen in | Decision |
| --- | --- | --- |
| Split brand panel beside the form | Stripe, Linear, Vercel | Taken. It explains the product without adding a marketing page, and it collapses cleanly on phones. |
| One email + password step | GitHub, Stripe | Taken. An email-first second step adds a round trip for a club with one sign-in audience. |
| Forgot-password link beside the password label | GitHub, Stripe, Linear | Taken. It is the one recovery action people look for at the point of failure. |
| Show/Hide password | GitHub, Stripe, most current sign-ins | Taken, as a text button rather than an eye icon: the label is unambiguous in every language the app ships. |
| Remember me | GitHub, Stripe | Taken. For a shared desk the default is off; the choice is explicit. |
| Password strength meter | Stripe, Google | Not taken. It needs a scoring dependency, and the club's rule is a single eight-character minimum. |
| Social sign-in / SSO | GitHub, Google, Vercel | Not taken. Staff accounts are created by the club; players sign up with email. There is no provider configured, so a button would be a dead end. |
| Two-factor authentication | Google, GitHub | Not taken in this change. It is a separate security decision and needs a second factor the club can support. |

The visual language stays inside the existing system: forest, ivory, gold, the same card, field and
notice classes, and the bundled TeeLine wordmark. The login page does not introduce a new font,
image host or script.

## Remember me, in detail

| State | Preference cookie | Auth cookies |
| --- | --- | --- |
| Unchecked | `teeline-remember=0`, session cookie | `maxAge` and `expires` stripped on every write |
| Checked | `teeline-remember=1`, 30 days | The library's own lifetime, refreshed by the proxy |
| No choice (existing sessions) | absent | Untouched, so a deploy does not sign anyone out |

Sign-out deletes the preference cookie. The proxy reads it on every matched request, so a session
refreshed on a later page keeps the same rule.

## Setup required outside the repo

1. Supabase dashboard → Authentication → URL Configuration → **Redirect URLs**: add
   `https://<production-domain>/auth/confirm` and `http://localhost:3000/auth/confirm`.
2. Keep the recovery email template's link on `{{ .ConfirmationURL }}` so the redirect carries the
   `code` (PKCE) or `token_hash`.
3. Set `NEXT_PUBLIC_SITE_URL` to the production domain. Without it the action falls back to the
   request host, which is correct locally but must not be the link players receive from production.

These are dashboard settings, not code. No migration is involved.
