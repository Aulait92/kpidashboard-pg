// Untertitel-Pipeline für Sora-Videos.
//
// Sora generiert oft Buchstaben-Soup wenn es eigenständig Text ins Bild
// schreibt. Wir lassen Sora dann lieber NUR die Audio sprechen und brennen
// die deutschen Untertitel hinterher per Whisper + ffmpeg sauber rein.
//
// Pipeline:
//   1. MP4 → ffmpeg → MP3 (Audio-Spur)
//   2. MP3 → Whisper API (whisper-1, verbose_json, segment timestamps, de)
//   3. ffmpeg drawtext-Filter (eine Drawtext-Stage pro Segment, gated mit
//      between(t, start, end)) brennt die Untertitel ins Video.
//
// Warum drawtext und nicht `subtitles` (SRT/libass)? Der libass-Pfad
// braucht fontconfig + System-Fonts, die im Container nicht da sind →
// ffmpeg wurde mit „exit null" (Signal) gekillt. drawtext nimmt eine
// gebundelte TTF-Datei direkt ohne fontconfig.

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let cachedFfmpegPath: string | null = null;
function getFfmpegPath(): string {
  if (cachedFfmpegPath) return cachedFfmpegPath;
  // @ffmpeg-installer/ffmpeg löst seinen Binary-Pfad per dynamic require auf.
  // Lazy + eval-require, damit Turbopack das Modul nicht statisch zu analysieren
  // versucht (siehe serverExternalPackages in next.config.ts).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const installer = eval("require")("@ffmpeg-installer/ffmpeg") as {
    path: string;
  };
  cachedFfmpegPath = installer.path;
  return cachedFfmpegPath;
}

function getFontPath(): string {
  // Schrift liegt in public/fonts/ und wird vom Next-Build mitgeliefert.
  // Standalone-Builds: process.cwd() zeigt auf das Server-Root.
  return join(process.cwd(), "public", "fonts", "DejaVuSans.ttf");
}

type WhisperSegment = {
  start: number;
  end: number;
  text: string;
};

async function runFfmpeg(args: string[], step: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(getFfmpegPath(), args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stderrChunks: string[] = [];
    proc.stderr.on("data", (chunk) => {
      stderrChunks.push(chunk.toString());
      // Stderr-Ring auf die letzten ~16KB begrenzen.
      const total = stderrChunks.join("").length;
      if (total > 16_384) stderrChunks.splice(0, 1);
    });
    proc.on("error", (err) => reject(err));
    proc.on("close", (code, signal) => {
      if (code === 0) return resolve();
      const tail = stderrChunks.join("").split("\n").slice(-10).join("\n");
      reject(
        new Error(
          `ffmpeg (${step}) exit code=${code} signal=${signal ?? "none"}:\n${tail}`,
        ),
      );
    });
  });
}

