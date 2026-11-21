// Termine per Weiterleitung blockieren (Ole, 21.11.2026). Vermittler großer Gesellschaften dürfen ihren Firmenkalender
// nicht freigeben (kein ICS, kein Microsoft-Zugriff) und nutzen den App-Kalender (lib/calendar/app-kalender.ts). Trägt
// der Vermittler in Outlook einen eigenen Termin ein, leitet er die Einladung an seine persönliche Termin-Adresse
// termine-<token>@antwort.dein-beratungstermin.de weiter; die App liest Beginn und Ende aus der Kalenderdatei (.ics) und
// blockiert die Zeit wie „Zeit blockieren“ (CalendarBlock mit quelle „weitergeleitet“).
//
//   Eingang     Resend Receiving wie die Antwortadresse (lib/mail/eingang.ts); die Rohmail (MIME) wird nach Kalender-
//               teilen durchsucht: Anhang .ics, text/calendar im Text (Outlook-Einladung) und eingebettete Nachrichten
//               (message/rfc822, „als Anlage weiterleiten“).
//   Auswertung  Hier rein: ical.js, Zeitzonen über Windows-Namen („W. Europe Standard Time“), IANA-Namen oder die
//               VTIMEZONE der Datei (nur lokal, nie global registriert); Serien: Vorkommen der nächsten 90 Tage.
//   Gespeichert Nur Beginn, Ende, Hash der UID, SEQUENCE, Vorkommen (RECURRENCE-ID) und die Quelle. Kein Betreff, keine
//               Teilnehmer, kein Ort, keine Beschreibung (Datenschutz, Firmeninterna).
//   Server      lib/calendar/termin-weiterleitung-server.ts (Datenbank, Rückmeldung, Überschneidungen).

import crypto from "node:crypto";
import ICAL from "ical.js";
import { ANTWORT_DOMAIN, reineAdresse } from "@/lib/mail/antwort-adresse";

export const TERMIN_QUELLE = "weitergeleitet";
export const TOKEN_LAENGE = 20;
const TOKEN = new RegExp(`^termine-([a-z2-7]{${TOKEN_LAENGE}})$`);
/** Serien: so viele Tage im Voraus blockieren, höchstens so viele Vorkommen. */
export const SERIE_TAGE = 90;
export const SERIE_MAX = 120;
const MAX_DAUER_MS = 31 * 86_400_000;
const TZ = "Europe/Berlin";

// ─── Adresse ───────────────────────────────────────────────────────────────

const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";

/** Zufälliger Token (20 Zeichen base32 = 100 Bit). */
export function neuerToken(): string {
  const bytes = crypto.randomBytes(TOKEN_LAENGE);
  let out = "";
  for (const b of bytes) out += BASE32[b & 31];
  return out;
}

export function terminAdresse(token: string, domain = ANTWORT_DOMAIN): string {
  return `termine-${token}@${domain}`;
}

/** Token aus einer Empfängeradresse (rein); null, wenn es keine Termin-Adresse ist. */
export function parseTerminAdresse(adresse: string | null | undefined, domain = ANTWORT_DOMAIN): string | null {
  const a = reineAdresse(adresse);
  if (!a) return null;
  const at = a.lastIndexOf("@");
  if (a.slice(at + 1) !== domain) return null;
  const m = TOKEN.exec(a.slice(0, at).split("+")[0]);
  return m ? m[1] : null;
}

// ─── MIME: Kalenderteile finden ────────────────────────────────────────────

type Kopf = Record<string, string>;

function trenneKopf(s: string): { kopf: Kopf; body: string } {
  const m = /\r?\n\r?\n/.exec(s);
  const roh = m ? s.slice(0, m.index) : s;
  const body = m ? s.slice(m.index + m[0].length) : "";
  const kopf: Kopf = {};
  let letzter = "";
  for (const zeile of roh.split(/\r?\n/)) {
    if (/^[ \t]/.test(zeile) && letzter) {
      kopf[letzter] += ` ${zeile.trim()}`;
      continue;
    }
    const i = zeile.indexOf(":");
    if (i <= 0) continue;
    letzter = zeile.slice(0, i).trim().toLowerCase();
    kopf[letzter] = zeile.slice(i + 1).trim();
  }
  return { kopf, body };
}

