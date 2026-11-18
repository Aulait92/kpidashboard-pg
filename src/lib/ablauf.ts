// Ablaufübersicht für Einstellungen → Assistent → Ablauf (Paket P6, Ole 17.11.2026): die Standard-Abfolge eines Kontakts
// als Zeitleiste, aus denselben Daten wie der Nachrichtenplan am Kontakt (lib/nachrichtenplan.ts):
//   Abfolgen (SEQUENCES in lib/lead-sequences.ts: Tage, Kanal, Text), Erinnerungen (ERINNERUNG und Texte aus
//   lib/showup.ts), Anrufplan (lib/call-plan.ts), Erstanschreiben, Terminvorschlag und Buchung (lib/whatsapp/*).
// Die Texte sind Beispiele mit „Frau Becker“ (Du: Julia), in der eingestellten Ansprache und mit dem Namen des Vermittlers.
// Rein (ohne Datenbank); später nutzen M7 („E-Mails“: Stufe je Vorlage) und P8 (Onboarding-Zeitleiste) dieselben Phasen.

import { anredeZeile, type Ansprache, type AnredeKontakt } from "@/lib/ansprache";
import { CALL_ATTEMPTS_TARGET, callPlanNote, nextCallAttemptAt } from "@/lib/call-plan";
import { SEQUENCES, type SequenceCtx, type SequenceKind } from "@/lib/lead-sequences";
import { ERINNERUNG, gleichText, leadLabel, startPush, stundeText, uhrKurz, vortagText } from "@/lib/showup";
import { erstanschreibenText } from "@/lib/whatsapp/erstanschreiben";
import { offeneZwischenfrage, zwischenfrageText, zwischenKnoepfe } from "@/lib/whatsapp/zwischenfrage";
import { buchungsText, terminNutzenSatz, terminVorschlagText, type VermittlerName } from "@/lib/whatsapp/gespraech";
import { mailWerte, vorlagenMail } from "@/lib/angebot-senden";
import { STANDARD_VORLAGEN_JE } from "@/lib/mail/vorlagen";
import type { PlanKanal } from "@/lib/nachrichtenplan";

export type AblaufKanal = PlanKanal | "aktion";

export type AblaufSchritt = {
  key: string;
  /** „Sofort“, „nach 2 Std.“, „Tag 5“, „1 Tag vorher“ */
  wann: string;
  kanal: AblaufKanal;
  titel: string;
  /** Beispieltext (WhatsApp mit *fett*, E-Mail mit „Betreff: …“) */
  vorschau?: string;
  /** Kurzer Zusatz („nur Videotermine“) */
  hinweis?: string;
};

export type AblaufPhase = {
  key: "erstkontakt" | "termin" | "angebot" | "bedenkzeit";
  titel: string;
  /** Ein Satz: worauf sich die Zeiten beziehen */
  bezug: string;
  schritte: AblaufSchritt[];
  /** Zweige, wenn etwas anders läuft (keine Antwort, nicht erreicht, nicht erschienen) */
  sonst?: { key: string; titel: string; schritte: AblaufSchritt[] }[];
  /** Läuft nur mit „Automatisch nachfassen“ (AgentConfig.followUpSequencesEnabled) */
  nachfassen?: boolean;
};

export type AblaufEingabe = {
  an: Ansprache;
  person: VermittlerName;
  /** Beispielzeit für Termin-Texte (Uhrzeit egal, nur für die Darstellung) */
  beispielTermin: Date;
  /** Beispielstart des Anrufplans (erster Versuch), z. B. Montag 10 Uhr */
  anrufStart: Date;
};

/** Beispiel-Kontakt der Übersicht. */
export const BEISPIEL_KONTAKT: AnredeKontakt = { firstName: "Julia", lastName: "Becker", salutation: "Frau", fullName: "Julia Becker" };
const BEISPIEL_SOURCE = "Privatschutz";
const BEISPIEL_FORMULAR = [{ label: "Versicherungsinteresse", value: "Haftpflicht und Hausrat" }];
const BEISPIEL_LINK = "https://meet.google.com/abc-defg-hij";

