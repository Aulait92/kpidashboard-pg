// Dokumente am Lead (Ole, 13.11.2026): Angebot, Police oder Sonstiges hochladen, ansehen, löschen.
// Dateityp wird am Inhalt geprüft (nicht nur an der Endung).
// Virenprüfung beim Hochladen (Ole, 18.11.2026, lib/sicherheit/virenpruefung.ts): Befund → nicht gespeichert,
// Änderungsprotokoll. Prüfung nicht möglich → gespeichert als „ungeprueft“; eine Police wird dann erst nach der Prüfung
// angeboten (Nachprüfung beim Öffnen und im Cron), andere Dateien wie bisher. Mit VIRENPRUEFUNG_PFLICHT abgelehnt.

import { prisma } from "@/lib/prisma";
import { logLeadHistory } from "@/lib/lead-history";
import { audit } from "@/lib/audit";
import { entscheide, meldeUngeprueft, pruefeAufViren, virenKonfig } from "@/lib/sicherheit/virenpruefung";

// „beratungsdoku“ (Paket M5, Ole 18.11.2026): Gesprächszusammenfassung als PDF mit Datum, entsteht nur in der App
// (Blatt „Angebot senden“, Dialog „E-Mail schreiben“), nicht per Upload. Bleibt beim Löschen des Leads als Nachweis
// (lib/erasure.ts, Frist BERATUNGSDOKU_AUFBEWAHRUNG_JAHRE).
export const FILE_KINDS = ["angebot", "police", "sonstiges", "beratungsdoku"] as const;
export type LeadFileKind = (typeof FILE_KINDS)[number];
export const FILE_KIND_LABEL: Record<LeadFileKind, string> = { angebot: "Angebot", police: "Police", sonstiges: "Dokument", beratungsdoku: "Beratungsdokumentation" };
export const isFileKind = (v: unknown): v is LeadFileKind => FILE_KINDS.includes(v as LeadFileKind);
/** Arten, die man hochladen kann (die Beratungsdokumentation erzeugt nur die App). */
export const UPLOAD_KINDS = ["angebot", "police", "sonstiges"] as const satisfies readonly LeadFileKind[];
export const isUploadKind = (v: unknown): v is (typeof UPLOAD_KINDS)[number] => (UPLOAD_KINDS as readonly string[]).includes(v as string);

/**
 * Aufbewahrung der Beratungsdokumentation nach dem Löschen des Leads (Paket M5, Ole 18.11.2026).
 *
 * Der Vermittler muss Wünsche, Bedürfnisse, Rat und Gründe dokumentieren und dem Kunden vor Vertragsschluss in
 * Textform geben (§ 61 Abs. 1, § 62 Abs. 1 VVG). Die Dokumentation ist sein Nachweis gegen Ansprüche aus Beratungs-
 * fehlern (§ 63 VVG). Diese verjähren regelmäßig in 3 Jahren ab Kenntnis (§§ 195, 199 Abs. 1 BGB), ohne Kenntnis
 * spätestens 10 Jahre nach ihrer Entstehung (§ 199 Abs. 3 Satz 1 Nr. 1 BGB). Löschwunsch nach Art. 17 DSGVO: Das PDF
 * darf bleiben, soweit es zur Geltendmachung, Ausübung oder Verteidigung von Rechtsansprüchen nötig ist
 * (Art. 17 Abs. 3 lit. e DSGVO); nur dieses PDF, alles andere am Lead wird gelöscht.
 *
 * Frist: 10 Jahre ab Erstellung, danach löscht der tägliche Cron (lib/erasure.ts pruneTransient). OFFEN (Ole bzw.
 * Anwältin): Frist bestätigen; ob sie ab Vertragsende statt ab Erstellung laufen soll (der Anspruch kann erst mit dem
 * Schaden entstehen, Höchstfrist 30 Jahre nach § 199 Abs. 3 Satz 1 Nr. 2 BGB); Hinweis im Datenschutzhinweis.
 */
export const BERATUNGSDOKU_AUFBEWAHRUNG_JAHRE = 10;

/** Bis wann eine Datei nach dem Löschen des Leads aufbewahrt wird (nur Beratungsdokumentation, sonst null). */
export function aufbewahrenBis(kind: string, erstellt: Date): Date | null {
  if (kind !== "beratungsdoku") return null;
  const d = new Date(erstellt);
  d.setUTCFullYear(d.getUTCFullYear() + BERATUNGSDOKU_AUFBEWAHRUNG_JAHRE);
  return d;
}
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

