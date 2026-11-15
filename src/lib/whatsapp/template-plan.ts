// Welche WhatsApp-Vorlagen die App je Kunde automatisch bei Meta einreicht und
// wie der Antrag aussieht (reine Funktionen, ohne Datenbank – testbar).
// Texte: TEMPLATE_BODY in templates.ts. Ändert sich ein Text, die Version hochsetzen
// (TEMPLATE_VERSION) – dann wird er als neue Vorlage eingereicht; die alte bleibt
// nutzbar, bis die neue freigegeben ist.
//
// Je Kunde und Zweck alle Fassungen (formsFor), unabhängig von der gewählten Ansprache –
// so greift ein Wechsel Sie/Du sofort mit freigegebenen Vorlagen:
//   pg_<zweck>_v3                 Du      „Hallo {{1}}, …“
//   pg_<zweck>_v3_sie             Sie     „Guten Tag {{1}}, …“ ({{1}} = Frau Schneider / Julia Schneider)
//   pg_<zweck>_v3_sie_ohne_name   Sie     „Guten Tag, …“ (für Kontakte ohne Nachnamen)

import {
  TEMPLATE_BUTTONS,
  TEMPLATE_VERSION,
  fillNames,
  formsFor,
  hasDuVariant,
  paramLabelsFor,
  renderTemplate,
  templateTextFor,
  type NoticePurpose,
  type TemplateForm,
  type TemplateNames,
} from "@/lib/whatsapp/templates";
import type { Ansprache } from "@/lib/ansprache";
import { firmDisplayName, personFromCustomerName } from "@/lib/advisor-name";
import type { CreateTemplateInput, RemoteTemplate } from "@/lib/whatsapp/dialog360";

export { TEMPLATE_VERSION };
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

/** Fassung zu einer Ansprache bzw. Fassung (Kampagnen/Empfehlungen: immer Sie). */
export function formOf(purpose: NoticePurpose, form: TemplateForm | Ansprache): TemplateForm {
  if (form === "sie_ohne_name") return form;
  return form === "du" && hasDuVariant(purpose) ? "du" : "sie";
}

/** Alle einzureichenden Vorlagen eines Kunden: je Zweck jede Fassung. */
export function plannedTemplates(purposes: NoticePurpose[]): { purpose: NoticePurpose; form: TemplateForm }[] {
  return purposes.flatMap((purpose) => formsFor(purpose).map((form) => ({ purpose, form })));
}

/**
 * Stabiler Name je Zweck, Textversion und Fassung, z. B. pg_outreach_v2, pg_outreach_v2_sie,
 * pg_outreach_v2_sie_ohne_name (Meta: Kleinbuchstaben, Ziffern, Unterstrich).
 */
export function templateNameFor(purpose: NoticePurpose, version = TEMPLATE_VERSION, form: TemplateForm | Ansprache = "du"): string {
  const f = formOf(purpose, form);
  const suffix = f === "du" ? "" : `_${f}`;
  return `pg_${purpose}_${version}${suffix}`.toLowerCase().replace(/[^a-z0-9_]/g, "_");
}

/**
 * Kategorie beim Einreichen. Termin-Bestätigung/-Erinnerung/-Verschiebung sind Service (UTILITY),
 * alles andere ist Ansprache (MARKETING). Meta prüft und stuft ggf. selbst um.
 */
export function categoryFor(purpose: NoticePurpose): "UTILITY" | "MARKETING" {
  return purpose === "booking_confirmation" || purpose === "reminder" || purpose === "reschedule" ? "UTILITY" : "MARKETING";
}

/** Firmenname, der im Text für „[Firma]“ steht (wie im Admin: ohne vorangestelltes „Allianz“). */
export function advisorDisplayName(customerName: string): string {
  return customerName.replace(/^Allianz\s+/i, "").trim() || customerName.trim();
}

/** [Firma] = Kundenname, [Berater] = Person (Ole, 14.11.2026). */
export function templateNamesOf(customerName: string): TemplateNames {
  return { firm: firmDisplayName(customerName), advisor: personFromCustomerName(customerName) };
}

/** Text der Vorlage für diesen Kunden (names: Firma und Berater, oder ein Name für beide). */
export function templateBodyFor(purpose: NoticePurpose, names: TemplateNames | string, form: TemplateForm | Ansprache = "du"): string {
  return fillNames(templateTextFor(purpose, formOf(purpose, form)), names);
}