const HOUR = 60 * 60 * 1000;
const MIN = 60 * 1000;
const DAY = 24 * HOUR;
/** Kalendertag (Berlin) als Zahl für Abstände in Tagen. */
const berlinMitternacht = (d: Date) => Date.parse(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(d)}T00:00:00Z`);

/** Abstand als Text: „sofort“, „nach 2 Std.“, „nach 3 Tagen“ bzw. „Tag 5“ (Angebot: Tage ab dem Versand). */
export function abstandText(day: number, art: "nach" | "tag" = "nach"): string {
  if (day <= 0) return "Sofort";
  if (day < 1) return `nach ${Math.round(day * 24)} Std.`;
  if (art === "tag") return `Tag ${day}`;
  return day === 1 ? "nach 1 Tag" : `nach ${day} Tagen`;
}

/** „1 Tag vorher“, „1 Std. vorher“, „15 Min. vorher“. */
export function vorherText(ms: number): string {
  if (ms >= 24 * HOUR) return ms === 24 * HOUR ? "1 Tag vorher" : `${Math.round(ms / (24 * HOUR))} Tage vorher`;
  if (ms >= HOUR) return `${Math.round(ms / HOUR)} Std. vorher`;
  return `${Math.round(ms / MIN)} Min. vorher`;
}

/** Schritte einer Abfolge als Zeitleiste (Text wie beim Versand, lib/lead-sequences.ts). */
function abfolgeSchritte(kind: SequenceKind, c: SequenceCtx, art: "nach" | "tag"): AblaufSchritt[] {
  const def = SEQUENCES[kind];
  return def.steps.map((step, i) => {
    const key = `${kind}:${i}`;
    const wann = abstandText(step.day, art);
    if (step.action === "call") {
      return { key, wann, kanal: "anruf" as const, titel: "Anruf-Aufgabe auf „Heute“", vorschau: step.note, ...(step.push ? { hinweis: "mit Push an Sie" } : {}) };
    }
    if (step.action === "email") {
      const vorlage = STANDARD_VORLAGEN_JE[c.an].find((v) => v.key === step.vorlage)!;
      const knoepfe = step.knoepfe ?? [];
      const m = vorlagenMail({
        vorlage,
        werte: mailWerte({ an: c.an, kontakt: c.kontakt, thema: c.topic, meinname: c.person?.nom ?? "", now: new Date(), extra: { ...(knoepfe.includes("rueckruf") ? { rueckruf_link: "[Link Rückruf]" } : {}), ...step.zusatz?.(c) } }),
        knoepfe: [
          ...(knoepfe.includes("angebot") ? [{ label: "Angebot ansehen", href: "[Link zum Angebot]" }] : []),
          ...(knoepfe.includes("rueckruf") ? [{ label: "Rückruf wünschen", href: "[Link Rückruf]" }] : []),
        ],
        signatur: { text: "", html: "" },
      });
      return { key, wann, kanal: "email" as const, titel: step.titel.replace(/\s*mit \[Rückruf wünschen\]/, ""), vorschau: `Betreff: ${m.subject}\n\n${m.text.trim()}`, hinweis: knoepfe.includes("rueckruf") ? "mit Knopf „Rückruf wünschen“" : undefined };
    }
    const letzte = step.purpose === "followup_last";
    return { key, wann, kanal: "whatsapp" as const, titel: letzte ? "Letzte Nachfrage" : "Nachfrage per WhatsApp", vorschau: step.text(c) };
  });
}

/** Die Standard-Abfolge eines Kontakts als Phasen (Reihenfolge wie der Verlauf). */
export function standardAblauf(o: AblaufEingabe): AblaufPhase[] {
  const { an, person } = o;
  const kontakt = BEISPIEL_KONTAKT;
  const hi = anredeZeile(an, kontakt);
  const label = leadLabel(kontakt, "Frau Becker");
  const topic = "Haftpflicht und Hausrat";
  const ctx: SequenceCtx = { firstName: "Julia", hi, kontakt, topic, an, person };
  // Genau eine Zwischenfrage mit Knöpfen, die die App selbst stellt (lib/whatsapp/zwischenfrage.ts, Ole 17.11.2026)
  const zwischen = offeneZwischenfrage(BEISPIEL_SOURCE, BEISPIEL_FORMULAR, null);
  const zeiten: [string, string] = ["morgen um 10 Uhr", "Donnerstag um 16 Uhr"];
  const t = o.beispielTermin;

  // Anrufplan wie im Nachrichtenplan (nextCallAttemptAt), Beispielstart an einem Montag um 10 Uhr
  const anrufVersuche: AblaufSchritt[] = [];
  let at: Date | null = o.anrufStart;
  for (let n = 1; n <= CALL_ATTEMPTS_TARGET && at; n++) {
    const tag = Math.round((berlinMitternacht(at) - berlinMitternacht(o.anrufStart)) / DAY) + 1;
    anrufVersuche.push({ key: `anruf:${n}`, wann: n === 1 ? "nach 30 Min." : `Tag ${tag}, ${uhrKurz(at)}`, kanal: "anruf", titel: callPlanNote(n), vorschau: `Aufgabe auf „Heute“: ${label} anrufen` });
    at = nextCallAttemptAt({ done: n, startedAt: o.anrufStart, lastAt: at, now: at });
  }

  return [
    {
      key: "erstkontakt",
      titel: "Erstkontakt",
      bezug: "Ab dem Eingang der Anfrage.",
      schritte: [
        {
          key: "erstanschreiben",
          wann: "Sofort",
          kanal: "whatsapp",
          titel: "Erstanschreiben",
          vorschau: erstanschreibenText({ an, kontakt, name: person.nom, vermittler: person.dat, vermittlerNom: person.nom, source: BEISPIEL_SOURCE, formular: BEISPIEL_FORMULAR }),
          hinweis: "danach die Erstinformation als PDF",
        },
        ...(zwischen
          ? [{ key: "zwischenfrage", wann: "nach der Antwort", kanal: "whatsapp" as const, titel: "Zwischenfrage", vorschau: `${zwischenfrageText(zwischen, an, person)} [${zwischenKnoepfe(zwischen).map((k) => k.title).join("] [")}]` }]
          : []),
        {
          key: "terminvorschlag",
          wann: "danach",
          kanal: "whatsapp",
          titel: "Terminvorschlag mit zwei Zeiten",
          vorschau: terminVorschlagText({ an, source: BEISPIEL_SOURCE, formular: BEISPIEL_FORMULAR, person, zeiten, video: true }),
          hinweis: "mit Knöpfen für die Zeiten",
        },
      ],
      sonst: [
        { key: "silent", titel: "Wenn keine Antwort kommt", schritte: abfolgeSchritte("silent", ctx, "nach") },
        {
          key: "anrufplan",
          titel: `Anrufplan: ${CALL_ATTEMPTS_TARGET} Versuche, wenn niemand antwortet`,
          schritte: [{ key: "anruf:push", wann: "nach 30 Min.", kanal: "push" as const, titel: "Push an Sie", vorschau: `${label} hat noch nicht geantwortet. Jetzt anrufen?` }, ...anrufVersuche],
        },
        { key: "not_reached", titel: "Telefonisch nicht erreicht", schritte: abfolgeSchritte("not_reached", ctx, "nach") },
      ],
      nachfassen: true,
    },
    {
      key: "termin",
      titel: "Termin",
      bezug: "Ab der Buchung bis zum Termin.",
      schritte: [
        {
          key: "buchung",
          wann: "Sofort",
          kanal: "whatsapp",
          titel: "Buchungsbestätigung",
          vorschau: buchungsText({ an, start: t, mode: "video", meetUrl: BEISPIEL_LINK, person }),
          hinweis: "dazu eine E-Mail mit Kalendereintrag",
        },
        {
          key: "vortag",
          wann: vorherText(ERINNERUNG.vortagVorMs),
          kanal: "whatsapp",
          titel: "Erinnerung am Vortag",
          vorschau: vortagText({
            an,
            hi,
            wann: "morgen um 10 Uhr",
            nutzen: terminNutzenSatz({ source: BEISPIEL_SOURCE, formular: BEISPIEL_FORMULAR, an, person, video: true }),
            komplettcheck: false,
            mode: "video",
            meetUrl: BEISPIEL_LINK,
            person,
          }),
          hinweis: "dazu eine E-Mail",
        },
        { key: "stunde", wann: vorherText(ERINNERUNG.stundeVorMs), kanal: "whatsapp", titel: "Erinnerung kurz vorher", vorschau: stundeText({ an, hi, mode: "video", person }) },
        {
          key: "gleich",
          wann: vorherText(ERINNERUNG.gleichVorMs),
          kanal: "whatsapp",
          titel: "Link zum Videoraum",
          vorschau: gleichText({ an, hi, person, startsAt: t, meetUrl: BEISPIEL_LINK }),
          hinweis: "nur Videotermine",
        },
        { key: "start", wann: "zum Beginn", kanal: "push", titel: "Push an Sie", vorschau: startPush({ appointmentId: "beispiel", name: label, startsAt: t }).title, hinweis: "nur Videotermine" },
      ],
      sonst: [{ key: "no_show", titel: "Wenn der Kontakt nicht erscheint", schritte: abfolgeSchritte("no_show", ctx, "nach") }],
    },
    {
      key: "angebot",
      titel: "Angebot und Nachfassen",
      bezug: "Tage ab dem Versand des Angebots. Am Vorabend jeder Nachricht bekommen Sie einen Push und können anhalten.",
      schritte: [
        { key: "angebot", wann: "nach dem Termin", kanal: "aktion", titel: "Sie senden das Angebot", vorschau: "Aufgabe auf „Heute“: Angebot ablegen und senden. Erst dann startet das Nachfassen." },
        ...abfolgeSchritte("offer", ctx, "tag"),
      ],
      nachfassen: true,
    },
    {
      key: "bedenkzeit",
      titel: "Bedenkzeit",
      bezug: "Möchte der Kontakt sich später melden, pausiert das Nachfassen bis zum genannten Tag.",
      schritte: abfolgeSchritte("recall", ctx, "nach").map((s) => ({ ...s, wann: "am genannten Tag", titel: "Der Assistent meldet sich wieder" })),
    },
  ];
}
