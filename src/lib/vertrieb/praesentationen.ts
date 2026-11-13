// Vertriebsunterlagen (Ole, 13.11.2026): aktuelle Makler- und Vertreter-Präsentation als
// PPTX (zum Bearbeiten/Präsentieren) und PDF (für den Versand mit der Angebotsmail).
// Gespeichert in der Datenbank – je Zielgruppe und Format genau eine Datei.

import { prisma } from "@/lib/prisma";

export const AUDIENCES = ["vertreter", "makler"] as const;
export type Audience = (typeof AUDIENCES)[number];
export const FORMATS = ["pdf", "pptx"] as const;
export type PresentationFormat = (typeof FORMATS)[number];

export const AUDIENCE_LABEL: Record<Audience, string> = { vertreter: "Vertreter", makler: "Makler" };
export const FORMAT_LABEL: Record<PresentationFormat, string> = { pdf: "PDF", pptx: "PowerPoint (PPTX)" };
export const CONTENT_TYPE: Record<PresentationFormat, string> = {
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};
/** Obergrenze je Datei. Anhänge der Angebotsmail (PDF) dürfen bei Resend zusammen höchstens 40 MB groß sein. */
export const MAX_BYTES: Record<PresentationFormat, number> = { pdf: 25 * 1024 * 1024, pptx: 100 * 1024 * 1024 };

export const isAudience = (v: unknown): v is Audience => AUDIENCES.includes(v as Audience);
export const isFormat = (v: unknown): v is PresentationFormat => FORMATS.includes(v as PresentationFormat);

/** Dateityp am Inhalt prüfen: PDF beginnt mit „%PDF“, PPTX ist ein ZIP („PK“). */
export function looksLike(format: PresentationFormat, buf: Uint8Array): boolean {
  if (buf.length < 4) return false;
  if (format === "pdf") return buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
  return buf[0] === 0x50 && buf[1] === 0x4b;
}

export type PresentationMeta = { audience: Audience; format: PresentationFormat; fileName: string; size: number; uploadedAt: Date };

/** Übersicht ohne Dateiinhalt. */
export async function listPresentations(): Promise<PresentationMeta[]> {
  const rows = await prisma.salesPresentation.findMany({
    select: { audience: true, format: true, fileName: true, size: true, uploadedAt: true },
  });
  return rows.filter((r) => isAudience(r.audience) && isFormat(r.format)) as PresentationMeta[];
}

export async function getPresentation(audience: Audience, format: PresentationFormat) {
  return prisma.salesPresentation.findUnique({ where: { audience_format: { audience, format } } });
}

export async function savePresentation(input: {
  audience: Audience;
  format: PresentationFormat;
  fileName: string;
  data: Uint8Array;
  uploadedById: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.data.length) return { ok: false, error: "Die Datei ist leer." };
  if (input.data.length > MAX_BYTES[input.format]) {
    return { ok: false, error: `Die Datei ist zu groß (höchstens ${Math.round(MAX_BYTES[input.format] / 1024 / 1024)} MB).` };
  }
  if (!looksLike(input.format, input.data)) {
    return { ok: false, error: input.format === "pdf" ? "Das ist keine PDF-Datei." : "Das ist keine PowerPoint-Datei (.pptx)." };
  }
  const fileName = input.fileName.replace(/[\\/\r\n"]/g, "_").slice(0, 160) || `praesentation.${input.format}`;
  const data = {
    fileName,
    contentType: CONTENT_TYPE[input.format],
    size: input.data.length,
    data: Buffer.from(input.data),
    uploadedAt: new Date(),
    uploadedById: input.uploadedById,
  };
  await prisma.salesPresentation.upsert({
    where: { audience_format: { audience: input.audience, format: input.format } },
    create: { audience: input.audience, format: input.format, ...data },
    update: data,
  });
  return { ok: true };
}

export async function deletePresentation(audience: Audience, format: PresentationFormat) {
  await prisma.salesPresentation.deleteMany({ where: { audience, format } });
}

/** Zielgruppe eines Vertriebskontakts: „Makler“ laut Anreicherung, sonst Vertreter. */
export function audienceForContact(c: { insurer?: string | null } | null | undefined): Audience {
  return c?.insurer === "Makler" ? "makler" : "vertreter";
}

/** Rechner-Link passend zum Angebot (Zielgruppe + Tagesbudget aller Produkte). */
export function rechnerUrl(appUrl: string, audience: Audience, products: unknown): string {
  const list = Array.isArray(products) ? (products as { dailyBudget?: unknown }[]) : [];
  const budget = Math.round(list.reduce((s, p) => s + (Number(p?.dailyBudget) || 0), 0));
  const q = new URLSearchParams({ typ: audience });
  if (budget > 0) q.set("budget", String(budget));
  return `${appUrl.replace(/\/$/, "")}/rechner?${q}`;
}

export function fileSizeLabel(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
