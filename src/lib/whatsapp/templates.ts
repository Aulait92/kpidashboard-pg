// System-Nachrichten (Erstanschreiben, Buchungsbestätigung, Erinnerung).
// WhatsApp erlaubt Freitext nur im 24h-Service-Fenster (nach der letzten
// Nachricht des Kontakts). Außerhalb muss eine von Meta freigegebene Vorlage
// verwendet werden. sendWhatsAppNotice wählt automatisch:
//   Fenster offen → Freitext (identischer Inhalt, keine Vorlagenkosten), mit Knöpfen als interaktive Nachricht
//   Fenster zu    → freigegebene Vorlage des Kunden für diesen Zweck
//
// Anrede-Zeile (Ole, 14.11.2026; Regel in lib/ansprache.ts → anredeZeile):
//   Du-Fassung        „Hallo {{1}}, …“             {{1}} = Vorname
//   Sie-Fassung       „Guten Tag {{1}}, …“         {{1}} = „Frau Schneider“ bzw. „Julia Schneider“
//   Sie ohne Namen    „Guten Tag, …“               (kein Namensplatzhalter; die übrigen rücken auf)
// Meta erlaubt keine leeren Parameter und keinen Platzhalter ganz am Anfang oder Ende. Ohne
// Nachnamen gibt es daher keine „Guten Tag {{1}}“-Nachricht mit leerem Wert, sondern die eigene
// Fassung ohne Namen. Weitere Parameter je Zweck (nach dem Namen): siehe REST_PARAMS.
//
// Verkaufsstärker (Ole, 15.11.2026, v4): eine Nachricht, ein Ziel, kurz. Wo eine Antwort erwartet wird, gibt es
// Schnellantwort-Knöpfe (TEMPLATE_BUTTONS; Antworten verarbeitet lib/whatsapp/knopf.ts). Das Erstanschreiben
// stellt je Produkt direkt die erste, leichte Frage und trägt die Erstinformation als PDF im Kopf (TEMPLATE_HEADER).
// Bis zu zwei Fassungen je Vorlage (TEMPLATE_BODY_B) für A/B-Tests (lib/whatsapp/ab-test.ts).

import { decryptSecret } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";
import { anredeName, anredeZeile, asAnsprache, kontaktParts, type Ansprache, type AnredeKontakt } from "@/lib/ansprache";
import { sendButtons, sendTemplate, sendText } from "@/lib/whatsapp/dialog360";
import { WhatsAppNoConsentError, WhatsAppOptOutError } from "@/lib/whatsapp/stopp";
import { ERSTINFO_KOPF } from "@/lib/whatsapp/ki-hinweis";

export type NoticePurpose =
  | "outreach"
  | "outreach_tkv"
  | "outreach_zahn"
  | "outreach_pkv"
  | "outreach_privatschutz"
  | "booking_confirmation"
  | "reminder"
  | "reminder_soon"
  | "reschedule"
  | "followup"
  | "followup_nudge"
  | "followup_offer"
  | "followup_noshow"
  | "followup_last"
  | "campaign_cross_sell"
  | "campaign_review"
  | "campaign_birthday"
  | "campaign_renewal"
  | "review_request"
  | "referral_request"
  | "referral_thanks"
  | "referral_update";

export const PURPOSE_LABELS: Record<NoticePurpose, string> = {
  outreach: "Erstanschreiben (ohne Produkt)",
  outreach_tkv: "Erstanschreiben Tierkrankenversicherung",
  outreach_zahn: "Erstanschreiben Zahnzusatz",
  outreach_pkv: "Erstanschreiben private Krankenversicherung",
  outreach_privatschutz: "Erstanschreiben Privatschutz",
  booking_confirmation: "Buchungsbestätigung",
  reminder: "Termin-Erinnerung",
  reminder_soon: "Termin gleich: passt alles?",
  reschedule: "Termin verschoben",
  followup: "Nachfassen mit zwei Terminvorschlägen",
  followup_nudge: "Nachfassen: kurze Nachfrage (Chat ruht)",
  followup_offer: "Nachfassen nach Angebot",
  followup_noshow: "Nachfassen nach verpasstem Termin",
  followup_last: "Nachfassen: letzte Nachricht (Abfolge)",
  campaign_cross_sell: "Bestandskunden: Lücke schließen",
  campaign_review: "Bestandskunden: Jahresgespräch",
  campaign_birthday: "Bestandskunden: Geburtstag",
  campaign_renewal: "Bestandskunden: Ablauf/Wechsel",
  review_request: "Empfehlungen: Nachfrage + Google-Bewertung",
  referral_request: "Empfehlungen: Bitte um Empfehlung",
  referral_thanks: "Empfehlungen: Dank an den Empfehlenden",
  referral_update: "Empfehlungen: Rückmeldung an den Empfehlenden",
};

/** Erstanschreiben je Produkt (lib/whatsapp/erstanschreiben.ts wählt anhand des Leadformulars). */
export const OUTREACH_PURPOSES = ["outreach", "outreach_tkv", "outreach_zahn", "outreach_pkv", "outreach_privatschutz"] as const satisfies readonly NoticePurpose[];
export const isOutreachPurpose = (p: string): boolean => (OUTREACH_PURPOSES as readonly string[]).includes(p);

/**
 * Version der automatisch eingereichten Texte. v2 (14.11.2026): Anrede „Guten Tag Frau Schneider“
 * bei Sie, eigene Fassung ohne Namen, Firma/Berater getrennt. v3 (15.11.2026, KI-Verordnung und
 * Erstinformation): Erstanschreiben mit vollständigem KI-Hinweis und Link zur Erstinformation.
 * v4 (15.11.2026, verkaufsstärker): erste Frage je Produkt mit Knöpfen, Erstinformation als PDF im Kopf,
 * Knöpfe überall, wo eine Antwort erwartet wird, Terminvorschläge im Nachfassen. Freigegebene ältere
 * Vorlagen bleiben im Einsatz, bis die neue Fassung freigegeben ist (rankTemplates, legacyParams).
 */
export const TEMPLATE_VERSION = "v4";

