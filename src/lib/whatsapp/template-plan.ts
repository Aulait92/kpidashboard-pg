// Welche WhatsApp-Vorlagen die App je Kunde automatisch bei Meta einreicht und
// wie der Antrag aussieht (reine Funktionen, ohne Datenbank – testbar).
// Texte: SUGGESTED_TEMPLATE_TEXT in templates.ts. Ändert sich ein Text, die
// Version hochsetzen (TEMPLATE_VERSION) – dann wird er als neue Vorlage
// eingereicht; die alte bleibt nutzbar, bis die neue freigegeben ist.

import { PURPOSE_PARAMS, TEMPLATE_BUTTONS, hasSieVariant, templateTextFor, type NoticePurpose } from "@/lib/whatsapp/templates";
import type { Ansprache } from "@/lib/ansprache";
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

/** Nur mit Modul „Empfehlungen & Bewertungen“ (auch in der Testphase). */
export const EMPFEHLUNG_PURPOSES: NoticePurpose[] = ["review_request", "referral_request", "referral_thanks", "referral_update"];

export function purposesFor(opts: { bestand: boolean; empfehlung?: boolean }): NoticePurpose[] {
  return [...CORE_PURPOSES, ...(opts.bestand ? CAMPAIGN_PURPOSES : []), ...(opts.empfehlung ? EMPFEHLUNG_PURPOSES : [])];
}

/**
 * Stabiler Name je Zweck und Textversion, z. B. pg_outreach_v1 (Meta: Kleinbuchstaben, Unterstrich).
 * Sie-Fassung (nur Zwecke, deren Standard duzt): pg_outreach_v1_sie.
 */
export function templateNameFor(purpose: NoticePurpose, version = TEMPLATE_VERSION, ansprache: Ansprache = "du"): string {
  const sie = ansprache === "sie" && hasSieVariant(purpose) ? "_sie" : "";
  return `pg_${purpose}_${version}${sie}`.toLowerCase().replace(/[^a-z0-9_]/g, "_");
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
export function templateBodyFor(purpose: NoticePurpose, advisor: string, ansprache: Ansprache = "du"): string {
  return templateTextFor(purpose, ansprache).split("[Berater]").join(advisor);
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
  "Google-Link": "https://app.performancegrowth.de/empfehlung/abc123/google",
  Empfehlungslink: "https://app.performancegrowth.de/empfehlung/abc123",
  "Stand der Empfehlung": "Über Ihren Link hat sich jemand bei mir gemeldet.",
};

export function exampleValuesFor(purpose: NoticePurpose, ansprache: Ansprache = "du"): string[] {
  return PURPOSE_PARAMS[purpose].map((label) =>
    label === "Link/Hinweis" && ansprache === "sie" ? "Wir rufen Sie unter Ihrer Nummer an." : (EXAMPLES[label] ?? label),
  );
}

/** Antrag für POST /v1/configs/templates. */
export function buildTemplateRequest(purpose: NoticePurpose, advisor: string, version = TEMPLATE_VERSION, ansprache: Ansprache = "du"): CreateTemplateInput {
  const text = templateBodyFor(purpose, advisor, ansprache);
  const examples = exampleValuesFor(purpose, ansprache);
  const body: Record<string, unknown> = { type: "BODY", text };
  if (examples.length) body.example = { body_text: [examples] };
  const components: unknown[] = [body];
  const buttons = TEMPLATE_BUTTONS[purpose] ?? [];
  if (buttons.length) components.push({ type: "BUTTONS", buttons: buttons.map((text) => ({ type: "QUICK_REPLY", text })) });
  return {
    name: templateNameFor(purpose, version, ansprache),
    category: categoryFor(purpose),
    language: TEMPLATE_LANGUAGE,
    components,
  };
}

/** Gehört der Vorlagenname zu dieser Fassung? (genau oder Revision …_r2, …_r3) */
export function isTemplateRevisionOf(name: string, base: string): boolean {
  return name === base || new RegExp(`^${base}_r\\d+$`).test(name);
}

/** Vorschau mit eingesetzten Beispielwerten (Kundenansicht). */
export function previewBodyFor(purpose: NoticePurpose, advisor: string, ansprache: Ansprache = "du"): string {
  const values = exampleValuesFor(purpose, ansprache);
  return templateBodyFor(purpose, advisor, ansprache).replace(/\{\{(\d+)\}\}/g, (_, n: string) => values[Number(n) - 1] ?? "");
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
  review_request: { title: "Nachfrage nach dem Abschluss mit Google-Link", when: "Einige Tage nach einem Abschluss (Modul Empfehlungen & Bewertungen)." },
  referral_request: { title: "Bitte um Empfehlung", when: "Einige Wochen nach einem Abschluss (Modul Empfehlungen & Bewertungen)." },
  referral_thanks: { title: "Dank an den Empfehlenden", when: "Sobald aus einer Empfehlung ein Abschluss wird." },
  referral_update: { title: "Rückmeldung an den Empfehlenden", when: "Wenn sich eine empfohlene Person meldet oder ein Termin zustande kommt (nur mit deren Einwilligung)." },
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
