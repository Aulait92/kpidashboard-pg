// SMS ohne E-Mail (Ole, 22.11.2026: „SMS einschalten, E-Mail bleibt aus, ja, aber Rückruf nur zu Geschäftszeiten“).
// Kunden mit ausgeschalteten E-Mail-Funktionen (Customer.mailFeaturesOff, z. B. Allianz-Agenturen) bekamen bei „kein
// WhatsApp“ (Meta 131026) bisher gar nichts. Jetzt läuft die Strecke (lib/mail-strecke/server.ts) dort nur mit SMS:
// höchstens 2 (sofort bzw. zur nächsten Geschäftszeit, die zweite nach 2 Geschäftstagen), Link auf die Antwortseite
// /t/<token> (Termin mit einem Klick, Lead bekannt) und Rückruf zu Geschäftszeiten. Nur Handynummern.
// Rechtliche Prüfung und Auflagen: docs/recht/2026-11-22-sms-ohne-whatsapp.md. Rein, getestet (tests/unit/nur-sms.test.ts).

import { a, type Ansprache } from "@/lib/ansprache";
import { ohneGedankenstriche } from "@/lib/gedankenstriche";
import { isWorkdayKey } from "@/lib/vertrieb/spaeter";
import type { VermittlerName } from "@/lib/vermittler-nennung";
import { anfrageThema } from "@/lib/mail-strecke/texte";

/** Schalter: Standard an; STRECKE_NUR_SMS=aus schaltet die SMS für Kunden ohne E-Mail-Funktionen ab. */
export function nurSmsAn(env: Record<string, string | undefined> = process.env): boolean {
  return !/^(0|aus|off|false|nein)$/i.test((env.STRECKE_NUR_SMS ?? "").trim());
}

/** Geschäftszeiten: Wochentage (0 = So … 6 = Sa) und Stunden [von, bis) in Berliner Zeit. */
export type Geschaeftszeiten = { tage: number[]; von: number; bis: number };

/** Ohne eigene Zeiten: Mo bis Fr 9 bis 18 Uhr (wie lib/onboarding-cron.ts GESCHAEFTSZEIT). */
export const GESCHAEFTSZEITEN_STANDARD: Geschaeftszeiten = { tage: [1, 2, 3, 4, 5], von: 9, bis: 18 };

const minuten = (hhmm: string) => (hhmm === "24:00" ? 1440 : Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)));

/**
 * Geschäftszeiten aus den Zeiten, zu denen Leads Termine buchen dürfen (CalendarLeadTimes.schedule des
 * Agentur-Kalenders, lib/calendar/lead-times.ts): Tage mit Zeiten, frühester Beginn bis spätestes Ende, begrenzt auf 8 bis
 * 20 Uhr. Ohne Zeitplan, ohne Werktag oder bei weniger als 3 Stunden: Standard Mo bis Fr 9 bis 18 Uhr.
 */
export function geschaeftszeitenAusPlan(schedule: { days?: Record<number, [string, string][]> } | null | undefined): Geschaeftszeiten {
  const days = schedule?.days ?? {};
  const tage: number[] = [];
  let von = 1440;
  let bis = 0;
  for (let d = 0; d <= 6; d++) {
    const r = (days[d] ?? []).filter((x) => Array.isArray(x) && /^\d\d:\d\d$/.test(x[0]) && /^\d\d:\d\d$/.test(x[1]));
    if (!r.length) continue;
    tage.push(d);
    for (const [f, t] of r) {
      von = Math.min(von, minuten(f));
      bis = Math.max(bis, minuten(t));
    }
  }
  const v = Math.max(8, Math.floor(von / 60));
  const b = Math.min(20, Math.ceil(bis / 60));
  if (!tage.some((d) => d >= 1 && d <= 5) || b - v < 3) return GESCHAEFTSZEITEN_STANDARD;
  return { tage, von: v, bis: b };
}

const KURZ = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

/** „Mo bis Fr, 9 bis 18 Uhr“ (ohne Gedankenstriche). */
export function geschaeftszeitText(g: Geschaeftszeiten): string {
  const t = [...g.tage].sort((x, y) => x - y);
  const zusammen = t.length > 2 && t.every((d, i) => i === 0 || d === t[i - 1] + 1);
  const tage = zusammen ? `${KURZ[t[0]]} bis ${KURZ[t[t.length - 1]]}` : t.map((d) => KURZ[d]).join(", ");
  return `${tage}, ${g.von} bis ${g.bis} Uhr`;
}

