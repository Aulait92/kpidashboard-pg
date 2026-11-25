// Dateien im WhatsApp-Chat (Ole, 25.11.2026): Ein Vermittler hatte seinem Interessenten ein Dokument geschickt, im
// Admin-Chat stand nur „[document]“. Jetzt zeigt der Admin-Chat bei jeder Datei Name, Art, Größe, Absender und Zeit,
// z. B. „Angebot_Hausrat.pdf · PDF · 120 KB · von Anid“. Den Inhalt gibt es nur über den Support-Zugriff
// (lib/support-zugriff.ts: Grund, Protokoll, Mitteilung an den Vermittler, Link 15 Minuten gültig).
//
// Geschützt (nur „Unterlage (geschützt)“, kein Name, kein Support-Zugriff; Rechtsprüfung A7 und „Zugriffskontrolle“ in
// docs/recht/policen-whatsapp-gesundheitsdaten.md, Zugriff nur über Break-Glass):
//   - alles aus der Policen-Ablage (LeadDocument zur Nachricht) und jede eingehende Datei in einem Lead-Chat (die
//     Policen-Strecke nimmt sie an bzw. verwirft sie),
//   - Leads aus Kranken, BU, Leben, Pflege, Unfall (Produkt des Leads),
//   - Dateiname oder Begleittext mit Gesundheitsbezug (Sparte oder eindeutige Begriffe).
// Reine Funktionen ohne Datenbank, getestet (tests/unit/chat-dateien.test.ts).

import { gesundheitInText, istGesundheitsbezug, sparteAusText } from "@/lib/policen/regeln";
import { enthaeltGesundheitsangabe, istTierLead } from "@/lib/gesundheitsdaten";

const TZ = "Europe/Berlin";

/** Nachrichtenarten, die eine Datei tragen. */
export const DATEI_ARTEN = ["document", "image", "video"] as const;
export const istDateiNachricht = (kind: string | null | undefined) => (DATEI_ARTEN as readonly string[]).includes(kind ?? "");

/** Wie lange Meta eine Medien-ID zum Abruf bereithält (Cloud API: 30 Tage). Danach ist der Inhalt nicht mehr abrufbar. */
export const MEDIA_ID_TAGE = 30;
/** Gültigkeit des Links nach dem Support-Zugriff. */
export const ZUGRIFF_MINUTEN = 15;
/** Mindestlänge des Grundes. */
export const GRUND_MIN = 10;
export const GRUND_MAX = 300;

export const GESCHUETZT_LABEL = "Unterlage (geschützt)";

/** Platzhalter-Texte, die nur „hier war eine Datei“ sagen (werden durch die Dateikarte ersetzt). */
export function istDateiPlatzhalter(body: string | null | undefined): boolean {
  const b = (body ?? "").trim();
  return !b || /^\[(document|image|video|sticker)\]$/.test(b) || b === "Dokument empfangen";
}

/** „PDF“, „Bild“, „Word“ … aus MIME-Typ bzw. Endung. */
export function dateiArt(mime: string | null | undefined, name: string | null | undefined, kind?: string | null): string {
  const m = (mime ?? "").toLowerCase().split(";")[0].trim();
  const endung = /\.([a-z0-9]{2,5})$/i.exec(name ?? "")?.[1]?.toLowerCase() ?? "";
  if (m === "application/pdf" || endung === "pdf") return "PDF";
  if (m.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "heic", "gif"].includes(endung) || kind === "image") return "Bild";
  if (m.startsWith("video/") || ["mp4", "mov", "3gp"].includes(endung) || kind === "video") return "Video";
  if (/word|msword|officedocument\.wordprocessingml/.test(m) || ["doc", "docx"].includes(endung)) return "Word";
  if (/excel|spreadsheetml/.test(m) || ["xls", "xlsx", "csv"].includes(endung)) return "Excel";
  if (/powerpoint|presentationml/.test(m) || ["ppt", "pptx"].includes(endung)) return "PowerPoint";
  if (m === "text/plain" || endung === "txt") return "Text";
  if (/zip|compressed/.test(m) || endung === "zip") return "ZIP";
  return "Datei";
}

const zahl = (n: number, stellen = 0) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: stellen }).format(n);

/** „120 KB“, „1,4 MB“; null, wenn unbekannt. */
export function groesseText(bytes: number | null | undefined): string | null {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return null;
  if (bytes < 1024) return `${zahl(bytes)} B`;
  if (bytes < 1024 * 1024) return `${zahl(Math.max(1, Math.round(bytes / 1024)))} KB`;
  return `${zahl(bytes / (1024 * 1024), 1)} MB`;
}

