// Einwilligung und Kanalwahl je Bestandskunde für Bestandskampagnen (Ole, 14.11.2026, nach rechtlicher
// Vorprüfung, keine Rechtsberatung). Rein, ohne Datenbank (auch im Browser nutzbar) und getestet.
//
// Gilt für BEIDE Kanäle (WhatsApp ist nach herrschender Meinung ebenfalls „elektronische Post“ im Sinne
// von § 7 Abs. 2 Nr. 2 und Abs. 3 UWG):
//   1. Mit Einwilligung für den Kanal: alle Anlässe.
//   2. Ohne Einwilligung, aber mit der Bestätigung des Vermittlers zu § 7 Abs. 3 UWG (Adresse aus einem
//      Vertragsabschluss, Hinweis auf das Widerspruchsrecht bei der Erhebung): nur Anlässe zum selben Bedarf
//      bzw. Vertrag (Ablauf/Wechsel, Jahresgespräch als Vertragscheck). Kein Cross-Selling in andere Sparten,
//      kein Geburtstag mit Angebot, keine Empfehlungs- oder Bewertungsbitte (BGH, 10.07.2018: auch Werbung).
//      Das gilt nur für E-Mail.
//   3. WhatsApp strikt: Die WhatsApp Business Messaging Policy von Meta verlangt ein Opt-in vor geschäftlichen
//      Erstnachrichten. Ohne WhatsApp-Einwilligung keine WhatsApp-Kampagne, auch nicht im § 7 Abs. 3-Modus.
//   4. Abmeldung („Stopp“, Abmeldelink) und „nein“ schließen immer aus, sofort und dauerhaft.

import type { Occasion } from "@/lib/bestand/campaigns";

export type Channel = "whatsapp" | "email";
export type ChannelMode = "whatsapp_first" | "whatsapp" | "email";
export type ConsentValue = "ja" | "nein" | null;
export type LegalBasis = "einwilligung" | "uwg7_3";

export const CHANNEL_LABEL: Record<Channel, string> = { whatsapp: "WhatsApp", email: "E-Mail" };

export const CHANNEL_MODES: readonly { key: ChannelMode; label: string; hint: string }[] = [
  { key: "whatsapp_first", label: "WhatsApp bevorzugt, sonst E-Mail", hint: "Wer per WhatsApp erreichbar ist, bekommt WhatsApp, alle anderen eine E-Mail." },
  { key: "whatsapp", label: "Nur WhatsApp", hint: "Nur Kunden mit Mobilnummer und WhatsApp-Einwilligung." },
  { key: "email", label: "Nur E-Mail", hint: "Nur Kunden mit E-Mail-Adresse, die per E-Mail angeschrieben werden dürfen." },
];

export function asChannelMode(v: unknown): ChannelMode {
  return v === "whatsapp" || v === "email" ? v : "whatsapp_first";
}

/** Rohwert aus Import oder Formular → ja | nein | null (unbekannt). Ein Datum zählt als „ja“. */
export function parseConsent(raw: unknown): ConsentValue {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  if (/^(ja|j|yes|y|x|1|true|wahr|liegt vor|vorhanden|erteilt|eingewilligt|ok)$/.test(s)) return "ja";
  if (/^(nein|n|no|0|false|falsch|keine?|nicht erteilt|abgelehnt|widerrufen)$/.test(s)) return "nein";
  if (/^\d{1,2}\.\d{1,2}\.\d{2,4}$|^\d{4}-\d{2}-\d{2}/.test(s)) return "ja";
  return null;
}

export const CONSENT_LABEL: Record<"ja" | "nein" | "unbekannt", string> = { ja: "ja", nein: "nein", unbekannt: "unbekannt" };

/**
 * Anlass zum selben Bedarf bzw. Vertrag (zulässig nach § 7 Abs. 3 UWG ohne Einwilligung)?
 * „Ähnlich“ ist eng auszulegen: gleicher typischer Verwendungszweck (LG Frankfurt, 22.03.2018, 2-03 O 372/17).
 *   renewal: Ablauf/Wechsel bzw. Anpassung des bestehenden Vertrags → ja
 *   review:  Jahresgespräch als Check der bestehenden Verträge (Anpassung, Optimierung) → ja
 *   cross_sell: andere Sparte (z. B. Hausrat an Kfz-Kunden) → nein
 *   birthday: Geburtstag mit Gesprächsangebot → nein
 *   empfehlung: Empfehlungs- bzw. Bewertungsbitte → nein
 */
