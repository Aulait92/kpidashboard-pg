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
// A/B-Fassung b (TEMPLATE_BODY_B) mit „_b“ hinter der Version: pg_<zweck>_v4_b, pg_<zweck>_v4_b_sie …
// Erstanschreiben mit PDF der Erstinformation im Kopf (TEMPLATE_HEADER) und Fußzeile (ERSTINFO_FOOTER).

import {
  ERSTINFO_FOOTER,
  TEMPLATE_BUTTONS,
  TEMPLATE_HEADER,
  TEMPLATE_VERSION,
  variantsFor,
  templateVersionFor,
  fillNames,
  formsFor,
  hasDuVariant,
  paramLabelsFor,
  renderTemplate,
  templateTextFor,
  type NoticePurpose,
  type TemplateForm,
  type TemplateNames,
  type TemplateVariant,
} from "@/lib/whatsapp/templates";
import type { Ansprache } from "@/lib/ansprache";
import { firmDisplayName, kurzNameFuerLeads, personFromCustomerName } from "@/lib/advisor-name";
import type { CreateTemplateInput, RemoteTemplate } from "@/lib/whatsapp/dialog360";

export { TEMPLATE_VERSION };
export const TEMPLATE_LANGUAGE = "de";

/** Immer einreichen (Assistent: Erstanschreiben, Termine, Nachfassen). */
export const CORE_PURPOSES: NoticePurpose[] = [
  "outreach",
  "outreach_tkv",
  "outreach_zahn",
  "outreach_pkv",
  "outreach_privatschutz",
  "booking_confirmation",
  "reminder",
  "reminder_soon",
  "reschedule",
  "followup",
  "followup_nudge",
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

/** Alle einzureichenden Vorlagen eines Kunden: je Zweck jede Fassung (Ansprache) und jede A/B-Fassung. */
export function plannedTemplates(purposes: NoticePurpose[]): { purpose: NoticePurpose; form: TemplateForm; variant: TemplateVariant }[] {
  return purposes.flatMap((purpose) => variantsFor(purpose).flatMap((variant) => formsFor(purpose).map((form) => ({ purpose, form, variant }))));
}

/**
 * Stabiler Name je Zweck, Textversion und Fassung, z. B. pg_outreach_v2, pg_outreach_v2_sie,
 * pg_outreach_v2_sie_ohne_name (Meta: Kleinbuchstaben, Ziffern, Unterstrich).
 */
export function templateNameFor(purpose: NoticePurpose, version = TEMPLATE_VERSION, form: TemplateForm | Ansprache = "du", variant: TemplateVariant = "a"): string {
  // Allgemeine Version → ggf. feste Version des Zwecks (PURPOSE_VERSION, z. B. review_request v3)
  if (version === TEMPLATE_VERSION) version = templateVersionFor(purpose);
  const f = formOf(purpose, form);
  const suffix = f === "du" ? "" : `_${f}`;
  return `pg_${purpose}_${version}${variant === "b" ? "_b" : ""}${suffix}`.toLowerCase().replace(/[^a-z0-9_]/g, "_");
}

/**
 * Kategorie beim Einreichen. Termin-Bestätigung/-Erinnerung/-Verschiebung sind Service (UTILITY),
 * alles andere ist Ansprache (MARKETING). Meta prüft und stuft ggf. selbst um.
 */
export function categoryFor(purpose: NoticePurpose): "UTILITY" | "MARKETING" {
  return purpose === "booking_confirmation" || purpose === "reminder" || purpose === "reminder_soon" || purpose === "reschedule" ? "UTILITY" : "MARKETING";
}

/** Firmenname, der im Text für „[Firma]“ steht (wie im Admin: ohne vorangestelltes „Allianz“). */
export function advisorDisplayName(customerName: string): string {
  return customerName.replace(/^Allianz\s+/i, "").trim() || customerName.trim();
}

/**
 * [Firma] = Kundenname, [Berater] = Person (Ole, 14.11.2026), [Rolle] = Status laut Erstinformation (rolleText),
 * [Kurzname] = Vorname laut Profil (Anbieterangaben), sonst Agentur (Erstanschreiben ab v5, Ole 16.11.2026).
 */
export function templateNamesOf(customerName: string, role?: string, profilName?: string | null): TemplateNames {
  return {
    firm: firmDisplayName(customerName),
    advisor: personFromCustomerName(customerName),
    kurz: kurzNameFuerLeads({ profilName, customerName }),
    ...(role ? { role } : {}),
  };
}

/** Text der Vorlage für diesen Kunden (names: Firma und Berater, oder ein Name für beide). */
export function templateBodyFor(purpose: NoticePurpose, names: TemplateNames | string, form: TemplateForm | Ansprache = "du", variant: TemplateVariant = "a"): string {
  return fillNames(templateTextFor(purpose, formOf(purpose, form), variant), names);
}

/** Beispielwerte für die Prüfung durch Meta (je Platzhalter, Reihenfolge wie paramLabelsFor). */
const EXAMPLES: Record<string, string> = {
  Vorname: "Julia",
  "Anrede und Nachname": "Frau Schneider",
  "Datum/Uhrzeit": "Mo., 14.12., 10:00 Uhr",
  Uhrzeit: "10:00 Uhr",
  Art: "Telefon",
  "Link/Hinweis": "Wir rufen dich unter deiner Nummer an.",
  "Thema (z. B. Hausrat, Haftpflicht)": "Hausrat",
  "Thema (z. B. Hausrat)": "Hausrat",
  "Vertrag (z. B. KFZ)": "KFZ",
  "Google-Link": "https://app.performancegrowth.de/empfehlung/abc123/google",
  Empfehlungslink: "https://app.performancegrowth.de/empfehlung/abc123",
  "Stand der Empfehlung": "Über Ihren Link hat sich jemand bei mir gemeldet.",
  "Erstinformation (Link)": "https://app.performancegrowth.de/erstinformation/abc123",
  "Terminvorschlag 1": "Di., 17.11. um 10:00 Uhr",
  "Terminvorschlag 2": "Mi., 18.11. um 16:00 Uhr",
  "Thema der Empfehlung": "Hausrat",
  Tier: "Ihre Katze",
};

/** Beispiel für das Produkt im Erstanschreiben (passt zum Artikel im Text: „zur …“ bzw. „zum Thema …“). */
const PRODUKT_BEISPIEL: Partial<Record<NoticePurpose, string>> = {
  outreach_tkv: "Katzenversicherung",
  outreach_zahn: "Zahnzusatzversicherung",
  outreach_pkv: "privaten Krankenversicherung",
  outreach_privatschutz: "Privatschutz",
};

export function exampleValuesFor(purpose: NoticePurpose, form: TemplateForm | Ansprache = "du"): string[] {
  const f = formOf(purpose, form);
  return paramLabelsFor(purpose, f).map((label) =>
    label === "Link/Hinweis" && f !== "du"
      ? "Wir rufen Sie unter Ihrer Nummer an."
      : label === "Tier" && f === "du"
        ? "deine Katze"
      : label === "Produkt"
        ? (PRODUKT_BEISPIEL[purpose] ?? "Versicherung")
        : (EXAMPLES[label] ?? label),
  );
}

/** Beispielwerte nach dem Namen (REST_PARAMS) – für Vorschauen mit eigener Anrede. */
export function exampleRestFor(purpose: NoticePurpose, an: Ansprache): string[] {
  return formOf(purpose, an) === "du" ? exampleValuesFor(purpose, "du").slice(1) : exampleValuesFor(purpose, "sie_ohne_name");
}

/**
 * Antrag für POST /v1/configs/templates. Mit opts.documentExample (öffentliche Adresse eines Beispiel-PDFs) bekommen
 * Zwecke mit TEMPLATE_HEADER einen Dokument-Kopf (example.header_handle mit Link, wie in der 360dialog-Doku
 * „Template Elements“) und die Fußzeile ERSTINFO_FOOTER. Ohne Beispiel (null): ohne Kopf und Fußzeile.
 */
export function buildTemplateRequest(
  purpose: NoticePurpose,
  names: TemplateNames | string,
  version = TEMPLATE_VERSION,
  form: TemplateForm | Ansprache = "du",
  opts: { variant?: TemplateVariant; documentExample?: string | null } = {},
): CreateTemplateInput {
  const variant = opts.variant ?? "a";
  const text = templateBodyFor(purpose, names, form, variant);
  const examples = exampleValuesFor(purpose, form);
  const components: unknown[] = [];
  const header = opts.documentExample ? TEMPLATE_HEADER[purpose] : undefined;
  if (header) components.push({ type: "HEADER", format: header, example: { header_handle: [opts.documentExample] } });
  const body: Record<string, unknown> = { type: "BODY", text };
  if (examples.length) body.example = { body_text: [examples] };
  components.push(body);
  if (header) components.push({ type: "FOOTER", text: ERSTINFO_FOOTER });
  const buttons = TEMPLATE_BUTTONS[purpose] ?? [];
  if (buttons.length) components.push({ type: "BUTTONS", buttons: buttons.map((text) => ({ type: "QUICK_REPLY", text })) });
  return {
    name: templateNameFor(purpose, version, form, variant),
    category: categoryFor(purpose),
    language: TEMPLATE_LANGUAGE,
    components,
  };
}

/** Kopf und Knöpfe eines Antrags (gespeichert in MessageTemplate.headerFormat/buttons). */
export function requestShape(req: CreateTemplateInput): { headerFormat: string | null; buttons: string[] } {
  const comps = req.components as { type: string; format?: string; buttons?: { text: string }[] }[];
  return {
    headerFormat: comps.find((c) => c.type === "HEADER")?.format ?? null,
    buttons: comps.find((c) => c.type === "BUTTONS")?.buttons?.map((b) => b.text) ?? [],
  };
}

/** Ohne Kopf neu einreichen (Fallback, wenn Meta bzw. 360dialog den Dokument-Kopf ablehnt). */
export function withoutHeader(req: CreateTemplateInput): CreateTemplateInput {
  return { ...req, components: (req.components as { type: string }[]).filter((c) => c.type !== "HEADER" && c.type !== "FOOTER") };
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
export function previewBodyFor(purpose: NoticePurpose, names: TemplateNames | string, form: TemplateForm | Ansprache = "du", variant: TemplateVariant = "a"): string {
  return renderTemplate(templateBodyFor(purpose, names, form, variant), exampleValuesFor(purpose, form));
}

/** Verständliche Titel für die Kundenansicht. */
export const CUSTOMER_TITLES: Record<NoticePurpose, { title: string; when: string }> = {
  outreach: { title: "Erste Nachricht an neue Leads (ohne bestimmtes Produkt)", when: "Wenige Minuten nach dem Formular, mit der Erstinformation als PDF." },
  outreach_tkv: { title: "Erste Nachricht: Tierkrankenversicherung", when: "Wenige Minuten nach dem Formular, mit der ersten Frage und der Erstinformation als PDF." },
  outreach_zahn: { title: "Erste Nachricht: Zahnzusatz", when: "Wenige Minuten nach dem Formular, mit der ersten Frage und der Erstinformation als PDF." },
  outreach_pkv: { title: "Erste Nachricht: private Krankenversicherung", when: "Wenige Minuten nach dem Formular, mit der ersten Frage und der Erstinformation als PDF." },
  outreach_privatschutz: { title: "Erste Nachricht: Privatschutz", when: "Wenige Minuten nach dem Formular, mit der ersten Frage und der Erstinformation als PDF." },
  booking_confirmation: { title: "Terminbestätigung", when: "Sobald ein Lead einen Termin gebucht hat." },
  reminder: { title: "Terminerinnerung", when: "Etwa 24 Stunden vor dem Termin." },
  reminder_soon: { title: "Kurz vor dem Termin", when: "Etwa eine Stunde vor dem Termin: passt alles?" },
  reschedule: { title: "Termin verschoben", when: "Wenn Ihr Team einen Termin verlegen muss, z. B. wegen Abwesenheit." },
  followup: { title: "Nachfassen mit zwei Terminvorschlägen", when: "Wenn ein Lead länger nicht geantwortet hat, mit zwei freien Zeiten aus Ihrem Kalender." },
  followup_nudge: { title: "Kurze Nachfrage", when: "Wenn ein Lead noch nicht geantwortet hat (ohne verbundenen Kalender statt der Terminvorschläge)." },
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