/**
 * Feste Textversion je Zweck, wenn sich dieser Text mit der allgemeinen Version NICHT geändert hat (dann wird er
 * nicht neu eingereicht). Es gilt dieser Wert statt TEMPLATE_VERSION.
 *   review_request v3 (15.11.2026): neutrale Bitte um eine ehrliche Bewertung mit Abmeldeknopf.
 *   referral_thanks, referral_update v3: unverändert seit v3.
 */
export const PURPOSE_VERSION: Partial<Record<NoticePurpose, string>> = { review_request: "v3", referral_thanks: "v3", referral_update: "v3" };

/**
 * Zwecke, für die nur die aktuelle Fassung gesendet wird (ältere automatisch eingereichte Fassungen nicht mehr),
 * weil der alte Text nicht mehr verwendet werden darf. Bis zur Freigabe wartet der Versand.
 */
export const CURRENT_VERSION_ONLY: readonly NoticePurpose[] = ["review_request"];

const versionNo = (v: string) => Number(/^v(\d+)$/.exec(v)?.[1] ?? 0);

/** Textversion eines Zwecks (z. B. „v4“). */
export function templateVersionFor(purpose: NoticePurpose): string {
  return PURPOSE_VERSION[purpose] ?? TEMPLATE_VERSION;
}

/** Fassung einer Vorlage. Kampagnen und Empfehlungen gibt es nur gesiezt. */
export type TemplateForm = "du" | "sie" | "sie_ohne_name";

/** A/B-Fassung (b nur für Zwecke mit TEMPLATE_BODY_B). */
export type TemplateVariant = "a" | "b";

/** Weitere Parameter je Zweck (nach dem Namen; Reihenfolge wie im Text). */
export const REST_PARAMS: Record<NoticePurpose, string[]> = {
  outreach: [],
  outreach_tkv: ["Produkt"],
  outreach_zahn: ["Produkt"],
  outreach_pkv: ["Produkt"],
  outreach_privatschutz: ["Produkt"],
  booking_confirmation: ["Datum/Uhrzeit", "Art", "Link/Hinweis"],
  reminder: ["Datum/Uhrzeit", "Art", "Link/Hinweis"],
  reminder_soon: ["Uhrzeit", "Art", "Link/Hinweis"],
  reschedule: ["Datum/Uhrzeit", "Art", "Link/Hinweis"],
  followup: ["Terminvorschlag 1", "Terminvorschlag 2"],
  followup_nudge: [],
  followup_offer: ["Thema (z. B. Hausrat, Haftpflicht)"],
  followup_noshow: [],
  followup_last: [],
  campaign_cross_sell: ["Thema (z. B. Hausrat)"],
  campaign_review: [],
  campaign_birthday: [],
  campaign_renewal: ["Vertrag (z. B. KFZ)"],
  review_request: ["Google-Link"],
  referral_request: ["Thema der Empfehlung", "Empfehlungslink"],
  referral_thanks: [],
  referral_update: ["Stand der Empfehlung"],
};

/** Bezeichnung des Namensplatzhalters je Fassung. */
export const NAME_PARAM: Record<"du" | "sie", string> = { du: "Vorname", sie: "Anrede und Nachname" };

// KI-Hinweis im Erstanschreiben (KI-VO Art. 50): kurz, aber eindeutig („digitaler KI-Assistent“, „kein Mensch“).
const KI_KURZ = { du: "Ich bin der digitale KI-Assistent von [Berater], kein Mensch, und stelle dir zwei kurze Fragen, damit du ein passendes Angebot bekommst.", sie: "Ich bin der digitale KI-Assistent von [Berater], kein Mensch, und stelle Ihnen zwei kurze Fragen, damit Sie ein passendes Angebot bekommen." };

/**
 * Text NACH der Anrede-Zeile. {{2}}, {{3}} … = REST_PARAMS. [Firma] = Kundenname („Buchung bei …“),
 * [Berater] = Person („hier ist …“, „Herzliche Grüße, …“), [Rolle] = Status laut Erstinformation
 * (z. B. „ von der Allianz“ oder „, Ihr Versicherungsmakler“, rolleText). Ohne „du“: nur gesiezt.
 */
