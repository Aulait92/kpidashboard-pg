// Einwilligung und Kanalwahl je Bestandskunde für Bestandskampagnen (Ole, 14.11.2026, nach rechtlicher
// Vorprüfung, keine Rechtsberatung). Rein, ohne Datenbank (auch im Browser nutzbar) und getestet.
//
// Gilt für BEIDE Kanäle (WhatsApp ist nach herrschender Meinung ebenfalls „elektronische Post“ im Sinne
// von § 7 Abs. 2 Nr. 2 und Abs. 3 UWG):
//   1. Mit Einwilligung für den Kanal: alle Anlässe.
//   2. Ohne Einwilligung, aber mit der Bestätigung des Vermittlers zu § 7 Abs. 3 UWG (Adresse aus einem
//      Vertragsabschluss) UND dem Nachweis je Kunde, dass bei der Erhebung der Adresse auf das Widerspruchsrecht
//      hingewiesen wurde (ExistingCustomer.widerspruchHinweis, seit 15.11.2026; fehlt er, greift Abs. 3 nicht,
//      BGH VI ZR 225/17): nur Anlässe zum selben Bedarf bzw. Vertrag (Ablauf/Wechsel, Jahresgespräch als
//      Vertragscheck). Kein Cross-Selling in andere Sparten (auch nicht zwischen Sachsparten, solange das nicht
//      anwaltlich geklärt ist), kein Geburtstag mit Angebot, keine Empfehlungs- oder Bewertungsbitte (BGH,
//      10.07.2018: auch Werbung). Das gilt nur für E-Mail.
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

/**
 * „Ähnliche“ Ware im Sinne von § 7 Abs. 3 Nr. 2 UWG (eng): nur dieselbe Sparte. Haftpflicht → Zahnzusatz (Kranken)
 * ist nicht ähnlich, Sachsparten untereinander (Hausrat, Wohngebäude, Haftpflicht) gelten bis zur anwaltlichen
 * Klärung ebenfalls nicht als ähnlich. Sparten wie in lib/bestand/rows.normalizeLine.
 */
export function isSimilarLine(owned: string, offered: string): boolean {
  const n = (s: string) => s.trim().toLowerCase();
  return !!n(owned) && n(owned) === n(offered) && n(offered) !== "sonstiges";
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
  /** Nachweis: bei Erhebung der E-Mail-Adresse auf das Widerspruchsrecht hingewiesen (ja | nein | null = unbekannt). */
  widerspruchHinweis?: string | null;
  /** Auf der Sperrliste (Hash von E-Mail bzw. Telefon): email = nur E-Mail, all = alle Kanäle. */
  suppressed?: { email?: boolean; all?: boolean };
  /** Kampagnen-WhatsApp kam mit „kein WhatsApp“ zurück (Meta 131026): künftig nur E-Mail. */
  waUnavailableAt?: Date | null;
  /** Vom Vermittler gesperrt („nicht mehr anschreiben“): keine Kampagnen, wieder entsperrbar. */
  blockedAt?: Date | null;
};

/** Einstellungen des Vermittlers. */
export type ConsentSettings = {
  /** Bestätigung zu § 7 Abs. 3 UWG liegt vor. */
  uwgConfirmed: boolean;
};

export type ExclusionReason =
  | "abgemeldet"
  | typeof BLOCKED_REASON
  | "keine Mobilnummer"
  | "keine WhatsApp-Einwilligung"
  | typeof NO_WHATSAPP_REASON
  | "WhatsApp-Einwilligung: nein"
  | "keine E-Mail-Adresse"
  | "E-Mail abgemeldet"
  | "E-Mail-Einwilligung: nein"
  | "keine E-Mail-Einwilligung, Bestätigung zu § 7 Abs. 3 UWG fehlt"
  | typeof NO_PROOF_REASON
  | "Cross-Selling in eine andere Sparte nur mit Einwilligung"
  | "Geburtstag mit Angebot nur mit Einwilligung"
  | "Empfehlungs- oder Bewertungsbitte nur mit Einwilligung";

/** Vom Vermittler gesperrt (Bestand → Kunde → Mehr → Sperren). */
export const BLOCKED_REASON = "gesperrt";

/** Nummer ist nicht per WhatsApp erreichbar (frühere Kampagne kam mit 131026 zurück). */
export const NO_WHATSAPP_REASON = "nicht per WhatsApp erreichbar";

/** Ohne Nachweis zum Widerspruchshinweis greift § 7 Abs. 3 UWG nicht. */
export const NO_PROOF_REASON = "ohne Nachweis zum Widerspruchshinweis, nur mit Einwilligung";

/** Hat dieser Kunde einen Nachweis, dass er bei der Erhebung der Adresse auf sein Widerspruchsrecht hingewiesen wurde? */
export function hasUwgProof(s: Pick<ConsentSubject, "widerspruchHinweis">): boolean {
  return s.widerspruchHinweis === "ja";
}

