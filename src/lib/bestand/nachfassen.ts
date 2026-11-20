// Ein automatisches Nachfassen je Kampagnen-Empfänger (Bestand Paket 4, 20.11.2026).
//
// Regeln (Recht, Plan docs/ux/2026-11-19-bestand-champions.md „Rechtliche Auflagen“):
// - höchstens eine Erinnerung je Empfänger, frühestens 5 Werktage (Mo bis Fr, Berliner Zeit) nach dem ersten Versand;
// - gleicher Anlass und gleiche Rechtsgrundlage wie die erste Nachricht: Das Nachfassen ist ein Schritt der Kampagne,
//   kein neuer Anlass. Vor dem Versand dieselben Prüfungen wie beim ersten Versand (Sperre, Abmeldung, Sperrliste,
//   whatsappDecision/emailDecision für den Anlass der Kampagne);
// - keine Erinnerung nach Antwort (auch „Kein Bedarf“), „Stopp“, Abmeldung, Unzustellbarkeit, beendeter Kampagne oder
//   ausgeschaltetem Schalter; nicht bei Geburtstag und Empfehlungsbitte;
// - WhatsApp außerhalb des 24-h-Fensters nur mit freigegebener Vorlage (gibt es für das Nachfassen noch nicht), sonst
//   per E-Mail, wenn die erlaubt ist, sonst gar nicht;
// - Ausnahme vom 30-Tage-Abstand (COOLDOWN_DAYS in campaigns.ts): Die Erinnerung darf innerhalb der 30 Tage nach der
//   ersten Nachricht derselben Kampagne kommen, aber nur, wenn seitdem keine andere Kampagne geschrieben hat. Mit der
//   Erinnerung beginnt der 30-Tage-Abstand neu (lastCampaignAt);
// - spätestens FOLLOW_UP_MAX_DAYS nach dem ersten Versand, danach nicht mehr (kein „Nachfassen“ nach Wochen).
// Texte: beide Ansprachen, ohne Gedankenstriche, ohne Druck, nie Euro, nie „Garantie“.
// Rein, ohne Datenbank (Tests: tests/unit/bestand-nachfassen.test.ts).

import { a, anredeZeile, type AnredeKontakt, type Ansprache } from "@/lib/ansprache";
import { emailDecision, whatsappDecision, type ChannelMode, type ConsentSettings, type ConsentSubject } from "@/lib/bestand/einwilligung";
import type { Occasion } from "@/lib/bestand/campaigns";

/** Werktage bis zur Erinnerung. */
export const FOLLOW_UP_WORKDAYS = 5;
/** Danach keine Erinnerung mehr (Tage nach dem ersten Versand). */
export const FOLLOW_UP_MAX_DAYS = 21;
/** Anlässe mit Erinnerung. Geburtstag (Glückwunsch) und Empfehlungsbitte bekommen keine. */
export const FOLLOW_UP_OCCASIONS: readonly Occasion[] = ["cross_sell", "review", "renewal"];
/** Gibt es eine von Meta freigegebene WhatsApp-Vorlage für das Nachfassen? Noch nicht (templates.ts unverändert). */
export const FOLLOW_UP_WA_TEMPLATE = false;
/** Beschriftung des Schalters in der Kampagne. */
export const FOLLOW_UP_LABEL = `Nach ${FOLLOW_UP_WORKDAYS} Werktagen einmal erinnern`;

const DAY = 86_400_000;

function berlinWeekday(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", weekday: "short" }).format(d);
}

/** Zeitpunkt n Werktage (Mo bis Fr, Berliner Zeit) nach `from`, gleiche Uhrzeit. Feiertage zählen als Werktag. */
export function addWorkdays(from: Date, n: number): Date {
  let t = from.getTime();
  let left = n;
  while (left > 0) {
    t += DAY;
    const wd = berlinWeekday(new Date(t));
    if (wd !== "Sat" && wd !== "Sun") left--;
  }
  return new Date(t);
}

/** Ab wann darf erinnert werden? */
export function followUpDueAt(sentAt: Date): Date {
  return addWorkdays(sentAt, FOLLOW_UP_WORKDAYS);
}

export type FollowUpInput = {
  occasion: string;
  campaign: { followUp: boolean; status: string; channelMode: ChannelMode };
  recipient: { status: string; sentAt: Date | null; repliedAt: Date | null; optOutAt: Date | null; bouncedAt: Date | null; followUpAt: Date | null };
  /** Kunde mit Sperrliste (subjectOf in einwilligung.ts) */
  subject: ConsentSubject;
  settings: ConsentSettings;
  /** Letzte Kampagnen-Nachricht an diesen Kunden (ExistingCustomer.lastCampaignAt) */
  lastCampaignAt: Date | null;
  /** 24-h-Fenster bei WhatsApp offen (der Kunde hat selbst geschrieben) */
  waWindowOpen: boolean;
  now: Date;
};

export type FollowUpDecision = { channel: "whatsapp" | "email" } | { channel: null; reason: string };