function parameter(wert: string | undefined, name: string): string | null {
  if (!wert) return null;
  const m = new RegExp(`;\\s*${name}\\*?=\\s*(?:"([^"]*)"|([^;\\s]*))`, "i").exec(wert);
  return m ? (m[1] ?? m[2] ?? null) : null;
}

function dekodiere(body: string, cte: string | undefined): Buffer {
  const art = (cte ?? "").trim().toLowerCase();
  if (art === "base64") return Buffer.from(body.replace(/[^A-Za-z0-9+/=]/g, ""), "base64");
  if (art === "quoted-printable") {
    const ohneUmbruch = body.replace(/=\r?\n/g, "");
    const bytes: number[] = [];
    for (let i = 0; i < ohneUmbruch.length; i++) {
      const c = ohneUmbruch[i];
      if (c === "=" && /^[0-9A-Fa-f]{2}$/.test(ohneUmbruch.slice(i + 1, i + 3))) {
        bytes.push(parseInt(ohneUmbruch.slice(i + 1, i + 3), 16));
        i += 2;
      } else bytes.push(ohneUmbruch.charCodeAt(i) & 0xff);
    }
    return Buffer.from(bytes);
  }
  return Buffer.from(body, "latin1");
}

function alsText(buf: Buffer, charset: string | null): string {
  const cs = (charset ?? "utf-8").toLowerCase();
  try {
    return new TextDecoder(cs === "utf8" ? "utf-8" : cs).decode(buf);
  } catch {
    return buf.toString("utf8");
  }
}

const KALENDER_TYP = /^(text\/calendar|application\/ics|text\/x-vcalendar|application\/x-ical|application\/ical)$/;
const KALENDER_REGEX = /BEGIN:VCALENDAR[\s\S]*?END:VCALENDAR/gi;

function sammle(s: string, tiefe: number, out: string[]): void {
  if (tiefe > 8 || out.length >= 20) return;
  const { kopf, body } = trenneKopf(s);
  const ct = kopf["content-type"] ?? "text/plain";
  const typ = ct.split(";")[0].trim().toLowerCase();
  const name = `${parameter(ct, "name") ?? ""} ${parameter(kopf["content-disposition"], "filename") ?? ""}`.toLowerCase();
  if (typ.startsWith("multipart/")) {
    const grenze = parameter(ct, "boundary");
    if (!grenze) return;
    const esc = grenze.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const teile = body.split(new RegExp(`(?:^|\\r?\\n)--${esc}(?:--)?[ \\t]*(?=\\r?\\n|$)`));
    for (const t of teile.slice(1, 200)) sammle(t.replace(/^\r?\n/, ""), tiefe + 1, out);
    return;
  }
  if (typ === "message/rfc822" || /\.eml\b/.test(name)) {
    sammle(dekodiere(body, kopf["content-transfer-encoding"]).toString("latin1"), tiefe + 1, out);
    return;
  }
  if (KALENDER_TYP.test(typ) || /\.(ics|vcs)\b/.test(name)) {
    const text = alsText(dekodiere(body, kopf["content-transfer-encoding"]), parameter(ct, "charset"));
    for (const m of text.match(KALENDER_REGEX) ?? []) out.push(m);
  }
}

/**
 * Kalenderdaten (VCALENDAR) aus einer Rohmail (rein): Anhänge und Teile mit text/calendar bzw. .ics, auch in
 * eingebetteten Nachrichten (message/rfc822). Ohne solche Teile: VCALENDAR im Klartext der Mail.
 */
