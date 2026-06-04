// Sora 2 Video-Generation via OpenAI Videos API.
//
// Pipeline: createJob → poll → downloadContent. Wir verwenden dasselbe
// API-Key-Setup wie für gpt-image-1 (OPENAI_API_KEY).
//
// Modell + Standardlänge via ENV überschreibbar — je nach API-Tier (Sora 2
// vs. Sora 2 Pro) sind unterschiedliche max. Längen erlaubt:
//   SORA_MODEL          default "sora-2-pro" (für 20s-Clips)
//   SORA_DURATION_SEC   default 20 (Fallback-Liste 16→12→8→4, falls Sora
//                       die Wunsch-Länge ablehnt — Tier-abhängig)
//   SORA_SIZE           default "720x1280" (vertikal 9:16 — auf sora-2 +
//                       sora-2-pro garantiert unterstützt; 720x720 / 1:1
//                       lehnt die API ab.)

const OPENAI_BASE = "https://api.openai.com/v1";
const CREATE_TIMEOUT_MS = 60_000;
const POLL_FETCH_TIMEOUT_MS = 30_000;

function getApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY nicht gesetzt.");
  return key;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

type VideoJob = {
  id: string;
  status: "queued" | "in_progress" | "completed" | "failed" | string;
  error?: { message?: string } | null;
};

async function createVideoJob(
  prompt: string,
  seconds: string,
): Promise<VideoJob> {
  const model = process.env.SORA_MODEL ?? "sora-2-pro";
  const size = process.env.SORA_SIZE ?? "720x1280";

  console.log(
    `[sora] createVideoJob model=${model} seconds=${seconds} size=${size} promptLen=${prompt.length}`,
  );

  const res = await fetchWithTimeout(
    `${OPENAI_BASE}/videos`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, prompt, seconds, size }),
    },
    CREATE_TIMEOUT_MS,
  );
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(
      `OpenAI /videos ${res.status}: ${text.slice(0, 600)}`,
    );
    // Status 400 deutet i.d.R. auf nicht-unterstützte Param-Kombi (z. B.
    // seconds zu lang für das Tier). Markieren, damit der Fallback greift.
    if (res.status === 400) (err as Error & { badParam?: boolean }).badParam = true;
    throw err;
  }
  const job = JSON.parse(text) as VideoJob;
  if (!job.id) {
    throw new Error(
      `OpenAI /videos lieferte kein id-Feld zurück: ${text.slice(0, 400)}`,
    );
  }
  console.log(`[sora] job created id=${job.id} status=${job.status}`);
  return job;
}

// Probiert die Wunsch-Sekunden zuerst und fällt bei 400-Errors (typisch:
// "seconds not supported for this model/tier") schrittweise auf kürzere
// Werte zurück, bis Sora die Kombi akzeptiert.
async function createVideoJobWithFallback(
  prompt: string,
  onProgress?: VideoProgress,
): Promise<VideoJob> {
  const wanted = process.env.SORA_DURATION_SEC ?? "20";
  // Reihenfolge: Wunschwert zuerst, dann standardmäßig akzeptierte Werte.
  const candidates = Array.from(
    new Set([wanted, "16", "12", "8", "4"]),
  );
  let lastErr: unknown;
  for (const seconds of candidates) {
    try {
      return await createVideoJob(prompt, seconds);
    } catch (err) {
      const isBadParam = (err as { badParam?: boolean }).badParam === true;
      if (!isBadParam) throw err;
      lastErr = err;
      console.warn(
        `[sora] seconds=${seconds} abgelehnt, versuche nächste Stufe…`,
      );
      await onProgress?.(`Sora lehnte ${seconds}s ab, versuche kürzer…`);
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error("Sora hat alle Längen-Fallbacks abgelehnt.");
}

async function getVideoJob(id: string): Promise<VideoJob> {
  const res = await fetchWithTimeout(
    `${OPENAI_BASE}/videos/${id}`,
    { headers: { Authorization: `Bearer ${getApiKey()}` } },
    POLL_FETCH_TIMEOUT_MS,
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`OpenAI /videos/${id} ${res.status}: ${text.slice(0, 400)}`);
  }
  return JSON.parse(text) as VideoJob;
}

async function downloadVideoContent(id: string): Promise<Buffer> {
  const res = await fetchWithTimeout(
    `${OPENAI_BASE}/videos/${id}/content`,
    { headers: { Authorization: `Bearer ${getApiKey()}` } },
    120_000,
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `OpenAI /videos/${id}/content ${res.status}: ${text.slice(0, 400)}`,
    );
  }
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}