const berlinTag = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const berlinStunde = (d: Date) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(d));
const wochentag = (tag: string) => new Date(`${tag}T12:00:00Z`).getUTCDay();
const naechsterTag = (tag: string) => new Date(Date.parse(`${tag}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** Geschäftstag: Wochentag mit Geschäftszeiten und (Mo bis Fr) kein bundesweiter Feiertag. */
export function istGeschaeftstag(tag: string, g: Geschaeftszeiten): boolean {
  const wd = wochentag(tag);
  if (!g.tage.includes(wd)) return false;
  return wd === 0 || wd === 6 ? true : isWorkdayKey(tag);
}

/** Jetzt Geschäftszeit (Berlin)? Nur dann geht eine SMS raus, sonst wartet sie bis zum nächsten Fenster. */
export function imGeschaeftsfenster(now: Date, g: Geschaeftszeiten): boolean {
  const h = berlinStunde(now);
  return istGeschaeftstag(berlinTag(now), g) && h >= g.von && h < g.bis;
}

/** Zweite SMS fällig? Ab dem zweiten Geschäftstag nach der ersten SMS, zur Geschäftszeit. */
export function zweiteSmsFaellig(ersteAt: Date, now: Date, g: Geschaeftszeiten): boolean {
  if (!imGeschaeftsfenster(now, g)) return false;
  let tag = berlinTag(ersteAt);
  for (let n = 0, i = 0; n < 2 && i < 30; i++) {
    tag = naechsterTag(tag);
    if (istGeschaeftstag(tag, g)) n++;
  }
  return berlinTag(now) >= tag;
}

/**
 * Wann geht die nächste SMS der Nur-SMS-Strecke raus? (Vorschau „Nächste Nachrichten“, Ole 22.11.2026) Erste SMS:
 * nächstes Geschäftsfenster ab jetzt; zweite: erster Zeitpunkt, an dem zweiteSmsFaellig gilt. null = keine mehr. Rein.
 */
export function naechsteSmsZeit(o: { smsZahl: number; smsAt: Date | null; g: Geschaeftszeiten; now: Date; max?: number }): Date | null {
  if (o.smsZahl >= (o.max ?? 2)) return null;
  if (o.smsZahl >= 1 && !o.smsAt) return null;
  const schritt = 15 * 60 * 1000;
  let t = new Date(Math.ceil(o.now.getTime() / schritt) * schritt);
  for (let i = 0; i < 14 * 96; i++, t = new Date(t.getTime() + schritt)) {
    if (o.smsZahl === 0 ? imGeschaeftsfenster(t, o.g) : zweiteSmsFaellig(o.smsAt!, t, o.g)) return t;
  }
  return null;
}

// ─── Länge (GSM 03.38) ─────────────────────────────────────────────────────────────────

const GSM = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXT = "^{}\\[~]|€";

/** Segmente einer SMS: GSM 160 bzw. 153 je Teil, sonst (Unicode) 70 bzw. 67. */
export function smsSegmente(text: string): { zeichen: number; segmente: number; unicode: boolean } {
  let n = 0;
  for (const ch of text) {
    if (GSM.includes(ch)) n += 1;
    else if (GSM_EXT.includes(ch)) n += 2;
    else {
      const u = [...text].length;
      return { zeichen: u, segmente: u <= 70 ? 1 : Math.ceil(u / 67), unicode: true };
    }
  }
  return { zeichen: n, segmente: n <= 160 ? 1 : Math.ceil(n / 153), unicode: false };
}

/** Höchstens so viele Teile je SMS. */
export const MAX_SEGMENTE = 2;

// ─── Text ──────────────────────────────────────────────────────────────────────────────

export type NurSmsInput = {
  an: Ansprache;
  anredeName: string | null;
  person: VermittlerName;
  source: string | null;
  /** Antwortseite /t/<token> (Termin wählen, Abmelden) */
  link: string;
  art: "erst" | "erinnerung";
  /** Nummer des Vermittlers (Erstinformation), sonst null */
  telefon: string | null;
  zeiten: Geschaeftszeiten;
};

/**
 * SMS an den Lead (rein): Dank bzw. Erinnerung, Link zur Terminwahl, Rückruf zu Geschäftszeiten, Abmeldehinweis. Ohne
 * Gedankenstriche, ohne KI-Hinweis (Ole, 22.11.2026: feste Nachricht, kein KI-Gespräch; Absender nicht als Person
 * ausgeben), höchstens 2 Teile: zu lang, fällt erst das Thema, dann der Name weg.
 */
export function nurSmsText(o: NurSmsInput): string {
  const an = o.an;
  const zeit = geschaeftszeitText(o.zeiten);
  const tel = (o.telefon ?? "").replace(/[^\d+ /]/g, "").replace(/\s+/g, " ").trim();
  const rueckruf = tel
    ? a(an, `Oder ruf an: ${tel} (${zeit}).`, `Oder rufen Sie an: ${tel} (${zeit}).`)
    : a(an, `Lieber telefonieren? Auf der Seite Telefon wählen, Rückruf ${zeit}.`, `Lieber telefonieren? Auf der Seite Telefon wählen, Rückruf ${zeit}.`);
  const abmelden = "Abmelden über den Link.";
  const bau = (mitThema: boolean, mitName: boolean) => {
    const hallo = mitName && o.anredeName ? `Hallo ${o.anredeName}, ` : `${a(an, "Hallo", "Guten Tag")}, `;
    const thema = mitThema ? anfrageThema(o.source, an) : "";
    const kern =
      o.art === "erst"
        ? `${hallo}${a(an, "danke für deine Anfrage", "danke für Ihre Anfrage")}${thema} bei ${o.person.dat}. Termin wählen: ${o.link}`
        : `${hallo}${a(an, `${o.person.nom} hat noch Zeit für dich. Termin wählen`, `${o.person.nom} hat noch Zeit für Sie. Termin wählen`)}: ${o.link}`;
    return ohneGedankenstriche(`${kern} ${rueckruf} ${abmelden}`);
  };
  const varianten = [bau(true, true), bau(false, true), bau(true, false), bau(false, false)];
  return varianten.find((t) => smsSegmente(t).segmente <= MAX_SEGMENTE) ?? varianten[varianten.length - 1];
}

/** Für den Verlauf beim Lead: Text ohne den persönlichen Link. */
export function smsFuerVerlauf(text: string): string {
  return text.replace(/https?:\/\/\S+/g, "(Link zur Terminwahl)");
}