export const TEMPLATE_BODY: Record<NoticePurpose, { du?: string; sie: string }> = {
  // Erste Nachricht an neue Leads: Dank, kurzer KI-Hinweis, sofort die erste leichte Frage (Knöpfe). Die
  // Erstinformation (§ 15/16 VersVermV) steht als PDF im Kopf der Vorlage (TEMPLATE_HEADER), nicht als Link.
  outreach: {
    du: "danke für deine Anfrage! Ich bin der digitale KI-Assistent von [Berater], kein Mensch, und helfe dir, schnell einen passenden Gesprächstermin zu finden. Wann erreicht [Berater] dich am besten für ein kurzes Telefonat?",
    sie: "vielen Dank für Ihre Anfrage! Ich bin der digitale KI-Assistent von [Berater], kein Mensch, und helfe Ihnen, schnell einen passenden Gesprächstermin zu finden. Wann erreicht [Berater] Sie am besten für ein kurzes Telefonat?",
  },
  outreach_tkv: {
    du: `danke für deine Anfrage zur {{2}}! ${KI_KURZ.du} Für welches Tier suchst du den Schutz?`,
    sie: `vielen Dank für Ihre Anfrage zur {{2}}! ${KI_KURZ.sie} Für welches Tier suchen Sie den Schutz?`,
  },
  outreach_zahn: {
    du: `danke für deine Anfrage zur {{2}}! ${KI_KURZ.du} Was ist dir am wichtigsten?`,
    sie: `vielen Dank für Ihre Anfrage zur {{2}}! ${KI_KURZ.sie} Was ist Ihnen am wichtigsten?`,
  },
  outreach_pkv: {
    du: `danke für deine Anfrage zur {{2}}! ${KI_KURZ.du} Wie bist du aktuell beruflich aufgestellt?`,
    sie: `vielen Dank für Ihre Anfrage zur {{2}}! ${KI_KURZ.sie} Wie sind Sie aktuell beruflich aufgestellt?`,
  },
  outreach_privatschutz: {
    du: `danke für deine Anfrage zum Thema {{2}}! ${KI_KURZ.du} Worum geht es dir vor allem?`,
    sie: `vielen Dank für Ihre Anfrage zum Thema {{2}}! ${KI_KURZ.sie} Worum geht es Ihnen vor allem?`,
  },
  // Service (UTILITY): Bestätigung mit Vorbereitungshinweis und Knopf zum Verschieben
  booking_confirmation: {
    du: "dein Termin bei [Firma] ist bestätigt: {{2}} ({{3}}). {{4}} Zur Vorbereitung: Leg dir gern deine bisherigen Unterlagen zum Thema bereit, falls vorhanden.",
    sie: "Ihr Termin bei [Firma] ist bestätigt: {{2}} ({{3}}). {{4}} Zur Vorbereitung: Legen Sie sich gern Ihre bisherigen Unterlagen zum Thema bereit, falls vorhanden.",
  },
  reminder: {
    du: "kurze Erinnerung an deinen Termin bei [Firma]: {{2}} ({{3}}). {{4}} Passt der Termin für dich?",
    sie: "kurze Erinnerung an Ihren Termin bei [Firma]: {{2}} ({{3}}). {{4}} Passt der Termin für Sie?",
  },
  // Kurz vor dem Termin (Ole, 15.11.2026): passt alles? Lieber verschieben als nicht erscheinen
  reminder_soon: {
    du: "gleich ist es so weit: Dein Termin bei [Firma] ist um {{2}} ({{3}}). {{4}} Passt bei dir alles?",
    sie: "gleich ist es so weit: Ihr Termin bei [Firma] ist um {{2}} ({{3}}). {{4}} Passt bei Ihnen alles?",
  },
  reschedule: {
    du: "dein Termin bei [Firma] musste leider verschoben werden. Die neue Zeit ist {{2}} ({{3}}). {{4}} Passt dir die neue Zeit?",
    sie: "Ihr Termin bei [Firma] musste leider verschoben werden. Die neue Zeit ist {{2}} ({{3}}). {{4}} Passt Ihnen die neue Zeit?",
  },
  // Zwei konkrete freie Zeiten aus dem Kalender (lib/whatsapp/termin-vorschlaege.ts); ohne Kalender followup_nudge
  followup: {
    du: "hier ist nochmal der digitale KI-Assistent von [Firma]. Für ein kurzes Gespräch mit [Berater] hätte ich zwei Zeiten frei: {{2}} oder {{3}}. Passt eine davon?",
    sie: "hier ist nochmal der digitale KI-Assistent von [Firma]. Für ein kurzes Gespräch mit [Berater] hätte ich zwei Zeiten frei: {{2}} oder {{3}}. Passt eine davon?",
  },
  followup_nudge: {
    du: "hier ist nochmal der digitale KI-Assistent von [Firma]. Sollen wir mit deiner Anfrage weitermachen? Es dauert nur ein paar Minuten.",
    sie: "hier ist nochmal der digitale KI-Assistent von [Firma]. Sollen wir mit Ihrer Anfrage weitermachen? Es dauert nur ein paar Minuten.",
  },
  followup_offer: {
    du: "hier ist der digitale KI-Assistent von [Firma]. Konntest du dir das Angebot zu {{2}} schon anschauen? Ist für dich eher der Beitrag oder die Leistung entscheidend?",
    sie: "hier ist der digitale KI-Assistent von [Firma]. Konnten Sie sich das Angebot zu {{2}} schon anschauen? Ist für Sie eher der Beitrag oder die Leistung entscheidend?",
  },
  followup_noshow: {
    du: "kein Problem, so etwas passiert. Hier ist der digitale KI-Assistent von [Firma]. Sollen wir einen neuen Termin mit [Berater] finden?",
    sie: "kein Problem, so etwas passiert. Hier ist der digitale KI-Assistent von [Firma]. Sollen wir einen neuen Termin mit [Berater] finden?",
  },
  followup_last: {
    du: "hier ist nochmal der digitale KI-Assistent von [Firma]. Ich melde mich ein letztes Mal: Ist das Thema für dich noch aktuell? Wenn nicht, ist das völlig in Ordnung, dann melden wir uns nicht weiter.",
    sie: "hier ist nochmal der digitale KI-Assistent von [Firma]. Ich melde mich ein letztes Mal: Ist das Thema für Sie noch aktuell? Wenn nicht, ist das völlig in Ordnung, dann melden wir uns nicht weiter.",
  },
  // Cross-Selling mit Grund und konkretem, kleinem nächsten Schritt (Ole, 15.11.2026)
  campaign_cross_sell: {
    sie: "hier ist [Berater][Rolle]. Viele meiner Kunden haben beim Thema {{2}} eine Lücke, die erst im Schadenfall auffällt. Soll ich in 10 Minuten kurz prüfen, ob das bei Ihnen auch so ist?",
  },
  campaign_review: {
    sie: "hier ist [Berater][Rolle]. Es ist Zeit für Ihren kurzen Jahres-Check: Passt Ihr Schutz noch zu Ihrer aktuellen Situation? Soll ich mir das in 10 Minuten mit Ihnen anschauen?",
  },
  campaign_birthday: {
    sie: "herzlichen Glückwunsch zum Geburtstag! Alles Gute für das neue Lebensjahr wünscht Ihnen [Berater].",
  },
  campaign_renewal: {
    sie: "hier ist [Berater][Rolle]. Bei Ihrem Vertrag ({{2}}) steht bald ein guter Zeitpunkt an, um Beitrag und Leistung zu prüfen. Soll ich mir das kurz für Sie anschauen?",
  },
  // Alle bekommen dieselbe Nachricht: erst der direkte Draht, dann die neutrale Bitte um eine ehrliche Bewertung
  // (kein Gating, nie „5 Sterne“). Abmelden über den Knopf „Keine Nachrichten mehr“. Version: PURPOSE_VERSION.
  review_request: {
    sie: "ich hoffe, Sie sind mit Ihrem neuen Vertrag gut versorgt. Wenn etwas nicht passt, antworten Sie mir einfach direkt hier, ich kümmere mich persönlich darum. Außerdem freue ich mich über Ihre ehrliche Bewertung bei Google: {{2}} Herzliche Grüße, [Berater]",
  },
  // Konkret mit Thema (Ole, 15.11.2026); geht direkt nach einem guten Moment raus (Lob, Gespräch, Abschluss)
  referral_request: {
    sie: "hier ist [Berater]. Kennen Sie jemanden, für den das Thema {{2}} gerade auch wichtig ist? Über Ihren persönlichen Link kann die Person ganz einfach selbst Kontakt mit mir aufnehmen: {{3}} Vielen Dank für Ihr Vertrauen!",
  },
  referral_thanks: {
    sie: "ich wollte mich noch einmal herzlich für Ihre Empfehlung bedanken. Ich konnte weiterhelfen. Das ist das schönste Lob für meine Arbeit! Herzliche Grüße, [Berater]",
  },
  // Nur mit Einwilligung der empfohlenen Person (Empfehlungsseite). {{2}} = ein Satz zum Stand.
  referral_update: {
    sie: "kurze Rückmeldung zu Ihrer Empfehlung: {{2}} Vielen Dank, dass Sie an mich gedacht haben! Herzliche Grüße, [Berater]",
  },
};