export function kalenderAusMime(roh: Buffer | string): string[] {
  const s = typeof roh === "string" ? roh : roh.toString("latin1");
  const out: string[] = [];
  sammle(s, 0, out);
  if (!out.length) for (const m of s.match(KALENDER_REGEX) ?? []) out.push(m);
  return [...new Set(out)];
}

/** VCALENDAR in einem Text (rein), z. B. im Text der Mail ohne Rohmail. */
export function kalenderAusText(text: string | null | undefined): string[] {
  return [...new Set((text ?? "").match(KALENDER_REGEX) ?? [])];
}

// ─── Zeitzonen ─────────────────────────────────────────────────────────────

const WINDOWS_TZ: Record<string, string> = {
  "w. europe standard time": "Europe/Berlin",
  "central europe standard time": "Europe/Budapest",
  "central european standard time": "Europe/Warsaw",
  "romance standard time": "Europe/Paris",
  "gmt standard time": "Europe/London",
  "greenwich standard time": "Atlantic/Reykjavik",
  "e. europe standard time": "Europe/Chisinau",
  "fle standard time": "Europe/Kiev",
  "gtb standard time": "Europe/Bucharest",
  "turkey standard time": "Europe/Istanbul",
  "russian standard time": "Europe/Moscow",
  "eastern standard time": "America/New_York",
  "central standard time": "America/Chicago",
  "mountain standard time": "America/Denver",
  "pacific standard time": "America/Los_Angeles",
  "utc": "UTC",
  "coordinated universal time": "UTC",
};

const istIana = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

/** IANA-Zone zu einer TZID (rein): Windows-Name, IANA-Name (auch mit Präfix), Outlook-Anzeigename; sonst null. */
export function ianaZone(tzid: string | null | undefined): string | null {
  const t = (tzid ?? "").trim().replace(/^"|"$/g, "");
  if (!t) return null;
  const win = WINDOWS_TZ[t.toLowerCase()];
  if (win) return win;
  const m = /([A-Za-z]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?)$/.exec(t);
  if (m && istIana(m[1])) return m[1];
  if (/^utc$|^gmt$|^z$/i.test(t)) return "UTC";
  // Outlook-Anzeigename, z. B. „(UTC+01:00) Amsterdam, Berlin, Bern, Rom, Stockholm, Wien“
  if (/berlin|amsterdam|wien|vienna|bern|zürich|zurich/i.test(t)) return "Europe/Berlin";
  return null;
}

function offsetMs(ms: number, tz: string): number {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(new Date(ms));
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - Math.floor(ms / 1000) * 1000;
}

/** Wanduhrzeit in einer IANA-Zone → Zeitpunkt (rein, sommerzeitfest). */
export function wandzeit(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  const o1 = offsetMs(guess, tz);
  let t = guess - o1;
  const o2 = offsetMs(t, tz);
  if (o2 !== o1) t = guess - o2;
  return new Date(t);
}

type IcalTime = InstanceType<typeof ICAL.Time>;
type IcalComponent = InstanceType<typeof ICAL.Component>;
type IcalEvent = InstanceType<typeof ICAL.Event>;
type Zonen = Map<string, InstanceType<typeof ICAL.Timezone>>;

/** ical.js-Zeit → Date. UTC direkt; sonst Wanduhrzeit mit der TZID (Windows/IANA, sonst VTIMEZONE der Datei, sonst Berlin). */
function zuDatum(t: IcalTime, tzid: string | null, zonen: Zonen): Date {
  const zone = t.zone as { tzid?: string } | null | undefined;
  if (zone?.tzid === "UTC" && !t.isDate) return t.toJSDate();
  const name = zone?.tzid && zone.tzid !== "floating" ? zone.tzid : tzid;
  const h = t.isDate ? 0 : t.hour;
  const mi = t.isDate ? 0 : t.minute;
  const s = t.isDate ? 0 : t.second;
  if (t.isDate) return wandzeit(t.year, t.month, t.day, 0, 0, 0, TZ);
  const iana = ianaZone(name);
  if (iana) return wandzeit(t.year, t.month, t.day, h, mi, s, iana);
  const eigene = name ? zonen.get(name) : undefined;
  if (eigene) {
    try {
      const off = eigene.utcOffset(t);
      return new Date(Date.UTC(t.year, t.month - 1, t.day, h, mi, s) - off * 1000);
    } catch {
      // weiter mit Berlin
    }
  }
  return wandzeit(t.year, t.month, t.day, h, mi, s, TZ);
}

