// Einwilligung im Meta-Leadformular (Anwalts-Memo Punkt 1, Ole 15.11.2026):
//   - Pflicht-Häkchen mit festem Wortlaut (Vermittler, Anschrift, KI-Assistent, Widerruf per „STOPP“ oder E-Mail,
//     Datenschutzhinweise). Die Kampagnen-Agenten setzen ihn beim Anlegen des Formulars, Admin und Kunde sehen
//     ihn ausgefüllt zum Kopieren.
//   - Antwort (custom_disclaimer_responses) am Lead speichern: Zeitpunkt, Formular-ID, Textversion, Wortlaut.
//   - Hinweis da, Häkchen fehlt → kein WhatsApp (nur E-Mail oder Telefon zur konkreten Anfrage).
//     Formular ganz ohne Hinweis → bisheriges Verhalten (WhatsApp wie bisher), aber Warnung an Admin und Vermittler.
// Reine Funktionen (ohne Datenbank).

/** Version des Wortlauts; ändert sich der Text, hochzählen (steht im Nachweis am Lead). */
export const CONSENT_VERSION = "2026-11-16";

/**
 * Zustimmung zur elektronischen Erstinformation (Rechtsprüfung 16.11.2026): Über eine Website (unser Link
 * /erstinformation/<token> ist je Vermittler, nicht je Interessent personalisiert) darf die Erstinformation nach
 * § 16 Abs. 2 VersVermV nur gegeben werden, wenn der Versicherungsnehmer zugestimmt hat; ein anderer dauerhafter
 * Datenträger (PDF) setzt die Wahl gegenüber Papier voraus. Seit Version 2026-11-16 Teil des Einwilligungstexts.
 */
export const ERSTINFO_ZUSTIMMUNG =
  "Die Erstinformation nach § 15 VersVermV erhalte ich elektronisch als Link und PDF, auf Wunsch auch auf Papier.";

/** Schlüssel des Häkchens in unseren Formularen (lib/kampagnen/builder.ts). */
export const CONSENT_CHECKBOX_KEY = "einwilligung_kontakt";

export type ConsentAngaben = {
  vermittler: string | null;
  anschrift: string | null;
  email: string | null;
  datenschutzUrl: string | null;
};

const PLATZHALTER = {
  vermittler: "[Name des Vermittlers]",
  anschrift: "[Anschrift]",
  email: "[E-Mail-Adresse]",
  datenschutzUrl: "[Link zur Datenschutzerklärung]",
};

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s*\n\s*/g, ", ").replace(/\s+/g, " ").trim();

/** Wortlaut mit den Angaben des Vermittlers; fehlende Angaben als Platzhalter in eckigen Klammern. */
export function leadFormConsentText(x: ConsentAngaben): string {
  const v = clean(x.vermittler) || PLATZHALTER.vermittler;
  const adr = clean(x.anschrift) || PLATZHALTER.anschrift;
  const mail = clean(x.email) || PLATZHALTER.email;
  const url = clean(x.datenschutzUrl) || PLATZHALTER.datenschutzUrl;
  return `Ich willige ein, dass ${v}, ${adr}, mich zu meiner Anfrage per WhatsApp, E-Mail und Telefon kontaktiert. Dabei antwortet zunächst ein KI-gestützter Assistent und vereinbart Termine. Widerruf jederzeit, z. B. mit ‚STOPP‘ oder per E-Mail an ${mail}. ${ERSTINFO_ZUSTIMMUNG} Datenschutzhinweise: ${url}`;
}

/** Welche Angaben fehlen für den Wortlaut? */
export function consentMissing(x: ConsentAngaben): string[] {
  const out: string[] = [];
  if (!clean(x.vermittler)) out.push("Name des Vermittlers");
  if (!clean(x.anschrift)) out.push("Anschrift");
  if (!clean(x.email)) out.push("E-Mail-Adresse für den Widerruf");
  if (!clean(x.datenschutzUrl)) out.push("Link zur Datenschutzerklärung");
  return out;
}

export type DisclaimerResponse = { key: string; checked: boolean };

const truthy = (v: unknown) => v === true || v === 1 || (typeof v === "string" && /^(1|true|yes|ja|checked|on)$/i.test(v.trim()));

/**
 * custom_disclaimer_responses aus dem Meta-Lead (Graph: [{ checkbox_key, is_checked }], Zapier teils als
 * JSON-Text). null = keine Antworten (Formular ohne eigenen Hinweis bzw. ohne Häkchen).
 */
export function parseDisclaimerResponses(raw: unknown): DisclaimerResponse[] | null {
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (v && typeof v === "object" && !Array.isArray(v) && Array.isArray((v as { data?: unknown }).data)) v = (v as { data: unknown[] }).data;
  if (!Array.isArray(v) || v.length === 0) return null;
  const out: DisclaimerResponse[] = [];
  for (const x of v) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const key = String(o.checkbox_key ?? o.key ?? "").trim();
    if (!key) continue;
    out.push({ key, checked: truthy(o.is_checked ?? o.checked ?? o.value) });
  }
  return out.length ? out : null;
}

/** "ja" = eingewilligt, "nein" = Häkchen fehlt, null = unbekannt (Formular ohne Hinweis). */
export function consentStateOf(responses: DisclaimerResponse[] | null): "ja" | "nein" | null {
  if (!responses?.length) return null;
  const own = responses.find((r) => r.key === CONSENT_CHECKBOX_KEY);
  if (own) return own.checked ? "ja" : "nein";
  return responses.every((r) => r.checked) ? "ja" : "nein";
}

export type ConsentNachweis = {
  at: string;
  formId: string | null;
  textVersion: string | null;
  text: string | null;
  responses: DisclaimerResponse[];
};

/** Darf der Assistent diesen Lead per WhatsApp anschreiben? Nur ein fehlendes Häkchen sperrt. */
export function whatsappErlaubt(waConsent: string | null | undefined): boolean {
  return waConsent !== "nein";
}

/** Kurztext für Kontakt, Chat und Admin. */
export function consentLabel(waConsent: string | null | undefined): { text: string; tone: "ok" | "warn" | "info" } {
  if (waConsent === "ja") return { text: "Einwilligung erteilt (WhatsApp, E-Mail, Telefon)", tone: "ok" };
  if (waConsent === "nein")
    return { text: "Häkchen zur Einwilligung fehlt: keine WhatsApp-Nachrichten, bitte nur per E-Mail oder Telefon zu dieser Anfrage melden", tone: "warn" };
  return { text: "Formular ohne Einwilligungs-Häkchen: Einwilligung nicht nachgewiesen", tone: "info" };
}
