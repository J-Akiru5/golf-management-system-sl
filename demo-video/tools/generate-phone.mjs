/**
 * Generates the phone-view card for the AVP from the published fixture, so the mobile scene shows the
 * real names, flights, holes and times the rest of the video uses. Throwaway-branch tool.
 *
 *   pnpm exec tsx demo-video/tools/generate-phone.ts   (or node, plain JS)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "..");
const published = JSON.parse(
  readFileSync(resolve(ROOT, "demo-video/fixtures/bamboo-tee-published.json"), "utf8"),
);

const groups = published.groups.slice(0, 7);
const cards = groups
  .map(
    (group) => `
        <article class="round">
          <header>
            <b>Hole ${group.startHole}${group.wave ? ` · Wave ${group.wave}` : ""}</b>
            <span>${group.time}</span>
          </header>
          <ul>
            ${group.players.map((player) => `<li>${player}</li>`).join("")}
          </ul>
          <p class="flight">${group.flight.toUpperCase()}</p>
        </article>`,
  )
  .join("");

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>TeeLine Golf — phone view</title>
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
      body {
        display: grid; place-items: center;
        background: radial-gradient(1200px 700px at 70% 20%, #1d4a2c 0%, transparent 60%),
          linear-gradient(135deg, #10251b 0%, #0b1711 100%);
        color: #eef0ea; font-family: "Segoe UI", system-ui, sans-serif;
      }
      #phone {
        width: 620px; height: 1040px; padding: 18px; border-radius: 64px;
        background: #0b1711; border: 3px solid #33493c;
        box-shadow: 0 40px 120px rgba(0,0,0,.55), inset 0 0 0 2px rgba(224,188,101,.12);
      }
      .screen {
        width: 100%; height: 100%; border-radius: 48px; overflow: hidden;
        background: #f6f4ee; color: #202722; display: grid; grid-template-rows: auto auto 1fr;
      }
      .top { background: #103a26; color: #eef0ea; padding: 26px 26px 22px; display: grid; gap: 8px; }
      .top img { width: 210px; }
      .top .kicker { color: #e0bc65; font-size: 15px; letter-spacing: .16em; text-transform: uppercase; font-weight: 800; }
      .top h1 { margin: 0; font-family: Georgia, serif; font-size: 38px; line-height: 1.05; }
      .search { padding: 18px 24px 8px; }
      .search span { display: block; padding: 14px 18px; border: 1px solid #c9cfc6; border-radius: 12px;
        color: #6d7a70; font-size: 19px; background: #fff; }
      .list { padding: 10px 24px 30px; display: grid; gap: 14px; align-content: start; }
      .round { border: 1px solid #d7dcd3; border-radius: 14px; background: #fff; overflow: hidden; }
      .round header { display: flex; justify-content: space-between; align-items: baseline;
        padding: 12px 16px; background: #eef2ea; font-size: 18px; }
      .round ul { margin: 0; padding: 6px 16px; list-style: none; display: grid; }
      .round li { padding: 9px 0; border-bottom: 1px solid #eef0ea; font-size: 20px; font-weight: 600; }
      .round li:last-child { border-bottom: 0; }
      .flight { margin: 0; padding: 8px 16px 12px; color: #6d7a70; font-size: 13px; letter-spacing: .12em; }
    </style>
  </head>
  <body>
    <div id="phone">
      <div class="screen">
        <div class="top">
          <img src="../../public/brand/teeline-logo-reverse.svg" alt="TeeLine Golf" />
          <span class="kicker">Club tournament pairings</span>
          <h1>Bamboo Tee (sample event)</h1>
        </div>
        <div class="search"><span>Find your name</span></div>
        <div class="list">${cards}</div>
      </div>
    </div>
  </body>
</html>
`;

writeFileSync(resolve(ROOT, "demo-video/cards/phone.html"), html);
console.log(`wrote demo-video/cards/phone.html with ${groups.length} groups`);
