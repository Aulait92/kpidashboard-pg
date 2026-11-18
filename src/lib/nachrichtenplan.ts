// Nachrichtenplan je Lead (Show-up-Paket, Basis für P6 „Nächste Nachrichten sichtbar“, Ole 17.11.2026): alle geplanten
// automatischen Nachrichten und Aufgaben mit Zeit, Kanal und Vorschautext. Quellen:
//   Erinnerungen zum Termin   Vortag (WhatsApp und E-Mail), 1 Stunde, 15 Minuten (lib/showup.ts)
//   Terminbeginn              Push „Ist Frau Becker da?“ an den Vermittler (nur Video)
//   Abfolgen                  offene Schritte laufender Nachfass-Abfolgen (lib/lead-sequences.ts), WhatsApp, E-Mail
//                             (Angebot Tag 5 mit [Rückruf wünschen]) bzw. Anruf, beim Angebot Tag 3 mit Push an Sie
//   Anrufplan                 nächster Versuch „Anrufversuch X von 6“ und die weiteren voraussichtlichen Versuche
//                             (lib/call-plan.ts); vor dem Start der Auslöser 30 Min. nach dem Erstanschreiben
// Rein (ohne Datenbank, testbar); Laden: lib/nachrichtenplan-server.ts. Oberfläche (Paket P6): „Nächste Nachrichten“ am
// Kontakt (components/naechste-nachrichten.tsx) mit Aktionen je Eintrag (aktionen, key; lib/nachrichtenplan-aktionen.ts),
// die Zeile „Morgen … automatische Nachrichten“ auf „Heute“ (zaehleAutomatische) und die Ablaufübersicht (lib/ablauf.ts).
// „voraussichtlich“: hängt davon ab, was vorher passiert (z. B. nicht erreicht), oder wartet aufs Versandfenster.

import type { Ansprache } from "@/lib/ansprache";
import type { VermittlerName } from "@/lib/whatsapp/gespraech";
import { CALL_ATTEMPTS_TARGET, callPlanNote, isCallPlanNote, nextCallAttemptAt } from "@/lib/call-plan";
import { SEQUENCES, type SequenceCtx, type SequenceKind } from "@/lib/lead-sequences";
import { erinnerungsPlan, gleichText, startPush, stundeText, vortagText } from "@/lib/showup";
import { anrufPush } from "@/lib/anruf-ausloeser";
import { angebotAnrufPush, mailWerte, naechsterVersand, vorabCheckPush, vorabCheckZeit, vorlagenMail, type MailVorlageText } from "@/lib/angebot-senden";
import { STANDARD_VORLAGEN_JE, type VorlageKey } from "@/lib/mail/vorlagen";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

export type PlanKanal = "whatsapp" | "email" | "push" | "anruf";
export type PlanQuelle = "erinnerung" | "terminbeginn" | "abfolge" | "anrufplan";

/** Was der Vermittler mit einem Eintrag tun kann (Paket P6). */
export type PlanAktion = "jetzt" | "verschieben" | "ueberspringen" | "rueckgaengig";

export type PlanEintrag = {
  /** Eindeutig je Eintrag, Ziel der Aktionen: abfolge:<id>:<schritt>, erinnerung:<termin>:<art>, anruf:<n>, … */
  key: string;
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
  /** Aktionen am Kontakt (leer: nur Anzeige) */
  aktionen?: PlanAktion[];
  /** Vom Vermittler übersprungen: geht nicht raus (Rückgängig möglich) */
  uebersprungen?: boolean;
  /** „Alle pausieren“: wartet, bis der Vermittler fortsetzt */
  pausiert?: boolean;
};