const tzidVon = (comp: IcalComponent, prop: string): string | null => {
  const p = comp.getFirstProperty(prop);
  const v = p?.getParameter("tzid");
  return typeof v === "string" ? v : null;
};

// ─── Termine auslesen ──────────────────────────────────────────────────────

export type Zeitraum = { start: Date; end: Date; vorkommen: Date | null };

export type TerminAktion = {
  uidHash: string;
  sequence: number;
  art: "blockieren" | "freigeben";
  /** Einzelnes Vorkommen einer Serie (RECURRENCE-ID); null = ganzer Termin bzw. ganze Serie */
  vorkommen: Date | null;
  serie: boolean;
  /** Zu blockierende Zeiten (nur künftige); leer bei „freigeben“ */
  zeiten: Zeitraum[];
};

export type TermineErgebnis = {
  aktionen: TerminAktion[];
  /** Einladungen der App selbst (Lead-Termine), übersprungen */
  eigene: number;
  /** Termine, die schon vorbei sind */
  vergangen: number;
};

/** Hash der UID (rein): die UID selbst wird nicht gespeichert. */
export function uidHash(uid: string): string {
  return crypto.createHash("sha256").update(`kalender-uid:${uid}`).digest("hex").slice(0, 32);
}

/** UIDs der App (Einladungen zu Lead-Terminen: app-kalender.ts „…@terminbuchung“, add-to-calendar.ts „…@termin“). */
const EIGENE_UID = /@(terminbuchung|termin)$/i;

function zeitraum(start: Date, end: Date, isDate: boolean): { start: Date; end: Date } {
  let e = end;
  if (!(e > start)) e = new Date(start.getTime() + (isDate ? 86_400_000 : 30 * 60_000));
  if (e.getTime() - start.getTime() > MAX_DAUER_MS) e = new Date(start.getTime() + MAX_DAUER_MS);
  return { start, end: e };
}

function eventZeiten(ev: IcalEvent, zonen: Zonen): { start: Date; end: Date } {
  const comp = ev.component;
  const tzS = tzidVon(comp, "dtstart");
  const tzE = tzidVon(comp, "dtend") ?? tzS;
  const s = zuDatum(ev.startDate, tzS, zonen);
  const e = ev.endDate ? zuDatum(ev.endDate, tzE, zonen) : s;
  return zeitraum(s, e, ev.startDate.isDate);
}

