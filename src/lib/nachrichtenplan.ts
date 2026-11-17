// Nachrichtenplan je Lead (Show-up-Paket, Basis für P6 „Nächste Nachrichten sichtbar“, Ole 17.11.2026): alle geplanten
// automatischen Nachrichten und Aufgaben mit Zeit, Kanal und Vorschautext. Quellen:
//   Erinnerungen zum Termin   Vortag (WhatsApp und E-Mail), 1 Stunde, 15 Minuten (lib/showup.ts)
//   Terminbeginn              Push „Ist Frau Becker da?“ an den Vermittler (nur Video)
//   Abfolgen                  offene Schritte laufender Nachfass-Abfolgen (lib/lead-sequences.ts), WhatsApp bzw. Anruf
//   Anrufplan                 nächster Versuch „Anrufversuch X von 6“ und die weiteren voraussichtlichen Versuche
//                             (lib/call-plan.ts); vor dem Start der Auslöser 30 Min. nach dem Erstanschreiben
// Rein (ohne Datenbank, testbar); Laden: lib/nachrichtenplan-server.ts. Noch ohne Oberfläche.
// „voraussichtlich“: hängt davon ab, was vorher passiert (z. B. nicht erreicht), oder wartet aufs Versandfenster.

import type { Ansprache } from "@/lib/ansprache";
import type { VermittlerName } from "@/lib/whatsapp/gespraech";
import { CALL_ATTEMPTS_TARGET, callPlanNote, isCallPlanNote, nextCallAttemptAt } from "@/lib/call-plan";
import { SEQUENCES, type SequenceCtx, type SequenceKind } from "@/lib/lead-sequences";
import { erinnerungsPlan, gleichText, startPush, stundeText, vortagText } from "@/lib/showup";
import { anrufPush } from "@/lib/anruf-ausloeser";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

export type PlanKanal = "whatsapp" | "email" | "push" | "anruf";
export type PlanQuelle = "erinnerung" | "terminbeginn" | "abfolge" | "anrufplan";

export type PlanEintrag = {
  /** Zeitpunkt (ISO) */
  at: string;
  kanal: PlanKanal;
  quelle: PlanQuelle;
  /** Kurz für die Anzeige: „Erinnerung am Vortag“, „Anrufversuch 2 von 6“ … */
  titel: string;
  /** Vorschautext (an den Lead bzw. an den Vermittler) */
  vorschau: string;
  /** Hängt von vorherigen Schritten ab bzw. vom Versandfenster */
  voraussichtlich?: boolean;
  terminId?: string;
  abfolgeId?: string;
};

export type PlanTermin = {
  id: string;
  startsAt: Date;
  createdAt: Date;
  endsAt?: Date | null;
  mode: string;
  meetUrl: string | null;
  status: string;
  komplettcheck: boolean | null;
  reminderSentAt: Date | null;
  soonReminderSentAt: Date | null;
  startReminderSentAt: Date | null;
  startPushAt: Date | null;
  rescheduleRequestedAt: Date | null;
  attendance: string | null;
};

export type PlanEingabe = {
  now: Date;
  an: Ansprache;
  /** Anrede-Zeile an den Lead („Guten Tag Frau Becker,“) */
  hi: string;
  person: VermittlerName;
  /** Name des Leads für den Vermittler („Frau Becker“) */
  label: string;
  leadId: string;
  /** Kommende Termine (gebucht) */
  termine: PlanTermin[];
  /** Nutzensatz für die Vortags-Erinnerung (terminNutzenSatz), je Termin-ID */
  nutzen?: Record<string, string>;
  /** Wann (zeitKurz) je Termin-ID für die Vortags-Erinnerung, sonst Datum */
  wann?: Record<string, string>;
  /** Betreff der Vortags-Mail je Termin-ID (erinnerungsBetreff) */
  mailBetreff?: Record<string, string>;
  /** Hat der Lead eine E-Mail-Adresse (Vortags-Mail)? */
  email: boolean;
  /** Kann WhatsApp gehen (Nummer, kein STOPP, Einwilligung)? */
  whatsapp: boolean;
  abfolgen: { id: string; kind: string; step: number; startedAt: Date; nextAt: Date | null; stoppedAt: Date | null }[];
  abfolgeKontext: SequenceCtx;
  anrufplan: { followUpAt: Date | null; followUpNote: string | null; callAttempts: number; callPlanStartedAt: Date | null; lastCallAttemptAt: Date | null };
  /** Auslöser „keine Antwort 30 Min. nach dem Erstanschreiben“, falls noch offen: wann er greift */
  anrufAusloeserAt?: Date | null;
};

