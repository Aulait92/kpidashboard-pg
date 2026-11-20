// Erinnerung vor Ablauf des Abschlussbonus (Ole, 18.11.2026, „Ja bauen“). Reine Funktionen ohne Datenbank:
// Wer bekommt was wann, die Mailtexte und die WhatsApp-Vorlagen. Versand im WhatsApp-Cron:
// lib/vertrieb/bonus-erinnerung-server.ts.
//
// Nur verschickte Angebote (per App gesendet oder „Als verschickt markieren“) mit Bonus und Frist in der Zukunft.
// Nie bei Entwurf, angenommen, abgelehnt, abgelaufen, ersetzt, neuerer Version oder Testangeboten.
// Abfolge (Berliner Zeit, je Schritt höchstens einmal, Merkfelder am Angebot):
// - Tag vor Ablauf, ab 9 Uhr: Mail „Noch bis morgen“ (nur, wenn die Frist mindestens 3 Tage nach dem Versand liegt).
// - Letzter Tag, ab 9 Uhr: Mail „Heute bis 23:59 Uhr“ mit Annahme-Link und Push an Ole („Bonus läuft heute ab“).
// - Letzter Tag, ab 13 Uhr: eine WhatsApp in Oles Namen, nur mit „WhatsApp erlaubt“ und freigegebener Vorlage.
// Alle Schritte nur, wenn das Angebot vor dem letzten Tag verschickt wurde (sonst kam die Angebotsmail gerade erst).
// Versäumte Schritte (Cron ausgefallen) werden nur bis 19 Uhr am selben Tag nachgeholt.
// Stopp: Annahme, Ablehnung, Antwort per Mail oder WhatsApp (nur Mail und WhatsApp, der Push an Ole bleibt),
// Abmeldung (Sperrliste, STOPP per WhatsApp).

import { abschlussBonusJetzt, addDaysIso, berlinTodayIso, eur, type AbschlussBonusQuelle } from "@/lib/offer-pricing";
import { fromDayKey } from "@/lib/vertrieb/dates";

export const MAIL_AB_STUNDE = 9;
export const WHATSAPP_AB_STUNDE = 13;
export const BIS_STUNDE = 19;
/** Mail am Tag vor Ablauf nur, wenn die Frist mindestens so viele Tage nach dem Versand liegt. */
export const VORAB_MIN_TAGE = 3;

export type BonusSchritt = "vorab" | "letzter" | "push" | "whatsapp";

export type BonusAngebot = AbschlussBonusQuelle & {
  status: string;
  isTest: boolean;
  validUntil: Date;
  declinedAt: Date | null;
  acceptedAt: Date | null;
  bonusMailVorabAt: Date | null;
  bonusMailLetzterAt: Date | null;
  bonusPushAt: Date | null;
  bonusWhatsAppAt: Date | null;
};

/** Grund, keine Bonus-Erinnerung (mehr) zu senden, oder null. */
export function bonusErinnerungStopp(o: BonusAngebot, now: Date, opts: { ersetzt?: boolean } = {}): string | null {
  if (o.isTest) return "Testangebot";
  if (o.status !== "sent") return `Status ${o.status}`;
  if (o.acceptedAt) return "angenommen";
  if (o.declinedAt) return "abgelehnt";
  if (o.validUntil.getTime() < now.getTime()) return "abgelaufen";
  if (opts.ersetzt) return "neuere Version";
  const bonus = abschlussBonusJetzt(o, now);
  if (!bonus || bonus.gesichert) return "kein Bonus offen";
  return null;
}

const tageZwischen = (von: string, bis: string) => Math.round((Date.parse(`${bis}T12:00:00Z`) - Date.parse(`${von}T12:00:00Z`)) / 86_400_000);

export type BonusPlanSchritt = {
  schritt: BonusSchritt;
  /** Berliner Kalendertag */
  tag: string;
  /** Ab diesem Zeitpunkt sendet der Cron (9 bzw. 13 Uhr Berlin) */
  ab: Date;
  /** Bis hier wird nachgeholt (19 Uhr Berlin am selben Tag), danach entfällt der Schritt */
  bis: Date;
};

const uhr = (h: number) => `${String(h).padStart(2, "0")}:00`;

/**
 * Noch offene Schritte mit Zeitfenster (ohne Stopp-Prüfung, siehe {@link bonusErinnerungStopp}). Grundlage für den
 * Versand ({@link faelligeBonusSchritte}) und für die Übersicht „Geplante Nachrichten“ (lib/vertrieb/geplante-nachrichten.ts).
 */
