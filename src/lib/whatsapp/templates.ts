// System-Nachrichten (Erstanschreiben, Buchungsbestätigung, Erinnerung).
// WhatsApp erlaubt Freitext nur im 24h-Service-Fenster (nach der letzten
// Nachricht des Kontakts). Außerhalb muss eine von Meta freigegebene Vorlage
// verwendet werden. sendWhatsAppNotice wählt automatisch:
//   Fenster offen → Freitext (Inhalt wie die Vorlage bzw. schon die vorgemerkte nächste Fassung, NAECHSTE_FASSUNG;
//                   keine Vorlagenkosten), mit Knöpfen als interaktive Nachricht
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
//
// Erstanschreiben v5 (Ole, 16.11.2026, conversion-optimiert, lib/whatsapp/erstanschreiben.ts): eine Begrüßung
// „Hallo {{1}},“ (Sie: {{1}} = „Herr Müller“, Du: Vorname; ohne Nachnamen „Hallo,“), Dank mit Produkt, ein Satz mit
// „digitaler KI-Assistent von [Kurzname]“ und Nutzen, die erste Frage als letzte Zeile (ab v7 nicht fett). Kein „Mensch“-Angebot,
// kein „berate nicht zu Tarifen“ (regelt der Assistent im Gespräch). PDF der Erstinformation weiter im Kopf.

import { decryptSecret } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";
import { anredeName, anredeZeile, asAnsprache, kontaktParts, type Ansprache, type AnredeKontakt } from "@/lib/ansprache";
import { sendButtons, sendTemplate, sendText } from "@/lib/whatsapp/dialog360";
import { WhatsAppNoConsentError, WhatsAppOptOutError, WhatsAppUnavailableError } from "@/lib/whatsapp/stopp";
import { ERSTINFO_KOPF } from "@/lib/whatsapp/ki-hinweis";
import { ERSTANSCHREIBEN_V7, ERSTANSCHREIBEN_V8 } from "@/lib/whatsapp/erstanschreiben";

export type NoticePurpose =
  | "outreach"
  | "outreach_tkv"
  | "outreach_zahn"
  | "outreach_pkv"
  | "outreach_privatschutz"
  | "booking_confirmation"
  | "reminder"
  | "reminder_soon"
  | "reminder_start"
  | "appt_waiting"
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
  reminder_start: "Termin in 15 Minuten: Link zum Videoraum",
  appt_waiting: "Vermittler wartet im Videoraum",
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
 * Erstanschreiben v5 (16.11.2026): PURPOSE_VERSION, neu aufgebaut nach lib/whatsapp/erstanschreiben.ts.
 */
export const TEMPLATE_VERSION = "v4";

/**
 * Feste Textversion je Zweck, wenn sich dieser Text mit der allgemeinen Version NICHT geändert hat (dann wird er
 * nicht neu eingereicht). Es gilt dieser Wert statt TEMPLATE_VERSION.
 *   review_request v3 (15.11.2026): neutrale Bitte um eine ehrliche Bewertung mit Abmeldeknopf.
 *   referral_thanks, referral_update v3: unverändert seit v3.
 */
export const PURPOSE_VERSION: Partial<Record<NoticePurpose, string>> = {
  review_request: "v3",
  referral_thanks: "v3",
  referral_update: "v3",
  // Erstanschreiben v7 (Ole, 17.11.2026, ERSTANSCHREIBEN_V7: erste Frage nicht fett): wird eingereicht, nur mit PDF-Kopf;
  // bis zur Freigabe sendet die App die neueste freigegebene mit PDF-Kopf (v6, rankOutreach)
  outreach: "v7",
  outreach_tkv: "v7",
  outreach_zahn: "v7",
  outreach_pkv: "v7",
  outreach_privatschutz: "v7",
  // Show-up-Paket (Ole, 17.11.2026): neue Zwecke, nur vorbereitet (VORBEREITETE_PURPOSES in template-plan.ts), nicht eingereicht
  reminder_start: "v5",
  appt_waiting: "v5",
};

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
  // Erstanschreiben ab v6 (alle Fassungen gleich aufgebaut): Thema, Vermittler im Dativ, erste Frage ohne „?“.
  // Ältere freigegebene Fassungen: v5 Produkt (TKV mit Tier), v4 Produkt, v3 Link (outreach.ts paramsFor)
  outreach: ["Thema", "Vermittler", "Erste Frage"],
  outreach_tkv: ["Thema", "Vermittler", "Erste Frage"],
  outreach_zahn: ["Thema", "Vermittler", "Erste Frage"],
  outreach_pkv: ["Thema", "Vermittler", "Erste Frage"],
  outreach_privatschutz: ["Thema", "Vermittler", "Erste Frage"],
  booking_confirmation: ["Datum/Uhrzeit", "Art", "Link/Hinweis"],
  reminder: ["Datum/Uhrzeit", "Art", "Link/Hinweis"],
  reminder_soon: ["Uhrzeit", "Art", "Link/Hinweis"],
  reminder_start: ["Vermittler (Nominativ)", "Uhrzeit", "Videolink"],
  appt_waiting: ["Vermittler (Nominativ)", "Videolink"],
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

