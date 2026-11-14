// KI-Bilder für LinkedIn-Posts (Ole, 14.11.2026): fotorealistische Szenen passend zum Post
// (aktuelles OpenAI-Bildmodell, wie bei den Werbeanzeigen). Meist fotorealistisch, ab und zu Illustration; kein Text im Bild,
// keine echten Personen, Marken oder Logos. Gespeichert als LinkedInPhoto (generated).

import { prisma } from "@/lib/prisma";
import { withImageModel } from "@/lib/openai-image-models";

const NO_TEXT = ", completely without any text, no letters, no words, no numbers, no logos, no brand names, no watermark, no famous or real identifiable people";
/** Bildstil: meist fotorealistisch, ab und zu Illustration/Zeichnung (Ole, 14.11.2026). */
export type ImageStyle = "foto" | "illustration";
const STYLES: Record<ImageStyle, string> = {
  foto:
    ", realistic photograph, natural light, authentic candid moment, modern German office or everyday setting, high quality, shallow depth of field" +
    ", no illustration, no drawing, no cartoon, no 3d render",
  illustration: ", hand-drawn illustration, warm and simple, clear shapes, editorial style or child-like drawing as described, no photograph",
};

export type ImageGenerator = (prompt: string, style?: ImageStyle) => Promise<Buffer | null>;

export const openAiImage: ImageGenerator = async (prompt, style = "foto") => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const timeoutMs = Number(process.env.OPENAI_IMAGE_TIMEOUT_MS) || 120_000;
  try {
    const res = await withImageModel(async (model) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const r = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({ model, prompt: `${prompt.slice(0, 800)}${STYLES[style]}${NO_TEXT}`, size: "1024x1024", quality: process.env.LINKEDIN_IMAGE_QUALITY || "medium", n: 1 }),
          signal: controller.signal,
        });
        return { status: r.status, body: await r.text() };
      } finally {
        clearTimeout(timer);
      }
    });
    if (!res.ok) {
      console.warn(`[linkedin-image] ${res.status} ${res.body.slice(0, 200)}`);
      return null;
    }
    const json = res.json as { data?: { b64_json?: string; url?: string }[] };
    const first = json.data?.[0];
    if (first?.b64_json) return Buffer.from(first.b64_json, "base64");
    if (first?.url) {
      const img = await fetch(first.url);
      return img.ok ? Buffer.from(await img.arrayBuffer()) : null;
    }
    return null;
  } catch (e) {
    console.warn("[linkedin-image]", e instanceof Error ? e.message : e);
    return null;
  }
};

/** Bild erzeugen und ablegen → Foto-ID (oder null, wenn nicht möglich). */
export async function createAiImage(prompt: string, gen: ImageGenerator = openAiImage, style: ImageStyle = "foto"): Promise<string | null> {
  const data = await gen(prompt, style);
  if (!data) return null;
  const row = await prisma.linkedInPhoto.create({
    data: { fileName: "ki-bild.png", contentType: "image/png", size: data.length, data: new Uint8Array(data), description: `KI-Bild: ${prompt.slice(0, 280)}`, generated: true },
    select: { id: true },
  });
  return row.id;
}