const iso = (d: Date) => d.toISOString();
/** Fällige, aber noch nicht gesendete Schritte gehen beim nächsten Lauf raus: nicht in die Vergangenheit legen. */
const fruehestens = (d: Date, now: Date) => (d.getTime() < now.getTime() ? now : d);

function terminEintraege(p: PlanEingabe, t: PlanTermin): PlanEintrag[] {
  if (t.status !== "booked" || t.startsAt.getTime() <= p.now.getTime() - HOUR) return [];
  const out: PlanEintrag[] = [];
  const plan = erinnerungsPlan(t);
  const vorStart = (d: Date | null) => !!d && t.startsAt.getTime() > p.now.getTime() && !t.rescheduleRequestedAt;
  if (p.whatsapp || p.email) {
    if (plan.vortag && !t.reminderSentAt && vorStart(plan.vortag) && !(plan.stunde && p.now.getTime() >= plan.stunde.getTime())) {
      const at = iso(fruehestens(plan.vortag, p.now));
      const vorschau = vortagText({
        an: p.an,
        hi: p.hi,
        wann: p.wann?.[t.id] ?? "morgen",
        nutzen: p.nutzen?.[t.id] ?? "",
        komplettcheck: t.komplettcheck === true,
        mode: t.mode,
        meetUrl: t.meetUrl,
        person: p.person,
      });
      if (p.whatsapp) out.push({ at, kanal: "whatsapp", quelle: "erinnerung", titel: "Erinnerung am Vortag", vorschau, terminId: t.id });
      if (p.email) out.push({ at, kanal: "email", quelle: "erinnerung", titel: "Erinnerungs-Mail am Vortag", vorschau: `Betreff: ${p.mailBetreff?.[t.id] ?? `Erinnerung an den Termin mit ${p.person.dat}`}`, terminId: t.id });
    }
  }
  if (p.whatsapp) {
    if (plan.stunde && !t.soonReminderSentAt && vorStart(plan.stunde) && t.startsAt.getTime() - p.now.getTime() > 10 * 60 * 1000) {
      out.push({ at: iso(fruehestens(plan.stunde, p.now)), kanal: "whatsapp", quelle: "erinnerung", titel: "Erinnerung 1 Stunde vorher", vorschau: stundeText({ an: p.an, hi: p.hi, mode: t.mode, person: p.person }), terminId: t.id });
    }
    if (plan.gleich && t.meetUrl && !t.startReminderSentAt && vorStart(plan.gleich)) {
      out.push({
        at: iso(fruehestens(plan.gleich, p.now)),
        kanal: "whatsapp",
        quelle: "erinnerung",
        titel: "Erinnerung 15 Minuten vorher",
        vorschau: gleichText({ an: p.an, hi: p.hi, person: p.person, startsAt: t.startsAt, meetUrl: t.meetUrl }),
        terminId: t.id,
      });
    }
  }
  if (t.mode === "video" && !t.startPushAt && !t.attendance && t.startsAt.getTime() > p.now.getTime() - 15 * 60 * 1000) {
    const push = startPush({ appointmentId: t.id, name: p.label, startsAt: t.startsAt });
    out.push({ at: iso(fruehestens(t.startsAt, p.now)), kanal: "push", quelle: "terminbeginn", titel: "Push an Sie zum Terminbeginn", vorschau: push.title, terminId: t.id });
  }
  return out;
}