/** Erinnerungen, die der Vermittler einzeln überspringen kann (Appointment.erinnerungenUebersprungen). */
export const ERINNERUNG_ARTEN = ["vortag", "vortag_mail", "stunde", "gleich"] as const;
export type ErinnerungKey = (typeof ERINNERUNG_ARTEN)[number];

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
  /** Vom Vermittler übersprungen (P6) */
  erinnerungenUebersprungen?: string[];
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
  /** Mail-Vorlagen des Vermittlers für E-Mail-Schritte (sonst die Standardtexte) */
  mailVorlagen?: Partial<Record<VorlageKey, MailVorlageText>>;
  /** Adresse am Kontakt oder aus dem Chat (Nachfass-Mail zum Angebot); ohne Angabe wie email */
  emailKontakt?: boolean;
  /** Kann WhatsApp gehen (Nummer, kein STOPP, Einwilligung)? */
  whatsapp: boolean;
  abfolgen: {
    id: string;
    kind: string;
    step: number;
    startedAt: Date;
    nextAt: Date | null;
    stoppedAt: Date | null;
    vorabCheckStep?: number | null;
    neustartAt?: Date | null;
    /** Vom Vermittler übersprungene Schritte (P6) */
    uebersprungen?: number[];
  }[];
  abfolgeKontext: SequenceCtx;
  anrufplan: { followUpAt: Date | null; followUpNote: string | null; callAttempts: number; callPlanStartedAt: Date | null; lastCallAttemptAt: Date | null };
  /** Auslöser „keine Antwort 30 Min. nach dem Erstanschreiben“, falls noch offen: wann er greift */
  anrufAusloeserAt?: Date | null;
  /** „Alle pausieren“ am Kontakt (Lead.nachrichtenPausiertAt) */
  pausiertAt?: Date | null;
};

const iso = (d: Date) => d.toISOString();
/** Fällige, aber noch nicht gesendete Schritte gehen beim nächsten Lauf raus: nicht in die Vergangenheit legen. */
const fruehestens = (d: Date, now: Date) => (d.getTime() < now.getTime() ? now : d);