export function isSameNeedOccasion(o: Occasion): boolean {
  return o === "renewal" || o === "review";
}

/** Warum ein Anlass ohne Einwilligung nicht geht (für Vorschau und Hilfe). */
export const NEEDS_CONSENT_REASON: Record<Occasion, string | null> = {
  renewal: null,
  review: null,
  cross_sell: "Cross-Selling in eine andere Sparte nur mit Einwilligung",
  birthday: "Geburtstag mit Angebot nur mit Einwilligung",
  empfehlung: "Empfehlungs- oder Bewertungsbitte nur mit Einwilligung",
};

/** Angaben eines Bestandskunden, die für die Entscheidung zählen. */
export type ConsentSubject = {
  phone: string | null;
  email: string | null;
  optOutAt: Date | null;
  emailOptOutAt: Date | null;
  emailConsent: string | null;
  whatsappConsent: string | null;
  /** Auf der Sperrliste (Hash von E-Mail bzw. Telefon): email = nur E-Mail, all = alle Kanäle. */
  suppressed?: { email?: boolean; all?: boolean };
};

/** Einstellungen des Vermittlers. */
export type ConsentSettings = {
  /** Bestätigung zu § 7 Abs. 3 UWG liegt vor. */
  uwgConfirmed: boolean;
};

export type ExclusionReason =
  | "abgemeldet"
  | "keine Mobilnummer"
  | "keine WhatsApp-Einwilligung"
  | "WhatsApp-Einwilligung: nein"
  | "keine E-Mail-Adresse"
  | "E-Mail abgemeldet"
  | "E-Mail-Einwilligung: nein"
  | "keine E-Mail-Einwilligung, Bestätigung zu § 7 Abs. 3 UWG fehlt"
  | "Cross-Selling in eine andere Sparte nur mit Einwilligung"
  | "Geburtstag mit Angebot nur mit Einwilligung"
  | "Empfehlungs- oder Bewertungsbitte nur mit Einwilligung";

export type ChannelDecision = { ok: true; basis: LegalBasis } | { ok: false; reason: ExclusionReason };

const consent = (v: string | null | undefined): ConsentValue => (v === "ja" ? "ja" : v === "nein" ? "nein" : null);

/** Darf dieser Kunde zu diesem Anlass per WhatsApp angeschrieben werden? Strikt: nur mit Opt-in. */
export function whatsappDecision(s: ConsentSubject): ChannelDecision {
  if (s.optOutAt || s.suppressed?.all) return { ok: false, reason: "abgemeldet" };
  if (!s.phone) return { ok: false, reason: "keine Mobilnummer" };
  const c = consent(s.whatsappConsent);
  if (c === "nein") return { ok: false, reason: "WhatsApp-Einwilligung: nein" };
  if (c !== "ja") return { ok: false, reason: "keine WhatsApp-Einwilligung" };
  return { ok: true, basis: "einwilligung" };
}

/** Darf dieser Kunde zu diesem Anlass per E-Mail angeschrieben werden? */
export function emailDecision(s: ConsentSubject, occasion: Occasion, settings: ConsentSettings): ChannelDecision {
  if (s.optOutAt || s.suppressed?.all) return { ok: false, reason: "abgemeldet" };
  if (!s.email) return { ok: false, reason: "keine E-Mail-Adresse" };
  if (s.emailOptOutAt || s.suppressed?.email) return { ok: false, reason: "E-Mail abgemeldet" };
  const c = consent(s.emailConsent);
  if (c === "nein") return { ok: false, reason: "E-Mail-Einwilligung: nein" };
  if (c === "ja") return { ok: true, basis: "einwilligung" };
  // Ohne Einwilligung: nur Bestandskundenwerbung nach § 7 Abs. 3 UWG
  const needs = NEEDS_CONSENT_REASON[occasion];
  if (needs) return { ok: false, reason: needs as ExclusionReason };
  if (!settings.uwgConfirmed) return { ok: false, reason: "keine E-Mail-Einwilligung, Bestätigung zu § 7 Abs. 3 UWG fehlt" };
  return { ok: true, basis: "uwg7_3" };
}

