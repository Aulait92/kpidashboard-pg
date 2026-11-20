// Geplante Nachrichten im Vertrieb (Ole, 20.11.2026: „Im CRM brauche ich eine Übersicht über die nächsten
// automatisierten Nachrichten, die rausgehen“). Reine Funktionen ohne Datenbank: je Quelle die nächste geplante
// Nachricht aus denselben Regeln wie der Versand, dazu Versandfenster, Sortierung und Gruppen (Heute, Morgen, nächste
// 7 Tage, später). Laden: lib/vertrieb/geplante-nachrichten-server.ts. Anzeige: Verkaufen → Geplante Nachrichten,
// Mein Tag (Vertrieb) und die Kontaktakte.
//
// Quellen und ihre Regeln (geteilt mit dem Versand, nichts kopiert):
// - Terminerinnerung 24 Stunden und 1 Stunde vorher, E-Mail und WhatsApp (lib/vertrieb/termin-erinnerungen.ts)
// - Zahlungserinnerung zum angenommenen Angebot, E-Mail und WhatsApp (naechsteErinnerung, lib/angebot-zahlungserinnerung.ts)
// - Erinnerung vor Ablauf des Abschlussbonus, E-Mail und WhatsApp (bonusPlan, lib/vertrieb/bonus-erinnerung.ts)
// - Später-Follow-up Mail 1 und 2 (lib/vertrieb/followup-regeln.ts, Versandfenster lib/vertrieb/spaeter.ts)
// - Mahnwesen: Erinnerung, Zahlungserinnerung, 1. und 2. Mahnung (naechsteStufe, lib/mahnwesen.ts), nur mit MAHNWESEN=on
// - Erinnerung an die Einrichtung Tag 1, 3, 7 (lib/selbst-einrichtung.ts)
// Nicht dabei: Push an Ole und Aufgaben (keine Nachricht an den Kontakt), Bestätigungen direkt nach einer Handlung
// (Buchung, Angebot senden) und Instantly-Kaltmails (Takt liegt in Instantly, nicht in unseren Daten).

import { addDaysIso, berlinTodayIso } from "@/lib/offer-pricing";
import { dayKey, fromDayKey } from "@/lib/vertrieb/dates";

export type Kanal = "email" | "whatsapp";
export type Quelle = "termin" | "zahlung" | "bonus" | "followup" | "mahnung" | "einrichtung";

export type GeplanteNachricht = {
  /** eindeutig je Nachricht (Quelle, Datensatz, Stufe) */
  key: string;
  quelle: Quelle;
  /** geplanter Versand; bei `sofort` der Zeitpunkt der Berechnung */
  at: Date;
  /** schon fällig: geht mit dem nächsten Lauf raus (der Cron läuft alle 5 Minuten), angezeigt als „gleich“ */
  sofort: boolean;
  /** z. B. „Terminerinnerung 24 Stunden vorher“ */
  art: string;
  kanaele: Kanal[];
  /** Kontakt bzw. Firma */
  empfaenger: string;
  /** z. B. „Angebot PG-2026-0007“ oder „Termin Do 26.11. 10 Uhr“ */
  bezug: string | null;
  /** Kontaktakte bzw. Kundenakte */
  href: string;
  contactId: string | null;
  /** Bestehender Weg zum Aussetzen bzw. Stoppen (z. B. Später-Follow-up in der Kontaktakte), sonst null */
  stoppHref?: string | null;
  /** Zusatz, z. B. „frühestens, je Postfach begrenzt“ */
  hinweis?: string | null;
};

export const KANAL_LABEL: Record<Kanal, string> = { email: "E-Mail", whatsapp: "WhatsApp" };

// ─── Versandfenster ────────────────────────────────────────────────────

export type Fenster = {
  /** volle Stunde (Berlin), ab der gesendet wird */
  von: number;
  /** volle Stunde (Berlin), bis zu der gesendet wird (exklusiv) */
  bis: number;
  /** Tag zulässig? (YYYY-MM-DD, Berlin), z. B. nur Werktage. Ohne: jeder Tag */
  tag?: (key: string) => boolean;
};

const berlinStunde = (d: Date) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "numeric", hourCycle: "h23" }).format(d));
const uhr = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** Werktag Mo bis Fr (ohne Feiertage), Tag als YYYY-MM-DD */
export const montagBisFreitag = (key: string) => {
  const wd = new Date(`${key}T12:00:00Z`).getUTCDay();
  return wd !== 0 && wd !== 6;
};

/**
 * Frühester Zeitpunkt ab `ab` (frühestens `now`) im Versandfenster. `sofort`, wenn das jetzt ist (der nächste Lauf
 * sendet). Wie die Läufe: Vor dem Fenster wird zu dessen Beginn gesendet, danach am nächsten zulässigen Tag.
 */
export function imFenster(ab: Date, now: Date, f: Fenster): { at: Date; sofort: boolean } {
  let t = ab.getTime() > now.getTime() ? ab : now;
  for (let i = 0; i < 60; i++) {
    const key = dayKey(t);
    const h = berlinStunde(t);
    if ((!f.tag || f.tag(key)) && h < f.bis) {
      const at = h < f.von ? fromDayKey(key, uhr(f.von)) : t;
      return { at, sofort: at.getTime() <= now.getTime() };
    }
    t = fromDayKey(addDaysIso(key, 1), uhr(f.von));
  }
  return { at: t, sofort: false };
}