/**
 * Zweite Fassung für A/B-Tests (gleiche Platzhalter und Knöpfe wie Fassung a). Je Lead fest zugeteilt; nach genug
 * Volumen wird die bessere Standard (lib/whatsapp/ab-test.ts).
 */
export const TEMPLATE_BODY_B: Partial<Record<NoticePurpose, { du?: string; sie: string }>> = {
  outreach_tkv: {
    du: "danke für deine Anfrage zur {{2}}! Damit [Berater] dir ein passendes Angebot machen kann, stelle ich dir als digitaler KI-Assistent, kein Mensch, zwei kurze Fragen. Erste Frage: Für welches Tier suchst du den Schutz?",
    sie: "vielen Dank für Ihre Anfrage zur {{2}}! Damit [Berater] Ihnen ein passendes Angebot machen kann, stelle ich Ihnen als digitaler KI-Assistent, kein Mensch, zwei kurze Fragen. Erste Frage: Für welches Tier suchen Sie den Schutz?",
  },
  followup_last: {
    du: "hier ist nochmal der digitale KI-Assistent von [Firma]. Ich möchte dich nicht weiter stören: Soll [Berater] sich noch um deine Anfrage kümmern?",
    sie: "hier ist nochmal der digitale KI-Assistent von [Firma]. Ich möchte Sie nicht weiter stören: Soll [Berater] sich noch um Ihre Anfrage kümmern?",
  },
  campaign_cross_sell: {
    sie: "hier ist [Berater][Rolle]. Beim Thema {{2}} sehe ich oft Lücken, die erst im Schadenfall auffallen. Darf ich in 10 Minuten kurz mit Ihnen prüfen, ob bei Ihnen alles passt?",
  },
};

const ALL_PURPOSES = Object.keys(TEMPLATE_BODY) as NoticePurpose[];

/** Fassungen a/b eines Zwecks (b nur mit TEMPLATE_BODY_B). */
export function variantsFor(purpose: NoticePurpose): TemplateVariant[] {
  return TEMPLATE_BODY_B[purpose] ? ["a", "b"] : ["a"];
}

/** A/B-Fassung am Vorlagennamen: pg_outreach_tkv_v4_b_sie → „b“. */
export function variantOfName(name: string): TemplateVariant {
  return /_v\d+_b(?:_|$)/.test(name) ? "b" : "a";
}

/** Gibt es eine Du-Fassung? (Assistent, Termine, Nachfassen; Kampagnen und Empfehlungen siezen immer) */
export function hasDuVariant(purpose: NoticePurpose): boolean {
  return !!TEMPLATE_BODY[purpose].du;
}

/** Gibt es für diesen Zweck getrennte Du- und Sie-Fassungen? */
export function hasSieVariant(purpose: NoticePurpose): boolean {
  return hasDuVariant(purpose);
}

/** Ansprache, die für diesen Zweck tatsächlich gilt (Kampagnen/Empfehlungen: immer Sie). */
export function effectiveAnsprache(purpose: NoticePurpose, an: Ansprache): Ansprache {
  return an === "du" && hasDuVariant(purpose) ? "du" : "sie";
}

/** Alle Fassungen, die je Zweck bei Meta eingereicht werden. */
export function formsFor(purpose: NoticePurpose): TemplateForm[] {
  return hasDuVariant(purpose) ? ["du", "sie", "sie_ohne_name"] : ["sie", "sie_ohne_name"];
}

/** {{n}} → {{n+by}} */
function shiftVars(text: string, by: number): string {
  return text.replace(/\{\{(\d+)\}\}/g, (_, n: string) => `{{${Number(n) + by}}}`);
}

function bodyOf(purpose: NoticePurpose, variant: TemplateVariant): { du?: string; sie: string } {
  return (variant === "b" && TEMPLATE_BODY_B[purpose]) || TEMPLATE_BODY[purpose];
}

/**
 * Vorlagentext einer Fassung (mit [Firma]/[Berater]/[Rolle]). Statt einer Fassung geht auch die Ansprache:
 * „du“ → Du-Fassung (bzw. Sie, wenn es keine gibt), „sie“ → Sie-Fassung mit Namen.
 */
export function templateTextFor(purpose: NoticePurpose, form: TemplateForm | Ansprache = "du", variant: TemplateVariant = "a"): string {
  const b = bodyOf(purpose, variant);
  if (form === "du" && b.du) return `Hallo {{1}}, ${b.du}`;
  if (form === "sie_ohne_name") return `Guten Tag, ${shiftVars(b.sie, -1)}`;
  return `Guten Tag {{1}}, ${b.sie}`;
}

