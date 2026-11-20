/**
 * The lockup is artwork, so it cannot read the ink token. Both files are in the page and the
 * stylesheet shows the one that suits the surface (`.logo-on-light` / `.logo-on-dark`), which also
 * covers the system theme before a choice is made.
 */
export function BrandMark({ height = "h-9" }: { height?: string }) {
  return (
    <span className="inline-flex items-center">
      <img
        src="/brand/teeline-horizontal-primary.svg"
        alt=""
        aria-hidden="true"
        width={180}
        height={48}
        className={`logo-on-light w-auto ${height}`}
      />
      <img
        src="/brand/teeline-horizontal-reverse.svg"
        alt=""
        aria-hidden="true"
        width={180}
        height={48}
        className={`logo-on-dark w-auto ${height}`}
      />
    </span>
  );
}