/** Beispielwerte für die Prüfung durch Meta (je Platzhalter, Reihenfolge wie paramLabelsFor). */
const EXAMPLES: Record<string, string> = {
  Vorname: "Julia",
  "Anrede und Nachname": "Frau Schneider",
  "Datum/Uhrzeit": "Mo., 14.12., 10:00 Uhr",
  Art: "Telefon",
  "Link/Hinweis": "Wir rufen dich unter deiner Nummer an.",
  "Thema (z. B. Hausrat, Haftpflicht)": "Hausrat",
  "Thema (z. B. Hausrat)": "Hausrat",
  "Vertrag (z. B. KFZ)": "KFZ",
  "Google-Link": "https://app.performancegrowth.de/empfehlung/abc123/google",
  Empfehlungslink: "https://app.performancegrowth.de/empfehlung/abc123",
  "Stand der Empfehlung": "Über Ihren Link hat sich jemand bei mir gemeldet.",
  "Erstinformation (Link)": "https://app.performancegrowth.de/erstinformation/abc123",
};

export function exampleValuesFor(purpose: NoticePurpose, form: TemplateForm | Ansprache = "du"): string[] {
  const f = formOf(purpose, form);
  return paramLabelsFor(purpose, f).map((label) =>
    label === "Link/Hinweis" && f !== "du" ? "Wir rufen Sie unter Ihrer Nummer an." : (EXAMPLES[label] ?? label),
  );
}

/** Beispielwerte nach dem Namen (REST_PARAMS) – für Vorschauen mit eigener Anrede. */
export function exampleRestFor(purpose: NoticePurpose, an: Ansprache): string[] {
  return formOf(purpose, an) === "du" ? exampleValuesFor(purpose, "du").slice(1) : exampleValuesFor(purpose, "sie_ohne_name");
}

/** Antrag für POST /v1/configs/templates. */
export function buildTemplateRequest(purpose: NoticePurpose, names: TemplateNames | string, version = TEMPLATE_VERSION, form: TemplateForm | Ansprache = "du"): CreateTemplateInput {
  const text = templateBodyFor(purpose, names, form);
  const examples = exampleValuesFor(purpose, form);
  const body: Record<string, unknown> = { type: "BODY", text };
  if (examples.length) body.example = { body_text: [examples] };
  const components: unknown[] = [body];
  const buttons = TEMPLATE_BUTTONS[purpose] ?? [];
  if (buttons.length) components.push({ type: "BUTTONS", buttons: buttons.map((text) => ({ type: "QUICK_REPLY", text })) });
  return {
    name: templateNameFor(purpose, version, form),
    category: categoryFor(purpose),
    language: TEMPLATE_LANGUAGE,
    components,
  };
}

/** Gehört der Vorlagenname zu dieser Fassung? (genau oder Revision …_r2, …_r3) */
export function isTemplateRevisionOf(name: string, base: string): boolean {
  return name === base || new RegExp(`^${base}_r\\d+$`).test(name);
}

/**
 * Prüft einen Vorlagentext gegen Metas Regeln (vor dem Einreichen und in Tests): Platzhalter
 * fortlaufend ab {{1}}, nicht ganz am Anfang oder Ende, nicht direkt nebeneinander, keine
 * leeren Werte in den Beispielen. Gibt die gefundenen Probleme zurück (leer = in Ordnung).
 */
export function metaTemplateProblems(text: string, examples: string[]): string[] {
  const problems: string[] = [];
  const vars = [...text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  const distinct = [...new Set(vars)].sort((x, y) => x - y);
  if (distinct.some((n, i) => n !== i + 1)) problems.push("Platzhalter nicht fortlaufend ab {{1}}");
  if (/^\s*\{\{\d+\}\}/.test(text)) problems.push("Platzhalter am Anfang");
  if (/\{\{\d+\}\}\s*$/.test(text)) problems.push("Platzhalter am Ende");
  if (/\{\{\d+\}\}\s*\{\{\d+\}\}/.test(text)) problems.push("Platzhalter direkt nebeneinander");
  if (examples.length !== distinct.length) problems.push("Anzahl Beispielwerte passt nicht");
  if (examples.some((e) => !e.trim())) problems.push("leerer Beispielwert");
  if (/[–—]/.test(text)) problems.push("Gedankenstrich");
  return problems;
}

/** Vorschau mit eingesetzten Beispielwerten (Kundenansicht). */
export function previewBodyFor(purpose: NoticePurpose, names: TemplateNames | string, form: TemplateForm | Ansprache = "du"): string {
  return renderTemplate(templateBodyFor(purpose, names, form), exampleValuesFor(purpose, form));
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
