/**
 * Assembles the recorded scenes and the line-level narration into the final AVP.
 *
 * Usage: pnpm avp:build
 * Output: demo-video/out/avp-5min.mp4, avp-90s.mp4, .srt, chapters.txt, poster.jpg
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "..");
const VIDEO = resolve(ROOT, "demo-video");
const OUT = resolve(VIDEO, "out");
const WORK = resolve(VIDEO, "build/work");
const local = process.env.LOCALAPPDATA ?? "";
const shim = resolve(local, "Microsoft/WinGet/Links");
const ffmpeg =
  process.env.FFMPEG ?? (existsSync(resolve(shim, "ffmpeg.exe")) ? resolve(shim, "ffmpeg.exe") : "ffmpeg");
const ffprobe =
  process.env.FFPROBE ?? (existsSync(resolve(shim, "ffprobe.exe")) ? resolve(shim, "ffprobe.exe") : "ffprobe");

const steps = JSON.parse(readFileSync(resolve(VIDEO, "steps.json"), "utf8"));
const timeline = JSON.parse(readFileSync(resolve(VIDEO, "audio/timeline.json"), "utf8"));
const timing = JSON.parse(readFileSync(resolve(VIDEO, "capture/timing.json"), "utf8"));

mkdirSync(OUT, { recursive: true });
mkdirSync(WORK, { recursive: true });

const run = (args) => execFileSync(ffmpeg, args, { stdio: "inherit" });
const probe = (file, args) =>
  execFileSync(ffprobe, ["-v", "error", ...args, file], { encoding: "utf8" }).trim();

const segments = [];
const captions = [];
const availableScenes = steps.scenes.filter((scene) => timing[scene.id] && timeline.scenes[scene.id]);
const proof = availableScenes.length !== steps.scenes.length;
let cursor = 0;

for (const [index, scene] of availableScenes.entries()) {
  const t = timing[scene.id];
  const sceneTimeline = timeline.scenes[scene.id];
  if (!t) throw new Error(`no recording for ${scene.id}; run the capture step first`);
  if (!sceneTimeline) throw new Error(`no timeline for ${scene.id}`);

  const length = t.seconds ?? sceneTimeline.duration + 0.5;
  const segment = resolve(WORK, `${String(index + 1).padStart(2, "0")}-${scene.id}.mp4`);
  run([
    "-y",
    "-ss",
    String(t.trimStart),
    "-t",
    String(length + 0.4),
    "-i",
    t.raw,
    "-i",
    t.audio,
    "-filter_complex",
    "[0:v]fps=25,tpad=stop_mode=clone:stop_duration=2,scale=1920:1080:flags=lanczos,setpts=PTS-STARTPTS[v]",
    "-map",
    "[v]",
    "-map",
    "1:a",
    "-af",
    "apad,asetpts=PTS-STARTPTS",
    "-t",
    String(length),
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    "48000",
    "-fps_mode",
    "cfr",
    "-video_track_timescale",
    "25000",
    "-fflags",
    "+genpts",
    "-avoid_negative_ts",
    "make_zero",
    segment,
  ]);
  segments.push(segment);

  for (const line of sceneTimeline.lines) {
    captions.push({ start: cursor + line.start, end: cursor + line.end, text: line.text });
  }
  cursor += length;
  console.log(`segment ${index + 1}: ${scene.id} ${length.toFixed(2)}s`);
}

const list = resolve(WORK, "concat.txt");
writeFileSync(list, segments.map((s) => `file '${s.replaceAll("\\", "/")}'`).join("\n") + "\n");
const joined = resolve(WORK, "joined.mp4");
run([
  "-y",
  "-f",
  "concat",
  "-safe",
  "0",
  "-i",
  list,
  "-c:v",
  "libx264",
  "-preset",
  "medium",
  "-crf",
  "20",
  "-pix_fmt",
  "yuv420p",
  "-c:a",
  "aac",
  "-b:a",
  "192k",
  "-ar",
  "48000",
  "-video_track_timescale",
  "25000",
  "-avoid_negative_ts",
  "make_zero",
  joined,
]);

const final = resolve(OUT, proof ? "avp-style-proof.mp4" : "avp-5min.mp4");
run([
  "-y",
  "-i",
  joined,
  "-c:v",
  "copy",
  "-af",
  "loudnorm=I=-16:TP=-1.5:LRA=11",
  "-c:a",
  "aac",
  "-b:a",
  "192k",
  "-ar",
  "48000",
  "-movflags",
  "+faststart",
  final,
]);

const srtTime = (value) => {
  const ms = Math.max(0, Math.round(value * 1000));
  const h = String(Math.floor(ms / 3600000)).padStart(2, "0");
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, "0");
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
  const rest = String(ms % 1000).padStart(3, "0");
  return `${h}:${m}:${s},${rest}`;
};
const srt = captions
  .map((caption, i) => `${i + 1}\n${srtTime(caption.start)} --> ${srtTime(caption.end)}\n${caption.text}\n`)
  .join("\n");
writeFileSync(resolve(OUT, "avp-5min.srt"), srt);

let chapter = "";
let chapterStart = 0;
for (const [index, scene] of availableScenes.entries()) {
  const sceneTimeline = timeline.scenes[scene.id];
  const mm = String(Math.floor(chapterStart / 60)).padStart(2, "0");
  const ss = String(Math.floor(chapterStart % 60)).padStart(2, "0");
  chapter += `CHAPTER${String(index + 1).padStart(2, "0")}=${mm}:${ss}:00\nCHAPTER${String(index + 1).padStart(2, "0")}NAME=${scene.title}\n`;
  chapterStart += (timing[scene.id]?.seconds ?? 0) || (sceneTimeline?.duration ?? 0) + 0.5;
}
writeFileSync(resolve(OUT, "chapters.txt"), chapter);

run(["-y", "-ss", "30", "-i", final, "-frames:v", "1", "-update", "1", "-q:v", "2", resolve(OUT, "poster.jpg")]);

const duration = Number(probe(final, ["-show_entries", "format=duration", "-of", "default=nw=1:nk=1"]));
console.log(`\nfinal: ${final}`);
console.log(`duration: ${duration.toFixed(2)}s (${(duration / 60).toFixed(2)} min)`);
if (duration < 300 || duration > 400) console.warn("WARNING: duration is outside the 5:00 to 6:40 target");

const shortIds = ["02-one-desk", "06-draw", "07-publish"];
const shortSegments = segments.filter((segment) => shortIds.some((id) => segment.includes(id)));
if (!proof && shortSegments.length === shortIds.length) {
const shortList = resolve(WORK, "short.txt");
writeFileSync(shortList, shortSegments.map((s) => `file '${s.replaceAll("\\", "/")}'`).join("\n") + "\n");
const shortJoined = resolve(WORK, "short-joined.mp4");
run([
  "-y",
  "-f",
  "concat",
  "-safe",
  "0",
  "-i",
  shortList,
  "-c:v",
  "libx264",
  "-preset",
  "medium",
  "-crf",
  "20",
  "-pix_fmt",
  "yuv420p",
  "-c:a",
  "aac",
  "-b:a",
  "192k",
  "-ar",
  "48000",
  "-video_track_timescale",
  "25000",
  "-avoid_negative_ts",
  "make_zero",
  shortJoined,
]);
const shortFinal = resolve(OUT, "avp-90s.mp4");
run([
  "-y",
  "-i",
  shortJoined,
  "-c:v",
  "copy",
  "-af",
  "loudnorm=I=-16:TP=-1.5:LRA=11",
  "-c:a",
  "aac",
  "-b:a",
  "192k",
  "-ar",
  "48000",
  "-movflags",
  "+faststart",
  shortFinal,
]);
const shortDuration = Number(
  probe(shortFinal, ["-show_entries", "format=duration", "-of", "default=nw=1:nk=1"]),
);
console.log(`short cut: ${shortFinal} (${shortDuration.toFixed(2)}s)`);
if (shortDuration > 95) console.warn("WARNING: the short cut is over 95 seconds");
}

rmSync(WORK, { recursive: true, force: true });