export function bonusPlan(o: BonusAngebot, now: Date): BonusPlanSchritt[] {
  const bonus = abschlussBonusJetzt(o, now);
  if (!bonus) return [];
  const fristTag = berlinTodayIso(bonus.bis);
  const sendTag = berlinTodayIso(o.sentAt ?? o.createdAt);
  if (sendTag >= fristTag) return [];
  const schritt = (s: BonusSchritt, tag: string, abStunde: number): BonusPlanSchritt => ({ schritt: s, tag, ab: fromDayKey(tag, uhr(abStunde)), bis: fromDayKey(tag, uhr(BIS_STUNDE)) });
  const out: BonusPlanSchritt[] = [];
  if (!o.bonusMailVorabAt && tageZwischen(sendTag, fristTag) >= VORAB_MIN_TAGE) out.push(schritt("vorab", addDaysIso(fristTag, -1), MAIL_AB_STUNDE));
  if (!o.bonusMailLetzterAt) out.push(schritt("letzter", fristTag, MAIL_AB_STUNDE));
  if (!o.bonusPushAt) out.push(schritt("push", fristTag, MAIL_AB_STUNDE));
  if (!o.bonusWhatsAppAt) out.push(schritt("whatsapp", fristTag, WHATSAPP_AB_STUNDE));
  return out;
}

/** Jetzt fällige Schritte (ohne Stopp-Prüfung, siehe {@link bonusErinnerungStopp}). */
export function faelligeBonusSchritte(o: BonusAngebot, now: Date): BonusSchritt[] {
  const t = now.getTime();
  return bonusPlan(o, now)
    .filter((s) => s.ab.getTime() <= t && t < s.bis.getTime())
    .map((s) => s.schritt);
}

/** „Donnerstag, 19. November“ */
export function fristDatum(iso: string): string {
  return new Intl.DateTimeFormat("de-DE", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(`${iso}T12:00:00Z`));
}

// ─── Mails (ohne Gedankenstriche, Sie oder Du nach der Anrede am Angebot) ──────────────

export type BonusMailText = { subject: string; paragraphs: string[]; button: string };

export function bonusMail(art: "vorab" | "letzter", o: { betrag: number; fristIso: string; number: string; du: boolean; spaeterZahlen: boolean }): BonusMailText {
  const b = eur(o.betrag);
  const du = o.du;
  const wann = art === "vorab" ? `noch bis morgen, ${fristDatum(o.fristIso)}, 23:59 Uhr` : "nur noch heute bis 23:59 Uhr";
  const p1 = du
    ? `kurze Erinnerung zu unserem Angebot ${o.number}: Dein Abschlussbonus von ${b} auf die Einrichtung gilt ${wann}.`
    : `kurze Erinnerung zu unserem Angebot ${o.number}: Ihr Abschlussbonus von ${b} auf die Einrichtung gilt ${wann}.`;
  // „Später zahlen“ nur, wenn es am Angebot erlaubt ist; sonst zählt die Zahlung bis zur Frist
  const p2 = o.spaeterZahlen
    ? du
      ? "Du kannst jetzt annehmen und erst später zahlen."
      : "Sie können jetzt annehmen und erst später zahlen."
    : du
      ? "Dafür nimmst du das Angebot bis dahin an und richtest die Zahlung der Einrichtung ein."
      : "Dafür nehmen Sie das Angebot bis dahin an und richten die Zahlung der Einrichtung ein.";
  const p3 = du ? "Wenn noch etwas offen ist, antworte einfach auf diese E-Mail." : "Wenn noch etwas offen ist, antworten Sie einfach auf diese E-Mail.";
  return {
    subject: art === "vorab" ? `Noch bis morgen: ${b} Abschlussbonus` : `Heute bis 23:59 Uhr: ${b} Abschlussbonus`,
    paragraphs: [p1, p2, p3],
    button: art === "vorab" ? "Angebot ansehen" : "Angebot annehmen",
  };
}

// ─── WhatsApp-Vorlagen (Support-Nummer, Absender Ole, Kategorie UTILITY versucht) ──────────
// Je Anrede und mit bzw. ohne „später zahlen“ eine Vorlage (Meta erlaubt keine leeren Platzhalter).
// Eingereicht im WhatsApp-Cron mit den übrigen Vorlagen der Support-Nummer (SUPPORT_TEMPLATES in
// lib/vertrieb/termin-whatsapp.ts). Bis zur Freigabe (und solange Meta sie als MARKETING einstuft) geht keine WhatsApp raus.
// Kein Punkt direkt hinter dem Link (sonst gehört er in manchen Apps zum Link).