export type GeneratedVideo = {
  buffer: Buffer;
  durationSec: number;
};

export type VideoProgress = (msg: string) => void | Promise<void>;

// Generiert ein Video aus einem Prompt. Pollt das Job bis "completed" oder
// timeout. Wirft bei "failed" oder Quoten-Fehlern. onProgress wird nach
// Job-Erstellung und bei jedem Status-Wechsel aufgerufen — damit das
// aufrufende UI (Telegram-Bot) Lebenszeichen senden kann.
export async function generateVideo(
  prompt: string,
  onProgress?: VideoProgress,
): Promise<GeneratedVideo> {
  if (!prompt.trim()) throw new Error("Video-Prompt ist leer.");

  const job = await createVideoJobWithFallback(prompt, onProgress);
  await onProgress?.(
    `Sora-Job angelegt (ID ${job.id.slice(0, 8)}…, Status: ${job.status}).`,
  );

  const startedAt = Date.now();
  const timeoutMs = Number(process.env.SORA_TIMEOUT_MS ?? 20 * 60 * 1000);
  const pollMs = Number(process.env.SORA_POLL_MS ?? 5000);
  const heartbeatMs = Number(process.env.SORA_HEARTBEAT_MS ?? 30_000);

  let current: VideoJob = job;
  let lastStatus = current.status;
  let lastHeartbeatAt = Date.now();
  while (current.status !== "completed" && current.status !== "failed") {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(
        `Sora-Generation Timeout nach ${Math.round(timeoutMs / 1000)}s (Job ${job.id}, letzter Status: ${current.status}).`,
      );
    }
    await new Promise((r) => setTimeout(r, pollMs));
    try {
      current = await getVideoJob(job.id);
    } catch (err) {
      console.warn(
        `[sora] poll failte (wird wiederholt):`,
        err instanceof Error ? err.message : err,
      );
      continue;
    }
    if (current.status !== lastStatus) {
      console.log(`[sora] job ${job.id} status: ${lastStatus} → ${current.status}`);
      const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
      await onProgress?.(
        `Sora-Status: ${current.status} (~${elapsedSec}s vergangen).`,
      );
      lastStatus = current.status;
      lastHeartbeatAt = Date.now();
    } else if (Date.now() - lastHeartbeatAt > heartbeatMs) {
      // Heartbeat — Sora bleibt oft minutenlang im selben Status; ohne
      // Lebenszeichen wirkt der Bot eingefroren. Default 30s.
      const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
      console.log(`[sora] heartbeat job=${job.id} status=${current.status} elapsed=${elapsedSec}s`);
      await onProgress?.(
        `Sora rendert weiter (Status: ${current.status}, ~${elapsedSec}s vergangen).`,
      );
      lastHeartbeatAt = Date.now();
    }
  }
  if (current.status === "failed") {
    throw new Error(
      `Sora-Job ${job.id} failte: ${current.error?.message ?? "unbekannt"}`,
    );
  }

  console.log(`[sora] job ${job.id} completed, lade Content…`);
  const buffer = await downloadVideoContent(job.id);
  console.log(`[sora] job ${job.id} content geladen, ${buffer.length} bytes`);
  return {
    buffer,
    durationSec: Number(process.env.SORA_DURATION_SEC ?? 20),
  };
}