const abgesagt = (comp: IcalComponent) => String(comp.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED";

/**
 * Termine aus Kalenderdaten (rein). Je VEVENT eine Aktion: blockieren (REQUEST, PUBLISH, ohne METHOD) bzw. freigeben
 * (CANCEL oder STATUS:CANCELLED). Antworten (REPLY, COUNTER …) werden übergangen. Serien: Vorkommen ab jetzt bis
 * `tage` Tage, höchstens `max`. Mehrere Dateien: je UID und Vorkommen gilt die höchste SEQUENCE.
 */
export function termineAusKalendern(kalender: string[], now: Date, o: { tage?: number; max?: number } = {}): TermineErgebnis {
  const bis = new Date(now.getTime() + (o.tage ?? SERIE_TAGE) * 86_400_000);
  const max = o.max ?? SERIE_MAX;
  const ergebnis: TermineErgebnis = { aktionen: [], eigene: 0, vergangen: 0 };
  const gesehen = new Map<string, number>();

  for (const ics of kalender) {
    let root: IcalComponent;
    try {
      root = new ICAL.Component(ICAL.parse(ics));
    } catch {
      continue;
    }
    const methode = String(root.getFirstPropertyValue("method") ?? "").toUpperCase();
    if (["REPLY", "COUNTER", "DECLINECOUNTER", "REFRESH"].includes(methode)) continue;
    // Zeitzonen der Datei nur lokal (nie global registrieren: fremde Dateien sollen andere nicht beeinflussen)
    const zonen: Zonen = new Map();
    for (const vtz of root.getAllSubcomponents("vtimezone")) {
      try {
        const tz = new ICAL.Timezone(vtz);
        if (tz.tzid) zonen.set(tz.tzid, tz);
      } catch {
        // ungültige Zone: ignorieren
      }
    }
    const master = new Map<string, IcalEvent>();
    const ausnahmen: IcalEvent[] = [];
    for (const ve of root.getAllSubcomponents("vevent")) {
      let ev: IcalEvent;
      try {
        ev = new ICAL.Event(ve);
        if (!ev.startDate) continue;
      } catch {
        continue;
      }
      if (ev.isRecurrenceException()) ausnahmen.push(ev);
      else master.set(ev.uid ?? "", ev);
    }
    const nimm = (a: TerminAktion) => {
      const k = `${a.uidHash}|${a.vorkommen?.toISOString() ?? ""}`;
      const alt = gesehen.get(k);
      if (alt !== undefined && ergebnis.aktionen[alt].sequence > a.sequence) return;
      if (alt !== undefined) ergebnis.aktionen[alt] = a;
      else {
        gesehen.set(k, ergebnis.aktionen.length);
        ergebnis.aktionen.push(a);
      }
    };
    const hashVon = (ev: IcalEvent) =>
      uidHash(ev.uid || `ohne-uid:${String(ev.component.getFirstPropertyValue("dtstart"))}:${String(ev.component.getFirstPropertyValue("dtend"))}`);
    const seqVon = (ev: IcalEvent) => {
      const n = Number(ev.sequence ?? 0);
      return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
    };

    // Ausnahmen mit Serie in derselben Datei gehören zur Serie; allein stehende sind Einzeländerungen
    const einzeln: IcalEvent[] = [];
    for (const ex of ausnahmen) {
      const m = master.get(ex.uid ?? "");
      if (m && m.isRecurring()) m.relateException(ex);
      else einzeln.push(ex);
    }

    for (const ev of master.values()) {
      if (EIGENE_UID.test(ev.uid ?? "")) {
        ergebnis.eigene++;
        continue;
      }
      const freigeben = methode === "CANCEL" || abgesagt(ev.component);
      const basis = { uidHash: hashVon(ev), sequence: seqVon(ev), vorkommen: null, serie: ev.isRecurring() };
      if (freigeben) {
        nimm({ ...basis, art: "freigeben", zeiten: [] });
        continue;
      }
      const zeiten: Zeitraum[] = [];
      if (!ev.isRecurring()) {
        const z = eventZeiten(ev, zonen);
        if (z.end > now) zeiten.push({ ...z, vorkommen: null });
      } else {
        const tzS = tzidVon(ev.component, "dtstart");
        const it = ev.iterator();
        for (let i = 0; i < 5000 && zeiten.length < max; i++) {
          const next = it.next();
          if (!next) break;
          const rid = zuDatum(next, tzS, zonen);
          if (rid >= bis) break;
          const occ = ev.getOccurrenceDetails(next);
          if (abgesagt(occ.item.component)) continue;
          const item = occ.item.component;
          const tzO = tzidVon(item, "dtstart") ?? tzS;
          const s = zuDatum(occ.startDate, tzO, zonen);
          const e = zuDatum(occ.endDate, tzidVon(item, "dtend") ?? tzO, zonen);
          const z = zeitraum(s, e, occ.startDate.isDate);
          if (z.end <= now || z.start >= bis) continue;
          zeiten.push({ ...z, vorkommen: rid });
        }
      }
      if (!zeiten.length) {
        ergebnis.vergangen++;
        continue;
      }
      nimm({ ...basis, art: "blockieren", zeiten });
    }

    for (const ex of einzeln) {
      if (EIGENE_UID.test(ex.uid ?? "")) {
        ergebnis.eigene++;
        continue;
      }
      const ridProp = ex.component.getFirstProperty("recurrence-id");
      const ridWert = ridProp?.getFirstValue() as IcalTime | undefined;
      if (!ridWert) continue;
      const rid = zuDatum(ridWert, tzidVon(ex.component, "recurrence-id") ?? tzidVon(ex.component, "dtstart"), zonen);
      const basis = { uidHash: hashVon(ex), sequence: seqVon(ex), vorkommen: rid, serie: true };
      if (methode === "CANCEL" || abgesagt(ex.component)) {
        nimm({ ...basis, art: "freigeben", zeiten: [] });
        continue;
      }
      const z = eventZeiten(ex, zonen);
      if (z.end <= now) {
        ergebnis.vergangen++;
        continue;
      }
      nimm({ ...basis, art: "blockieren", zeiten: [{ ...z, vorkommen: rid }] });
    }
  }
  return ergebnis;
}

// ─── Texte (Sie-Form, ohne Gedankenstriche) ────────────────────────────────

const tagFmt = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "short", day: "2-digit", month: "2-digit" });
const uhrFmt = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** „Di., 25.11.“ */
export const tagText = (d: Date) => tagFmt.format(d).replace(/,?\s+/, ", ");
/** „10“ bzw. „10:30“ */
export const uhrText = (d: Date) => {
  const [h, m] = uhrFmt.format(d).split(":");
  return m === "00" ? String(Number(h)) : `${Number(h)}:${m}`;
};
const mitternacht = (d: Date) => uhrFmt.format(d) === "00:00";

