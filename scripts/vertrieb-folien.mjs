#!/usr/bin/env node
// Vertriebspräsentation als Web-Präsentation (Ole, 15.11.2026): Folienbilder aus den PPTX in docs/unterlagen
// nach public/praesentation/vertrieb/{vertreter,makler}/NN.webp (1600 px breit) und das Video der Assistenten-Folie
// nach public/praesentation/vertrieb/assistent.mp4 (+ Standbild). Einmal nach jeder neuen Fassung der Folien laufen
// lassen und die Dateien committen; die Folienliste steht in src/lib/vertrieb/verkaufspraesentation.ts.
//
//   node scripts/vertrieb-folien.mjs
//
// Braucht: unzip, ffmpeg (Video), sharp (liegt mit Next.js in node_modules).

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const out = path.join(root, "public/praesentation/vertrieb");
const DATEI = { vertreter: "Vertreter-Praesentation.pptx", makler: "Makler-Praesentation.pptx" };

/** Folien in Präsentationsreihenfolge mit ihren Medien (Bild in voller Größe, ggf. Video). */
function folien(dir) {
  const pres = readFileSync(path.join(dir, "ppt/presentation.xml"), "utf8");
  const rels = readFileSync(path.join(dir, "ppt/_rels/presentation.xml.rels"), "utf8");
  const ziel = new Map([...rels.matchAll(/<Relationship [^>]*>/g)].map((m) => [/Id="([^"]+)"/.exec(m[0])[1], /Target="([^"]+)"/.exec(m[0])[1]]));
  // Folie „Ihr Abschlussbonus“ (Bild abschlussbonus.png, scripts/bonus-folie-einfuegen.py) gibt es nur in PPTX/PDF;
  // die Web-Präsentation fügt sie selbst mit der Frist aus dem Angebot ein. Deshalb hier überspringen.
  const ohneBonus = [...pres.matchAll(/<p:sldId [^>]*r:id="([^"]+)"/g)].filter((m) => {
    const name = path.basename(ziel.get(m[1]));
    return !readFileSync(path.join(dir, "ppt/slides/_rels", `${name}.rels`), "utf8").includes("abschlussbonus.png");
  });
  return ohneBonus.map((m, n) => {
    const name = path.basename(ziel.get(m[1]));
    const sr = readFileSync(path.join(dir, "ppt/slides/_rels", `${name}.rels`), "utf8");
    const xml = readFileSync(path.join(dir, "ppt/slides", name), "utf8");
    const media = new Map([...sr.matchAll(/<Relationship [^>]*>/g)].map((r) => [/Id="([^"]+)"/.exec(r[0])[1], /Target="([^"]+)"/.exec(r[0])[1]]));
    const datei = (id) => (media.get(id)?.startsWith("../media/") ? path.join(dir, "ppt/media", media.get(id).slice(9)) : null);
    // Folienbild = das tatsächlich gezeigte Bild (a:blip r:embed); daneben liegen alte Vorschaubilder ohne Größe
    const bilder = [...xml.matchAll(/<a:blip r:embed="([^"]+)"/g)].map((x) => datei(x[1])).filter(Boolean).sort((a, b) => statSync(b).size - statSync(a).size);
    const video = [...media.values()].find((t) => /\.mp4$/i.test(t));
    return { nr: n + 1, bild: bilder[0], video: video ? path.join(dir, "ppt/media", path.basename(video)) : null };
  });
}

let video = null;
for (const [audience, datei] of Object.entries(DATEI)) {
  const tmp = mkdtempSync(path.join(tmpdir(), "pptx-"));
  try {
    execFileSync("unzip", ["-oq", path.join(root, "docs/unterlagen", datei), "-d", tmp]);
    const fs = folien(tmp);
    mkdirSync(path.join(out, audience), { recursive: true });
    for (const f of fs) {
      const ziel = path.join(out, audience, `${String(f.nr).padStart(2, "0")}.webp`);
      await sharp(f.bild).resize({ width: 1600 }).webp({ quality: 78 }).toFile(ziel);
      if (f.video && !video) {
        video = path.join(out, "assistent.mp4");
        execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", f.video, "-vf", "scale=1280:-2", "-c:v", "libx264", "-crf", "28", "-preset", "slow", "-an", "-movflags", "+faststart", video]);
      }
      console.log(`${audience} ${f.nr}: ${path.basename(f.bild)}${f.video ? " + Video" : ""} → ${path.relative(root, ziel)} (${Math.round(statSync(ziel).size / 1024)} KB)`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
if (video) console.log(`Video → ${path.relative(root, video)} (${Math.round(statSync(video).size / 1024)} KB)`);
