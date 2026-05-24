import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";

// Diagnose: testet von DIESER Umgebung (Railway) aus die OpenAI-Erreichbarkeit
// — ein winziger Text-Call und ein winziger Bild-Call, jeweils mit Timing und
// Roh-Fehler. Zeigt sofort, ob/welcher Call hängt und woran.
async function timed<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<{ ok: boolean; ms: number; result?: T; error?: string }> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const result = await fn(controller.signal);
    return { ok: true, ms: Date.now() - start, result };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      ms: Date.now() - start,
      error: aborted
        ? `Timeout nach ${timeoutMs}ms`
        : err instanceof Error
          ? `${err.name}: ${err.message}${(err as { cause?: { code?: string } }).cause?.code ? ` (${(err as { cause?: { code?: string } }).cause?.code})` : ""}`
          : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Nur Admins." }, { status: 403 });
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY nicht gesetzt." }, { status: 500 });
  }
  const textModel = process.env.OPENAI_TEXT_MODEL || "gpt-4o";
  const imageModel = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
  const imageQuality = process.env.OPENAI_IMAGE_QUALITY || "low";

  // 1. Text-Call (winzig).
  const text = await timed(async (signal) => {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: textModel,
        max_tokens: 5,
        messages: [{ role: "user", content: "Sag nur: ok" }],
      }),
      signal,
    });
    const body = await res.text();
    return { status: res.status, body: body.slice(0, 300) };
  }, 30000);

  // 2. Bild-Call (winzig, low).
  const image = await timed(async (signal) => {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: imageModel,
        prompt: "a simple red circle on white background",
        size: "1024x1024",
        quality: imageQuality,
        n: 1,
      }),
      signal,
    });
    const body = await res.text();
    // Body nicht komplett zurückgeben (Base64 ist riesig) — nur Status + Anfang.
    return { status: res.status, bodyStart: body.slice(0, 200) };
  }, 120000);

  return NextResponse.json(
    { textModel, imageModel, imageQuality, text, image },
    { headers: { "cache-control": "no-store" } },
  );
}