/** „Di., 25.11., 10 bis 11 Uhr“, mehrtägig „Di., 25.11., 10 Uhr bis Mi., 26.11., 12 Uhr“, ganztägig „Di., 25.11., ganztägig“. */
export function zeitText(start: Date, end: Date): string {
  if (mitternacht(start) && mitternacht(end)) {
    const letzter = new Date(end.getTime() - 3600_000);
    return tagText(start) === tagText(letzter) ? `${tagText(start)}, ganztägig` : `${tagText(start)} bis ${tagText(letzter)}, ganztägig`;
  }
  if (tagText(start) === tagText(end) || (mitternacht(end) && end.getTime() - start.getTime() < 86_400_000)) {
    return `${tagText(start)}, ${uhrText(start)} bis ${mitternacht(end) ? "24" : uhrText(end)} Uhr`;
  }
  return `${tagText(start)}, ${uhrText(start)} Uhr bis ${tagText(end)}, ${uhrText(end)} Uhr`;
}

/** „Di., 25.11., 10 Uhr“ */
export const zeitpunktText = (d: Date) => `${tagText(d)}, ${uhrText(d)} Uhr`;

export type AngewendetArt = "blockiert" | "verschoben" | "freigegeben" | "veraltet" | "nicht_gefunden";
export type Angewendet = { art: AngewendetArt; serie: boolean; zeiten: Zeitraum[] };
export type Ueberschneidung = { name: string; start: Date; leadId: string | null };
export type FehlerGrund = "kein_termin" | "vergangen" | "eigener";

export type Rueckmeldung = { betreff: string; absaetze: string[] };

