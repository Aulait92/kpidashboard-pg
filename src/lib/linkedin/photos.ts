// Fotoablage für LinkedIn-Posts (Ole, 14.11.2026): Fotos von Ole, die die KI passend zum
// Post auswählt. Beim Hochladen beschreibt Claude das Foto kurz (änderbar), damit die
// Auswahl inhaltlich passt.

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { CAMPAIGN_MODEL } from "@/lib/kampagnen/llm";

export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export const PHOTO_MAX_BYTES = 8 * 1024 * 1024;
export const PHOTO_MAX_COUNT = 60;

type PhotoType = (typeof PHOTO_TYPES)[number];
export const isPhotoType = (t: string): t is PhotoType => (PHOTO_TYPES as readonly string[]).includes(t);

export type Describer = (data: Buffer, contentType: PhotoType) => Promise<string>;

/** Kurze, sachliche Beschreibung (ein Satz) – was zu sehen ist, Stimmung, Ort. */
export const claudeDescribe: Describer = async (data, contentType) => {
  const client = new Anthropic();
  const msg = await client.messages.create({
    model: CAMPAIGN_MODEL,
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: contentType, data: data.toString("base64") } },
          {
            type: "text",
            text: "Beschreibe dieses Foto in einem kurzen deutschen Satz (max. 20 Wörter) für die Auswahl zu LinkedIn-Posts: Was ist zu sehen (Person, Tätigkeit, Ort, Stimmung)? Keine Vermutungen über Namen. Nur den Satz ausgeben.",
          },
        ],
      },
    ],
  });
  return msg.content
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join(" ")
    .trim()
    .slice(0, 300);
};

export async function addPhoto(
  file: { name: string; type: string; data: Buffer },
  opts: { description?: string; describe?: Describer | null } = {},
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!isPhotoType(file.type)) return { ok: false, error: `${file.name}: nur JPG, PNG, WebP oder GIF.` };
  if (file.data.length > PHOTO_MAX_BYTES) return { ok: false, error: `${file.name}: höchstens 8 MB.` };
  if ((await prisma.linkedInPhoto.count()) >= PHOTO_MAX_COUNT) return { ok: false, error: `Höchstens ${PHOTO_MAX_COUNT} Fotos. Bitte erst alte löschen.` };
  let description = (opts.description ?? "").trim().slice(0, 300);
  const describe = opts.describe === undefined ? (process.env.ANTHROPIC_API_KEY ? claudeDescribe : null) : opts.describe;
  if (!description && describe) description = await describe(file.data, file.type).catch(() => "");
  const row = await prisma.linkedInPhoto.create({
    data: { fileName: file.name.slice(0, 200), contentType: file.type, size: file.data.length, data: new Uint8Array(file.data), description },
    select: { id: true },
  });
  return { ok: true, id: row.id };
}
