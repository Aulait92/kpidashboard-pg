// Welche WhatsApp-Vorlagen die App je Kunde automatisch bei Meta einreicht und
// wie der Antrag aussieht (reine Funktionen, ohne Datenbank – testbar).
// Texte: SUGGESTED_TEMPLATE_TEXT in templates.ts. Ändert sich ein Text, die
// Version hochsetzen (TEMPLATE_VERSION) – dann wird er als neue Vorlage
// eingereicht; die alte bleibt nutzbar, bis die neue freigegeben ist.

import { PURPOSE_PARAMS, SUGGESTED_TEMPLATE_TEXT, TEMPLATE_BUTTONS, type NoticePurpose } from "@/lib/whatsapp/templates";
import type { CreateTemplateInput, RemoteTemplate } from "@/lib/whatsapp/dialog360";

export const TEMPLATE_VERSION = "v1";
export const TEMPLATE_LANGUAGE = "de";

/** Immer einreichen (Assistent: Erstanschreiben, Termine, Nachfassen). */
export const CORE_PURPOSES: NoticePurpose[] = [
  "outreach",
  "booking_confirmation",
  "reminder",
  "reschedule",
  "followup",
  "followup_offer",
  "followup_noshow",
  "followup_last",
];
/** Nur mit gebuchtem Bestandskunden-Modul. */
export const CAMPAIGN_PURPOSES: NoticePurpose[] = ["campaign_cross_sell", "campaign_review", "campaign_birthday", "campaign_renewal"];

export function purposesFor(opts: { bestand: boolean }): NoticePurpose[] {
  return opts.bestand ? [...CORE_PURPOSES, ...CAMPAIGN_PURPOSES] : [...CORE_PURPOSES];
}

/** Stabiler Name je Zweck und Textversion, z. B. pg_outreach_v1 (Meta: Kleinbuchstaben, Unterstrich). */
export function templateNameFor(purpose: NoticePurpose, version = TEMPLATE_VERSION): string {
  return `pg_${purpose}_${version}`.toLowerCase().replace(/[^a-z0-9_]/g, "_");
}

/**
 * Kategorie beim Einreichen. Termin-Bestätigung/-Erinnerung/-Verschiebung sind Service (UTILITY),
 * alles andere ist Ansprache (MARKETING). Meta prüft und stuft ggf. selbst um.
 */
export function categoryFor(purpose: NoticePurpose): "UTILITY" | "MARKETING" {
  return purpose === "booking_confirmation" || purpose === "reminder" || purpose === "reschedule" ? "UTILITY" : "MARKETING";
}

/** Name, der im Text für „[Berater]“ steht (wie im Admin: ohne vorangestelltes „Allianz“). */
export function advisorDisplayName(customerName: string): string {
  return customerName.replace(/^Allianz\s+/i, "").trim() || customerName.trim();
}

/** Text der Vorlage für diesen Kunden. */
export function templateBodyFor(purpose: NoticePurpose, advisor: string): string {
  return SUGGESTED_TEMPLATE_TEXT[purpose].split("[Berater]").join(advisor);
}

/** Beispielwerte für die Prüfung durch Meta (je Platzhalter, Reihenfolge wie PURPOSE_PARAMS). */
const EXAMPLES: Record<string, string> = {
  Vorname: "Julia",
  "Datum/Uhrzeit": "Mo., 14.12., 10:00 Uhr",
  Art: "Telefon",
  "Link/Hinweis": "Wir rufen dich unter deiner Nummer an.",
  "Thema (z. B. Hausrat, Haftpflicht)": "Hausrat",
  "Thema (z. B. Hausrat)": "Hausrat",
  "Vertrag (z. B. KFZ)": "KFZ",
};

export function exampleValuesFor(purpose: NoticePurpose): string[] {
  return PURPOSE_PARAMS[purpose].map((label) => EXAMPLES[label] ?? label);
}

