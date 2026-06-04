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

async function runFfmpeg(
  args: string[],
  step: string,
): Promise<{ stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(getFfmpegPath(), args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stderrChunks: string[] = [];
    proc.stderr.on("data", (chunk) => {
      stderrChunks.push(chunk.toString());
      // Stderr-Ring auf die letzten ~32KB begrenzen.
      const total = stderrChunks.join("").length;
      if (total > 32_768) stderrChunks.splice(0, 1);
    });
    proc.on("error", (err) => reject(err));
    proc.on("close", (code, signal) => {
      const stderr = stderrChunks.join("");
      if (code === 0) return resolve({ stderr });
      const tail = stderr.split("\n").slice(-10).join("\n");
      reject(
        new Error(
          `ffmpeg (${step}) exit code=${code} signal=${signal ?? "none"}:\n${tail}`,
        ),
      );
    });
  });
}

// Parst aus ffmpeg-stderr Duration des Inputs und tatsächliche Output-Dauer
// (steht in der finalen Progress-Zeile als `time=HH:MM:SS.ms`).
function parseFfmpegDurations(stderr: string): {
  inputDuration?: number;
  outputTime?: number;
} {
  const hms = (h: string, m: string, s: string) =>
    Number.parseInt(h, 10) * 3600 +
    Number.parseInt(m, 10) * 60 +
    Number.parseFloat(s);
  const inputMatch = /Duration:\s+(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  const timeMatches = [
    ...stderr.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g),
  ];
  const lastTime = timeMatches[timeMatches.length - 1];
  return {
    inputDuration: inputMatch
      ? hms(inputMatch[1], inputMatch[2], inputMatch[3])
      : undefined,
    outputTime: lastTime
      ? hms(lastTime[1], lastTime[2], lastTime[3])
      : undefined,
  };
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

const MAX_CHARS_PER_LINE = 22;
const MAX_LINES_PER_SUBTITLE = 2;

// Lange Whisper-Segmente in Untertitel-Häppchen à max 2 Zeilen × 22 Zeichen
// splitten. Jeder Chunk bekommt einen Zeit-Anteil proportional zur Zeichen-
// länge (Approximation, weil ohne Word-Timestamps Whisper keine genaueren
// Zeitstempel mitliefert).
function splitSegment(seg: WhisperSegment): WhisperSegment[] {
  const maxChars = MAX_CHARS_PER_LINE * MAX_LINES_PER_SUBTITLE;
  const text = seg.text.trim();
  if (!text) return [];
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let buf = "";
  for (const w of words) {
    if (buf.length === 0) {
      buf = w;
    } else if ((buf + " " + w).length > maxChars) {
      chunks.push(buf);
      buf = w;
    } else {
      buf += " " + w;
    }
  }
  if (buf) chunks.push(buf);
  if (chunks.length === 1) return [{ ...seg, text: chunks[0] }];

  const totalChars = chunks.reduce((s, c) => s + c.length, 0);
  const segDuration = Math.max(0, seg.end - seg.start);
  const out: WhisperSegment[] = [];
  let cursor = seg.start;
  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1;
    const slice =
      totalChars > 0 ? (chunks[i].length / totalChars) * segDuration : 0;
    const end = isLast ? seg.end : cursor + slice;
    out.push({ start: cursor, end, text: chunks[i] });
    cursor = end;
  }
  return out;
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
  options: {
    onProgress?: (msg: string) => void | Promise<void>;
  } = {},
): Promise<{ buffer: Buffer; burned: boolean; note?: string }> {
  const onProgress = options.onProgress;
  // Tail-Padding: konstante N Sekunden eingefrorener letzter Frame +
  // Stille, damit der CTA am Ende Zeit zum „Landen" bekommt statt
  // abrupt zu schneiden. SUBTITLE_TAIL_PAD_SEC override (default 5s,
  // 0 = aus). Sora-Default 20s + 5s Tail = 25s Output.
  const tailPadSec = Number(process.env.SUBTITLE_TAIL_PAD_SEC ?? 5);
  const dir = await mkdtemp(join(tmpdir(), "sora-subs-"));
  const inputPath = join(dir, "in.mp4");
  const audioPath = join(dir, "audio.mp3");
  const outputPath = join(dir, "out.mp4");

  try {
    await writeFile(inputPath, videoBuffer);
    await onProgress?.("Audio extrahieren…");

    // 1. Audio extrahieren. stderr enthält die echte Sora-Input-Dauer, die
    // wir an den Aufrufer melden — so sehen wir, ob Sora kürzer geliefert
    // hat als angefordert.
    const { stderr: audioStderr } = await runFfmpeg(
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
    const sora = parseFfmpegDurations(audioStderr);
    if (sora.inputDuration) {
      await onProgress?.(
        `Sora-Original-Länge: ${sora.inputDuration.toFixed(2)}s.`,
      );
    }

    // 2. Whisper-Transkription.
    await onProgress?.("Whisper transkribiert…");
    const rawSegments = await transcribeAudio(audioPath);
    if (rawSegments.length === 0) {
      return {
        buffer: videoBuffer,
        burned: false,
        note: "Whisper lieferte kein Transkript — Untertitel übersprungen.",
      };
    }
    // Lange Segmente in 2-Zeilen-Häppchen splitten, damit kein einzelner
    // Untertitel länger als 2×22 Zeichen wird. Schneller hintereinander
    // → besser lesbar.
    const segments = rawSegments.flatMap(splitSegment);
    await onProgress?.(
      `Whisper: ${rawSegments.length} → ${segments.length} Untertitel-Häppchen.`,
    );

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
    // 4. Tail-Padding: konstante Hänge-Sekunden mit eingefrorenem letztem
    // Frame, damit der CTA Zeit zum Landen bekommt. Sora's echte Länge
    // ist egal — wir hängen einfach N Sekunden hinten dran.
    const padSec = Math.max(0, tailPadSec);
    const needsPadding = padSec >= 0.5;
    if (needsPadding) {
      await onProgress?.(
        `Hänge ${padSec.toFixed(1)}s Standbild + Stille als Tail an…`,
      );
    } else {
      await onProgress?.(
        `Kein Tail-Padding (SUBTITLE_TAIL_PAD_SEC=${padSec.toFixed(1)}). ffmpeg encodiert mit Untertiteln…`,
      );
    }

    // 5. Encoding. stderr behalten wir uns, um die echte Output-Dauer dem
    // Aufrufer mitzugeben.
    //   -c:a copy   : Audio unverändert übernehmen — vermeidet Priming-
    //                 Delay am Anfang und Drift am Ende durch AAC-Reencode.
    //   -fflags +genpts + -avoid_negative_ts make_zero
    //                 : robuste Timestamps, falls Sora-MP4 negative oder
    //                   weglaufende PTS hat (Sora-Output hat das gelegentlich).
    //   -vsync passthrough
    //                 : Frame-Timing aus dem Input übernehmen, statt zu
    //                   re-samplen.
    //   KEIN -t  : Wir vertrauen der echten Input-Länge.
    // Filter-Chain:
    //   • drawtext-Stages (Untertitel)
    //   • tpad freezed den letzten Frame `padSec` Sekunden lang (nur wenn
    //     Padding gebraucht wird — drawtext zeichnet nicht auf den
    //     gepaddeten Frames, weil deren Timestamps außerhalb aller
    //     `enable=between(t,…)`-Ranges liegen).
    const vfChain = needsPadding
      ? `${chain},tpad=stop_mode=clone:stop_duration=${padSec.toFixed(3)}`
      : chain;

    const args: string[] = [
      "-fflags",
      "+genpts",
      "-i",
      inputPath,
      "-vf",
      vfChain,
      "-vsync",
      "passthrough",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
    ];
    if (needsPadding) {
      // apad braucht Audio-Reencode (geht nicht mit -c:a copy). tpad und apad
      // verlängern Video- und Audio-Stream beide um padSec — Output endet
      // bei sora_duration + padSec.
      args.push(
        "-af",
        `apad=pad_dur=${padSec.toFixed(3)}`,
        "-c:a",
        "aac",
        "-b:a",
        "128k",
      );
    } else {
      args.push("-c:a", "copy");
    }
    args.push(
      "-avoid_negative_ts",
      "make_zero",
      "-movflags",
      "+faststart",
      "-y",
      outputPath,
    );
    const { stderr } = await runFfmpeg(args, "burn subtitles");

    const durations = parseFfmpegDurations(stderr);
    if (durations.inputDuration && durations.outputTime) {
      const delta = durations.outputTime - durations.inputDuration;
      await onProgress?.(
        `Encoding fertig: Input ${durations.inputDuration.toFixed(2)}s, Output ${durations.outputTime.toFixed(2)}s (Δ ${delta.toFixed(2)}s).`,
      );
    }

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
