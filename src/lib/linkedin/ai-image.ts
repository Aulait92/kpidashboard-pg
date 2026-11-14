// KI-Bilder für LinkedIn-Posts (Ole, 14.11.2026): fotorealistische Szenen passend zum Post
// (gpt-image-1, wie bei den Werbeanzeigen). Keine Illustrationen, kein Text im Bild,
// keine echten Personen, Marken oder Logos. Gespeichert als LinkedInPhoto (generated).

import { prisma } from "@/lib/prisma";

const STYLE =
  ", realistic photograph, natural light, authentic candid moment, modern German office or everyday setting, high quality, shallow depth of field" +
  ", no illustration, no drawing, no cartoon, no 3d render" +
  ", completely without any text, no letters, no words, no numbers, no logos, no brand names, no watermark" +
  ", no famous or real identifiable people";

export type ImageGenerator = (prompt: string) => Promise<Buffer | null>;

export const openAiImage: ImageGenerator = async (prompt) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.OPENAI_IMAGE_TIMEOUT_MS) || 120_000);
  try {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
        prompt: `${prompt.slice(0, 800)}${STYLE}`,
        size: "1024x1024",
        quality: process.env.LINKEDIN_IMAGE_QUALITY || "medium",
        n: 1,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[linkedin-image] ${res.status} ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const json = (await res.json()) as { data?: { b64_json?: string }[] };
    const b64 = json.data?.[0]?.b64_json;
    return b64 ? Buffer.from(b64, "base64") : null;
  } catch (e) {
    console.warn("[linkedin-image]", e instanceof Error ? e.message : e);
    return null;
  } finally {
    clearTimeout(timer);
  }
};

/** Bild erzeugen und ablegen → Foto-ID (oder null, wenn nicht möglich). */
export async function createAiImage(prompt: string, gen: ImageGenerator = openAiImage): Promise<string | null> {
  const data = await gen(prompt);
  if (!data) return null;
  const row = await prisma.linkedInPhoto.create({
    data: { fileName: "ki-bild.png", contentType: "image/png", size: data.length, data: new Uint8Array(data), description: `KI-Bild: ${prompt.slice(0, 280)}`, generated: true },
    select: { id: true },
  });
  return row.id;
}