function abfolgeEintraege(p: PlanEingabe, a: PlanEingabe["abfolgen"][number]): PlanEintrag[] {
  const def = SEQUENCES[a.kind as SequenceKind];
  if (!def || a.stoppedAt || !a.nextAt) return [];
  const out: PlanEintrag[] = [];
  let prev = a.nextAt;
  for (let i = a.step; i < def.steps.length; i++) {
    const step = def.steps[i];
    const at = i === a.step ? fruehestens(a.nextAt, p.now) : new Date(Math.max(a.startedAt.getTime() + step.day * DAY, prev.getTime() + 2 * HOUR));
    prev = at;
    const nr = `(Schritt ${i + 1} von ${def.steps.length})`;
    if (step.action === "call") {
      out.push({ at: iso(at), kanal: "anruf", quelle: "abfolge", titel: `${def.label}: Anruf-Aufgabe ${nr}`, vorschau: step.note, voraussichtlich: i > a.step, abfolgeId: a.id });
    } else {
      const zeiten = step.purpose === "followup" || step.slots ? " (mit zwei freien Zeiten, falls der Kalender verbunden ist)" : "";
      out.push({
        at: iso(at),
        kanal: "whatsapp",
        quelle: "abfolge",
        titel: `${def.label}: WhatsApp ${nr}${zeiten}`,
        vorschau: step.text(p.abfolgeKontext),
        // WhatsApp nur Mo bis Sa 9 bis 19 Uhr, ohne Antwort; ohne Vorlage wird es eine Anruf-Aufgabe
        voraussichtlich: true,
        abfolgeId: a.id,
      });
    }
  }
  return out;
}

/** Weitere Anrufversuche ab Versuch `ab` (inklusive), wenn jeder vorherige „nicht erreicht“ bleibt. */
function anrufVersuche(p: PlanEingabe, ab: number, erstAt: Date, startedAt: Date): PlanEintrag[] {
  const out: PlanEintrag[] = [];
  let at: Date | null = erstAt;
  for (let n = ab; n <= CALL_ATTEMPTS_TARGET && at; n++) {
    out.push({ at: iso(at), kanal: "anruf", quelle: "anrufplan", titel: callPlanNote(n), vorschau: `Aufgabe auf „Heute“: ${p.label} anrufen`, voraussichtlich: n > ab });
    at = nextCallAttemptAt({ done: n, startedAt, lastAt: at, now: at });
  }
  return out;
}

function anrufplanEintraege(p: PlanEingabe): PlanEintrag[] {
  const ap = p.anrufplan;
  if (ap.followUpAt && isCallPlanNote(ap.followUpNote)) {
    const n = Number(/(\d+) von/.exec(ap.followUpNote ?? "")?.[1] ?? ap.callAttempts + 1);
    const at = fruehestens(ap.followUpAt, p.now);
    return anrufVersuche(p, n, at, ap.callPlanStartedAt ?? ap.lastCallAttemptAt ?? at);
  }
  if (p.anrufAusloeserAt) {
    const at = fruehestens(p.anrufAusloeserAt, p.now);
    const push = anrufPush({ leadId: p.leadId, name: p.label });
    return [
      { at: iso(at), kanal: "push", quelle: "anrufplan", titel: "Keine Antwort: Push an Sie", vorschau: push.title, voraussichtlich: true },
      ...anrufVersuche(p, 1, at, at).map((e) => ({ ...e, voraussichtlich: true })),
    ];
  }
  return [];
}

/** Alle geplanten automatischen Nachrichten und Aufgaben eines Leads, nach Zeit sortiert. */
export function planeNachrichten(p: PlanEingabe): PlanEintrag[] {
  const termine = p.termine.filter((t) => t.status === "booked");
  const kommend = termine.some((t) => t.startsAt.getTime() > p.now.getTime());
  return [
    ...termine.flatMap((t) => terminEintraege(p, t)),
    // Ein anstehender Termin beendet laufende Abfolgen (lib/lead-sequences.ts stopReasonFor)
    ...(kommend ? [] : p.abfolgen.flatMap((a) => abfolgeEintraege(p, a))),
    // Der Anrufplan steht unabhängig davon auf „Heute“
    ...anrufplanEintraege(p),
  ].sort((x, y) => x.at.localeCompare(y.at));
}