/** Platzhalter-Bezeichnungen einer Fassung (Reihenfolge {{1}}, {{2}} …). */
export function paramLabelsFor(purpose: NoticePurpose, form: TemplateForm | Ansprache = "du"): string[] {
  const rest = REST_PARAMS[purpose];
  if (form === "sie_ohne_name") return [...rest];
  return [NAME_PARAM[form === "du" && hasDuVariant(purpose) ? "du" : "sie"], ...rest];
}

/** Standardtexte (Du-Fassung, sonst Sie-Fassung) – z. B. als Vorschlag beim Anlegen von Hand. */
export const SUGGESTED_TEMPLATE_TEXT = Object.fromEntries(ALL_PURPOSES.map((p) => [p, templateTextFor(p, "du")])) as Record<NoticePurpose, string>;

/** Platzhalter der Standardtexte. */
export const PURPOSE_PARAMS = Object.fromEntries(ALL_PURPOSES.map((p) => [p, paramLabelsFor(p, "du")])) as Record<NoticePurpose, string[]>;

/** Sie-Fassungen (mit Namen) der Zwecke, die auch eine Du-Fassung haben. */
export const SIE_TEMPLATE_TEXT: Partial<Record<NoticePurpose, string>> = Object.fromEntries(
  ALL_PURPOSES.filter(hasDuVariant).map((p) => [p, templateTextFor(p, "sie")]),
);

/** Ist dieser (automatisch eingereichte) Vorlagenname eine Sie-Fassung? pg_outreach_v1_sie, …_sie_ohne_name_r2 */
export function isSieTemplateName(name: string): boolean {
  return /_sie(_ohne_name)?(_r\d+)?$/.test(name);
}

/** [Firma], [Berater] und [Rolle] einsetzen. Ein einzelner Name gilt für Firma und Berater. */
export type TemplateNames = { firm: string; advisor: string; role?: string };
/** Ohne bekannten Status: neutral und immer zutreffend. */
export const ROLLE_STANDARD = ", Ihr Versicherungsvermittler";
export function fillNames(text: string, names: TemplateNames | string): string {
  const n = typeof names === "string" ? { firm: names, advisor: names } : names;
  return text
    .split("[Firma]")
    .join(n.firm)
    .split("[Berater]")
    .join(n.advisor)
    .split("[Rolle]")
    .join((n as TemplateNames).role ?? ROLLE_STANDARD);
}

/**
 * Selbstbezeichnung nach Status laut Erstinformation (Ole, 15.11.2026). „Versicherungsberater“ ist ein eigener,
 * geschützter Beruf (§ 34d Abs. 2 GewO) und passt auf keinen unserer Status. Ausschließlichkeitsvertreter: Name und
 * Gesellschaft („Anid Brand von der Allianz“), Mehrfachvertreter „Ihr Versicherungsvertreter“, Makler
 * „Ihr Versicherungsmakler“. Ergebnis wird direkt hinter den Namen gesetzt.
 */
export function rolleText(status: string | null | undefined, versicherer: readonly string[] = []): string {
  if (status === "makler") return ", Ihr Versicherungsmakler";
  if (status === "mehrfachvertreter") return ", Ihr Versicherungsvertreter";
  if (status === "vertreter") {
    const v = (versicherer[0] ?? "").trim();
    if (!v) return ", Ihr Versicherungsvertreter";
    if (/^(der|die|das|den|dem)\s/i.test(v)) return ` von ${v.replace(/^die\s/i, "der ")}`;
    return /verein\b/i.test(v) ? ` vom ${v}` : ` von der ${v}`;
  }
  return ROLLE_STANDARD;
}

/**
 * Welcher Wert gehört in {{1}}? Erkannt am Text, damit es auch für ältere und von Hand angelegte
 * Vorlagen stimmt: „Guten Tag {{1}}“ → Anrede und Nachname, „Guten Tag,“ ohne {{1}} am Anfang →
 * kein Namensplatzhalter, sonst (z. B. „Hallo {{1}}“) → Vorname.
 */
export type NameSlot = "vorname" | "anrede" | "ohne";
export function nameSlotOf(body: string): NameSlot {
  const t = body.trim();
  if (/^Guten Tag \{\{1\}\}/.test(t)) return "anrede";
  if (/^Guten Tag\s*[,!.]/.test(t)) return "ohne";
  return "vorname";
}

/**
 * Parameter für eine Vorlage: rest = Werte nach dem Namen (REST_PARAMS). null, wenn die Vorlage
 * einen Nachnamen braucht, der fehlt.
 */
export function templateParams(body: string, an: Ansprache, kontakt: AnredeKontakt | null | undefined, rest: string[]): string[] | null {
  const slot = nameSlotOf(body);
  if (slot === "ohne") return [...rest];
  if (slot === "anrede") {
    const name = anredeName("sie", kontakt);
    return name ? [name, ...rest] : null;
  }
  const first = kontaktParts(kontakt).first;
  return [first || (an === "du" ? "du" : "zusammen"), ...rest];
}

type Candidate = { name: string; body: string; auto?: boolean | null; headerFormat?: string | null };

/** Ist der Vorlagenname die aktuelle automatisch eingereichte Fassung dieses Zwecks? */
export function isCurrentTemplateName(name: string, purpose: NoticePurpose): boolean {
  return new RegExp(`^pg_${purpose}_${templateVersionFor(purpose)}(?:_|$)`).test(name);
}

/**
 * Beste freigegebene Vorlage für Ansprache und Kontakt (rein, testbar). Liste: neueste zuerst.
 * Reihenfolge Sie: aktuelle Sie-Fassung mit Namen (nur mit Nachnamen) → Sie ohne Namen → ältere
 * Sie-Fassung → irgendeine. Du: aktuelle Du-Fassung → ältere Du-Fassung → irgendeine.
 * So bleibt bis zur Freigabe der neuen Fassung die bisherige freigegebene im Einsatz.
 * opts.variant: bevorzugte A/B-Fassung (die andere aktuelle Fassung kommt danach, vor älteren).
 * opts.documentHeader: false = Vorlagen mit PDF im Kopf ausschließen (kein PDF verfügbar).
 */
