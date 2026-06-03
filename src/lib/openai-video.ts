// Sora 2 Video-Generation via OpenAI Videos API.
//
// Pipeline: createJob → poll → downloadContent. Wir verwenden dasselbe
// API-Key-Setup wie für gpt-image-1 (OPENAI_API_KEY).
//
// Modell + Standardlänge via ENV überschreibbar — je nach API-Tier (Sora 2
// vs. Sora 2 Pro) sind unterschiedliche max. Längen erlaubt:
//   SORA_MODEL          default "sora-2-pro" (für 20s-Clips)
//   SORA_DURATION_SEC   default 20
//   SORA_SIZE           default "720x720" (quadratisch 1:1, Feed-Format)

const OPENAI_BASE = "https://api.openai.com/v1";

function getApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY nicht gesetzt.");
  return key;
}

type VideoJob = {
  id: string;
  status: "queued" | "in_progress" | "completed" | "failed";
  error?: { message?: string } | null;
};

async function createVideoJob(prompt: string): Promise<VideoJob> {
  const model = process.env.SORA_MODEL ?? "sora-2-pro";
  const seconds = process.env.SORA_DURATION_SEC ?? "20";
  const size = process.env.SORA_SIZE ?? "720x720";

  const res = await fetch(`${OPENAI_BASE}/videos`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, prompt, seconds, size }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`OpenAI /videos ${res.status}: ${text.slice(0, 400)}`);
  }
  return JSON.parse(text) as VideoJob;
}

async function getVideoJob(id: string): Promise<VideoJob> {
  const res = await fetch(`${OPENAI_BASE}/videos/${id}`, {
    headers: { Authorization: `Bearer ${getApiKey()}` },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`OpenAI /videos/${id} ${res.status}: ${text.slice(0, 400)}`);
  }
  return JSON.parse(text) as VideoJob;
}

async function downloadVideoContent(id: string): Promise<Buffer> {
  const res = await fetch(`${OPENAI_BASE}/videos/${id}/content`, {
    headers: { Authorization: `Bearer ${getApiKey()}` },
  });
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

// Generiert ein Video aus einem Prompt. Pollt das Job bis "completed" oder
// timeout (default 10 Min). Wirft bei "failed" oder Quoten-Fehlern.
export async function generateVideo(prompt: string): Promise<GeneratedVideo> {
  if (!prompt.trim()) throw new Error("Video-Prompt ist leer.");

  const job = await createVideoJob(prompt);
  const startedAt = Date.now();
  const timeoutMs = Number(process.env.SORA_TIMEOUT_MS ?? 10 * 60 * 1000);
  const pollMs = Number(process.env.SORA_POLL_MS ?? 5000);

  let current: VideoJob = job;
  while (current.status !== "completed" && current.status !== "failed") {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Sora-Generation Timeout nach ${timeoutMs}ms (Job ${job.id}).`);
    }
    await new Promise((r) => setTimeout(r, pollMs));
    current = await getVideoJob(job.id);
  }
  if (current.status === "failed") {
    throw new Error(
      `Sora-Job ${job.id} failte: ${current.error?.message ?? "unbekannt"}`,
    );
  }

  const buffer = await downloadVideoContent(job.id);
  return {
    buffer,
    durationSec: Number(process.env.SORA_DURATION_SEC ?? 20),
  };
}