/**
 * Text NACH der Anrede-Zeile. {{2}}, {{3}} … = REST_PARAMS. [Firma] = Kundenname („Buchung bei …“),
 * [Berater] = Person („hier ist …“, „Herzliche Grüße, …“), [Rolle] = Status laut Erstinformation
 * (z. B. „ von der Allianz“ oder „, Ihr Versicherungsmakler“, rolleText). Ohne „du“: nur gesiezt.
 */
export const TEMPLATE_BODY: Record<NoticePurpose, { du?: string; sie: string }> = {
  // Erste Nachricht an neue Leads (v7, Ole 17.11.2026; Freitext: erstanschreiben.ts erstanschreibenText): Dank mit
  // Thema, KI-Assistent des Vermittlers, erste offene Frage als letzte Zeile, nicht fett (Platzhalter, ERSTANSCHREIBEN_V7).
  // Die Erstinformation (§ 15/16 VersVermV) steht immer als PDF im Kopf (TEMPLATE_HEADER).
  outreach: { ...ERSTANSCHREIBEN_V7 },
  outreach_tkv: { ...ERSTANSCHREIBEN_V7 },
  outreach_zahn: { ...ERSTANSCHREIBEN_V7 },
  outreach_pkv: { ...ERSTANSCHREIBEN_V7 },
  outreach_privatschutz: { ...ERSTANSCHREIBEN_V7 },
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
  // Show-up-Paket (Ole, 17.11.2026), nur vorbereitet, nicht eingereicht (VORBEREITETE_PURPOSES): 15 Minuten vorher mit
  // Link (nur Videotermine) und „wartet schon im Videoraum“ nach „Fehlt noch“. Freitext: lib/showup.ts.
  reminder_start: {
    du: "gleich geht es los: {{2}} ist um {{3}} für dich im Videoraum. Der Link funktioniert direkt im Handy-Browser, ohne App: {{4}} Bis gleich!",
    sie: "gleich geht es los: {{2}} ist um {{3}} für Sie im Videoraum. Der Link funktioniert direkt im Handy-Browser, ohne App: {{4}} Bis gleich!",
  },
  appt_waiting: {
    du: "{{2}} wartet schon im Videoraum auf dich. Hier ist der Link: {{3}} Bis gleich!",
    sie: "{{2}} wartet schon im Videoraum auf Sie. Hier ist der Link: {{3}} Bis gleich!",
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
  // Cross-Selling mit Grund und konkretem, kleinem nächsten Schritt (Ole, 15.11.2026). Freigegeben bei Meta als v4,
  // NICHT ändern: Der Text muss zur Freigabe passen. Neue Fassung ist vorgemerkt in NAECHSTE_FASSUNG (v5).
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
  followup_last: {
    du: "hier ist nochmal der digitale KI-Assistent von [Firma]. Ich möchte dich nicht weiter stören: Soll [Berater] sich noch um deine Anfrage kümmern?",
    sie: "hier ist nochmal der digitale KI-Assistent von [Firma]. Ich möchte Sie nicht weiter stören: Soll [Berater] sich noch um Ihre Anfrage kümmern?",
  },
  campaign_cross_sell: {
    sie: "hier ist [Berater][Rolle]. Beim Thema {{2}} sehe ich oft Lücken, die erst im Schadenfall auffallen. Darf ich in 10 Minuten kurz mit Ihnen prüfen, ob bei Ihnen alles passt?",
  },
};

/**
 * Vorgemerkte nächste Fassung für die nächste Einreichung bei Meta. Wird NICHT gesendet und NICHT
 * eingereicht, solange sie hier steht: Gesendet wird immer die freigegebene Vorlage aus TEMPLATE_BODY.
 * Aktivieren (bei der nächsten Einreichung): Text nach TEMPLATE_BODY übernehmen, PURPOSE_VERSION des Zwecks auf
 * `version` setzen und den Eintrag hier löschen. Dann reicht template-submit die neuen Namen
 * (pg_<zweck>_<version>_sie, …_sie_ohne_name, bei A/B auch _b_…) automatisch ein; bis zur Freigabe bleibt die
 * bisherige Fassung im Einsatz (rankTemplates).
 *   campaign_cross_sell v5 (Rechtsvorprüfung 16.11.2026, § 5 UWG): statt der nicht belegten Aussage „Viele meiner
 *   Kunden haben … eine Lücke“ eine allgemeine Aussage über das Thema.
 */
export type NaechsteFassung = {
  version: string;
  du?: string;
  sie: string;
  /** A/B-Fassung b, falls vorhanden */
  b?: { du?: string; sie: string };
  /** Neue Schnellantwort-Knöpfe (im Freitext sofort, in der Vorlage ab dieser Version). */
  knoepfe?: string[];
};

/**
 * Vorbereitete neue Fassung mit ANDEREN Platzhaltern (Show-up-Paket, Ole 17.11.2026): wird NICHT eingereicht und als
 * Vorlage nicht gesendet, bis Ole die Texte freigibt (docs/vorlagen-showup.md). Im offenen 24-h-Fenster sendet die App
 * schon den neuen Text als Freitext (lib/showup.ts). Aktivieren: Text nach TEMPLATE_BODY, REST_PARAMS des Zwecks auf
 * `params`, PURPOSE_VERSION auf `version`, Eintrag hier löschen. Die Absender (lib/whatsapp/reminders.ts) belegen die
 * Platzhalter je Version der gewählten Vorlage (paramsFor): ab dieser Version die neue Belegung, sonst die bisherige.
 */
export type VorbereiteteFassung = { version: string; du: string; sie: string; params: string[]; beispiele: { du: string[]; sie: string[] } };

/**
 * Erstanschreiben v8 (Ole, 17.11.2026, P2), nur vorbereitet (docs/vorlagen-erstanschreiben-v8.md): konkretes Interesse
 * mit Emoji, neutraler Nutzen-Halbsatz, erste Frage dynamisch und nicht fett. Parameter: outreach.ts paramsFor ab v8.
 */
const ERSTANSCHREIBEN_V8_FASSUNG = (beispielSie: string[], beispielDu: string[]): VorbereiteteFassung => ({
  version: "v8",
  du: ERSTANSCHREIBEN_V8.du,
  sie: ERSTANSCHREIBEN_V8.sie,
  params: ["Anfrage mit Interesse und Emoji", "Vermittler (Dativ)", "Vermittler als Subjekt (er, sie bzw. Vorname)", "Für wen (z. B. für Ihre Familie, sonst persönlich)", "Erste offene Frage ohne Fragezeichen"],
  beispiele: { sie: beispielSie, du: beispielDu },
});

export const VORBEREITETE_FASSUNG: Partial<Record<NoticePurpose, VorbereiteteFassung>> = {
  outreach: ERSTANSCHREIBEN_V8_FASSUNG(
    ["Frau Becker", "zum Thema Versicherung", "Herrn Kannapinn", "er", "persönlich", "Wann erreicht Herr Kannapinn Sie am besten für ein kurzes Telefonat"],
    ["Anna", "zum Thema Versicherung", "Ole", "er", "persönlich", "Wann erreicht Ole dich am besten für ein kurzes Telefonat"],
  ),
  outreach_tkv: ERSTANSCHREIBEN_V8_FASSUNG(
    ["Frau Becker", "zur Katzenversicherung 🐱", "Herrn Kannapinn", "er", "für Ihre Katze", "Wie alt ist Ihre Katze"],
    ["Anna", "zur Katzenversicherung 🐱", "Ole", "er", "für deine Katze", "Wie alt ist deine Katze"],
  ),
  outreach_zahn: ERSTANSCHREIBEN_V8_FASSUNG(
    ["Frau Becker", "zur Zahnzusatzversicherung", "Herrn Kannapinn", "er", "persönlich", "Welcher Tarifbaustein ist Ihnen am wichtigsten"],
    ["Anna", "zur Zahnzusatzversicherung", "Ole", "er", "persönlich", "Welcher Tarifbaustein ist dir am wichtigsten"],
  ),
  outreach_pkv: ERSTANSCHREIBEN_V8_FASSUNG(
    ["Frau Becker", "zur privaten Krankenversicherung", "Herrn Kannapinn", "er", "persönlich", "Wie sind Sie aktuell beruflich aufgestellt"],
    ["Anna", "zur privaten Krankenversicherung", "Ole", "er", "persönlich", "Wie bist du aktuell beruflich aufgestellt"],
  ),
  outreach_privatschutz: ERSTANSCHREIBEN_V8_FASSUNG(
    ["Frau Becker", "zu Haftpflicht und Hausrat 🏠", "Herrn Kannapinn", "er", "für Ihre Familie", "Sind Haftpflicht und Hausrat schon irgendwo versichert, oder wäre beides neu"],
    ["Anna", "zu Haftpflicht und Hausrat 🏠", "Ole", "er", "für deine Familie", "Sind Haftpflicht und Hausrat schon irgendwo versichert, oder wäre beides neu"],
  ),
  // Vortag (ca. 24 h vorher): Nutzensatz aus den Angaben, bei Komplettcheck der Satz zu den Verträgen, Zugang, Frage
  reminder: {
    version: "v5",
    du: "kurze Erinnerung an deinen Termin {{2}}. {{3}} So geht es los: {{4}} Passt es weiterhin?",
    sie: "kurze Erinnerung an Ihren Termin {{2}}. {{3}} So geht es los: {{4}} Passt es weiterhin?",
    params: ["Wann (z. B. morgen um 10 Uhr)", "Nutzen (ein Satz, ggf. mit Verträgen)", "Zugang (Videolink bzw. Anruf)"],
    beispiele: {
      du: ["Julia", "morgen um 10 Uhr", "In einem kurzen Videotermin zeigt dir Thomas, was Haftpflicht und Hausrat für deine Familie kosten und worauf du achten solltest.", "https://meet.google.com/abc-defg-hij"],
      sie: ["Frau Schneider", "morgen um 10 Uhr", "In einem kurzen Videotermin zeigt Ihnen Herr Schmidt, was Haftpflicht und Hausrat für Ihre Familie kosten und worauf Sie achten sollten. Legen Sie gern Ihre bestehenden Verträge bereit.", "https://meet.google.com/abc-defg-hij"],
    },
  },
  // 1 Stunde vorher, ohne Link
  reminder_soon: {
    version: "v5",
    du: "in einer Stunde ist dein {{2}} mit {{3}}. Passt bei dir alles? Falls etwas dazwischengekommen ist, finden wir gern eine neue Zeit.",
    sie: "in einer Stunde ist Ihr {{2}} mit {{3}}. Passt bei Ihnen alles? Falls etwas dazwischengekommen ist, finden wir gern eine neue Zeit.",
    params: ["Terminart (Videotermin bzw. Telefontermin)", "Vermittler (Dativ)"],
    beispiele: { du: ["Julia", "Videotermin", "Thomas"], sie: ["Frau Schneider", "Videotermin", "Herrn Schmidt"] },
  },
};

export const NAECHSTE_FASSUNG: Partial<Record<NoticePurpose, NaechsteFassung>> = {
  campaign_cross_sell: {
    version: "v5",
    sie: "hier ist [Berater][Rolle]. Beim Thema {{2}} gibt es oft Lücken, die erst im Schadenfall auffallen. Soll ich in 10 Minuten kurz prüfen, ob das bei Ihnen auch so ist?",
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
 * Text für Freitext im offenen 24-h-Fenster (keine Meta-Vorlage, daher sofort die vorgemerkte nächste Fassung, z. B.
 * der KI-Hinweis nach Memo). Ohne vorgemerkte Fassung: derselbe Text wie die Vorlage.
 */
export function freitextBodyOf(purpose: NoticePurpose, variant: TemplateVariant = "a"): { du?: string; sie: string } {
  const n = NAECHSTE_FASSUNG[purpose];
  if (n) {
    if (variant === "b" && TEMPLATE_BODY_B[purpose]) return n.b ?? bodyOf(purpose, variant);
    return { du: n.du, sie: n.sie };
  }
  return bodyOf(purpose, variant);
}

/** Knöpfe im offenen Fenster: die der vorgemerkten nächsten Fassung, sonst die der freigegebenen Vorlage. */
export function freitextButtonsOf(purpose: NoticePurpose): string[] | undefined {
  return NAECHSTE_FASSUNG[purpose]?.knoepfe ?? TEMPLATE_BUTTONS[purpose];
}

/**
 * Vorlagentext einer Fassung (mit [Firma]/[Berater]/[Rolle]). Statt einer Fassung geht auch die Ansprache:
 * „du“ → Du-Fassung (bzw. Sie, wenn es keine gibt), „sie“ → Sie-Fassung mit Namen.
 */
export function templateTextFor(purpose: NoticePurpose, form: TemplateForm | Ansprache = "du", variant: TemplateVariant = "a"): string {
  const b = bodyOf(purpose, variant);
  // Erstanschreiben ab v5: „Hallo“ auch gesiezt („Hallo Herr Müller,“), genau eine Begrüßung
  const gruss = isOutreachPurpose(purpose) ? "Hallo" : "Guten Tag";
  if (form === "du" && b.du) return `Hallo {{1}}, ${b.du}`;
  if (form === "sie_ohne_name") return `${gruss}, ${shiftVars(b.sie, -1)}`;
  return `${gruss} {{1}}, ${b.sie}`;
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

/**
 * [Firma], [Berater], [Rolle] und [Kurzname] einsetzen. Ein einzelner Name gilt für alle.
 * kurz = Vorname des Vermittlers laut Profil, sonst Agentur (Erstanschreiben v5, advisor-name.ts kurzNameFuerLeads).
 */
export type TemplateNames = { firm: string; advisor: string; role?: string; kurz?: string };
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
    .join((n as TemplateNames).role ?? ROLLE_STANDARD)
    .split("[Kurzname]")
    .join((n as TemplateNames).kurz || n.firm);
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
export function nameSlotOf(body: string, name?: string | null): NameSlot {
  const t = body.trim();
  if (/^Guten Tag \{\{1\}\}/.test(t)) return "anrede";
  if (/^(Guten Tag|Hallo)\s*[,!.]/.test(t)) return "ohne";
  // Erstanschreiben ab v5: Sie-Fassung „Hallo {{1}},“ mit „Herr Müller“ (nur automatisch eingereichte ab v5)
  if (/^Hallo \{\{1\}\}/.test(t) && name && isSieTemplateName(name) && templateVersionOfName(name) >= 5) return "anrede";
  return "vorname";
}

/** Textversion aus dem Vorlagennamen (pg_outreach_tkv_v5_sie → 5); 0 = von Hand angelegt bzw. unbekannt. */
export function templateVersionOfName(name: string): number {
  return Number(/^pg_[a-z_]+?_v(\d+)(?:_|$)/.exec(name)?.[1] ?? 0);
}

/** Ansprache, in der eine Vorlage geschrieben ist (du = Vorname-Fassung ohne „_sie“). */
export function templateAnspracheOf(t: { name: string; body: string }): Ansprache {
  return nameSlotOf(t.body, t.name) === "vorname" && !isSieTemplateName(t.name) ? "du" : "sie";
}

/**
 * Parameter für eine Vorlage: rest = Werte nach dem Namen (REST_PARAMS). null, wenn die Vorlage
 * einen Nachnamen braucht, der fehlt.
 */
export function templateParams(body: string, an: Ansprache, kontakt: AnredeKontakt | null | undefined, rest: string[], name?: string | null): string[] | null {
  const slot = nameSlotOf(body, name);
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
    const slot = nameSlotOf(t.body, t.name);
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
  return { tpl, current, variant: current ? variantOfName(tpl.name) : "a", params: (rest) => templateParams(tpl.body, an, kontakt, rest, tpl.name) ?? [...rest] };
}

/** PDF der Erstinformation fürs Erstanschreiben: vollständig, nur als Entwurf (Angaben unvollständig) oder gar nicht. */
export type OutreachPdf = "vollstaendig" | "entwurf" | "keins";

export type OutreachPick<T> = NonNullable<ReturnType<typeof rankTemplates<T & Candidate>>> & {
  purpose: NoticePurpose;
  /** Textversion der gewählten Vorlage (0 = von Hand angelegt) */
  version: number;
  /** Welches PDF in den Kopf gehört (immer eines: das Erstanschreiben geht nie ohne Erstinformation raus) */
  dokument: "vollstaendig" | "entwurf";
};

/**
 * Erstanschreiben als Vorlage über Produkt und allgemeine Fassung hinweg (Ole, 17.11.2026, rein, testbar).
 * Regel (Live-Test 17.11.2026): Das Erstanschreiben geht NIE ohne Erstinformation raus. Als Vorlage (Fenster zu) kommen
 * deshalb nur Vorlagen mit PDF-Kopf in Frage; die „_ohnepdf“-Fassungen nie (im offenen Fenster geht Freitext mit dem PDF
 * als Nachricht 2, outreach.ts). Das PDF: vollständig, sonst im aktuellen Stand („entwurf“); gibt es gar keins →
 * { wartenAufPdf } (nicht senden, Vermittler und Admin bekommen einen Hinweis).
 * Ansprache: Sie-Kunden bekommen nie eine Du-Fassung (Live-Test 17.11.2026: Du-Text an einen Sie-Kunden, weil nur die
 * Du-Fassung lokal freigegeben war). Die neueste freigegebene Textversion gewinnt, bei gleicher Version die des Produkts
 * (purposes[0]) vor der allgemeinen; innerhalb davon wie rankTemplates (Anrede-Fassung).
 * null = keine passende freigegebene Vorlage (Erstanschreiben wartet, NoTemplateError).
 */
export function rankOutreach<T extends Candidate & { purpose: string }>(
  list: T[],
  purposes: NoticePurpose[],
  ansprache: Ansprache,
  kontakt: AnredeKontakt | null | undefined,
  opts: { variant?: TemplateVariant; pdf: OutreachPdf },
): OutreachPick<T> | { wartenAufPdf: true } | null {
  const ver = (t: T) => templateVersionOfName(t.name);
  const passt = (t: T) =>
    (purposes as string[]).includes(t.purpose) &&
    t.headerFormat === "DOCUMENT" &&
    !(ansprache === "sie" && hasDuVariant(t.purpose as NoticePurpose) && templateAnspracheOf(t) === "du");
  const mine = list.filter(passt);
  // Neueste zuerst, von Hand angelegte (Version 0) zuletzt
  const versions = [...new Set(mine.map(ver))].sort((x, y) => (x === 0 ? 1 : y === 0 ? -1 : y - x));
  let pick: (NonNullable<ReturnType<typeof rankTemplates<T>>> & { purpose: NoticePurpose; version: number }) | null = null;
  outer: for (const v of versions) {
    for (const p of purposes) {
      const r = rankTemplates(
        mine.filter((t) => t.purpose === p && ver(t) === v),
        p,
        ansprache,
        kontakt,
        { variant: p === purposes[0] ? opts.variant : "a" },
      );
      if (r) {
        pick = { ...r, purpose: p, version: v };
        break outer;
      }
    }
  }
  if (!pick) return null;
  if (opts.pdf === "keins") return { wartenAufPdf: true };
  return { ...pick, dokument: opts.pdf };
}

/** Die Erstinformation fehlt ganz (PDF nicht erzeugbar): Erstanschreiben wartet und wird erneut versucht. */
export class ErstinfoPdfFehltError extends Error {
  constructor() {
    super("Erstinformation als PDF nicht verfügbar: Erstanschreiben wartet.");
  }
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
  // Erstanschreiben ab v6 ohne Knöpfe in der Vorlage (die erste Frage ist ein Platzhalter). Freigegebene ältere Fassungen
  // tragen ihre Knöpfe weiter (MessageTemplate.buttons); im Freitext passen sie zur gestellten Frage
  // (erstanschreiben.ts ersteFrageKnoepfe).
  booking_confirmation: [KNOPF.terminVerschieben],
  reminder: [KNOPF.passt, KNOPF.verschieben],
  reminder_soon: [KNOPF.passt, KNOPF.verschieben],
  reminder_start: [KNOPF.verschieben],
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
export const ERSTINFO_FOOTER = "Oben: unsere Erstinformation, wie gesetzlich vorgesehen";

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
 * Freitext für das offene 24-h-Fenster: Anrede-Zeile nach Regel plus Text der aktuellen bzw. vorgemerkten Fassung.
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
  const b = freitextBodyOf(purpose, variant);
  const body = fillNames(eff === "du" && b.du ? b.du : b.sie, names);
  // Erstanschreiben: „Hallo Herr Müller,“ bzw. „Hallo,“ (wie die Vorlage ab v5)
  const name = isOutreachPurpose(purpose) ? anredeName(eff, kontakt) : null;
  const zeile = isOutreachPurpose(purpose) ? (name ? `Hallo ${name},` : "Hallo,") : anredeZeile(eff, kontakt);
  return `${zeile} ${renderTemplate(body, ["", ...rest])}`;
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
  /**
   * Parameter je nach gewählter Vorlage (Version, Ansprache der Fassung, aktuell oder älter); hat Vorrang vor
   * params/legacyParams. Erstanschreiben: v5 mit „Ihre Katze“ bzw. „deine Katze“, v4 mit Produkt, v3 mit Link.
   */
  paramsFor?: (t: { version: number; ansprache: Ansprache; current: boolean; purpose: NoticePurpose }) => string[];
  /** Freitext für das offene 24h-Fenster (und Fallback-Inhalt der Inbox). */
  text: string;
  leadId?: string | null;
  contactName?: string | null;
  /** Name und Anrede des Kontakts (sonst nur contactName, Anrede unbekannt). */
  anrede?: AnredeKontakt | null;
  /** PDF für Vorlagen mit Dokument im Kopf (Erstinformation). Ohne: solche Vorlagen werden übersprungen. */
  document?: { link: string; filename: string } | null;
  /**
   * Erstanschreiben (rankOutreach): weitere Zwecke, die mit dem Zweck zusammen nach Version gewählt werden (allgemeine
   * Fassung „outreach“ nach dem Produkt), und das PDF der Erstinformation im aktuellen Stand, falls sie unvollständig ist.
   */
  outreach?: { fallbackPurposes: NoticePurpose[]; documentEntwurf?: { link: string; filename: string } | null };
  /** Payloads der Schnellantwort-Knöpfe (z. B. „slot:2026-11-17T09:00:00.000Z“), nur für die aktuelle Fassung. */
  buttonPayloads?: string[];
  /** Knöpfe im offenen Fenster (Standard: TEMPLATE_BUTTONS des Zwecks, wenn sie interaktiv passen); [] = keine. */
  textButtons?: string[];
  /** A/B-Fassung (Standard: fest je Lead bzw. Nummer zugeteilt, siehe lib/whatsapp/ab-test.ts). */
  variant?: TemplateVariant;
  /**
   * Der Vermittler bzw. Admin sendet selbst per Klick (Nachfassen im Chat, Test an mich). Ohne: automatische
   * Nachricht, nur an Kontakte aus der Pipeline (lib/whatsapp/nur-leads.ts, sonst WhatsAppKeinLeadError).
   */
  manuell?: boolean;
}): Promise<{
  mode: "text" | "template";
  conversationId: string;
  messageId?: string | null;
  variant: TemplateVariant | null;
  documentHeader: boolean;
  /** Zweck der gesendeten Vorlage (beim Erstanschreiben ggf. die allgemeine Fassung) */
  purpose: NoticePurpose;
  /** Textversion der gesendeten Vorlage (null = Freitext) */
  version: number | null;
  /** PDF im Kopf: vollständig oder Entwurf (Erstinformation unvollständig) */
  pdf: "vollstaendig" | "entwurf" | null;
}> {
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
    const l = await prisma.lead.findUnique({ where: { id: leadId }, select: { waConsent: true, waUnavailableAt: true } });
    // Kein WhatsApp (Nummer nicht erreichbar, lib/whatsapp/kein-whatsapp.ts): keine weiteren Nachrichten, außer der Lead schreibt selbst
    if (l?.waConsent === "nein" || l?.waUnavailableAt) {
      const wrote = existing ? await prisma.message.count({ where: { conversationId: existing.id, direction: "inbound" } }) : 0;
      if (!wrote) throw l.waConsent === "nein" ? new WhatsAppNoConsentError() : new WhatsAppUnavailableError();
    }
  }
  // Allowlist (Ole, 16.11.2026): automatische Nachrichten nur an Leads aus der Pipeline bzw. (Kampagnen, Empfehlungen)
  // an importierte Bestandskunden. Nie an unbekannte Kontakte, z. B. private Chats der Business-App (Coexistence).
  if (!opts.manuell) {
    const { pruefeAutomatik } = await import("@/lib/whatsapp/nur-leads");
    await pruefeAutomatik({ customerId: opts.customerId, to: opts.to, purpose: opts.purpose, leadId, conversationId: existing?.id ?? null });
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
  let purpose: NoticePurpose = opts.purpose;
  let version: number | null = null;
  let pdf: "vollstaendig" | "entwurf" | null = null;

  if (windowOpen) {
    mode = "text";
    body = opts.text;
    const buttons = interactiveButtons(opts.textButtons ?? freitextButtonsOf(opts.purpose));
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
    let pick: (NonNullable<Awaited<ReturnType<typeof pickTemplate>>> & { purpose?: NoticePurpose; dokument?: "vollstaendig" | "entwurf" | null }) | null;
    if (opts.outreach) {
      // Erstanschreiben: neueste freigegebene Fassung über Produkt und allgemeine Fassung (rankOutreach)
      const purposes = [opts.purpose, ...opts.outreach.fallbackPurposes.filter((p) => p !== opts.purpose)];
      const [customer, approved] = await Promise.all([
        prisma.customer.findUnique({ where: { id: opts.customerId }, select: { leadAddress: true } }),
        prisma.messageTemplate.findMany({ where: { customerId: opts.customerId, purpose: { in: purposes }, status: "approved" }, orderBy: { updatedAt: "desc" } }),
      ]);
      const pdfStand: OutreachPdf = opts.document ? "vollstaendig" : opts.outreach.documentEntwurf ? "entwurf" : "keins";
      const r = rankOutreach(approved, purposes, asAnsprache(customer?.leadAddress), kontakt, { variant: wanted, pdf: pdfStand });
      if (r && "wartenAufPdf" in r) throw new ErstinfoPdfFehltError();
      pick = r;
    } else {
      pick = await pickTemplate(opts.customerId, opts.purpose, kontakt, { variant: wanted, documentHeader: !!opts.document });
    }
    if (!pick) throw new NoTemplateError(opts.purpose);
    const { tpl } = pick;
    purpose = pick.purpose ?? opts.purpose;
    version = templateVersionOfName(tpl.name);
    // Ältere Fassung mit anderer Belegung: deren Parameter. Nur so viele Werte, wie die Vorlage Platzhalter hat.
    const base = opts.paramsFor
      ? opts.paramsFor({ version, ansprache: templateAnspracheOf(tpl), current: pick.current, purpose })
      : !pick.current && opts.legacyParams
        ? opts.legacyParams
        : opts.params;
    const params = pick.params(base.slice(1)).slice(0, placeholderCount(tpl.body));
    const buttons = Array.isArray(tpl.buttons) ? (tpl.buttons as unknown[]).length : 0;
    const docSource = pick.dokument === "entwurf" ? (opts.outreach?.documentEntwurf ?? null) : (opts.document ?? null);
    const doc = tpl.headerFormat === "DOCUMENT" ? docSource : null;
    // Erstanschreiben nie ohne Erstinformation (Ole, 17.11.2026): ohne PDF im Kopf nicht senden
    if (opts.outreach && !doc) throw new ErstinfoPdfFehltError();
    mode = "template";
    pricingCategory = tpl.category.toLowerCase();
    variant = pick.variant;
    documentHeader = !!doc;
    pdf = doc ? (pick.dokument === "entwurf" ? "entwurf" : "vollstaendig") : null;
    if (pdf === "entwurf") console.warn("[whatsapp] Erstanschreiben mit unvollständiger Erstinformation im Kopf", opts.customerId);
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
      purpose,
      // A/B-Messung nur über Vorlagen (Freitext ist der Text des Aufrufers, keine Fassung)
      variant,
      // Vorlagen kosten (vorläufig); der Status-Webhook liefert Metas endgültige Angabe.
      ...(pricingCategory ? { pricingCategory, billable: true } : {}),
    },
  });

  // messageId: für den Zustellstatus am Kampagnen-Empfänger (delivered/read aus dem Webhook)
  return { mode, conversationId: conversation.id, messageId, variant, documentHeader, purpose, version, pdf };
}