export function rankTemplates<T extends Candidate>(
  list: T[],
  purpose: NoticePurpose,
  ansprache: Ansprache,
  kontakt: AnredeKontakt | null | undefined,
  opts: { variant?: TemplateVariant; documentHeader?: boolean } = {},
): { tpl: T; current: boolean; variant: TemplateVariant; params: (rest: string[]) => string[] } | null {
  const an = effectiveAnsprache(purpose, ansprache);
  const hasName = !!anredeName("sie", kontakt);
  // Unter älteren Fassungen die neueste bevorzugen (v2 vor v1)
  const older = (n: string) => 0.5 - Math.min(Number(/^pg_[a-z_]+?_v(\d+)(?:_|$)/.exec(n)?.[1] ?? 0), 99) / 1000;
  const strict = CURRENT_VERSION_ONLY.includes(purpose);
  const olderAuto = (n: string) => new RegExp(`^pg_${purpose}_v\\d+`).test(n) && !isCurrentTemplateName(n, purpose);
  const wanted = opts.variant ?? "a";
  const score = (t: T): number | null => {
    if (strict && olderAuto(t.name)) return null; // alter Text darf nicht mehr raus
    if (opts.documentHeader === false && t.headerFormat === "DOCUMENT") return null;
    const slot = nameSlotOf(t.body);
    if (slot === "anrede" && !hasName) return null; // bräuchte einen Nachnamen
    const sieWording = slot !== "vorname" || isSieTemplateName(t.name) || !hasDuVariant(purpose);
    const cur = isCurrentTemplateName(t.name, purpose) ? (variantOfName(t.name) === wanted ? 0 : 0.25) : older(t.name);
    if (an === "du") {
      if (slot === "vorname" && !sieWording) return 0 + cur;
      if (slot !== "vorname") return 2 + cur;
      return 3 + cur;
    }
    if (slot === "anrede") return 0 + cur;
    if (slot === "ohne") return 1 + cur;
    if (sieWording) return 2 + cur;
    return 3 + cur;
  };
  let best: { tpl: T; s: number } | null = null;
  for (const t of list) {
    const s = score(t);
    if (s !== null && (!best || s < best.s)) best = { tpl: t, s };
  }
  if (!best) return null;
  const tpl = best.tpl;
  const current = isCurrentTemplateName(tpl.name, purpose);
  return { tpl, current, variant: current ? variantOfName(tpl.name) : "a", params: (rest) => templateParams(tpl.body, an, kontakt, rest) ?? [...rest] };
}

/**
 * Schnellantwort-Knopf für Direktwerbung (Kampagnen an Bestandskunden): Hinweis auf das
 * Widerspruchsrecht (Art. 21 Abs. 4 DSGVO). Ein Klick kommt als Antwort mit diesem Text
 * zurück und wird wie „STOPP“ behandelt (lib/bestand/campaigns.ts → handleCampaignReply).
 */
export const OPT_OUT_BUTTON = "Keine Nachrichten mehr";

/** Knopftexte (Antworten verarbeitet lib/whatsapp/knopf.ts). Meta: höchstens 25 Zeichen, interaktiv 20. */
export const KNOPF = {
  passt: "Ja, passt",
  verschieben: "Bitte verschieben",
  terminVerschieben: "Termin verschieben",
  neuerTermin: "Ja, neuer Termin",
  keinBedarfMehr: "Kein Bedarf mehr",
  nochAktuell: "Ja, noch aktuell",
  neinDanke: "Nein, danke",
  ersteZeit: "Erste Zeit passt",
  zweiteZeit: "Zweite Zeit passt",
  andereZeit: "Andere Zeit",
  weiter: "Ja, weitermachen",
  beitrag: "Eher der Beitrag",
  leistung: "Eher die Leistung",
  gernPruefen: "Ja, gern prüfen",
  keinBedarf: "Kein Bedarf",
  gern: "Ja, gern",
} as const;

/**
 * Schnellantwort-Knöpfe je Zweck (statisch in der Vorlage; beim Senden optional mit eigenem Payload, z. B. der
 * Startzeit eines Terminvorschlags). Werbung trägt immer den Abmeldeknopf.
 */
export const TEMPLATE_BUTTONS: Partial<Record<NoticePurpose, string[]>> = {
  outreach: ["Heute", "Morgen", "Lieber schriftlich"],
  outreach_tkv: ["Hund", "Katze"],
  outreach_zahn: ["Zahnersatz", "Prophylaxe", "Beides"],
  outreach_pkv: ["Angestellt", "Selbstständig", "Beamter"],
  outreach_privatschutz: ["Haftpflicht", "Hausrat", "Mehreres"],
  booking_confirmation: [KNOPF.terminVerschieben],
  reminder: [KNOPF.passt, KNOPF.verschieben],
  reminder_soon: [KNOPF.passt, KNOPF.verschieben],
  reschedule: [KNOPF.passt, KNOPF.verschieben],
  followup: [KNOPF.ersteZeit, KNOPF.zweiteZeit, KNOPF.andereZeit],
  followup_nudge: [KNOPF.weiter, KNOPF.keinBedarfMehr],
  followup_offer: [KNOPF.beitrag, KNOPF.leistung, KNOPF.keinBedarfMehr],
  followup_noshow: [KNOPF.neuerTermin, KNOPF.keinBedarfMehr],
  followup_last: [KNOPF.nochAktuell, KNOPF.neinDanke],
  campaign_cross_sell: [KNOPF.gernPruefen, KNOPF.keinBedarf, OPT_OUT_BUTTON],
  campaign_review: [KNOPF.gern, KNOPF.keinBedarf, OPT_OUT_BUTTON],
  campaign_birthday: [OPT_OUT_BUTTON],
  campaign_renewal: [KNOPF.gernPruefen, KNOPF.keinBedarf, OPT_OUT_BUTTON],
  referral_request: [OPT_OUT_BUTTON],
  review_request: [OPT_OUT_BUTTON],
};

/**
 * Kopf der Vorlage: Erstinformation als PDF (§ 16 VersVermV, dauerhafter Datenträger) im Erstanschreiben.
 * Beim Einreichen mit Beispiel-PDF, beim Senden mit dem PDF-Link des Kunden (lib/whatsapp/template-plan.ts).
 */