/** Erinnerung (an den Lead): überspringbar, wartet bei „Alle pausieren“. */
function erinnerung(p: PlanEingabe, t: PlanTermin, art: ErinnerungKey, e: Omit<PlanEintrag, "key" | "quelle" | "terminId">): PlanEintrag {
  const weg = (t.erinnerungenUebersprungen ?? []).includes(art);
  return {
    ...e,
    key: `erinnerung:${t.id}:${art}`,
    quelle: "erinnerung",
    terminId: t.id,
    aktionen: weg ? ["rueckgaengig"] : ["ueberspringen"],
    ...(weg ? { uebersprungen: true } : {}),
    ...(p.pausiertAt && !weg ? { pausiert: true } : {}),
  };
}

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
      if (p.whatsapp) out.push(erinnerung(p, t, "vortag", { at, kanal: "whatsapp", titel: "Erinnerung am Vortag", vorschau }));
      if (p.email) out.push(erinnerung(p, t, "vortag_mail", { at, kanal: "email", titel: "Erinnerungs-Mail am Vortag", vorschau: `Betreff: ${p.mailBetreff?.[t.id] ?? `Erinnerung an den Termin mit ${p.person.dat}`}` }));
    }
  }
  if (p.whatsapp) {
    if (plan.stunde && !t.soonReminderSentAt && vorStart(plan.stunde) && t.startsAt.getTime() - p.now.getTime() > 10 * 60 * 1000) {
      out.push(erinnerung(p, t, "stunde", { at: iso(fruehestens(plan.stunde, p.now)), kanal: "whatsapp", titel: "Erinnerung 1 Stunde vorher", vorschau: stundeText({ an: p.an, hi: p.hi, mode: t.mode, person: p.person }) }));
    }
    if (plan.gleich && t.meetUrl && !t.startReminderSentAt && vorStart(plan.gleich)) {
      out.push(
        erinnerung(p, t, "gleich", {
          at: iso(fruehestens(plan.gleich, p.now)),
          kanal: "whatsapp",
          titel: "Erinnerung 15 Minuten vorher",
          vorschau: gleichText({ an: p.an, hi: p.hi, person: p.person, startsAt: t.startsAt, meetUrl: t.meetUrl }),
        }),
      );
    }
  }
  if (t.mode === "video" && !t.startPushAt && !t.attendance && t.startsAt.getTime() > p.now.getTime() - 15 * 60 * 1000) {
    const push = startPush({ appointmentId: t.id, name: p.label, startsAt: t.startsAt });
    out.push({ key: `start:${t.id}`, at: iso(fruehestens(t.startsAt, p.now)), kanal: "push", quelle: "terminbeginn", titel: "Push an Sie zum Terminbeginn", vorschau: push.title, terminId: t.id });
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
    // Bedenkzeit bzw. Pause (P5): Die Tage zählen ab dem Neustart
    const base = a.neustartAt ?? a.startedAt;
    const roh = i === a.step ? fruehestens(a.nextAt, p.now) : new Date(Math.max(base.getTime() + step.day * DAY, prev.getTime() + 2 * HOUR));
    // Angebot (P3): WhatsApp und E-Mail gehen erst im Versandfenster (Mo bis Sa 9 bis 19 Uhr) raus
    const angebot = a.kind === "offer" || a.kind === "offer_selbst";
    const at = angebot && step.action !== "call" ? naechsterVersand(roh) : roh;
    prev = at;
    const nr = `(Schritt ${i + 1} von ${def.steps.length})`;
    // Nächste Nachrichten (P6): übersprungen, pausiert, Aktionen (der nächste Schritt: jetzt, verschieben, überspringen)
    const weg = (a.uebersprungen ?? []).includes(i);
    const p6 = {
      key: `abfolge:${a.id}:${i}`,
      aktionen: (weg ? ["rueckgaengig"] : i === a.step ? [...(step.action === "call" ? [] : ["jetzt" as const]), "verschieben", "ueberspringen"] : ["ueberspringen"]) as PlanAktion[],
      ...(weg ? { uebersprungen: true } : {}),
      ...(p.pausiertAt && !weg ? { pausiert: true } : {}),
    };
    const begleit = (art: string) => ({ key: `${art}:${a.id}:${i}`, ...(p.pausiertAt ? { pausiert: true } : {}) });
    // Angebot (P3): Vorab-Check-Push an den Vermittler am Vorabend jedes automatischen Nachfassens (WhatsApp, E-Mail)
    if (!weg && angebot && step.action !== "call" && !(i === a.step && a.vorabCheckStep === a.step)) {
      const versand = at;
      const zeit = vorabCheckZeit(versand);
      if (zeit.getTime() > p.now.getTime()) {
        const push = vorabCheckPush({ leadId: p.leadId, name: p.label, kanal: step.action, versand, now: zeit });
        out.push({ ...begleit("vorab"), at: iso(zeit), kanal: "push", quelle: "abfolge", titel: `${def.label}: Vorab-Check an Sie ${nr}`, vorschau: push.title, voraussichtlich: true, abfolgeId: a.id });
      }
    }
    if (step.action === "call") {
      out.push({ ...p6, at: iso(at), kanal: "anruf", quelle: "abfolge", titel: `${def.label}: Anruf-Aufgabe ${nr}`, vorschau: step.note, voraussichtlich: i > a.step, abfolgeId: a.id });
      // Angebot Tag 3: dazu ein Push an den Vermittler (nur, wenn die Aufgabe neu angelegt wird)
      if (step.push && !weg) {
        out.push({ ...begleit("push"), at: iso(at), kanal: "push", quelle: "abfolge", titel: `${def.label}: Push an Sie ${nr}`, vorschau: angebotAnrufPush({ leadId: p.leadId, name: p.label }).title, voraussichtlich: true, abfolgeId: a.id });
      }
    } else if (step.action === "email") {
      // Text aus der Vorlage des Vermittlers (geladen in lib/nachrichtenplan-server.ts), sonst der Standardtext
      const c = p.abfolgeKontext;
      const vorlage = p.mailVorlagen?.[step.vorlage] ?? STANDARD_VORLAGEN_JE[c.an].find((v) => v.key === step.vorlage)!;
      const knoepfe = step.knoepfe ?? [];
      const m = vorlagenMail({
        vorlage,
        werte: mailWerte({ an: c.an, kontakt: c.kontakt, thema: c.topic, meinname: c.person?.nom ?? "", now: at, extra: { ...(knoepfe.includes("rueckruf") ? { rueckruf_link: "[Link Rückruf]" } : {}), ...step.zusatz?.(c) } }),
        knoepfe: [
          ...(knoepfe.includes("angebot") ? [{ label: "Angebot ansehen", href: "[Link zum Angebot]" }] : []),
          ...(knoepfe.includes("rueckruf") ? [{ label: "Rückruf wünschen", href: "[Link Rückruf]" }] : []),
        ],
        signatur: { text: "", html: "" },
      });
      out.push({
        ...p6,
        at: iso(at),
        kanal: "email",
        quelle: "abfolge",
        titel: `${def.label}: ${step.titel} ${nr}${(p.emailKontakt ?? p.email) ? "" : " (entfällt ohne E-Mail-Adresse)"}`,
        vorschau: `Betreff: ${m.subject}\n\n${m.text.trim()}`,
        // E-Mail nur Mo bis Sa 9 bis 19 Uhr und nur, solange der Lead nicht antwortet
        voraussichtlich: true,
        abfolgeId: a.id,
      });
    } else {
      const zeiten = step.purpose === "followup" || step.slots ? " (mit zwei freien Zeiten, falls der Kalender verbunden ist)" : "";
      out.push({
        ...p6,
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
    out.push({ key: `anruf:${n}`, at: iso(at), kanal: "anruf", quelle: "anrufplan", titel: callPlanNote(n), vorschau: `Aufgabe auf „Heute“: ${p.label} anrufen`, voraussichtlich: n > ab });
    at = nextCallAttemptAt({ done: n, startedAt, lastAt: at, now: at });
  }
  return out;
}

function anrufplanEintraege(p: PlanEingabe): PlanEintrag[] {
  const ap = p.anrufplan;
  if (ap.followUpAt && isCallPlanNote(ap.followUpNote)) {
    const n = Number(/(\d+) von/.exec(ap.followUpNote ?? "")?.[1] ?? ap.callAttempts + 1);
    const at = fruehestens(ap.followUpAt, p.now);
    // Der nächste Versuch steht als Wiedervorlage auf „Heute“: verschiebbar (P6)
    return anrufVersuche(p, n, at, ap.callPlanStartedAt ?? ap.lastCallAttemptAt ?? at).map((e, i) => (i === 0 ? { ...e, aktionen: ["verschieben" as const] } : e));
  }
  if (p.anrufAusloeserAt) {
    const at = fruehestens(p.anrufAusloeserAt, p.now);
    const push = anrufPush({ leadId: p.leadId, name: p.label });
    return [
      { key: "ausloeser", at: iso(at), kanal: "push", quelle: "anrufplan", titel: "Keine Antwort: Push an Sie", vorschau: push.title, voraussichtlich: true },
      ...anrufVersuche(p, 1, at, at).map((e) => ({ ...e, key: `ausloeser-${e.key}`, voraussichtlich: true })),
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

/** Geht an den Lead (WhatsApp, E-Mail), nicht an den Vermittler (Push, Anruf-Aufgabe). */
export const anLead = (e: Pick<PlanEintrag, "kanal">) => e.kanal === "whatsapp" || e.kanal === "email";

/**
 * Automatische Nachrichten an den Lead in [von, bis) (Zeile „Morgen … automatische Nachrichten“ auf „Heute“, P6):
 * WhatsApp und E-Mail, ohne übersprungene und pausierte.
 */
export function zaehleAutomatische(eintraege: PlanEintrag[], von: Date, bis: Date): PlanEintrag[] {
  return eintraege.filter((e) => anLead(e) && !e.uebersprungen && !e.pausiert && e.at >= von.toISOString() && e.at < bis.toISOString());
}

export { morgenText } from "@/lib/morgen-text";
