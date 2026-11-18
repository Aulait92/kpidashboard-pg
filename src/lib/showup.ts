// Show-up-Paket (Ole, 17.11.2026): Regeln und Texte rund um den Termin, rein und testbar (ohne Datenbank).
//
// Drei Erinnerungen per WhatsApp (Versand: lib/whatsapp/reminders.ts):
//   Vortag   ca. 24 h vorher, nur wenn mindestens 26 h vorher gebucht: Nutzensatz aus den Angaben (wie terminNutzenSatz),
//            bei Komplettcheck „Legen Sie gern Ihre bestehenden Verträge bereit.“, Zugang (Link bzw. Anruf), „Passt es
//            weiterhin?“ mit „Ja, passt“ / „Bitte verschieben“. Dazu die Vortags-Mail (lib/calendar/lead-email.ts).
//   1 Stunde vorher, nur wenn mindestens 2 h vorher gebucht: „In einer Stunde ist Ihr Videotermin mit Herrn Kannapinn.
//            Passt bei Ihnen alles? …“, gleiche Knöpfe, ohne Link.
//   15 Min.  vorher (nur Videotermine mit Link): „Gleich geht es los: … im Videoraum. Der Link funktioniert direkt im
//            Handy-Browser, ohne App: <Link>. Bis gleich!“ mit „Bitte verschieben“.
//   Nach „Bitte verschieben“ (Appointment.rescheduleRequestedAt) entfallen alle weiteren Erinnerungen zum alten Termin.
//
// Terminbeginn (lib/showup-server.ts), nur Videotermine, ohne Prüfung der Teilnehmer in Meet/Teams:
//   Push an den Vermittler „Ist Frau Becker da?“ mit Deep-Link auf das Entscheidungsblatt (/buyer/termine/<id>);
//   dieselbe Frage auf „Heute“. „Ja, da“ → erschienen. „Fehlt noch“ → WhatsApp „Herr Kannapinn wartet schon im
//   Videoraum auf Sie: <Link>“ plus Anruf-Knopf. Danach ohne weitere Reaktion bis Terminende: Rückfrage „Ist Frau Becker
//   noch gekommen?“; „Nein“ → nicht erschienen und No-Show-Rettung (lib/lead-sequences.ts SEQUENCES.no_show).
//   Ohne Reaktion des Vermittlers: keine Nachricht an den Lead, nach dem Termin die Statusfrage auf „Heute“.
// Texte an Leads in beiden Fassungen (a(an, du, sie)), keine Gedankenstriche. Texte an den Vermittler in Sie-Form.

import { a, anredeName, type Ansprache, type AnredeKontakt } from "@/lib/ansprache";
import type { VermittlerName } from "@/lib/whatsapp/gespraech";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const TZ = "Europe/Berlin";

/** Zeitpunkte und Mindest-Vorlauf der drei Erinnerungen (Vorlauf = Termin minus Buchungszeitpunkt). */
export const ERINNERUNG = {
  vortagVorMs: 24 * HOUR,
  vortagMinVorlaufMs: 26 * HOUR,
  stundeVorMs: HOUR,
  stundeMinVorlaufMs: 2 * HOUR,
  gleichVorMs: 15 * MIN,
  /** Direkt nach der Buchungsbestätigung keine zweite Nachricht */
  gleichMinVorlaufMs: 30 * MIN,
} as const;

/** Dauer, wenn der Termin kein Ende hat. */
export const STANDARD_DAUER_MS = 30 * MIN;
/** Termin mit Komplettcheck: so lang (Ole, 17.11.2026). */
export const KOMPLETTCHECK_DAUER_MIN = 45;

export type ErinnerungsTermin = { startsAt: Date; createdAt: Date; mode: string; meetUrl?: string | null };
export type ErinnerungsPlan = { vortag: Date | null; stunde: Date | null; gleich: Date | null };

/** Wann welche Erinnerung fällig wird (null = entfällt nach den Regeln). */
export function erinnerungsPlan(t: ErinnerungsTermin): ErinnerungsPlan {
  const start = t.startsAt.getTime();
  const vorlauf = start - t.createdAt.getTime();
  return {
    vortag: vorlauf >= ERINNERUNG.vortagMinVorlaufMs ? new Date(start - ERINNERUNG.vortagVorMs) : null,
    stunde: vorlauf >= ERINNERUNG.stundeMinVorlaufMs ? new Date(start - ERINNERUNG.stundeVorMs) : null,
    gleich: t.mode === "video" && !!t.meetUrl && vorlauf >= ERINNERUNG.gleichMinVorlaufMs ? new Date(start - ERINNERUNG.gleichVorMs) : null,
  };
}

export type ErinnerungsArt = "vortag" | "stunde" | "gleich";