const TYPES: { ext: string[]; type: string; magic: (b: Uint8Array) => boolean }[] = [
  { ext: ["pdf"], type: "application/pdf", magic: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 },
  { ext: ["png"], type: "image/png", magic: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { ext: ["jpg", "jpeg"], type: "image/jpeg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  // WebP (z. B. Screenshots aus dem Tarifrechner im Browser): „RIFF“ … „WEBP“
  { ext: ["webp"], type: "image/webp", magic: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 },
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

export type LeadFileMeta = { id: string; kind: LeadFileKind; fileName: string; size: number; createdAt: string; wirdGeprueft: boolean };

/** Hochgeladene Police mit ausstehender Virenprüfung: erst nach der Prüfung anbieten. */
export const wartetAufPruefung = (f: { kind: string; virenStatus: string | null }) => f.kind === "police" && f.virenStatus === "ungeprueft";

export async function listLeadFiles(leadId: string): Promise<LeadFileMeta[]> {
  const rows = await prisma.leadFile.findMany({
    where: { leadId },
    orderBy: { createdAt: "desc" },
    select: { id: true, kind: true, fileName: true, size: true, createdAt: true, virenStatus: true },
  });
  return rows.map(({ virenStatus, ...r }) => ({
    ...r,
    kind: (isFileKind(r.kind) ? r.kind : "sonstiges") as LeadFileKind,
    createdAt: r.createdAt.toISOString(),
    wirdGeprueft: wartetAufPruefung({ kind: r.kind, virenStatus }),
  }));
}

export async function saveLeadFile(input: {
  leadId: string;
  customerId: string;
  kind: LeadFileKind;
  fileName: string;
  data: Uint8Array;
  userId: string | null;
  /** Eintrag im Verlauf (Standard: „Angebot hochgeladen: …“); eigener Text z. B. für Dokumente aus der App */
  verlauf?: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!input.data.length) return { ok: false, error: "Die Datei ist leer." };
  if (input.data.length > MAX_FILE_BYTES) return { ok: false, error: "Die Datei ist zu groß (höchstens 15 MB)." };
  const fileName = input.fileName.replace(/[\\/\r\n"]/g, "_").slice(0, 160) || "dokument.pdf";
  const contentType = detectType(fileName, input.data);
  if (!contentType) return { ok: false, error: "Bitte eine PDF-, Bild- (JPG/PNG/WebP), Word- oder Excel-Datei hochladen." };
  const count = await prisma.leadFile.count({ where: { leadId: input.leadId } });
  if (count >= 30) return { ok: false, error: "Zu diesem Lead sind schon 30 Dokumente gespeichert. Bitte erst alte löschen." };
  const viren = await pruefeAufViren(input.data);
  const entscheidung = entscheide(viren);
  if (entscheidung === "verwerfen") {
    await audit("viren.befund", {
      entity: "Lead",
      entityId: input.leadId,
      customerId: input.customerId,
      details: { quelle: "upload", art: input.kind, signatur: viren.status === "befund" ? viren.signatur : null },
      actor: { id: input.userId, role: "BUYER" },
    });
    return { ok: false, error: "Die Virenprüfung hat diese Datei abgelehnt. Sie wurde nicht gespeichert." };
  }
  if (entscheidung === "ablehnen") return { ok: false, error: "Die Virenprüfung ist gerade nicht erreichbar. Bitte in ein paar Minuten erneut hochladen." };
  if (entscheidung === "ungeprueft") await meldeUngeprueft("upload", viren.status === "ungeprueft" ? viren.grund : "fehler");
  const now = new Date();
  const saved = await prisma.leadFile.create({
    select: { id: true },
    data: {
      createdAt: now,
      aufbewahrenBis: aufbewahrenBis(input.kind, now),
      leadId: input.leadId,
      customerId: input.customerId,
      kind: input.kind,
      fileName,
      contentType,
      size: input.data.length,
      data: Buffer.from(input.data),
      uploadedById: input.userId,
      virenStatus: entscheidung === "annehmen" ? "sauber" : "ungeprueft",
    },
  });
  await logLeadHistory(input.leadId, "dokument", input.verlauf ?? `${FILE_KIND_LABEL[input.kind]} hochgeladen: ${fileName}`, { customerId: input.customerId, userId: input.userId });
  return { ok: true, id: saved.id };
}

export const fileSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/**
 * Ungeprüfte Datei nachprüfen (beim Öffnen und im Cron). sauber → angeboten; Befund → gelöscht, Verlauf und
 * Änderungsprotokoll; ungeprueft → Dienst weiter nicht erreichbar.
 */
export async function pruefeLeadFileNach(f: { id: string; leadId: string; customerId: string; kind: string; fileName: string; data: Uint8Array }): Promise<"sauber" | "befund" | "ungeprueft"> {
  const e = await pruefeAufViren(f.data);
  if (e.status === "ungeprueft") return "ungeprueft";
  if (e.status === "sauber") {
    await prisma.leadFile.update({ where: { id: f.id }, data: { virenStatus: "sauber" } }).catch(() => null);
    return "sauber";
  }
  await prisma.leadFile.delete({ where: { id: f.id } }).catch(() => null);
  await audit("viren.befund", { entity: "Lead", entityId: f.leadId, customerId: f.customerId, details: { quelle: "upload_nachpruefung", art: f.kind, signatur: e.signatur }, actor: { role: "system" } });
  await logLeadHistory(f.leadId, "dokument", `${FILE_KIND_LABEL[isFileKind(f.kind) ? f.kind : "sonstiges"]} bei der Virenprüfung abgelehnt und gelöscht: ${f.fileName}`, { customerId: f.customerId, userId: null });
  return "befund";
}

/** Ungeprüfte Uploads nachprüfen, sobald die Virenprüfung erreichbar ist (WhatsApp-Cron, höchstens `max` je Lauf). */
export async function pruefeUngepruefteLeadFilesNach(max = 20): Promise<{ geprueft: number; befund: number }> {
  if (!virenKonfig()) return { geprueft: 0, befund: 0 };
  const files = await prisma.leadFile.findMany({
    where: { virenStatus: "ungeprueft" },
    orderBy: { createdAt: "asc" },
    take: max,
    select: { id: true, leadId: true, customerId: true, kind: true, fileName: true, data: true },
  });
  let geprueft = 0;
  let befund = 0;
  for (const f of files) {
    const r = await pruefeLeadFileNach(f);
    if (r === "ungeprueft") break;
    geprueft++;
    if (r === "befund") befund++;
  }
  return { geprueft, befund };
}
