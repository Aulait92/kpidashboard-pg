// Google Veo 3 Video-Generation via Gemini API.
//
// Pipeline: predictLongRunning → poll operation → download video.
// Auth: x-goog-api-key Header mit GOOGLE_API_KEY.
//
// Veo 3 ist deutlich teurer als Sora (~$0.30/s mit Audio, ~$0.15/s ohne).
// Bei 25s mit Audio also ~$7.50 pro Video — entsprechend bei mehreren
// Varianten pro Telegram-Befehl im Auge behalten.
//
// Modell + Dauer + Aspect via ENV:
//   VEO_MODEL              default "veo-3.0-generate-001"
//   VEO_DURATION_SEC       default 25 (Veo unterstützt 4–60s, je Tier)
//   VEO_ASPECT_RATIO       default "16:9" (Native Veo-Output; Center-Crop
//                          auf 1:1 passiert in der Untertitel-Stufe)
//   VEO_NEGATIVE_PROMPT    default leer
//   VEO_TIMEOUT_MS         default 15 Min
//   VEO_POLL_MS            default 5000 (Poll-Interval)
//   VEO_HEARTBEAT_MS       default 30_000 (Telegram-Lebenszeichen)

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const CREATE_TIMEOUT_MS = 60_000;
const POLL_FETCH_TIMEOUT_MS = 30_000;

function getApiKey(): string {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) throw new Error("GOOGLE_API_KEY nicht gesetzt.");
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

type VeoOperation = {
  name: string;
  done?: boolean;
  error?: { code?: number; message?: string };
  response?: {
    generatedSamples?: {
      video?: {
        uri?: string;
        encoding?: string;
        bytesBase64Encoded?: string;
      };
    }[];
    // Manche Veo-Versionen wickeln das anders: generateVideoResponse
    generateVideoResponse?: {
      generatedSamples?: {
        video?: {
          uri?: string;
          encoding?: string;
          bytesBase64Encoded?: string;
        };
      }[];
    };
  };
};

async function startVideoOperation(prompt: string): Promise<string> {
  const model = process.env.VEO_MODEL ?? "veo-3.0-generate-001";
  const durationSeconds = Number(process.env.VEO_DURATION_SEC ?? 25);
  const aspectRatio = process.env.VEO_ASPECT_RATIO ?? "16:9";
  const negativePrompt = process.env.VEO_NEGATIVE_PROMPT ?? "";

  console.log(
    `[veo] startVideoOperation model=${model} seconds=${durationSeconds} aspect=${aspectRatio} promptLen=${prompt.length}`,
  );

  const body: Record<string, unknown> = {
    instances: [{ prompt }],
    parameters: {
      durationSeconds,
      aspectRatio,
      personGeneration: "allow_adult",
      ...(negativePrompt ? { negativePrompt } : {}),
    },
  };

  const res = await fetchWithTimeout(
    `${GEMINI_BASE}/models/${model}:predictLongRunning`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": getApiKey(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    CREATE_TIMEOUT_MS,
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Veo predictLongRunning ${res.status}: ${text.slice(0, 600)}`);
  }
  const json = JSON.parse(text) as { name?: string };
  if (!json.name) {
    throw new Error(
      `Veo lieferte kein operation.name zurück: ${text.slice(0, 400)}`,
    );
  }
  console.log(`[veo] operation started: ${json.name}`);
  return json.name;
}

async function getOperation(name: string): Promise<VeoOperation> {
  // Operations werden über den vollqualifizierten Pfad geholt; name kann
  // mit "models/..." starten oder mit "operations/...". Wir prefixen nur,
  // wenn nicht schon vollständig.
  const path = name.startsWith("operations/") || name.includes("/operations/")
    ? name
    : `operations/${name}`;
  const url = `${GEMINI_BASE}/${path}`;
  const res = await fetchWithTimeout(
    url,
    { headers: { "x-goog-api-key": getApiKey() } },
    POLL_FETCH_TIMEOUT_MS,
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Veo getOperation ${res.status}: ${text.slice(0, 400)}`);
  }
  return JSON.parse(text) as VeoOperation;
}