/**
 * Ist diese Erinnerung jetzt fällig? Nicht nach „Bitte verschieben“, nicht nach dem Start. Die Vortags-Erinnerung
 * entfällt, wenn schon die 1-h-Erinnerung dran ist (z. B. nach einem Ausfall), damit nicht zwei auf einmal kommen.
 */
export function erinnerungFaellig(
  art: ErinnerungsArt,
  t: ErinnerungsTermin & { rescheduleRequestedAt?: Date | null; status?: string },
  now: Date,
): "senden" | "entfaellt" | "warten" {
  if ((t.status ?? "booked") !== "booked" || t.rescheduleRequestedAt) return "entfaellt";
  const plan = erinnerungsPlan(t);
  const at = plan[art];
  if (!at) return "entfaellt";
  if (now.getTime() < at.getTime()) return "warten";
  const bisStart = t.startsAt.getTime() - now.getTime();
  if (art === "vortag" && plan.stunde && now.getTime() >= plan.stunde.getTime()) return "entfaellt";
  if (art === "stunde" && bisStart <= 10 * MIN) return "entfaellt";
  if (art === "gleich" && bisStart <= 0) return "entfaellt";
  return "senden";
}

const uhrTeile = (d: Date) =>
  Object.fromEntries(new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((p) => [p.type, p.value]));

/** „10 Uhr“, „10:30 Uhr“ (Berlin). */
export function uhrKurz(d: Date): string {
  const p = uhrTeile(d);
  return p.minute === "00" ? `${Number(p.hour)} Uhr` : `${Number(p.hour)}:${p.minute} Uhr`;
}

/** „Videotermin“ bzw. „Telefontermin“. */
export function terminArtWort(mode: string): string {
  return mode === "video" ? "Videotermin" : "Telefontermin";
}

/** Satz zu den Verträgen bei Komplettcheck = Ja (Ole, 17.11.2026). */
export function vertraegeBereitSatz(an: Ansprache): string {
  return a(an, "Leg gern deine bestehenden Verträge bereit.", "Legen Sie gern Ihre bestehenden Verträge bereit.");
}

/** Zugang zum Termin: Videolink bzw. „Herr Kannapinn ruft Sie an.“ */
export function zugangText(an: Ansprache, person: VermittlerName, mode: string, meetUrl: string | null | undefined): string {
  if (mode === "video") return meetUrl?.trim() || a(an, "Den Link bekommst du kurz vorher hier im Chat.", "Den Link bekommen Sie kurz vorher hier im Chat.");
  return a(an, `${person.nom} ruft dich an.`, `${person.nom} ruft Sie an.`);
}

export type VortagEingabe = {
  an: Ansprache;
  /** Anrede-Zeile „Guten Tag Frau Becker,“ */
  hi: string;
  /** „morgen um 10 Uhr“ (zeitKurz) */
  wann: string;
  /** Nutzensatz (terminNutzenSatz) */
  nutzen: string;
  komplettcheck: boolean;
  mode: string;
  meetUrl: string | null | undefined;
  person: VermittlerName;
  /** Policen-Erinnerung (P2, lib/whatsapp/termin-strecke.ts policenVortagSatzFuer), solange keine Police da ist */
  policen?: string | null;
};

/** Platzhalter der Vortags-Vorlage v5 (reminder) nach dem Namen: Wann, Nutzen (+ Verträge), Zugang. */
export function vortagParams(o: VortagEingabe): [string, string, string] {
  const nutzen = [o.nutzen, o.komplettcheck ? vertraegeBereitSatz(o.an) : "", o.policen ?? ""].filter(Boolean).join(" ");
  return [o.wann, nutzen, zugangText(o.an, o.person, o.mode, o.meetUrl)];
}

/**
 * Vortags-Erinnerung als Freitext: „Guten Tag Frau Becker, kurze Erinnerung an Ihren Termin morgen um 10 Uhr. In einem
 * kurzen Videotermin zeigt Ihnen Herr Kannapinn, … [Legen Sie gern Ihre bestehenden Verträge bereit.] So geht es los:
 * <Link> Passt es weiterhin?“ (Absätze wie im Chat üblich).
 */
export function vortagText(o: VortagEingabe): string {
  const [wann, nutzen, zugang] = vortagParams(o);
  return `${o.hi} kurze Erinnerung an ${a(o.an, "deinen", "Ihren")} Termin ${wann}. ${nutzen}\n\nSo geht es los: ${zugang}\n\nPasst es weiterhin?`;
}

/** 1 Stunde vorher (Ole, 17.11.2026), ohne Link. */
export function stundeText(o: { an: Ansprache; hi: string; mode: string; person: VermittlerName }): string {
  return (
    `${o.hi} in einer Stunde ist ${a(o.an, "dein", "Ihr")} ${terminArtWort(o.mode)} mit ${o.person.dat}. ` +
    `${a(o.an, "Passt bei dir alles?", "Passt bei Ihnen alles?")} Falls etwas dazwischengekommen ist, finden wir gern eine neue Zeit.`
  );
}