/** Antrag für POST /v1/configs/templates. */
export function buildTemplateRequest(purpose: NoticePurpose, advisor: string, version = TEMPLATE_VERSION): CreateTemplateInput {
  const text = templateBodyFor(purpose, advisor);
  const examples = exampleValuesFor(purpose);
  const body: Record<string, unknown> = { type: "BODY", text };
  if (examples.length) body.example = { body_text: [examples] };
  const components: unknown[] = [body];
  const buttons = TEMPLATE_BUTTONS[purpose] ?? [];
  if (buttons.length) components.push({ type: "BUTTONS", buttons: buttons.map((text) => ({ type: "QUICK_REPLY", text })) });
  return {
    name: templateNameFor(purpose, version),
    category: categoryFor(purpose),
    language: TEMPLATE_LANGUAGE,
    components,
  };
}

/** Vorschau mit eingesetzten Beispielwerten (Kundenansicht). */
export function previewBodyFor(purpose: NoticePurpose, advisor: string): string {
  const values = exampleValuesFor(purpose);
  return templateBodyFor(purpose, advisor).replace(/\{\{(\d+)\}\}/g, (_, n: string) => values[Number(n) - 1] ?? "");
}

/** Verständliche Titel für die Kundenansicht. */
export const CUSTOMER_TITLES: Record<NoticePurpose, { title: string; when: string }> = {
  outreach: { title: "Erste Nachricht an neue Leads", when: "Geht wenige Minuten nach dem Formular raus." },
  booking_confirmation: { title: "Terminbestätigung", when: "Sobald ein Lead einen Termin gebucht hat." },
  reminder: { title: "Terminerinnerung", when: "Etwa 24 Stunden vor dem Termin." },
  reschedule: { title: "Termin verschoben", when: "Wenn Ihr Team einen Termin verlegen muss, z. B. wegen Abwesenheit." },
  followup: { title: "Nachfassen, wenn der Chat ruht", when: "Wenn ein Lead länger nicht geantwortet hat." },
  followup_offer: { title: "Nachfassen nach einem Angebot", when: "Einige Tage nach „Angebot gesendet“." },
  followup_noshow: { title: "Nachfassen nach verpasstem Termin", when: "Wenn ein Lead nicht zum Termin erschienen ist." },
  followup_last: { title: "Letzte Nachricht", when: "Zum Abschluss einer Nachfass-Abfolge." },
  campaign_cross_sell: { title: "Bestandskunden: Lücke schließen", when: "Kampagne an Bestandskunden mit fehlender Sparte." },
  campaign_review: { title: "Bestandskunden: Jahresgespräch", when: "Kampagne für den jährlichen Vertrags-Check." },
  campaign_birthday: { title: "Bestandskunden: Geburtstag", when: "Am Geburtstag Ihrer Kunden." },
  campaign_renewal: { title: "Bestandskunden: Ablauf/Wechsel", when: "Vor dem Ablauf eines Vertrags." },
};

export type LocalStatus = "pending" | "approved" | "rejected" | "paused";

/** 360dialog-/Meta-Status → unser Status (nur „approved“ wird zum Senden genutzt). */
export function mapRemoteStatus(status: string): LocalStatus {
  const s = status.toUpperCase();
  if (s === "APPROVED") return "approved";
  if (s === "REJECTED" || s === "DISABLED") return "rejected";
  if (s === "PAUSED") return "paused";
  return "pending"; // SUBMITTED, PENDING, IN_APPEAL, …
}

/** Passende Vorlage in der Liste von 360dialog (Name gleich, Sprache „de“ bzw. „de_DE“). */
export function findRemote(list: RemoteTemplate[], name: string): RemoteTemplate | null {
  return list.find((t) => t.name === name && (t.language === TEMPLATE_LANGUAGE || t.language.toLowerCase().startsWith(`${TEMPLATE_LANGUAGE}_`))) ?? null;
}