/**
 * Für die Zählung „X ohne Nachweis, nur mit Einwilligung“: Kunde mit E-Mail, nicht abgemeldet, Einwilligung
 * unbekannt und ohne Nachweis zum Widerspruchshinweis (per E-Mail also nur nach einer Einwilligung erreichbar).
 */
export function lacksUwgProof(s: ConsentSubject): boolean {
  if (!s.email || s.blockedAt || s.optOutAt || s.emailOptOutAt || s.suppressed?.all || s.suppressed?.email) return false;
  return consent(s.emailConsent) === null && !hasUwgProof(s);
}

export type ChannelDecision = { ok: true; basis: LegalBasis } | { ok: false; reason: ExclusionReason };

const consent = (v: string | null | undefined): ConsentValue => (v === "ja" ? "ja" : v === "nein" ? "nein" : null);

/** Darf dieser Kunde zu diesem Anlass per WhatsApp angeschrieben werden? Strikt: nur mit Opt-in. */
export function whatsappDecision(s: ConsentSubject): ChannelDecision {
  if (s.blockedAt) return { ok: false, reason: BLOCKED_REASON };
  if (s.optOutAt || s.suppressed?.all) return { ok: false, reason: "abgemeldet" };
  if (!s.phone) return { ok: false, reason: "keine Mobilnummer" };
  if (s.waUnavailableAt) return { ok: false, reason: NO_WHATSAPP_REASON };
  const c = consent(s.whatsappConsent);
  if (c === "nein") return { ok: false, reason: "WhatsApp-Einwilligung: nein" };
  if (c !== "ja") return { ok: false, reason: "keine WhatsApp-Einwilligung" };
  return { ok: true, basis: "einwilligung" };
}

/** Darf dieser Kunde zu diesem Anlass per E-Mail angeschrieben werden? */
export function emailDecision(s: ConsentSubject, occasion: Occasion, settings: ConsentSettings): ChannelDecision {
  if (s.blockedAt) return { ok: false, reason: BLOCKED_REASON };
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
  if (!hasUwgProof(s)) return { ok: false, reason: NO_PROOF_REASON };
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
  if (waReason === BLOCKED_REASON || waReason === "abgemeldet") return { channel: null, reason: waReason };
  return { channel: null, reason: mailReason === "keine E-Mail-Adresse" ? waReason : mailReason };
}

export type AudienceCounts = {
  whatsapp: number;
  email: number;
  /** davon per E-Mail nach § 7 Abs. 3 UWG (ohne Einwilligung) */
  emailUwg: number;
  /** nicht per WhatsApp erreicht und ohne Nachweis zum Widerspruchshinweis: per E-Mail nur mit Einwilligung */
  noProof: number;
  excluded: Partial<Record<ExclusionReason, number>>;
  excludedTotal: number;
};

/**
 * Zählung für die Vorschau: je Kanal erreichbar und warum andere ausgeschlossen sind. subjects (gleiche
 * Reihenfolge wie choices) zählt zusätzlich, wer ohne Nachweis zum Widerspruchshinweis nur mit Einwilligung geht.
 */
export function countAudience(choices: ChannelChoice[], subjects: ConsentSubject[] = []): AudienceCounts {
  const out: AudienceCounts = { whatsapp: 0, email: 0, emailUwg: 0, noProof: 0, excluded: {}, excludedTotal: 0 };
  choices.forEach((c, i) => {
    const s = subjects[i];
    if (s && c.channel !== "whatsapp" && lacksUwgProof(s)) out.noProof++;
  });
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
  if (s.blockedAt || s.optOutAt || s.suppressed?.all || !s.email || s.emailOptOutAt || s.suppressed?.email) return false;
  const c = consent(s.emailConsent);
  if (c === "nein") return false;
  return c === "ja" || (settings.uwgConfirmed && hasUwgProof(s));
}

/** Quelle des Nachweises zum Widerspruchshinweis (für Protokoll und Anzeige). */
export const HINWEIS_SOURCE_LABEL: Record<string, string> = {
  import: "aus der Importdatei",
  import_pauschal: "Bestätigung beim Import",
  bestand_pauschal: "Bestätigung für den Bestand",
  vermittler: "von Hand",
};

/** Text der Einwilligungs-Abfrage (wird so protokolliert). */
export function consentQuestion(advisor: string, channels: Channel[]): string {
  const ways = channels.map((c) => CHANNEL_LABEL[c]).join(" bzw. ");
  return `Ich bin einverstanden, dass ${advisor} mich über passende Versicherungsangebote und Neuigkeiten zu meinen Verträgen per ${ways} informiert. Die Einwilligung kann ich jederzeit widerrufen, zum Beispiel über den Abmeldelink in jeder E-Mail oder mit „Stopp“ per WhatsApp.`;
}