export const TEMPLATE_HEADER: Partial<Record<NoticePurpose, "DOCUMENT">> = Object.fromEntries(OUTREACH_PURPOSES.map((p) => [p, "DOCUMENT"]));

/** Fußzeile unter Vorlagen mit PDF im Kopf (Meta: höchstens 60 Zeichen, ohne Platzhalter). */
export const ERSTINFO_FOOTER = "Oben: Erstinformation nach § 15 VersVermV (PDF)";

/** Markierung im gespeicherten Text, wenn das PDF der Erstinformation im Kopf der Vorlage mitging (ki-hinweis.ts). */
export const ERSTINFO_HEADER_MARK = ERSTINFO_KOPF;

export class NoTemplateError extends Error {
  constructor(purpose: string) {
    super(`Keine freigegebene WhatsApp-Vorlage für „${purpose}".`);
  }
}

/** Freigegebene Vorlage für Kunde, Zweck und Kontakt samt Parametern (siehe rankTemplates). */
export async function pickTemplate(
  customerId: string,
  purpose: NoticePurpose,
  kontakt?: AnredeKontakt | null,
  opts: { variant?: TemplateVariant; documentHeader?: boolean } = {},
) {
  const [customer, approved] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId }, select: { leadAddress: true } }),
    prisma.messageTemplate.findMany({ where: { customerId, purpose, status: "approved" }, orderBy: { updatedAt: "desc" } }),
  ]);
  return rankTemplates(approved, purpose, asAnsprache(customer?.leadAddress), kontakt ?? null, opts);
}

/**
 * Freigegebene Vorlage für den Versand: passend zur Ansprache des Kunden und zum Kontakt (mit
 * Nachnamen „Guten Tag Frau Schneider“, sonst „Guten Tag“). Der Erstkontakt wird nie blockiert,
 * solange irgendeine freigegeben ist.
 */
export async function pickApprovedTemplate(customerId: string, purpose: NoticePurpose, kontakt?: AnredeKontakt | null) {
  return (await pickTemplate(customerId, purpose, kontakt))?.tpl ?? null;
}

/** Anzahl verschiedener Platzhalter {{n}} in einem Vorlagentext. */
export function placeholderCount(body: string): number {
  return new Set([...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1])).size;
}

/** {{1}}, {{2}} … durch Parameter ersetzen. */
export function renderTemplate(body: string, params: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_, n: string) => params[Number(n) - 1] ?? "");
}

/**
 * Freitext für das offene 24-h-Fenster: Anrede-Zeile nach Regel plus Text der aktuellen Fassung.
 * rest = Werte nach dem Namen (REST_PARAMS).
 */
export function noticeText(
  purpose: NoticePurpose,
  an: Ansprache,
  names: TemplateNames | string,
  kontakt: AnredeKontakt | null | undefined,
  rest: string[],
  variant: TemplateVariant = "a",
): string {
  const eff = effectiveAnsprache(purpose, an);
  const b = bodyOf(purpose, variant);
  const body = fillNames(eff === "du" && b.du ? b.du : b.sie, names);
  return `${anredeZeile(eff, kontakt)} ${renderTemplate(body, ["", ...rest])}`;
}

/** Vorname aus „Vorname Nachname" (Fallback neutral). */
export function firstNameOf(name: string | null | undefined): string {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first || "du";
}

/** Knöpfe, die als interaktive Nachricht im offenen Fenster gehen (WhatsApp: höchstens 3, je 20 Zeichen). */
export function interactiveButtons(buttons: readonly string[] | undefined): string[] | null {
  const list = buttons ?? [];
  if (!list.length || list.length > 3 || list.some((b) => b.length > 20)) return null;
  return [...list];
}

/** Komponenten für den Versand einer Vorlage: Kopf (PDF), Text-Parameter, Knopf-Payloads (rein, testbar). */
export function templateComponents(opts: {
  params: string[];
  document?: { link: string; filename: string } | null;
  buttonPayloads?: string[] | null;
  buttonCount?: number;
}): unknown[] | undefined {
  const components: unknown[] = [];
  if (opts.document) components.push({ type: "header", parameters: [{ type: "document", document: { link: opts.document.link, filename: opts.document.filename } }] });
  // Meta lehnt leere Parameter ab
  if (opts.params.length) components.push({ type: "body", parameters: opts.params.map((p) => ({ type: "text", text: p.trim() || "-" })) });
  const payloads = opts.buttonPayloads ?? [];
  if (payloads.length && payloads.length <= (opts.buttonCount ?? 0)) {
    payloads.forEach((payload, i) => components.push({ type: "button", sub_type: "quick_reply", index: String(i), parameters: [{ type: "payload", payload }] }));
  }
  return components.length ? components : undefined;
}

/**
 * System-Nachricht senden und als Outbound-Message persistieren (damit Inbox
 * und Bot-Verlauf sie sehen). Verknüpft die Konversation optional mit dem Lead.
 */
