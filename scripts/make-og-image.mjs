#!/usr/bin/env node
/**
 * Build the Open Graph card: `public/og/teeline-og.jpg`, 1200 × 630.
 *
 * Why this shape: the previous unfurl had no og:image at all, so chat clients grabbed the 320 px
 * IGCC crest from the page and upscaled it. This card uses the real photo (`public/photos/`) and the
 * vector TeeLine reverse logo, composed in Chromium with the site's own bundled fonts, then
 * screenshot at the exact OG size. Everything is inlined as data URIs so nothing is fetched over
 * the network and the output is reproducible.
 *
 * Run: node scripts/make-og-image.mjs
 * Requires the Playwright browser that `pnpm verify:ui` already uses.
 *
 * The output is committed. Re-run it when the brand, the photo or the tagline changes; the check in
 * `src/lib/seo.test.ts` fails if the file is missing, too large, or not a JPEG.
 */
import { mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { chromium } from "@playwright/test";

const ROOT = process.cwd();
const OUT = join(ROOT, "public/og/teeline-og.jpg");

const read = (path) => readFileSync(join(ROOT, path));
const dataUri = (path, mime) => `data:${mime};base64,${read(path).toString("base64")}`;

const photo = dataUri("public/photos/fairway-dawn.webp", "image/webp");
const logo = readFileSync(join(ROOT, "public/brand/teeline-logo-reverse.svg"), "utf8");
const cormorant = dataUri(
  "node_modules/@fontsource/cormorant-garamond/files/cormorant-garamond-latin-600-normal.woff2",
  "font/woff2",
);
const cormorantItalic = dataUri(
  "node_modules/@fontsource/cormorant-garamond/files/cormorant-garamond-latin-600-italic.woff2",
  "font/woff2",
);
const manrope = dataUri(
  "node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2",
  "font/woff2",
);

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <style>
      @font-face {
        font-family: "Cormorant";
        font-weight: 600;
        font-style: normal;
        src: url(${cormorant}) format("woff2");
      }
      @font-face {
        font-family: "Cormorant";
        font-weight: 600;
        font-style: italic;
        src: url(${cormorantItalic}) format("woff2");
      }
      @font-face {
        font-family: "Manrope";
        font-weight: 200 800;
        src: url(${manrope}) format("woff2");
      }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 1200px; height: 630px; }
      body {
        position: relative;
        overflow: hidden;
        background: #071f18;
        font-family: "Manrope", sans-serif;
      }
      .photo {
        position: absolute;
        inset: 0;
        background-image: url(${photo});
        background-size: cover;
        background-position: 62% 64%;
      }
      .scrim {
        position: absolute;
        inset: 0;
        background:
          linear-gradient(96deg, rgba(4, 20, 15, 0.94) 0%, rgba(4, 20, 15, 0.82) 34%, rgba(4, 20, 15, 0.35) 66%, rgba(4, 20, 15, 0.06) 100%),
          linear-gradient(0deg, rgba(4, 20, 15, 0.62) 0%, rgba(4, 20, 15, 0) 46%);
      }
      .content {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 56px 64px 44px;
      }
      .logo svg { width: 340px; height: auto; display: block; }
      .main { display: flex; flex-direction: column; gap: 18px; max-width: 720px; }
      .eyebrow {
        font-size: 17px;
        font-weight: 650;
        letter-spacing: 0.17em;
        text-transform: uppercase;
        color: #d4b46f;
      }
      h1 {
        font-family: "Cormorant", serif;
        font-weight: 600;
        font-size: 86px;
        line-height: 1.02;
        letter-spacing: -0.012em;
        color: #f7f5ee;
      }
      h1 em { font-style: italic; color: #e7d6ae; }
      .rule { width: 68px; height: 3px; background: #d4b46f; border-radius: 2px; }
      .sub {
        font-size: 24px;
        font-weight: 450;
        line-height: 1.4;
        color: #d9dfd7;
        max-width: 560px;
      }
      .footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 18px;
        font-weight: 550;
        letter-spacing: 0.02em;
        color: #e7ebe4;
      }
      .footer .brand { color: #d4b46f; letter-spacing: 0.08em; text-transform: uppercase; font-size: 15px; }
    </style>
  </head>
  <body>
    <div class="photo"></div>
    <div class="scrim"></div>
    <div class="content">
      <div class="logo">${logo}</div>
      <div class="main">
        <p class="eyebrow">Golf tournament management</p>
        <h1>Every round,<br /><em>beautifully</em> organized.</h1>
        <div class="rule"></div>
        <p class="sub">Entries, the draw, published pairings and printed sheets in one place.</p>
      </div>
      <div class="footer">
        <span>golf.syntaxure.dev</span>
        <span class="brand">TeeLine Golf</span>
      </div>
    </div>
  </body>
</html>`;

mkdirSync(dirname(OUT), { recursive: true });

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(html, { waitUntil: "load" });
  // The fonts and the photo are data URIs, so there is no network wait; let layout settle once.
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: OUT, type: "jpeg", quality: 86 });
} finally {
  await browser.close();
}

const bytes = statSync(OUT).size;
const header = readFileSync(OUT).subarray(0, 2);
const isJpeg = header[0] === 0xff && header[1] === 0xd8;
console.log(`wrote ${OUT}`);
console.log(`size: ${bytes} bytes (${(bytes / 1024).toFixed(0)} KB), 1200x630, jpeg=${isJpeg}`);
if (!isJpeg || bytes > 400_000) {
  console.error("OG card is not a JPEG or is larger than 400 KB");
  process.exitCode = 1;
}
