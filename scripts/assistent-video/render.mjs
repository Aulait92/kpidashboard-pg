// Video „So arbeitet Ihr digitaler Assistent“ (Folie 13 der Vertriebspräsentationen) aus assistent.html neu erzeugen
// (20.11.2026: Nachbau des Originals mit gleichem Layout und Timing, Lead gesiezt, ohne Gedankenstriche).
// Texte und Zeitplan stehen in cfg.js (ALT = altes Video zum Vergleich, NEU = aktuelle Fassung).
//
//   node scripts/assistent-video/render.mjs neu /tmp/av/frames            # 1410 PNG (30 fps, 47 s, 1920x1080)
//   ffmpeg -framerate 30 -i /tmp/av/frames/%04d.png -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p \
//     -movflags +faststart -an /tmp/av/assistent.mp4
//   # Standbild = Frame 0000, PDF-Einzelbilder = Frames 0030 0246 0360 0660 0870 1050 1250 1400
//   python3 scripts/assistent-video/einsetzen.py docs/unterlagen /tmp/av/assistent.mp4 /tmp/av/frames/0000.png \
//     /tmp/av/frames/{0030,0246,0360,0660,0870,1050,1250,1400}.png
//   # Web: ffmpeg -i /tmp/av/assistent.mp4 -vf scale=1280:-2 -c:v libx264 -crf 28 -preset slow -an -movflags +faststart \
//   #   public/praesentation/vertrieb/assistent.mp4; Standbild als {vertreter,makler}/13.webp (1600 px, Qualität 78)
//
// Optional: node render.mjs neu <dir> 120,300  rendert nur diese Frames (zum Vergleichen).
import { chromium } from "playwright";
import { mkdirSync, linkSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";

const [fassung, out, list] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const b = await chromium.launch(process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM } : {});
const p = await b.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 2 });
await p.addInitScript((f) => { window.FASSUNG = f; }, fassung);
await p.goto("file://" + path.resolve(path.dirname(new URL(import.meta.url).pathname), "assistent.html"));
await p.evaluate(() => document.fonts.ready);
const frames = list ? list.split(",").map(Number) : [...Array(1410).keys()];
let lastKey = null, lastFile = null;
for (const n of frames) {
  const key = await p.evaluate((n) => window.render(n), n);
  const file = path.join(out, `${String(n).padStart(4, "0")}.png`);
  if (existsSync(file)) unlinkSync(file);
  // gleiche Frames als Hardlink (spart Zeit und Platz)
  if (key === lastKey && !list) linkSync(lastFile, file);
  else { await p.screenshot({ path: file }); lastKey = key; lastFile = file; }
}
await b.close();