export const BONUS_TEMPLATE_PURPOSE = "vertrieb_bonus";
export const BONUS_TEMPLATE_SIE = "pg_vertrieb_bonus_sie_v1";
export const BONUS_TEMPLATE_DU = "pg_vertrieb_bonus_du_v1";
export const BONUS_TEMPLATE_SPAETER_SIE = "pg_vertrieb_bonus_spaeter_sie_v1";
export const BONUS_TEMPLATE_SPAETER_DU = "pg_vertrieb_bonus_spaeter_du_v1";

function bonusBody(du: boolean, spaeter: boolean): string {
  const bonus = du ? "Dein Bonus" : "Ihr Bonus";
  const spaeterSatz = spaeter ? (du ? " Du kannst jetzt annehmen und erst später zahlen." : " Sie können jetzt annehmen und erst später zahlen.") : "";
  const schluss = du ? "Wenn noch etwas offen ist, schreib mir einfach hier." : "Wenn noch etwas offen ist, schreiben Sie mir einfach hier.";
  return `Hallo {{1}}, hier ist Ole. Nur kurz, damit es nicht untergeht: ${bonus} von {{2}} aufs Setup gilt noch bis heute Abend. Hier der Link: {{3}}${spaeterSatz} ${schluss}`;
}

export const BONUS_TEMPLATE_EXAMPLES_SIE = ["Herr Mustermann", "300 €", "https://app.performancegrowth.de/angebot/abc"];
export const BONUS_TEMPLATE_EXAMPLES_DU = ["Max", "300 €", "https://app.performancegrowth.de/angebot/abc"];

export const BONUS_VORLAGEN = [
  { name: BONUS_TEMPLATE_SIE, body: bonusBody(false, false), examples: BONUS_TEMPLATE_EXAMPLES_SIE, purpose: BONUS_TEMPLATE_PURPOSE, du: false, spaeter: false },
  { name: BONUS_TEMPLATE_DU, body: bonusBody(true, false), examples: BONUS_TEMPLATE_EXAMPLES_DU, purpose: BONUS_TEMPLATE_PURPOSE, du: true, spaeter: false },
  { name: BONUS_TEMPLATE_SPAETER_SIE, body: bonusBody(false, true), examples: BONUS_TEMPLATE_EXAMPLES_SIE, purpose: BONUS_TEMPLATE_PURPOSE, du: false, spaeter: true },
  { name: BONUS_TEMPLATE_SPAETER_DU, body: bonusBody(true, true), examples: BONUS_TEMPLATE_EXAMPLES_DU, purpose: BONUS_TEMPLATE_PURPOSE, du: true, spaeter: true },
] as const;

/** Passende Vorlage, wenn sie nutzbar ist (freigegeben und nicht als MARKETING eingestuft), sonst null. */
export function bonusVorlage(du: boolean, spaeter: boolean, nutzbar: (name: string, version: 1 | 2) => boolean): { name: string; body: string } | null {
  const v = BONUS_VORLAGEN.find((x) => x.du === du && x.spaeter === spaeter)!;
  // Version 2 = Freigabe allein reicht nicht, MARKETING wird nicht genutzt (wie bei den persönlichen Vorlagen von Ole)
  return nutzbar(v.name, 2) ? { name: v.name, body: v.body } : null;
}

// ─── „WhatsApp erlaubt“ am Vertriebskontakt ─────────────────────────────

export type WhatsappErlaubtQuelle = "manuell" | "termin" | "whatsapp" | null;

/** Von Hand gesetzt (true/false) gilt immer; sonst automatisch aus Terminnachrichten bzw. eigener WhatsApp. */
export function whatsappErlaubtAus(o: { manuell: boolean | null; terminWhatsApp: boolean; eingehend: boolean }): { erlaubt: boolean; quelle: WhatsappErlaubtQuelle } {
  if (o.manuell != null) return { erlaubt: o.manuell, quelle: "manuell" };
  if (o.terminWhatsApp) return { erlaubt: true, quelle: "termin" };
  if (o.eingehend) return { erlaubt: true, quelle: "whatsapp" };
  return { erlaubt: false, quelle: null };
}

export const WHATSAPP_ERLAUBT_HINWEIS: Record<Exclude<WhatsappErlaubtQuelle, null>, string> = {
  manuell: "von Hand gesetzt",
  termin: "automatisch, Termin per WhatsApp",
  whatsapp: "automatisch, hat per WhatsApp geschrieben",
};