/** Dateiname der Erstinformation aus dem gespeicherten Text (Begleittext, Dateiname, Adresse; lib/whatsapp/erstinfo-pdf.ts). */
export function nameAusText(body: string | null | undefined): string | null {
  const zeilen = (body ?? "").split("\n").map((z) => z.trim());
  return zeilen.find((z) => /^[^\s/\\:]{1,160}\.[a-z0-9]{2,5}$/i.test(z) && !/^https?:/i.test(z)) ?? null;
}

/** Gesundheitsbezug eines Dateinamens bzw. Begleittexts (Sparte Kranken, BU, Leben, Pflege, Unfall oder eindeutige Begriffe). */
export function textMitGesundheitsbezug(text: string | null | undefined): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  return istGesundheitsbezug(sparteAusText(t)) || gesundheitInText(t) || enthaeltGesundheitsangabe(t.replace(/[_.-]+/g, " "));
}

/** Lead aus einer Gesundheitssparte (Produkt bzw. Quelle des Leads)? Tierversicherungen zählen nicht. */
export function leadMitGesundheitsbezug(source: string | null | undefined): boolean {
  if (!source || istTierLead(source)) return false;
  return gesundheitInText(source) || istGesundheitsbezug(sparteAusText(source));
}

export type DateiNachricht = {
  id: string;
  direction: string;
  kind: string | null;
  body: string | null;
  sentBy: string | null;
  createdAt: Date;
  mediaId?: string | null;
  mediaName?: string | null;
  mediaMime?: string | null;
  mediaSize?: number | null;
  mediaLink?: string | null;
};

export type DateiKontext = {
  /** Chat gehört zu einem Lead (eingehende Dateien laufen dann in die Policen-Strecke) */
  leadChat: boolean;
  /** Produkt bzw. Quelle des Leads (Lead.source) */
  leadSource?: string | null;
  /** Unterlagen der Policen-Ablage je Nachricht (LeadDocument.messageId) */
  ablage?: Map<string, { mimeType: string; size: number }>;
  /** Support-Nummer von performancegrowth: kein Vermittler, kein Support-Zugriff */
  supportChat?: boolean;
  /** Anzeigenamen: Lead (Vorname), Vermittler (für Nachrichten aus der WhatsApp-App), Logins (sentByUserId) */
  leadName?: string | null;
  vermittlerName?: string | null;
  nutzerNamen?: Map<string, string>;
  now?: Date;
};

/**
 * moeglich: Support-Zugriff anbieten · gesperrt: Gesundheitsbezug bzw. Policen-Ablage (nur Break-Glass) ·
 * nicht_gespeichert: Inhalt liegt nicht bei uns (ältere Nachricht ohne Medien-ID) · abgelaufen: Medien-ID älter als
 * 30 Tage · support: Chat der Support-Nummer (kein Vermittler, der benachrichtigt werden könnte)
 */
export type ZugriffStand = "moeglich" | "gesperrt" | "nicht_gespeichert" | "abgelaufen" | "support";

export type DateiInfo = {
  messageId: string;
  geschuetzt: boolean;
  /** Dateiname bzw. „Unterlage (geschützt)“ bzw. „Datei“ (Name unbekannt) */
  titel: string;
  /** Echter Dateiname (nur ungeschützt), für Protokoll und Mitteilung */
  name: string | null;
  art: string;
  groesse: string | null;
  von: string;
  zeit: string;
  /** „Angebot_Hausrat.pdf · PDF · 120 KB · von Anid“ */
  zeile: string;
  /** Unterzeile der Karte: „PDF · 120 KB · von Anid · 25.11., 14:03“ */
  details: string;
  zugriff: ZugriffStand;
};

const vorname = (s: string | null | undefined) => (s ?? "").trim().split(/\s+/)[0] || null;

export function absenderName(m: Pick<DateiNachricht, "direction" | "sentBy"> & { sentByUserId?: string | null }, k: DateiKontext): string {
  if (m.direction !== "outbound") return vorname(k.leadName) ?? (k.supportChat ? "Kontakt" : "Lead");
  if (m.sentBy === "bot" || m.sentBy === "system" || !m.sentBy) return "Assistent";
  const login = m.sentByUserId ? k.nutzerNamen?.get(m.sentByUserId) : null;
  if (login) return vorname(login)!;
  if (k.supportChat) return "Support";
  return vorname(k.vermittlerName) ?? "Vermittler";
}

