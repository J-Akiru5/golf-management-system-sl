import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../public", import.meta.url)));
const port = Number(process.env.PORT || 3101);
const par = [4, 4, 4, 5, 3, 4, 4, 4, 4, 3, 4, 4, 3, 5, 4, 3, 4, 4];
const names = ["ALPHA, ONE", "BETA, TWO", "GAMMA, THREE", "DELTA, FOUR"];
const players = names.map((name, i) => ({
  playerId: `preview-player-${i + 1}`,
  registrationId: `preview-registration-${i + 1}`,
  partnerPlayerId: `preview-player-${i % 2 === 0 ? i + 2 : i}`,
  partnerRegistrationId: `preview-registration-${i % 2 === 0 ? i + 2 : i}`,
  name,
  partner: names[i % 2 === 0 ? i + 1 : i - 1],
  team: Math.floor(i / 2) + 1,
  group: Math.floor(i / 2) + 1,
  dayNumber: 1,
  playDate: "2026-11-15",
  teeTime: `06:${String(30 + Math.floor(i / 2) * 4).padStart(2, "0")}`,
  session: "AM",
  startHole: 1,
  wave: "A",
  flight: "A",
  cls: i < 2 ? "A" : "B",
  formulaClass: i < 2 ? "A" : "B",
  frozenIndex: 8 + i * 2,
  playingHandicap: 10 + i * 2,
  tee: i % 2 === 0 ? "Blue" : "White",
  teeCode: i % 2 === 0 ? "B" : "W",
}));
const field = {
  ok: true,
  event: "24th Bamboo Tee",
  tournamentId: "local-ui-preview",
  dayNumber: 1,
  playDate: "2026-11-15",
  maxIndex: 30,
  allowance: 1,
  days: [{ day: 1, date: "2026-11-15" }, { day: 2, date: "2026-11-16" }],
  players,
};
const scores = (n) => par.map((value, i) => String(value + ((n + i) % 4 === 0 ? 1 : 0)));
const cards = players.map((p, i) => ({
  id: `preview-card-${i + 1}`,
  manual: false,
  playerId: p.playerId,
  registrationId: p.registrationId,
  name: p.name,
  group: String(p.group),
  tee: p.teeCode,
  hdcp: i === 2 ? String(p.playingHandicap + 4) : String(p.playingHandicap),
  written: i < 2 ? String(scores(i + 1).reduce((a, v) => a + Number(v), 0)) : "",
  cls: p.cls,
  verified: i === 0,
  day: "1",
  session: "AM",
  note: "",
  source: "Local UI preview sample",
  holes: i < 2 ? scores(i + 1) : Array(18).fill(""),
}));
const seed = { cards, reviewBatches: [], activeReviewBatchId: "all", mode: "written" };
const mockScript = `
(() => {
  const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
  const sampleField = ${JSON.stringify(field)};
  const sampleDocument = { cards: ${JSON.stringify(cards)}, reviewBatches: [], activeReviewBatchId: "all", mode: "written" };
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    if (!url.startsWith("/api/scorecards/")) return originalFetch(input, init);
    if (url === "/api/scorecards/session") return json({ email: "Local UI preview · sample only", role: "tabulation" });
    if (url.startsWith("/api/scorecards/field")) return json(sampleField);
    if (url.endsWith("/snapshot")) return json({ ok: true, path: "local-only", at: new Date().toISOString() });
    if (url === "/api/scorecards/submit") {
      const body = JSON.parse(init.body || "{}");
      return json({ ok: true, submission: { at: new Date().toISOString(), by: "Local UI preview", label: "Day 1 AM", slug: "day1am-r5", cards: body.cards || [], nameOnly: body.nameOnly || [], unmatched: [] } });
    }
    if (url.endsWith("/export")) return new Response(JSON.stringify(sampleDocument), { headers: { "content-type": "application/json" } });
    if (init.method === "PUT") {
      const body = JSON.parse(init.body || "{}");
      return json({ ok: true, updatedAt: new Date().toISOString(), serverTime: Date.now(), updatedBy: "Local UI preview", payload: body.payload || sampleDocument });
    }
    return json({ payload: sampleDocument, updatedAt: new Date().toISOString(), updatedBy: "Local UI preview", serverTime: Date.now() });
  };
  try {
    sessionStorage.setItem("bamboo-tab", "ui-preview");
    localStorage.setItem("bamboo-scores-day1am-r5-v1-ui-preview", JSON.stringify(${JSON.stringify(seed)}));
  } catch {}
})();
`;
const mime = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".json": "application/json; charset=utf-8",
};

const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).pathname;
    if (pathname === "/scorecard" || pathname === "/scorecard/") {
      let html = await readFile(resolve(root, "scorecard/index.html"), "utf8");
      html = html.replace(/<body([^>]*)>/i, `<body$1><div role="status" style="position:sticky;top:0;z-index:100;background:#b89550;color:#202522;padding:8px 12px;text-align:center;font:600 14px/1.4 system-ui">LOCAL UI PREVIEW · SAMPLE DATA · Not connected to Supabase. Changes are temporary.</div>`);
      html = html.replace(/<script>\s*const SRC =/, `<script>\n${mockScript}\n</script>\n<script>\nconst SRC =`);
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(html);
      return;
    }
    const pathnameDecoded = decodeURIComponent(pathname);
    const target = resolve(root, `.${pathnameDecoded}`);
    if (target !== root && !target.startsWith(root + sep)) {
      res.writeHead(403); res.end("Forbidden"); return;
    }
    const body = await readFile(target);
    res.writeHead(200, { "content-type": mime[extname(target)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
});
server.listen(port, "127.0.0.1", () => console.log(`Sample-only TeeLine UI preview at http://127.0.0.1:${port}/scorecard/`));