export type ChannelChoice = { channel: Channel; basis: LegalBasis } | { channel: null; reason: ExclusionReason };

/**
 * Kanal je Empfänger: WhatsApp, wenn erlaubt (Mobilnummer, Opt-in, keine Abmeldung), sonst E-Mail, wenn erlaubt.
 * Bei „nur WhatsApp“ bzw. „nur E-Mail“ nur dieser Kanal. Ausschlussgrund: der des bevorzugten Kanals, außer er
 * ist nur „fehlt“ (dann der des Ersatzkanals, der meist mehr sagt).
 */
export function chooseChannel(mode: ChannelMode, s: ConsentSubject, occasion: Occasion, settings: ConsentSettings): ChannelChoice {
  const wa = mode === "email" ? null : whatsappDecision(s);
  if (wa?.ok) return { channel: "whatsapp", basis: wa.basis };
  const mail = mode === "whatsapp" ? null : emailDecision(s, occasion, settings);
  if (mail?.ok) return { channel: "email", basis: mail.basis };
  if (mode === "whatsapp") return { channel: null, reason: (wa as { reason: ExclusionReason }).reason };
  if (mode === "email") return { channel: null, reason: (mail as { reason: ExclusionReason }).reason };
  // Beide nicht möglich: abgemeldet geht vor, sonst der aussagekräftigere Grund der E-Mail
  const waReason = (wa as { reason: ExclusionReason }).reason;
  const mailReason = (mail as { reason: ExclusionReason }).reason;
  if (waReason === "abgemeldet") return { channel: null, reason: waReason };
  return { channel: null, reason: mailReason === "keine E-Mail-Adresse" ? waReason : mailReason };
}

export type AudienceCounts = {
  whatsapp: number;
  email: number;
  /** davon per E-Mail nach § 7 Abs. 3 UWG (ohne Einwilligung) */
  emailUwg: number;
  excluded: Partial<Record<ExclusionReason, number>>;
  excludedTotal: number;
};

/** Zählung für die Vorschau: je Kanal erreichbar und warum andere ausgeschlossen sind. */
export function countAudience(choices: ChannelChoice[]): AudienceCounts {
  const out: AudienceCounts = { whatsapp: 0, email: 0, emailUwg: 0, excluded: {}, excludedTotal: 0 };
  for (const c of choices) {
    if (c.channel === "whatsapp") out.whatsapp++;
    else if (c.channel === "email") {
      out.email++;
      if (c.basis === "uwg7_3") out.emailUwg++;
    } else if (c.channel === null) {
      out.excluded[c.reason] = (out.excluded[c.reason] ?? 0) + 1;
      out.excludedTotal++;
    }
  }
  return out;
}

/**
 * Darf die Bitte um Einwilligung per E-Mail gehen? Sie ist selbst Werbung: nur, wenn ein anderer Weg zulässig ist
 * (E-Mail-Einwilligung oder § 7 Abs. 3 UWG), sonst nur im persönlichen Kontakt (Link kopieren, im Termin).
 */
export function consentRequestByMailAllowed(s: ConsentSubject, settings: ConsentSettings): boolean {
  if (s.optOutAt || s.suppressed?.all || !s.email || s.emailOptOutAt || s.suppressed?.email) return false;
  const c = consent(s.emailConsent);
  if (c === "nein") return false;
  return c === "ja" || settings.uwgConfirmed;
}

/** Text der Einwilligungs-Abfrage (wird so protokolliert). */
export function consentQuestion(advisor: string, channels: Channel[]): string {
  const ways = channels.map((c) => CHANNEL_LABEL[c]).join(" bzw. ");
  return `Ich bin einverstanden, dass ${advisor} mich über passende Versicherungsangebote und Neuigkeiten zu meinen Verträgen per ${ways} informiert. Die Einwilligung kann ich jederzeit widerrufen, zum Beispiel über den Abmeldelink in jeder E-Mail oder mit „Stopp“ per WhatsApp.`;
}