// ── Paket 3 (20.11.2026): Einwilligung als Umsatzhebel ──────────────────────────────────────────────────────

/** Abstand zwischen zwei Bitten um Einwilligung per E-Mail an denselben Kunden (wie COOLDOWN_DAYS der Kampagnen). */
export const CONSENT_ASK_GAP_DAYS = 30;
/** Ziel für den Anteil „Für Angebote erreichbar“ (Plan Paket 3). */
export const OFFER_REACH_GOAL = 0.4;

/**
 * „Für Angebote erreichbar“: zu allen Anlässen anschreibbar, also mit Einwilligung für einen Kanal (WhatsApp mit
 * Opt-in oder E-Mail mit Einwilligung). § 7 Abs. 3 UWG allein reicht dafür nicht (nur derselbe Bedarf).
 */
export function reachableForOffers(s: ConsentSubject): boolean {
  if (whatsappDecision(s).ok) return true;
  if (s.blockedAt || s.optOutAt || s.suppressed?.all || !s.email || s.emailOptOutAt || s.suppressed?.email) return false;
  return consent(s.emailConsent) === "ja";
}

/** Zählbar für die Quote: nicht abgemeldet oder gesperrt und mit mindestens einem Kontaktweg. */
export function countsForReach(s: ConsentSubject): boolean {
  if (s.blockedAt || s.optOutAt || s.suppressed?.all) return false;
  const mailOpen = !!s.email && !s.emailOptOutAt && !s.suppressed?.email;
  return mailOpen || !!s.phone;
}

/**
 * Darf dieser Kunde in der Sammelanfrage per E-Mail um Einwilligung gebeten werden? Nur wer noch nicht für Angebote
 * erreichbar ist, die Bitte per E-Mail bekommen darf (consentRequestByMailAllowed: Werbeerlaubnis per E-Mail) und in
 * den letzten CONSENT_ASK_GAP_DAYS Tagen nicht gefragt wurde. Abgemeldete, Gesperrte und „nein“ fallen damit raus.
 */
export function consentAskEligible(s: ConsentSubject, settings: ConsentSettings, lastAskedAt: Date | null, now: Date): boolean {
  if (reachableForOffers(s)) return false;
  if (!consentRequestByMailAllowed(s, settings)) return false;
  return !lastAskedAt || now.getTime() - lastAskedAt.getTime() >= CONSENT_ASK_GAP_DAYS * 86_400_000;
}

/**
 * P.S. mit Einwilligungslink in einer Kampagnen-Mail (§ 7 Abs. 3 UWG, Plan Paket 3): nur wenn die Bitte per E-Mail
 * erlaubt ist und noch eine Einwilligung fehlt (E-Mail, oder WhatsApp bei vorhandener Mobilnummer). Nicht in
 * Geburtstags- und Empfehlungs-Mails (eigener Ton bzw. eigener Link), nie in Double-Opt-in- oder Service-Mails
 * (die laufen nicht über campaignMailFor).
 */
export function wantsConsentPs(s: ConsentSubject, settings: ConsentSettings, occasion: Occasion): boolean {
  if (occasion === "birthday" || occasion === "empfehlung") return false;
  if (!consentRequestByMailAllowed(s, settings)) return false;
  const mailMissing = consent(s.emailConsent) !== "ja";
  const waMissing = !!s.phone && !s.waUnavailableAt && consent(s.whatsappConsent) === null;
  return mailMissing || waMissing;
}

export type OfferReach = {
  /** zählbare Kunden (nicht abgemeldet oder gesperrt, mit Kontaktweg) */
  total: number;
  /** davon für Angebote erreichbar */
  reachable: number;
  /** Anteil 0..1 (0 ohne zählbare Kunden) */
  share: number;
  /** ohne Einwilligung, aber mit Kontaktweg (persönlicher Link möglich) */
  withoutConsent: number;
  /** davon per E-Mail anfragbar (Sammelanfrage) */
  askable: number;
};

/** Kennzahl „Für Angebote erreichbar“ und Zahl der per E-Mail anfragbaren Kunden. Rein. */
export function offerReach(rows: { subject: ConsentSubject; lastAskedAt: Date | null }[], settings: ConsentSettings, now: Date): OfferReach {
  let total = 0;
  let reachable = 0;
  let askable = 0;
  for (const r of rows) {
    if (!countsForReach(r.subject)) continue;
    total++;
    if (reachableForOffers(r.subject)) reachable++;
    else if (consentAskEligible(r.subject, settings, r.lastAskedAt, now)) askable++;
  }
  return { total, reachable, share: total ? reachable / total : 0, withoutConsent: total - reachable, askable };
}
