import { TeeLineLogo } from "@/components/TeeLineLogo";

export interface SpotlightData {
  firstName: string;
  surname: string;
  kicker: string;
  eventLabel: string;
  eventName: string;
  /** Handicap Index already formatted ("4.2", "+1.8") or null when none is on record. */
  index: string | null;
  /** Up to three more recorded stats. Empty ones are dropped by the caller. */
  stats: { label: string; value: string }[];
  record: string[];
  pairingTitle: string;
  pairing: string[];
  tee: { hole: string; label: string; date: string } | null;
  /** Consented cut-out photo only. */
  photo?: string;
  placeholder: "silhouette" | "none";
}

/**
 * The full-screen 16:9 player card for the clubhouse display. Drawn at 1600 × 900 and scaled to
 * the given width. Fixed colours (forest, ivory, gold), not the theme, so a screen, a screenshot
 * and an export look the same. Gold is reserved for the Handicap Index.
 */
export function PlayerSpotlight({ d, width = 1600 }: { d: SpotlightData; width?: number }) {
  const k = width / 1600;
  const first = d.firstName.toUpperCase();
  // The first name shrinks for long names so it never runs under the stats.
  const firstSize = Math.min(210, Math.floor(700 / Math.max(1, first.length * 0.46)));
  return (
    <div
      className="relative overflow-hidden rounded-[20px]"
      style={{ width, height: width * (9 / 16) }}
    >
      <div
        className="absolute top-0 left-0 origin-top-left overflow-hidden text-[#f7f5ee]"
        style={{ width: 1600, height: 900, transform: `scale(${k})`, background: "#0b2b23" }}
      >
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(900px 700px at 30% 40%,rgba(40,93,71,.55),rgba(11,43,35,0) 70%),radial-gradient(600px 500px at 85% 15%,rgba(215,181,104,.12),rgba(11,43,35,0) 70%),linear-gradient(180deg,#0b2b23 0,#0b1511 100%)",
          }}
        />
        {d.index && (
          <div
            aria-hidden="true"
            className="absolute top-[-40px] left-10 font-condensed text-[980px] leading-[.8] tracking-[-.02em] text-[rgba(247,245,238,.035)] select-none tnum"
          >
            {d.index}
          </div>
        )}

        {d.photo ? (
          <img
            src={d.photo}
            alt=""
            className="absolute bottom-0 left-[150px] h-[860px] w-[640px] object-contain object-bottom"
          />
        ) : d.placeholder === "silhouette" ? (
          <Silhouette />
        ) : null}

        <div
          className="absolute inset-x-0 bottom-0 h-[120px]"
          style={{
            background:
              "linear-gradient(180deg,rgba(11,21,17,0),rgba(11,43,35,.9) 70%,#285d47 100%)",
          }}
        />

        <div className="absolute top-[52px] right-[60px] left-[60px] flex items-start justify-between">
          <div className="flex items-center gap-3.5">
            <TeeLineLogo variant="reverse" width={190} />
            <div>
              <b className="block font-display text-[15px] font-extrabold tracking-[.04em] uppercase">
                Iloilo Golf &amp; Country Club
              </b>
              <span className="text-xs tracking-[.06em] text-[#c5d3ca] uppercase">
                Est. 1907 · Sta. Barbara, Iloilo
              </span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs font-bold tracking-[.14em] text-[#d7b568] uppercase">
              {d.eventLabel}
            </span>
            <b className="block font-serif text-[30px] leading-8 font-semibold">{d.eventName}</b>
          </div>
        </div>

        <div className="absolute top-[150px] left-[820px] w-[700px]">
          <div className="flex items-center gap-3 text-[13px] font-bold tracking-[.24em] text-[#d7b568] uppercase after:h-px after:flex-1 after:bg-[rgba(215,181,104,.6)]">
            {d.kicker}
          </div>
          <div
            className="mt-3.5 font-condensed leading-[.84] tracking-[.01em]"
            style={{ fontSize: firstSize }}
          >
            {first}
          </div>
          <div className="mt-1.5 font-display text-[44px] font-extrabold tracking-[.42em] uppercase">
            {d.surname}
          </div>
        </div>

        <div className="absolute top-[520px] left-[820px] grid w-[700px] grid-cols-4 border-t border-[rgba(201,163,74,.6)] pt-[18px]">
          <div>
            <div className="font-condensed text-[84px] leading-[.9] text-[#d7b568] tnum">
              {d.index ?? "—"}
            </div>
            <div className="mt-1.5 text-[11.5px] font-bold tracking-[.14em] text-[#c5d3ca] uppercase">
              Handicap Index
            </div>
          </div>
          {d.stats.slice(0, 3).map((s) => (
            <div key={s.label}>
              <div className="font-condensed text-[84px] leading-[.9] tnum">{s.value}</div>
              <div className="mt-1.5 text-[11.5px] font-bold tracking-[.14em] text-[#c5d3ca] uppercase">
                {s.label}
              </div>
            </div>
          ))}
        </div>

        <div className="absolute top-[690px] left-[820px] grid w-[700px] grid-cols-[1.2fr_1fr] gap-7">
          <div>
            <h5 className="mb-2 text-xs tracking-[.18em] text-[#d7b568] uppercase">Club record</h5>
            {d.record.length ? (
              <ul className="text-[14.5px] leading-[23px]">
                {d.record.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            ) : (
              <p className="text-[14.5px] leading-[23px] text-[#c5d3ca]">
                No tournament results recorded yet.
              </p>
            )}
          </div>
          {d.pairing.length > 0 && (
            <div>
              <h5 className="mb-2 text-xs tracking-[.18em] text-[#d7b568] uppercase">
                {d.pairingTitle}
              </h5>
              <div className="flex flex-wrap gap-1.5">
                {d.pairing.map((p) => (
                  <span
                    key={p}
                    className="inline-flex h-7 items-center rounded-full border border-[rgba(247,245,238,.25)] px-2.5 text-[12.5px]"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {d.tee && (
          <div className="absolute bottom-[52px] left-[60px] flex h-14 items-center gap-3.5 rounded-full border border-[rgba(215,181,104,.55)] bg-[rgba(12,23,18,.7)] py-0 pr-[22px] pl-2.5 backdrop-blur-[10px]">
            <span className="grid size-[38px] place-items-center rounded-full bg-[#d7b568] font-display text-sm font-extrabold text-[#171c19]">
              {d.tee.hole}
            </span>
            <div>
              <b className="font-display text-[17px]">{d.tee.label}</b>
              <br />
              <span className="text-[13px] text-[#c5d3ca]">{d.tee.date}</span>
            </div>
          </div>
        )}
        {!d.photo && d.placeholder === "silhouette" && (
          <div className="absolute right-[60px] bottom-[30px] text-[10px] tracking-[.14em] text-[rgba(197,211,202,.6)] uppercase">
            Photo slot · no consented photo
          </div>
        )}
        <div className="pointer-events-none absolute inset-[22px] rounded-[22px] border border-[rgba(215,181,104,.55)]" />
      </div>
    </div>
  );
}

/** Generic golfer silhouette that only marks the photo slot in previews. Never a real person. */
function Silhouette() {
  return (
    <svg
      className="absolute bottom-0 left-[150px] h-[860px] w-[640px]"
      viewBox="0 0 640 860"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="sp-fig" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1d3a2c" />
          <stop offset="1" stopColor="#0b1511" />
        </linearGradient>
        <filter id="sp-rim" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="6" dy="-4" stdDeviation="3" floodColor="#d7b568" floodOpacity=".55" />
        </filter>
      </defs>
      <g fill="none" stroke="rgba(215,181,104,.18)" strokeWidth="1.2">
        <ellipse cx="330" cy="520" rx="300" ry="300" />
        <ellipse cx="330" cy="520" rx="240" ry="240" />
        <ellipse cx="330" cy="520" rx="180" ry="180" />
      </g>
      <g
        filter="url(#sp-rim)"
        fill="url(#sp-fig)"
        stroke="url(#sp-fig)"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="352" y1="190" x2="560" y2="330" stroke="#c9d0cb" strokeWidth="5" />
        <path d="M560 330 l26 10 -6 12 -28 -10z" fill="#c9d0cb" stroke="none" />
        <path
          d="M268 250 C300 232 360 232 392 252 L404 340 C400 400 388 440 380 480 L292 486 C286 440 276 400 270 340 Z"
          stroke="none"
        />
        <path d="M282 260 L250 200 L262 150" fill="none" strokeWidth="34" />
        <path d="M382 262 L318 196 L272 154" fill="none" strokeWidth="34" />
        <circle cx="266" cy="150" r="15" stroke="none" />
        <circle cx="336" cy="196" r="44" stroke="none" />
        <path
          d="M296 176 C300 140 370 136 380 172 L404 178 C404 186 396 188 380 186 Z"
          stroke="none"
        />
        <path d="M300 476 L296 640 L292 790" fill="none" strokeWidth="50" />
        <path d="M368 476 L410 630 L360 730 L372 790" fill="none" strokeWidth="46" />
        <path d="M262 800 C262 786 300 780 330 788 L330 806 L262 806 Z" stroke="none" />
        <path d="M352 780 L392 770 L406 800 L356 806 Z" stroke="none" />
      </g>
    </svg>
  );
}