/** Darf diesem Empfänger jetzt erinnert werden, und über welchen Kanal? Rein. */
export function followUpDecision(x: FollowUpInput): FollowUpDecision {
  const no = (reason: string): FollowUpDecision => ({ channel: null, reason });
  const r = x.recipient;
  if (!FOLLOW_UP_OCCASIONS.includes(x.occasion as Occasion)) return no("Anlass ohne Erinnerung");
  if (!x.campaign.followUp) return no("Erinnerung aus");
  // Pausiert (von Hand oder Kontingent): Erinnerungen warten mit; beendet: followUp ist dann aus (endCampaign)
  if (x.campaign.status !== "running" && x.campaign.status !== "done") return no("Kampagne pausiert");
  if (r.followUpAt) return no("schon erinnert");
  if (r.status !== "sent" || r.repliedAt) return no("geantwortet oder nicht verschickt");
  if (r.optOutAt) return no("abgemeldet");
  if (r.bouncedAt) return no("unzustellbar");
  if (!r.sentAt) return no("nicht verschickt");
  if (x.now < followUpDueAt(r.sentAt)) return no("noch nicht fällig");
  if (x.now.getTime() - r.sentAt.getTime() > FOLLOW_UP_MAX_DAYS * DAY) return no("zu lange her");
  // Ausnahme vom 30-Tage-Abstand nur für diese Kampagne: Hat seitdem eine andere Kampagne geschrieben, keine Erinnerung
  if (x.lastCampaignAt && x.lastCampaignAt.getTime() > r.sentAt.getTime() + 60_000) return no("seitdem andere Kampagne");
  const mode = x.campaign.channelMode;
  if (mode !== "email") {
    const wa = whatsappDecision(x.subject);
    if (wa.ok && (x.waWindowOpen || FOLLOW_UP_WA_TEMPLATE)) return { channel: "whatsapp" };
  }
  if (mode !== "whatsapp") {
    const mail = emailDecision(x.subject, x.occasion as Occasion, x.settings);
    if (mail.ok) return { channel: "email" };
    return no(mail.reason);
  }
  const wa = whatsappDecision(x.subject);
  return no(wa.ok ? "WhatsApp nur im offenen Fenster" : wa.reason);
}

/** Wochentag der ersten Nachricht („Dienstag“). */
export function wochentag(d: Date): string {
  return new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "long" }).format(d);
}

/** Erinnerung per WhatsApp (nur im offenen 24-h-Fenster). Ohne Druck, ohne Gedankenstriche. */
export function followUpText(kontakt: AnredeKontakt | null, an: Ansprache, sentAt: Date, terminlink: string | null): string {
  const hi = anredeZeile(an, kontakt).replace(/,$/, "");
  const termin = terminlink ? ` Termin wählen: ${terminlink}` : a(an, " Dann antworte einfach mit Ja.", " Dann antworten Sie einfach mit Ja.");
  return `${hi}, kurz nachgefragt zu meiner Nachricht vom ${wochentag(sentAt)}: ${a(an, "Passt dir ein kurzes Telefonat?", "Passt Ihnen ein kurzes Telefonat?")}${termin} Kein Bedarf? Dann reicht ein kurzes Nein.`;
}

/** Erinnerung per E-Mail: Betreff und Text (Fuß mit Abmeldelink und Impressum kommt beim Versand dazu). */
export function followUpMail(o: { kontakt: AnredeKontakt | null; an: Ansprache; sentAt: Date; terminlink: string | null; subject: string; meinname: string }): { subject: string; body: string } {
  const { an } = o;
  const zeilen = [
    anredeZeile(an, o.kontakt),
    "",
    `kurz nachgefragt zu meiner Nachricht vom ${wochentag(o.sentAt)}: ${a(an, "Passt dir ein kurzes Telefonat?", "Passt Ihnen ein kurzes Telefonat?")}`,
    "",
    ...(o.terminlink ? [`Termin wählen: ${o.terminlink}`, a(an, "Oder antworte einfach mit Ja auf diese E-Mail.", "Oder antworten Sie einfach mit Ja auf diese E-Mail.")] : [a(an, "Dann antworte einfach mit Ja auf diese E-Mail.", "Dann antworten Sie einfach mit Ja auf diese E-Mail.")]),
    "",
    a(an, "Kein Bedarf? Dann reicht ein kurzes Nein. Falls du schon geantwortet hast: danke, dann hat sich diese Nachricht erledigt.", "Kein Bedarf? Dann reicht ein kurzes Nein. Falls Sie schon geantwortet haben: danke, dann hat sich diese Nachricht erledigt."),
    "",
    "Viele Grüße",
    o.meinname,
  ];
  const subject = `Kurz nachgefragt: ${o.subject.replace(/^(Kurz nachgefragt:\s*)+/i, "")}`;
  return { subject, body: zeilen.join("\n") };
}

/** Zählt eine Antwort als „nach Erinnerung“? */
export function replyAfterFollowUp(r: { repliedAt: Date | null; followUpAt: Date | null }): boolean {
  return !!r.repliedAt && !!r.followUpAt && r.repliedAt.getTime() >= r.followUpAt.getTime();
}
