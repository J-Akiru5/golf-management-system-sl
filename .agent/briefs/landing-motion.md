# Brief: LANDING MOTION (premium scroll motion, fast on low-end phones)

Branch `landing/motion`, from `feat/landing` after the polish pass. Same common rules (attached). You
own `src/components/landing/**` except `types.ts`. Goal from the owner: "a premium, million-dollar
feel" with parallax, while staying fast on low-end phones (good INP, lazy loading).

## Architecture (decided by the orchestrator; follow it)

- **Library: GSAP 3 + ScrollTrigger, already installed** (`gsap`, plus `lenis` for smooth scroll).
  Do not add Framer Motion or any other package. Read `src/components/public/MotionLayer.tsx`: it is
  the pattern to follow (motion is imported inside an effect, never part of first paint, the page is
  complete without it).
- **One client component, `src/components/landing/LandingMotion.tsx`**, rendered once inside
  `LandingHero` or `index.tsx` (your choice, but only once on the page). It:
  1. Waits for idle (`requestIdleCallback` with a 1500 ms timeout, falling back to `setTimeout`), or
     the first scroll/pointer event, whichever is first. Then dynamically imports `gsap`,
     `gsap/ScrollTrigger` and (only in full mode) `lenis`.
  2. Picks a **motion tier** before importing anything:
     - `none`: `prefers-reduced-motion: reduce`. Import nothing. Everything is already visible.
     - `lite`: `navigator.connection?.saveData`, or `navigator.deviceMemory <= 4`, or
       `navigator.hardwareConcurrency <= 4`, or `(pointer: coarse)` with viewport < 768 px. Reveals
       only (short opacity/translate, no scrub, no parallax, no Lenis).
     - `full`: everything below, Lenis smooth scroll on fine pointers only.
  3. Uses `gsap.context()` scoped to `.tl-landing` and `gsap.matchMedia()`; reverts everything on
     unmount. `ScrollTrigger.config({ ignoreMobileResize: true })`, `fastScrollEnd: true`.
- **Markup contract via data attributes** (add them in your components; the motion layer reads them):
  `data-tl-parallax="<speed>"` (e.g. 0.15 for contours, 0.35 for the gold line, -0.1 for the glow),
  `data-tl-reveal` (fade/rise in, optional `data-tl-stagger` on a parent), `data-tl-tilt` (the
  product frame), `data-tl-count="<final number>"` (proof figures), `data-tl-draw` (SVG paths that draw
  in).

## The motion (full tier)

1. **Hero depth**: the contour field, the gold tee line and the radial glow move at different speeds
   as the hero scrolls away (scrubbed parallax). The hero copy drifts up slightly and fades as it
   leaves. Subtle, never seasick: max 60 px of travel per layer.
2. **Tee line draw**: on load, the gold line draws in once (stroke-dashoffset), about 1.6 s, ease
   `power3.out`. Contours fade in after it.
3. **Product frame**: starts tilted (`rotateX` about 18deg, slightly scaled down) and eases to flat and
   full size as it scrolls into the centre (scrub). A soft light sweep across the screenshot once when
   it lands is fine.
4. **Proof figures count up** from 0 to the exact final value once when visible (Bebas, tabular
   numerals, `toLocaleString("en-US")` so 118,279 keeps its comma). The server markup already holds
   the final value, so without JS, in `lite` or `none`, the exact number is shown. Never show a number
   that is not the final one once the count ends.
5. **Section reveals**: headings and cards rise 24 px and fade in with a 0.06 s stagger. Capability
   diagrams draw their lines in (`data-tl-draw`).
6. **Pinned story (desktop, full tier only)**: the "From entry to result" section pins while the
   visitor scrolls through its three steps (Prepare, Review, Play). The copy column advances step by
   step and the diagram on the other side crossfades to the matching step, with a thin gold progress
   line showing 1/3, 2/3, 3/3. Use `ScrollTrigger` `pin: true`, `scrub`, `anticipatePin: 1`, and an
   end of about 2.5 viewport heights. In lite, none, under 1024 px wide or without JS it is the normal
   stacked layout with all three steps visible (the server markup is the stacked layout; the pin only
   rearranges it after the library loads, and reverts on unmount or resize below 1024 px via
   `matchMedia`).
7. **Carousel**: cards stagger in; the active card lifts slightly. No autoplay.
8. **Buttons**: a small magnetic pull on the primary buttons on fine pointers only (max 6 px), via
   `gsap.quickTo`. Nothing on touch.

## Performance rules (non-negotiable)

- Animate only `transform` and `opacity` (and SVG `stroke-dashoffset`). No `top/left/width/height`,
  no `filter: blur` animation, no box-shadow animation.
- No React state updates on scroll. No layout reads inside scroll callbacks. `will-change` only on the
  few layers that scrub, never globally.
- Reveals animate **from** an offset to the natural state (`gsap.from` with `immediateRender: false`
  or set initial styles only after the library has loaded), so nothing is ever left hidden if the
  script fails or loads late. No CSS that hides content waiting for JS.
- Images: the hero product shot uses `next/image` with `priority` and correct `sizes`; every other
  image is lazy (`loading="lazy"`, the default) with `sizes`. No image larger than it is displayed.
- There is no hero switch any more (the featured event is an organizer setting). The carousel uses
  passive listeners. Keep client components small; the hero itself is a server component.
- The landing's own client JavaScript in the first load stays small: GSAP and Lenis load only after
  idle, in their own chunks.

## Acceptance

`pnpm typecheck`, `pnpm lint`, `pnpm test` pass; add tests for the tier picker (a pure function you
export, given the media/navigator facts) and for the count-up formatter. Final report as in the common
rules, including what each tier does.