// ─── Kanäle ────────────────────────────────────────────────────────────

/**
 * WhatsApp über die Support-Nummer möglich? Dieselben Hürden wie beim Versand (sendeVorlageAnKontakt in
 * lib/angebot-zahlungserinnerung-server.ts, sendSupportTemplate in lib/vertrieb/termin-whatsapp.ts): Nummer, kein
 * Festnetz, Nummer verbunden, Vorlage freigegeben, kein „STOPP“. Liefert den Grund oder null.
 */
export function whatsappHindernis(w: { phone: string | null; festnetz: boolean; kontoVerbunden: boolean; vorlage: boolean; optedOut: boolean }): string | null {
  if (!w.phone) return "no_phone";
  if (w.festnetz) return "festnetz";
  if (!w.kontoVerbunden) return "no_account";
  if (!w.vorlage) return "no_template";
  if (w.optedOut) return "opted_out";
  return null;
}

export function kanaeleAus(k: { email: boolean; whatsapp: boolean }): Kanal[] {
  return [...(k.email ? (["email"] as const) : []), ...(k.whatsapp ? (["whatsapp"] as const) : [])];
}

// ─── Einrichtung (Tag 1, 3, 7) ─────────────────────────────────────────

/**
 * Nächste Erinnerung an die Einrichtung: schon fällig (`faelligJetzt` aus dueReminder, lib/selbst-einrichtung.ts) →
 * jetzt, sonst der nächste noch nicht gesendete Tag nach `base`. null: alle gesendet.
 */
export function naechsteEinrichtungsErinnerung(
  base: Date,
  now: Date,
  sent: Record<string, unknown> | null | undefined,
  tage: readonly number[],
  faelligJetzt: number | null,
): { tag: number; ab: Date } | null {
  if (faelligJetzt != null) return { tag: faelligJetzt, ab: now };
  const DAY = 86_400_000;
  const tag = tage.find((d) => base.getTime() + d * DAY > now.getTime() && !(sent && sent[String(d)]));
  return tag == null ? null : { tag, ab: new Date(base.getTime() + tag * DAY) };
}

// ─── Liste ─────────────────────────────────────────────────────────────

/** Chronologisch (gleiche Zeit: nach Empfänger), nur bis `bis`. */
export function sortiere(items: GeplanteNachricht[], bis?: Date): GeplanteNachricht[] {
  return items
    .filter((n) => !bis || n.at.getTime() <= bis.getTime())
    .sort((a, b) => a.at.getTime() - b.at.getTime() || a.empfaenger.localeCompare(b.empfaenger, "de"));
}

/** Nächste Nachricht je Kontakt (für die Kontaktakte). */
export function naechsteJeKontakt(items: GeplanteNachricht[]): Map<string, GeplanteNachricht> {
  const out = new Map<string, GeplanteNachricht>();
  for (const n of sortiere(items)) if (n.contactId && !out.has(n.contactId)) out.set(n.contactId, n);
  return out;
}

export type Gruppe = { key: "heute" | "morgen" | "woche" | "spaeter"; label: string; items: GeplanteNachricht[] };

/** Heute, Morgen, nächste 7 Tage, später (Berliner Kalendertage). Leere Gruppen fallen weg. */
export function gruppiere(items: GeplanteNachricht[], now: Date): Gruppe[] {
  const heute = berlinTodayIso(now);
  const morgen = addDaysIso(heute, 1);
  const woche = addDaysIso(heute, 7);
  const g: Gruppe[] = [
    { key: "heute", label: "Heute", items: [] },
    { key: "morgen", label: "Morgen", items: [] },
    { key: "woche", label: "Nächste 7 Tage", items: [] },
    { key: "spaeter", label: "Später", items: [] },
  ];
  for (const n of sortiere(items)) {
    const t = berlinTodayIso(n.at);
    g[t <= heute ? 0 : t === morgen ? 1 : t <= woche ? 2 : 3].items.push(n);
  }
  return g.filter((x) => x.items.length);
}

const TZ = "Europe/Berlin";

/** „gleich“ (schon fällig, der Cron läuft alle 5 Minuten), „14:00“ (nurZeit, z. B. in der Gruppe Heute), sonst „heute 14:00“, „morgen 9:00“, „Mo 23.11. 9:00“ */
export function zeitLabel(n: Pick<GeplanteNachricht, "at" | "sofort">, now: Date, opts: { nurZeit?: boolean } = {}): string {
  if (n.sofort) return "gleich";
  const zeit = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(n.at);
  if (opts.nurZeit) return zeit;
  const t = berlinTodayIso(n.at);
  const heute = berlinTodayIso(now);
  if (t === heute) return `heute ${zeit}`;
  if (t === addDaysIso(heute, 1)) return `morgen ${zeit}`;
  const tag = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "short", day: "2-digit", month: "2-digit" }).format(n.at).replace(/\.,/, "");
  return `${tag} ${zeit}`;
}

/** „E-Mail und WhatsApp“ */
export function kanaeleText(k: readonly Kanal[]): string {
  return k.map((x) => KANAL_LABEL[x]).join(" und ");
}