async function transcribeAudio(audioPath: string): Promise<WhisperSegment[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY nicht gesetzt.");
  const buf = await readFile(audioPath);
  const form = new FormData();
  form.set(
    "file",
    new Blob([new Uint8Array(buf)], { type: "audio/mpeg" }),
    "audio.mp3",
  );
  form.set("model", process.env.WHISPER_MODEL ?? "whisper-1");
  form.set("response_format", "verbose_json");
  form.set("language", "de");
  form.set("timestamp_granularities[]", "segment");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Whisper ${res.status}: ${text.slice(0, 400)}`);
  }
  const json = (await res.json()) as {
    segments?: WhisperSegment[];
    text?: string;
  };
  if (!json.segments || json.segments.length === 0) {
    if (json.text && json.text.trim().length > 0) {
      return [{ start: 0, end: 9999, text: json.text }];
    }
    return [];
  }
  return json.segments;
}

// drawtext erwartet, dass im Text-Argument bestimmte Zeichen escaped sind:
//   \  →  \\
//   '  →  \'   (innerhalb '…')
//   :  →  \:   (Filter-Trennzeichen)
//   ,  →  \,   (Filter-Argument-Trennzeichen)
//   %  →  \%
//   newline → entfernen, sonst killt es den Filter.
function escapeDrawtext(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/,/g, "\\,")
    .replace(/%/g, "\\%")
    .replace(/[\r\n]+/g, " ")
    .trim();
}

// Lange Zeilen in 2–3 Zeilen wrappen, damit der Text in einem 720px-Frame
// nicht über die Bildkante rauswächst. drawtext rendert „\n" als Linebreak,
// wenn man im filter-Argument `text='Zeile1' und expansion=none setzt — wir
// schreiben den literalen Backslash-n in den Filter-Wert.
function wrapText(text: string, maxCharsPerLine = 32, maxLines = 3): string {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const lines: string[] = [];
  let buf = "";
  for (const w of words) {
    if (buf.length === 0) {
      buf = w;
    } else if ((buf + " " + w).length > maxCharsPerLine) {
      lines.push(buf);
      buf = w;
      if (lines.length >= maxLines - 1) {
        // Restliche Wörter in die letzte Zeile packen, lieber zu lang als
        // abgeschnitten.
        buf = [w, ...words.slice(words.indexOf(w) + 1)].join(" ");
        break;
      }
    } else {
      buf += " " + w;
    }
  }
  if (buf) lines.push(buf);
  return lines.join("\n");
}

function buildDrawtextChain(
  segments: WhisperSegment[],
  fontFile: string,
): string {
  const safeFont = fontFile.replace(/\\/g, "/").replace(/:/g, "\\:");
  const stages: string[] = [];
  for (const seg of segments) {
    const text = wrapText(seg.text);
    if (!text) continue;
    // Filter-Argumente sind selbst durch `:` getrennt — Wert mit `'…'`
    // quoten und Innen-Werte escapen.
    const drawtext = [
      `fontfile=${safeFont}`,
      `text='${escapeDrawtext(text)}'`,
      `enable='between(t,${seg.start.toFixed(2)},${seg.end.toFixed(2)})'`,
      // Zentriert horizontal, unteres Drittel.
      `x=(w-text_w)/2`,
      `y=h-(text_h+50)`,
      `fontsize=28`,
      `fontcolor=white`,
      `borderw=4`,
      `bordercolor=black`,
      `line_spacing=6`,
      `box=0`,
    ].join(":");
    stages.push(`drawtext=${drawtext}`);
  }
  return stages.join(",");
}

// Brennt deutsche Untertitel ins MP4 ein und liefert den neuen Buffer zurück.
// Bei jedem Fehler (Whisper down, ffmpeg fails, Audio fehlt) wird der Original-
// Buffer zurückgegeben — Untertitel sind ein Nice-to-have, kein Hard-Block.
export async function burnGermanSubtitles(
  videoBuffer: Buffer,
): Promise<{ buffer: Buffer; burned: boolean; note?: string }> {
  const dir = await mkdtemp(join(tmpdir(), "sora-subs-"));
  const inputPath = join(dir, "in.mp4");
  const audioPath = join(dir, "audio.mp3");
  const outputPath = join(dir, "out.mp4");

  try {
    await writeFile(inputPath, videoBuffer);

    // 1. Audio extrahieren.
    await runFfmpeg(
      [
        "-i",
        inputPath,
        "-vn",
        "-acodec",
        "libmp3lame",
        "-b:a",
        "128k",
        "-y",
        audioPath,
      ],
      "extract audio",
    );

    // 2. Whisper-Transkription.
    const segments = await transcribeAudio(audioPath);
    if (segments.length === 0) {
      return {
        buffer: videoBuffer,
        burned: false,
        note: "Whisper lieferte kein Transkript — Untertitel übersprungen.",
      };
    }

    // 3. drawtext-Filterkette bauen.
    const chain = buildDrawtextChain(segments, getFontPath());
    if (!chain) {
      return {
        buffer: videoBuffer,
        burned: false,
        note: "Keine renderbaren Segmente — Untertitel übersprungen.",
      };
    }

    // 4. Encoding bewusst leichtgewichtig: ultrafast-Preset, single-thread
    // Cap, moderate CRF — damit der Container nicht OOM bekommt.
    await runFfmpeg(
      [
        "-i",
        inputPath,
        "-vf",
        chain,
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "24",
        "-pix_fmt",
        "yuv420p",
        "-threads",
        "2",
        "-c:a",
        "copy",
        "-movflags",
        "+faststart",
        "-y",
        outputPath,
      ],
      "burn subtitles",
    );

    const out = await readFile(outputPath);
    return { buffer: out, burned: true };
  } catch (err) {
    console.warn(
      "[subtitles] burn failte, liefere Original zurück:",
      err instanceof Error ? err.message : err,
    );
    return {
      buffer: videoBuffer,
      burned: false,
      note: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