/** 15 Minuten vorher (Ole, 17.11.2026), nur Videotermine mit Link. */
export function gleichText(o: { an: Ansprache; hi: string; person: VermittlerName; startsAt: Date; meetUrl: string }): string {
  return (
    `${o.hi} gleich geht es los: ${o.person.nom} ist um ${uhrKurz(o.startsAt)} für ${a(o.an, "dich", "Sie")} im Videoraum. ` +
    `Der Link funktioniert direkt im Handy-Browser, ohne App: ${o.meetUrl}. Bis gleich!`
  );
}

/** Nach „Fehlt noch“ (Ole, 17.11.2026): „Herr Kannapinn wartet schon im Videoraum auf Sie: <Link>“. */
export function wartetText(o: { an: Ansprache; hi: string; person: VermittlerName; meetUrl: string }): string {
  return `${o.hi} ${o.person.nom} wartet schon im Videoraum auf ${a(o.an, "dich", "Sie")}: ${o.meetUrl}`;
}

/** Name des Leads für den Vermittler: „Frau Becker“, sonst der volle Name, sonst „Ihr Kontakt“. */
export function leadLabel(kontakt: AnredeKontakt | null | undefined, fallback?: string | null): string {
  const n = anredeName("sie", kontakt);
  return n || kontakt?.fullName?.trim() || fallback?.trim() || "Ihr Kontakt";
}

/** Anwesenheit am Termin (Appointment.attendance). */
export type Anwesenheit = "erschienen" | "fehlt" | "nicht_erschienen";
export const ANWESENHEIT_LABEL: Record<Anwesenheit, string> = { erschienen: "Erschienen", fehlt: "Fehlt noch", nicht_erschienen: "Nicht erschienen" };

export function asAnwesenheit(v: unknown): Anwesenheit | null {
  return v === "erschienen" || v === "fehlt" || v === "nicht_erschienen" ? v : null;
}

/** Ende des Termins (endsAt, sonst Start plus 30 Minuten). */
export function terminEnde(t: { startsAt: Date; endsAt?: Date | null }): Date {
  return t.endsAt ?? new Date(t.startsAt.getTime() + STANDARD_DAUER_MS);
}

/**
 * Welche Frage steht am Termin an (Entscheidungsblatt, „Heute“)?
 *   „start“    ab Terminbeginn bis Ende: „Ist Frau Becker da?“ (Ja, da / Fehlt noch)
 *   „wartet“   nach „Fehlt noch“ bis Ende: WhatsApp ist raus, Anruf-Knopf, „Ist doch da“
 *   „nachher“  nach dem Ende ohne Antwort bzw. nach „Fehlt noch“: „Ist Frau Becker noch gekommen?“ (Ja / Nein)
 *   null       vor dem Termin, schon beantwortet, Telefontermin oder nicht mehr gebucht
 * Nur Videotermine (beim Telefontermin ruft der Vermittler an und trägt das Ergebnis wie bisher ein).
 */
export function anwesenheitsFrage(
  t: { startsAt: Date; endsAt?: Date | null; mode: string; status: string; attendance?: string | null },
  now: Date,
): "start" | "wartet" | "nachher" | null {
  if (t.mode !== "video" || t.status !== "booked") return null;
  const att = asAnwesenheit(t.attendance);
  if (att === "erschienen" || att === "nicht_erschienen") return null;
  if (now.getTime() < t.startsAt.getTime() - 5 * MIN) return null;
  const vorbei = now.getTime() >= terminEnde(t).getTime();
  if (vorbei) return "nachher";
  return att === "fehlt" ? "wartet" : "start";
}

/** Push zum Terminbeginn an den Vermittler (Sie-Form; der Push hat keine Knöpfe, daher Deep-Link aufs Blatt). */
export function startPush(o: { appointmentId: string; name: string; startsAt: Date }) {
  return {
    title: `Ist ${o.name} da?`,
    body: `Ihr Videotermin um ${uhrKurz(o.startsAt)}. Tippen Sie: Ja, da oder Fehlt noch, erinnern.`,
    url: `/buyer/termine/${o.appointmentId}`,
    tag: `termin-start:${o.appointmentId}`,
  };
}

/** Rückfrage nach dem Termin, wenn „Fehlt noch“ ohne weitere Reaktion blieb. */
export function nachherPush(o: { appointmentId: string; name: string }) {
  return {
    title: `Ist ${o.name} noch gekommen?`,
    body: "Kurz Ja oder Nein. Bei Nein fragt der Assistent nach einem neuen Termin.",
    url: `/buyer/termine/${o.appointmentId}`,
    tag: `termin-nachher:${o.appointmentId}`,
  };
}