export async function sendWhatsAppNotice(opts: {
  customerId: string;
  to: string;
  purpose: NoticePurpose;
  /**
   * Parameter wie in PURPOSE_PARAMS: [Vorname, …weitere]. Der Namensplatzhalter wird je nach
   * gewählter Vorlage ersetzt (Vorname, „Frau Schneider“ oder entfällt), siehe rankTemplates.
   */
  params: string[];
  /** Parameter für ältere freigegebene Fassungen, deren Platzhalter anders belegt sind (z. B. v3 mit Link). */
  legacyParams?: string[];
  /** Freitext für das offene 24h-Fenster (und Fallback-Inhalt der Inbox). */
  text: string;
  leadId?: string | null;
  contactName?: string | null;
  /** Name und Anrede des Kontakts (sonst nur contactName, Anrede unbekannt). */
  anrede?: AnredeKontakt | null;
  /** PDF für Vorlagen mit Dokument im Kopf (Erstinformation). Ohne: solche Vorlagen werden übersprungen. */
  document?: { link: string; filename: string } | null;
  /** Payloads der Schnellantwort-Knöpfe (z. B. „slot:2026-11-17T09:00:00.000Z“), nur für die aktuelle Fassung. */
  buttonPayloads?: string[];
  /** Knöpfe im offenen Fenster (Standard: TEMPLATE_BUTTONS des Zwecks, wenn sie interaktiv passen); [] = keine. */
  textButtons?: string[];
  /** A/B-Fassung (Standard: fest je Lead bzw. Nummer zugeteilt, siehe lib/whatsapp/ab-test.ts). */
  variant?: TemplateVariant;
}): Promise<{ mode: "text" | "template"; conversationId: string; messageId?: string | null; variant: TemplateVariant | null; documentHeader: boolean }> {
  const account = await prisma.whatsAppAccount.findUnique({
    where: { customerId: opts.customerId },
  });
  if (!account || account.status !== "connected" || !account.apiKeyEnc) {
    throw new Error("Kein verbundenes WhatsApp-Konto für diesen Kunden.");
  }

  const existing = await prisma.conversation.findUnique({
    where: {
      customerId_contactPhone: {
        customerId: opts.customerId,
        contactPhone: opts.to,
      },
    },
    select: { id: true, windowExpiresAt: true, optedOutAt: true, leadId: true },
  });
  // „STOPP“: keine Nachrichten mehr an diese Nummer (lib/whatsapp/stopp.ts)
  if (existing?.optedOutAt) throw new WhatsAppOptOutError();
  // Häkchen zur Einwilligung im Leadformular fehlt: kein WhatsApp, außer der Lead hat selbst per WhatsApp geschrieben
  const leadId = opts.leadId ?? existing?.leadId ?? null;
  if (leadId) {
    const l = await prisma.lead.findUnique({ where: { id: leadId }, select: { waConsent: true } });
    if (l?.waConsent === "nein") {
      const wrote = existing ? await prisma.message.count({ where: { conversationId: existing.id, direction: "inbound" } }) : 0;
      if (!wrote) throw new WhatsAppNoConsentError();
    }
  }
  const windowOpen =
    !!existing?.windowExpiresAt && existing.windowExpiresAt.getTime() > Date.now();

  const apiKey = decryptSecret(account.apiKeyEnc);
  let mode: "text" | "template";
  let body: string;
  let messageId: string | null;
  let pricingCategory: string | null = null;
  let variant: TemplateVariant | null = null;
  let documentHeader = false;

  if (windowOpen) {
    mode = "text";
    body = opts.text;
    const buttons = interactiveButtons(opts.textButtons ?? TEMPLATE_BUTTONS[opts.purpose]);
    if (buttons) {
      // Interaktive Knöpfe; die ID trägt den Payload (z. B. Terminvorschlag), sonst den Knopftext
      const ids = buttons.map((b, i) => opts.buttonPayloads?.[i] ?? b);
      messageId = (await sendButtons(apiKey, opts.to, opts.text, buttons.map((title, i) => ({ id: ids[i], title })))).messageId;
    } else {
      messageId = (await sendText(apiKey, opts.to, opts.text)).messageId;
    }
  } else {
    const kontakt: AnredeKontakt = opts.anrede ?? { fullName: opts.contactName ?? null };
    // A/B-Fassung: fest je Lead bzw. Nummer, nach Entscheidung der Gewinner (lib/whatsapp/ab-test.ts)
    const wanted = opts.variant ?? (await (await import("@/lib/whatsapp/ab-test")).abVariantFor(opts.purpose, leadId ?? opts.to));
    const pick = await pickTemplate(opts.customerId, opts.purpose, kontakt, { variant: wanted, documentHeader: !!opts.document });
    if (!pick) throw new NoTemplateError(opts.purpose);
    const { tpl } = pick;
    // Ältere Fassung mit anderer Belegung: deren Parameter. Nur so viele Werte, wie die Vorlage Platzhalter hat.
    const base = !pick.current && opts.legacyParams ? opts.legacyParams : opts.params;
    const params = pick.params(base.slice(1)).slice(0, placeholderCount(tpl.body));
    const buttons = Array.isArray(tpl.buttons) ? (tpl.buttons as unknown[]).length : 0;
    const doc = tpl.headerFormat === "DOCUMENT" ? (opts.document ?? null) : null;
    mode = "template";
    pricingCategory = tpl.category.toLowerCase();
    variant = pick.variant;
    documentHeader = !!doc;
    body = `${doc ? `${ERSTINFO_HEADER_MARK}\n` : ""}${renderTemplate(tpl.body, params)}`;
    const components = templateComponents({ params, document: doc, buttonPayloads: pick.current ? opts.buttonPayloads : null, buttonCount: buttons });
    messageId = (await sendTemplate(apiKey, opts.to, tpl.name, tpl.language, components)).messageId;
  }

  const now = new Date();
  const conversation = await prisma.conversation.upsert({
    where: {
      customerId_contactPhone: {
        customerId: opts.customerId,
        contactPhone: opts.to,
      },
    },
    create: {
      customerId: opts.customerId,
      whatsAppAccountId: account.id,
      contactPhone: opts.to,
      contactName: opts.contactName ?? null,
      leadId: opts.leadId ?? null,
      status: "open",
      lastMessageAt: now,
    },
    update: {
      lastMessageAt: now,
      ...(opts.leadId ? { leadId: opts.leadId } : {}),
    },
    select: { id: true },
  });

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: "outbound",
      kind: mode === "template" ? "template" : "text",
      body,
      waMessageId: messageId,
      status: "sent",
      sentBy: "system",
      purpose: opts.purpose,
      // A/B-Messung nur über Vorlagen (Freitext ist der Text des Aufrufers, keine Fassung)
      variant,
      // Vorlagen kosten (vorläufig); der Status-Webhook liefert Metas endgültige Angabe.
      ...(pricingCategory ? { pricingCategory, billable: true } : {}),
    },
  });

  // messageId: für den Zustellstatus am Kampagnen-Empfänger (delivered/read aus dem Webhook)
  return { mode, conversationId: conversation.id, messageId, variant, documentHeader };
}
