import type { MetadataRoute } from "next";

/**
 * The installable app. `display: standalone` gives the desk and player bars the full screen on a
 * phone. The launcher icon is the club crest, generated into /public/icons by
 * scripts/make-pwa-icons.ps1 and committed, so no request leaves the club's own server.
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
      "Iloilo Golf & Country Club tournament desk and player pairings. The last screen you opened stays readable with no signal.",
    id: "/",
    start_url: "/",
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
        name: "Live draw",
        short_name: "Draw",
        description: "The working draw and the published pairings.",
        url: "/draw",
      },
      {
        name: "Registration desk",
        short_name: "Register",
        description: "Add or find a player on the day.",
        url: "/register",
      },
      {
        name: "My tee time",
        short_name: "My golf",
        description: "Your entry and your published start.",
        url: "/my",
      },
    ],
  };
}
