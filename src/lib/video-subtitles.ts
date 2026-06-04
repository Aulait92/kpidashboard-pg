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

// ffmpeg-Probe-Modus: ohne Output-Datei → exit 1, aber stderr enthält
// die Duration des Inputs. Wir parsen sie und ignorieren den exit code.
async function probeDuration(path: string): Promise<number | null> {
  return new Promise((resolve) => {
    const proc = spawn(getFfmpegPath(), ["-hide_banner", "-i", path], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", () => resolve(null));
    proc.on("close", () => {
      const m = /Duration:\s+(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
      if (!m) return resolve(null);
      const h = Number.parseInt(m[1], 10);
      const min = Number.parseInt(m[2], 10);
      const s = Number.parseFloat(m[3]);
      resolve(h * 3600 + min * 60 + s);
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

// Strict Wrap: pro Zeile max. maxCharsPerLine Zeichen, beliebig viele
// Zeilen — kein „Rest in die letzte Zeile dumpen"-Fallback mehr (das war
// der Grund für rechts abgeschnittene Untertitel bei langen Segmenten).
function wrapText(text: string, maxCharsPerLine = 22): string {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const lines: string[] = [];
  let buf = "";
  for (const w of words) {
    if (buf.length === 0) {
      buf = w;
    } else if ((buf + " " + w).length > maxCharsPerLine) {
      lines.push(buf);
      buf = w;
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
  textFilesDir: string,
): { chain: string; textFiles: { path: string; content: string }[] } {
  const safeFont = fontFile.replace(/\\/g, "/").replace(/:/g, "\\:");
  const stages: string[] = [];
  const textFiles: { path: string; content: string }[] = [];
  let idx = 0;
  for (const seg of segments) {
    const wrapped = wrapText(seg.text);
    if (!wrapped.trim()) continue;
    // textfile= statt text= verwenden: drawtext liest die Datei roh ein und
    // rendert echte Newlines als Zeilenumbruch — kein Escaping-Streit mit dem
    // ffmpeg-Filter-Parser, der `\n` sonst je nach Build anders interpretiert.
    const filePath = join(textFilesDir, `seg-${idx++}.txt`);
    textFiles.push({ path: filePath, content: wrapped });
    const safePath = filePath.replace(/\\/g, "/").replace(/:/g, "\\:");
    const drawtext = [
      `fontfile=${safeFont}`,
      `textfile=${safePath}`,
      `enable='between(t,${seg.start.toFixed(2)},${seg.end.toFixed(2)})'`,
      // Horizontal zentriert mit Fallback gegen Cutoff: falls eine Zeile
      // doch mal breiter wird als (Frame minus 80px Margin), wird sie auf
      // 40px-Margin links geklemmt statt rechts abzuschneiden.
      `x=if(gt(text_w\\,w-80)\\,40\\,(w-text_w)/2)`,
      // Vertikal näher zur Mitte (zentriert, leicht nach unten versetzt).
      `y=(h-text_h)/2+h/10`,
      `fontsize=42`,
      `fontcolor=white`,
      `borderw=5`,
      `bordercolor=black`,
      `line_spacing=8`,
      `box=0`,
      `fix_bounds=1`,
    ].join(":");
    stages.push(`drawtext=${drawtext}`);
  }
  return { chain: stages.join(","), textFiles };
}

// Brennt deutsche Untertitel ins MP4 ein und liefert den neuen Buffer zurück.
// Bei jedem Fehler (Whisper down, ffmpeg fails, Audio fehlt) wird der Original-
// Buffer zurückgegeben — Untertitel sind ein Nice-to-have, kein Hard-Block.
export async function burnGermanSubtitles(
  videoBuffer: Buffer,
  onProgress?: (msg: string) => void | Promise<void>,
): Promise<{ buffer: Buffer; burned: boolean; note?: string }> {
  const dir = await mkdtemp(join(tmpdir(), "sora-subs-"));
  const inputPath = join(dir, "in.mp4");
  const audioPath = join(dir, "audio.mp3");
  const outputPath = join(dir, "out.mp4");

  try {
    await writeFile(inputPath, videoBuffer);

    // 0. Input-Länge messen, damit wir das Output am Ende exakt darauf
    // cappen können. ffmpeg-Audio-Reencodes haben sonst eine Tendenz zur
    // Drift (paar Frames zu wenig am Ende).
    const inputDuration = await probeDuration(inputPath);

    await onProgress?.("Audio extrahieren…");

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
    await onProgress?.("Whisper transkribiert…");
    const segments = await transcribeAudio(audioPath);
    await onProgress?.(
      `Whisper: ${segments.length} ${segments.length === 1 ? "Segment" : "Segmente"}.`,
    );
    if (segments.length === 0) {
      return {
        buffer: videoBuffer,
        burned: false,
        note: "Whisper lieferte kein Transkript — Untertitel übersprungen.",
      };
    }

    // 3. drawtext-Filterkette bauen. Pro Segment wird die Text-Datei in
    // tempdir geschrieben und referenziert — vermeidet Escaping-Probleme
    // bei Sonderzeichen und macht echte Zeilenumbrüche zuverlässig.
    const { chain, textFiles } = buildDrawtextChain(
      segments,
      getFontPath(),
      dir,
    );
    if (!chain) {
      return {
        buffer: videoBuffer,
        burned: false,
        note: "Keine renderbaren Segmente — Untertitel übersprungen.",
      };
    }
    for (const f of textFiles) {
      await writeFile(f.path, f.content, "utf8");
    }
    await onProgress?.(
      inputDuration
        ? `ffmpeg encodiert mit Untertiteln (${inputDuration.toFixed(2)}s)…`
        : "ffmpeg encodiert mit Untertiteln…",
    );

    // 4. Encoding. Audio neu codieren, damit Container-Quirks aus dem Sora-
    // Output nicht zu Stream-Mismatch führen. -t setzt die Output-Dauer
    // exakt auf die gemessene Input-Dauer (kein Drift durch AAC-Reencode).
    const args: string[] = [
      "-i",
      inputPath,
      "-vf",
      chain,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
    ];
    if (inputDuration && inputDuration > 0) {
      args.push("-t", inputDuration.toFixed(3));
    }
    args.push("-y", outputPath);
    await runFfmpeg(args, "burn subtitles");

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