function extractVideoBytes(op: VeoOperation): {
  uri?: string;
  base64?: string;
} | null {
  const samples =
    op.response?.generatedSamples ??
    op.response?.generateVideoResponse?.generatedSamples;
  if (!samples || samples.length === 0) return null;
  const v = samples[0].video;
  if (!v) return null;
  return { uri: v.uri, base64: v.bytesBase64Encoded };
}

async function downloadVideoFromOperation(op: VeoOperation): Promise<Buffer> {
  const v = extractVideoBytes(op);
  if (!v) {
    throw new Error(
      `Veo-Operation enthält keine Video-Daten: ${JSON.stringify(op).slice(0, 400)}`,
    );
  }
  if (v.base64) return Buffer.from(v.base64, "base64");
  if (!v.uri) {
    throw new Error("Veo-Operation hat weder URI noch base64-Video.");
  }
  // Der Download-Endpoint braucht den API-Key per Header oder Query-Param.
  const downloadUrl = v.uri.includes("?")
    ? `${v.uri}&key=${getApiKey()}`
    : `${v.uri}?key=${getApiKey()}`;
  const res = await fetchWithTimeout(
    downloadUrl,
    { headers: { "x-goog-api-key": getApiKey() } },
    120_000,
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Veo-Download ${res.status}: ${text.slice(0, 400)}`);
  }
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}

export type GeneratedVideo = {
  buffer: Buffer;
  durationSec: number;
};

export type VideoProgress = (msg: string) => void | Promise<void>;

// Generiert ein Video aus einem Prompt. Pollt die Operation bis done=true
// oder Timeout. Heartbeat alle 30s, damit der Telegram-Bot nicht eingefroren
// wirkt. Wirft bei API-Fehlern oder Quoten-Issues.
export async function generateVideo(
  prompt: string,
  onProgress?: VideoProgress,
): Promise<GeneratedVideo> {
  if (!prompt.trim()) throw new Error("Video-Prompt ist leer.");

  const operationName = await startVideoOperation(prompt);
  await onProgress?.(`Veo-Job angelegt (${operationName.slice(-12)}…).`);

  const startedAt = Date.now();
  const timeoutMs = Number(process.env.VEO_TIMEOUT_MS ?? 15 * 60 * 1000);
  const pollMs = Number(process.env.VEO_POLL_MS ?? 5000);
  const heartbeatMs = Number(process.env.VEO_HEARTBEAT_MS ?? 30_000);

  let lastHeartbeatAt = Date.now();
  let op: VeoOperation = { name: operationName, done: false };
  while (!op.done) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(
        `Veo-Generation Timeout nach ${Math.round(timeoutMs / 1000)}s (${operationName}).`,
      );
    }
    await new Promise((r) => setTimeout(r, pollMs));
    try {
      op = await getOperation(operationName);
    } catch (err) {
      console.warn(
        "[veo] poll failte (wird wiederholt):",
        err instanceof Error ? err.message : err,
      );
      continue;
    }
    if (!op.done && Date.now() - lastHeartbeatAt > heartbeatMs) {
      const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
      console.log(`[veo] heartbeat ${operationName} elapsed=${elapsedSec}s`);
      await onProgress?.(
        `Veo rendert weiter (~${elapsedSec}s vergangen)…`,
      );
      lastHeartbeatAt = Date.now();
    }
  }
  if (op.error) {
    throw new Error(
      `Veo-Operation failte: ${op.error.message ?? "unbekannt"} (code=${op.error.code ?? "—"})`,
    );
  }

  console.log(`[veo] operation completed: ${operationName}`);
  const buffer = await downloadVideoFromOperation(op);
  console.log(`[veo] downloaded ${buffer.length} bytes`);
  return {
    buffer,
    durationSec: Number(process.env.VEO_DURATION_SEC ?? 25),
  };
}