function satzFuer(a: Angewendet): { betreff: string; satz: string } {
  const erste = a.zeiten[0];
  const z = erste ? zeitText(erste.start, erste.end) : "";
  const n = a.zeiten.length;
  switch (a.art) {
    case "blockiert":
      return a.serie && n > 1
        ? { betreff: `Serie blockiert: ${n} Termine ab ${z}`, satz: `Wir haben die Serie für die nächsten ${SERIE_TAGE} Tage blockiert: ${n} Termine ab ${z}. Dort bieten wir keine Lead-Termine an.` }
        : { betreff: `Zeit blockiert: ${z}`, satz: `Wir haben diese Zeit in Ihrem App-Kalender blockiert: ${z}. Dort bieten wir keine Lead-Termine an.` };
    case "verschoben":
      return a.serie && n > 1
        ? { betreff: `Serie geändert: ${n} Termine ab ${z}`, satz: `Die Serie hat sich geändert. Blockiert sind jetzt ${n} Termine ab ${z}, die alten Zeiten sind wieder frei.` }
        : { betreff: `Zeit verschoben: ${z}`, satz: `Der Termin hat sich geändert. Blockiert ist jetzt: ${z}. Die alte Zeit ist wieder frei.` };
    case "freigegeben":
      return a.serie && n > 1
        ? { betreff: "Serie abgesagt: Zeiten wieder frei", satz: `Die Serie ist abgesagt. Die ${n} blockierten Zeiten ab ${z} sind wieder frei für Lead-Termine.` }
        : { betreff: z ? `Zeit wieder frei: ${z}` : "Zeit wieder frei", satz: z ? `Der Termin ist abgesagt. Diese Zeit ist wieder frei für Lead-Termine: ${z}.` : "Der Termin ist abgesagt, die Zeit ist wieder frei für Lead-Termine." };
    case "nicht_gefunden":
      return { betreff: "Keine blockierte Zeit gefunden", satz: "Zu dieser Absage haben wir keine blockierte Zeit gefunden. Es hat sich nichts geändert." };
    case "veraltet":
      return { betreff: "Ältere Fassung, nichts geändert", satz: "Diese Einladung ist älter als die zuletzt weitergeleitete Fassung. Es hat sich nichts geändert." };
  }
}

/** Bestätigung nach der Verarbeitung (rein). */
export function rueckmeldungErfolg(angewendet: Angewendet[], ueberschneidungen: Ueberschneidung[]): Rueckmeldung {
  const saetze = angewendet.map(satzFuer);
  const wichtig = saetze.find((_, i) => angewendet[i].art !== "veraltet" && angewendet[i].art !== "nicht_gefunden") ?? saetze[0];
  const betreff = saetze.length > 1 && angewendet.filter((a) => a.art !== "veraltet").length > 1 ? `${saetze.length} Termine übernommen` : (wichtig?.betreff ?? "Termin übernommen");
  const absaetze = saetze.map((s) => s.satz);
  for (const u of ueberschneidungen.slice(0, 3)) {
    absaetze.push(`Achtung: In dieser Zeit liegt schon ein Termin mit ${u.name} am ${zeitpunktText(u.start)}. Er bleibt bestehen, bitte prüfen Sie ihn in der App.`);
  }
  return { betreff, absaetze };
}

/** Hinweis, wenn nichts übernommen wurde (rein). */
export function rueckmeldungFehler(grund: FehlerGrund): Rueckmeldung {
  if (grund === "vergangen") return { betreff: "Termin liegt in der Vergangenheit", absaetze: ["Dieser Termin ist schon vorbei, deshalb ist nichts blockiert."] };
  if (grund === "eigener") return { betreff: "Termin ist schon eingeplant", absaetze: ["Dieser Termin kommt aus der App und ist schon eingeplant. Sie müssen nichts tun."] };
  return {
    betreff: "Kein Termin gefunden",
    absaetze: [
      "In Ihrer weitergeleiteten E-Mail haben wir keinen Termin gefunden, deshalb ist nichts blockiert.",
      "So klappt es: Öffnen Sie den Termin in Outlook und wählen Sie Weiterleiten. Die Einladung muss als Termin ankommen, ein kopierter Text reicht nicht.",
    ],
  };
}

/** Push zur Überschneidung (rein). */
export function ueberschneidungPush(u: Ueberschneidung): { title: string; body: string } {
  return { title: "Überschneidung", body: `Termin mit ${u.name} am ${zeitpunktText(u.start)} liegt in einer blockierten Zeit.` };
}
