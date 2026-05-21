// OpenAI Images 2.0 (gpt-image-1) Wrapper für die Creative-Generation.
// Ersetzt die alte HTML → Playwright → PNG Pipeline durch einen direkten
// Text-zu-Bild-Call. gpt-image-1 rendert sowohl die visuelle Komposition
// als auch alle Text-Overlays selbst.

export type OpenAIImageSize = "1024x1024" | "1536x1024" | "1024x1536";
export type OpenAIImageQuality = "low" | "medium" | "high";

export type OpenAIImageResult = {
  buffer: Buffer;
  contentType: "image/png" | "image/jpeg" | "image/webp";
  revisedPrompt?: string;
};

export async function generateOpenAIImage(opts: {
  prompt: string;
  size?: OpenAIImageSize;
  quality?: OpenAIImageQuality;
  // Meta-Feed-Creatives wollen JPEG für kleinere Datei + schnelleren Upload.
  // PNG nur wenn Transparenz/Pixel-Perfect-Text gebraucht wird.
  format?: "png" | "jpeg" | "webp";
}): Promise<OpenAIImageResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY nicht gesetzt. Key bei https://platform.openai.com/api-keys erstellen und in Railway als Env-Var hinterlegen.",
    );
  }

  const size = opts.size ?? "1024x1024";
  const quality = opts.quality ?? "high";
  const format = opts.format ?? "jpeg";

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt: opts.prompt,
      n: 1,
      size,
      quality,
      output_format: format,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI Images ${res.status}: ${body.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    data: { b64_json?: string; revised_prompt?: string }[];
  };
  const first = data.data?.[0];
  if (!first?.b64_json) {
    throw new Error("OpenAI Images: keine b64_json-Daten in der Antwort.");
  }
  const buffer = Buffer.from(first.b64_json, "base64");
  const contentType =
    format === "png"
      ? "image/png"
      : format === "webp"
        ? "image/webp"
        : "image/jpeg";
  return { buffer, contentType, revisedPrompt: first.revised_prompt };
}
