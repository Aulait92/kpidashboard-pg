// Untertitel-Pipeline für Sora-Videos.
//
// Sora generiert oft Buchstaben-Soup wenn es eigenständig Text ins Bild
// schreibt. Wir lassen Sora dann lieber NUR die Audio sprechen und brennen
// die deutschen Untertitel hinterher per Whisper + ffmpeg sauber rein.
//
// Pipeline:
//   1. MP4 → ffmpeg → MP3 (Audio-Spur)
//   2. MP3 → Whisper API (whisper-1, verbose_json, segment timestamps, de)
//   3. Segmente → SRT-Datei
//   4. ffmpeg-Filter `subtitles=…:force_style=…` brennt sie ins Video
//   5. fertiges MP4 zurück als Buffer

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

const ffmpegPath: string = ffmpegInstaller.path;

type WhisperSegment = {
  start: number;
  end: number;
  text: string;
};

async function runFfmpeg(args: string[], step: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", (err) => reject(err));
    proc.on("close", (code) => {
      if (code === 0) return resolve();
      reject(
        new Error(
          `ffmpeg (${step}) exit ${code}: ${stderr.split("\n").slice(-8).join("\n")}`,
        ),
      );
    });
  });
}

function srtTime(sec: number): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const millis = ms % 1000;
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(millis, 3)}`;
}

function formatSrt(segments: WhisperSegment[]): string {
  return segments
    .map((seg, i) => {
      const text = seg.text.trim();
      if (!text) return "";
      return `${i + 1}\n${srtTime(seg.start)} --> ${srtTime(seg.end)}\n${text}\n`;
    })
    .filter((s) => s.length > 0)
    .join("\n");
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
    // Fallback: einen Block über die ganze Audio-Länge.
    if (json.text && json.text.trim().length > 0) {
      return [{ start: 0, end: 9999, text: json.text }];
    }
    return [];
  }
  return json.segments;
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
  const srtPath = join(dir, "subs.srt");
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

    // 3. SRT schreiben.
    const srt = formatSrt(segments);
    if (!srt.trim()) {
      return {
        buffer: videoBuffer,
        burned: false,
        note: "Transkript leer nach Trim — Untertitel übersprungen.",
      };
    }
    await writeFile(srtPath, srt, "utf8");

    // 4. Untertitel einbrennen. force_style → weiße Schrift, schwarzer
    // Outline, untere Mitte, lesbare Größe.
    const style = [
      "FontName=Arial",
      "FontSize=20",
      "PrimaryColour=&H00FFFFFF",
      "OutlineColour=&H00000000",
      "BorderStyle=1",
      "Outline=3",
      "Shadow=0",
      "Alignment=2",
      "MarginV=40",
    ].join(",");
    // Pfade für den subtitles-Filter sind tückisch: Doppelpunkte/Backslashes
    // müssen escaped werden (Windows + Filter-Trennzeichen).
    const escSrtPath = srtPath.replace(/\\/g, "/").replace(/:/g, "\\:");
    await runFfmpeg(
      [
        "-i",
        inputPath,
        "-vf",
        `subtitles='${escSrtPath}':force_style='${style}'`,
        "-c:a",
        "copy",
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
