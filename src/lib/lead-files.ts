// Dokumente am Lead (Ole, 13.11.2026): Angebot, Police oder Sonstiges hochladen, ansehen, löschen.
// Dateityp wird am Inhalt geprüft (nicht nur an der Endung).

import { prisma } from "@/lib/prisma";
import { logLeadHistory } from "@/lib/lead-history";

export const FILE_KINDS = ["angebot", "police", "sonstiges"] as const;
export type LeadFileKind = (typeof FILE_KINDS)[number];
export const FILE_KIND_LABEL: Record<LeadFileKind, string> = { angebot: "Angebot", police: "Police", sonstiges: "Dokument" };
export const isFileKind = (v: unknown): v is LeadFileKind => FILE_KINDS.includes(v as LeadFileKind);
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

const TYPES: { ext: string[]; type: string; magic: (b: Uint8Array) => boolean }[] = [
  { ext: ["pdf"], type: "application/pdf", magic: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 },
  { ext: ["png"], type: "image/png", magic: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { ext: ["jpg", "jpeg"], type: "image/jpeg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: ["docx"], type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", magic: (b) => b[0] === 0x50 && b[1] === 0x4b },
  { ext: ["xlsx"], type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", magic: (b) => b[0] === 0x50 && b[1] === 0x4b },
];

/** Erlaubter Dateityp anhand von Endung und Inhalt; null = nicht erlaubt. */
export function detectType(fileName: string, data: Uint8Array): string | null {
  if (data.length < 4) return null;
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  const t = TYPES.find((x) => x.ext.includes(ext));
  return t && t.magic(data) ? t.type : null;
}

export type LeadFileMeta = { id: string; kind: LeadFileKind; fileName: string; size: number; createdAt: string };

export async function listLeadFiles(leadId: string): Promise<LeadFileMeta[]> {
  const rows = await prisma.leadFile.findMany({
    where: { leadId },
    orderBy: { createdAt: "desc" },
    select: { id: true, kind: true, fileName: true, size: true, createdAt: true },
  });
  return rows.map((r) => ({ ...r, kind: (isFileKind(r.kind) ? r.kind : "sonstiges") as LeadFileKind, createdAt: r.createdAt.toISOString() }));
}

export async function saveLeadFile(input: {
  leadId: string;
  customerId: string;
  kind: LeadFileKind;
  fileName: string;
  data: Uint8Array;
  userId: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.data.length) return { ok: false, error: "Die Datei ist leer." };
  if (input.data.length > MAX_FILE_BYTES) return { ok: false, error: "Die Datei ist zu groß (höchstens 15 MB)." };
  const fileName = input.fileName.replace(/[\\/\r\n"]/g, "_").slice(0, 160) || "dokument.pdf";
  const contentType = detectType(fileName, input.data);
  if (!contentType) return { ok: false, error: "Bitte eine PDF-, Bild- (JPG/PNG), Word- oder Excel-Datei hochladen." };
  const count = await prisma.leadFile.count({ where: { leadId: input.leadId } });
  if (count >= 30) return { ok: false, error: "Zu diesem Lead sind schon 30 Dokumente gespeichert. Bitte erst alte löschen." };
  await prisma.leadFile.create({
    data: {
      leadId: input.leadId,
      customerId: input.customerId,
      kind: input.kind,
      fileName,
      contentType,
      size: input.data.length,
      data: Buffer.from(input.data),
      uploadedById: input.userId,
    },
  });
  await logLeadHistory(input.leadId, "dokument", `${FILE_KIND_LABEL[input.kind]} hochgeladen: ${fileName}`, { customerId: input.customerId, userId: input.userId });
  return { ok: true };
}

export const fileSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