const kurzZeit = (d: Date) =>
  `${new Intl.DateTimeFormat("de-DE", { timeZone: TZ, day: "2-digit", month: "2-digit" }).format(d)}, ${new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d)}`;

/** Warum geschützt? null = nicht geschützt. */
export function schutzGrund(m: DateiNachricht, k: DateiKontext, name: string | null): "ablage" | "gesundheit" | null {
  if (k.ablage?.has(m.id)) return "ablage";
  if (m.direction === "inbound" && k.leadChat) return "ablage";
  if (leadMitGesundheitsbezug(k.leadSource)) return "gesundheit";
  if (textMitGesundheitsbezug(name)) return "gesundheit";
  // Begleittext (Erstinformation: fester Text, Vermittler: eigener Text)
  if (!istDateiPlatzhalter(m.body) && textMitGesundheitsbezug(m.body)) return "gesundheit";
  return null;
}

/** Anzeige einer Datei im Admin-Chat; null, wenn die Nachricht keine Datei ist. */
export function dateiInfo(m: DateiNachricht & { sentByUserId?: string | null }, k: DateiKontext): DateiInfo | null {
  if (!istDateiNachricht(m.kind)) return null;
  const now = k.now ?? new Date();
  const ablage = k.ablage?.get(m.id);
  const rohName = m.mediaName?.trim() || (m.sentBy === "bot" ? nameAusText(m.body) : null);
  const grund = schutzGrund(m, k, rohName);
  const geschuetzt = !!grund;
  const art = dateiArt(m.mediaMime ?? ablage?.mimeType, geschuetzt ? null : rohName, m.kind);
  const groesse = groesseText(m.mediaSize ?? ablage?.size ?? null);
  const von = absenderName(m, k);
  const zeit = kurzZeit(m.createdAt);
  const name = geschuetzt ? null : rohName;
  const titel = geschuetzt ? GESCHUETZT_LABEL : (name ?? (art === "Bild" ? "Bild" : art === "Video" ? "Video" : "Datei"));
  let zugriff: ZugriffStand;
  if (geschuetzt) zugriff = "gesperrt";
  else if (k.supportChat) zugriff = "support";
  else if (m.mediaLink) zugriff = "moeglich";
  else if (!m.mediaId) zugriff = "nicht_gespeichert";
  else if (now.getTime() - m.createdAt.getTime() > MEDIA_ID_TAGE * 86_400_000) zugriff = "abgelaufen";
  else zugriff = "moeglich";
  const teile = [art, groesse, `von ${von}`].filter(Boolean) as string[];
  return {
    messageId: m.id,
    geschuetzt,
    titel,
    name,
    art,
    groesse,
    von,
    zeit,
    zeile: [titel, ...teile].join(" · "),
    details: [...teile, zeit].join(" · "),
    zugriff,
  };
}

// ─── Support-Zugriff: Grund, Mitteilung ────────────────────────────────

/** Grund prüfen: Pflicht, mindestens 10 Zeichen (ohne Leerraum am Rand), höchstens 300, eine Zeile. */
export function pruefeGrund(raw: unknown): { ok: true; grund: string } | { ok: false; fehler: string } {
  const grund = String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (grund.length < GRUND_MIN) return { ok: false, fehler: `Bitte einen Grund mit mindestens ${GRUND_MIN} Zeichen angeben.` };
  if (grund.length > GRUND_MAX) return { ok: false, fehler: `Bitte den Grund auf höchstens ${GRUND_MAX} Zeichen kürzen.` };
  return { ok: true, grund };
}

/**
 * Mitteilung an den Vermittler (Ole, 25.11.2026, exakt): „Ole Kannapinn hat am {Datum} um {Uhrzeit} im Rahmen des
 * Supports das Dokument „{Dateiname}“ im Chat mit {Lead-Vorname} geöffnet. Grund: {Grund}.“ Ohne Gedankenstriche
 * (Aufrufer bereinigt den Grund).
 */
export function supportZugriffText(o: { adminName: string; at: Date; dateiName: string; leadVorname: string; grund: string }): string {
  const datum = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(o.at);
  const uhrzeit = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(o.at);
  const grund = o.grund.trim().replace(/[.!]+$/, "");
  return `${o.adminName} hat am ${datum} um ${uhrzeit} im Rahmen des Supports das Dokument „${o.dateiName}“ im Chat mit ${o.leadVorname} geöffnet. Grund: ${grund}.`;
}
