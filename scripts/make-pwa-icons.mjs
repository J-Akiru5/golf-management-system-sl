// Generates the PWA launcher icons from the TeeLine app icon.
//
// The icons are committed, so a build never reaches for a CDN or an image service. Run this only
// when the mark changes:
//   node scripts/make-pwa-icons.mjs
//
// Chromium (through the Playwright dev dependency) renders the SVG, which is why this is a script
// and not a build step: the icons change once in a while, the build runs on every deploy.
//
// The "any" icons keep the icon's own rounded corners. iOS paints transparency black and Android
// crops a maskable icon to its own shape, so those two are drawn full-bleed on forest with the mark
// inside the 80% maskable safe zone.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SOURCE = `${ROOT}public/brand/teeline-app-icon-forest.svg`;
const OUT = `${ROOT}public/icons`;

const FOREST = "#073D2E";
const svg = await readFile(SOURCE, "utf8");

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

/** A square screenshot of the page at `size`, optionally with the mark inset on a full-bleed field. */
async function shoot({ size, file, inset = 0, transparent = false }) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  if (inset > 0) {
    // Keep the corners square and the field opaque: the platform supplies the shape. The SVG is
    // inlined because an <img src="file://…"> inside setContent is not loaded on about:blank.
    await page.setContent(
      `<!doctype html><meta charset="utf-8">
       <style>
         html, body { margin: 0; height: 100%; background: ${FOREST}; }
         body { display: grid; place-items: center; }
         svg { width: ${Math.round(size * (1 - inset * 2))}px; height: auto; display: block; }
       </style>
       ${svg}`,
    );
  } else {
    await page.goto(`file://${SOURCE}`);
  }
  const png = await page.screenshot({ omitBackground: transparent });
  await writeFile(`${OUT}/${file}`, png);
  await page.close();
  return png.length;
}

const sizes = [
  { size: 192, file: "icon-192.png", transparent: true },
  { size: 512, file: "icon-512.png", transparent: true },
  // 10% inset each side leaves the mark inside the maskable 80% safe zone.
  { size: 512, file: "maskable-512.png", inset: 0.1 },
  // iOS ignores transparency and shows it as black, so this one is opaque too.
  { size: 180, file: "apple-touch-icon.png", inset: 0.12 },
];

for (const icon of sizes) {
  const bytes = await shoot(icon);
  console.log(`${icon.file}: ${bytes} bytes`);
}

await browser.close();
