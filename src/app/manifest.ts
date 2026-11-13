import type { MetadataRoute } from "next";

/**
 * The installable app. `display: standalone` gives the desk and player bars the full screen on a
 * phone. The launcher icons are the TeeLine app icon, rendered into /public/icons by
 * scripts/make-pwa-icons.mjs and committed, so no request leaves the club's own server.
 *
 * A manifest has one theme colour. The app follows the device's light or dark theme, so the two
 * `theme-color` values a browser actually honours are declared in the root layout's `viewport`
 * export; this value is the forest used by the light theme and by the installed splash.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TeeLine Golf · IGCC",
    short_name: "TeeLine",
    description:
      "Your entry, tee time, pairings and club programme for Iloilo Golf & Country Club. The last screen you opened stays readable with no signal.",
    id: "/",
    // A player installs this app for their own entry and tee time. The public
    // home stays one tap away in the player bar.
    start_url: "/my",
    scope: "/",
    display: "standalone",
    background_color: "#f7f5ee",
    theme_color: "#073d2e",
    categories: ["sports", "productivity"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Staff desk",
        short_name: "Staff",
        description: "Check players in and score a group on the course.",
        url: "/staff",
      },
      {
        name: "My golf",
        short_name: "My golf",
        description: "Your entry and your published start.",
        url: "/my",
      },
      {
        name: "Pairings",
        short_name: "Pairings",
        description: "The published tee times and pairings.",
        url: "/pairings",
      },
      {
        name: "Leaderboard",
        short_name: "Results",
        description: "The published gross and net results.",
        url: "/leaderboard",
      },
    ],
  };
}
