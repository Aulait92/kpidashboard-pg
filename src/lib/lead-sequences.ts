// Nicht erreicht (Ole, 14.11.2026): die Anrufe plant der Anrufplan (6 Versuche, lib/call-plan.ts); diese
// Abfolge schickt dazwischen die WhatsApp. Ihr Anruf-Schritt legt keine zweite Aufgabe an, solange der Plan läuft.
//
// Nachfass-Abfolgen: nach „Nicht erreicht“, „Angebot gesendet“ und „Nicht
// erschienen“ fasst die App in festen Schritten nach (WhatsApp bzw.
// Anruf-Aufgabe auf „Heute“). Abgearbeitet vom 5-Minuten-Cron (runSequences).
//
// Regeln:
// - nur wenn der Kunde „Automatisch nachfassen“ an hat (AgentConfig.followUpSequencesEnabled)
//   und der Assistent aktiv ist
// - WhatsApp nur Mo–Sa 9–19 Uhr (Berlin), nur mit verbundenem Konto; außerhalb des
//   24h-Fensters nur mit freigegebener Vorlage – sonst wird stattdessen eine Anruf-Aufgabe angelegt
// - jeder Schritt wird vor dem Senden per bedingtem Update „beansprucht“ → nie doppelt
// - Stopp vor jedem Schritt, wenn: Lead antwortet, Termin gebucht, Phase Abschluss /
//   Kein Interesse / Disqualifiziert, Reklamation, Löschung, „Stopp“, Schalter aus
// - Verlauf (log) ohne Nachrichteninhalte
//
// Angebot (Paket P3, Ole 17.11.2026, lib/angebot-senden.ts): startet erst, wenn der Vermittler das Angebot über die App
// sendet („offer“: Tag 2 WhatsApp, Tag 3 Anruf-Aufgabe plus Push, Tag 5 E-Mail mit [Rückruf wünschen], Tag 10 letzte
// WhatsApp, danach Anruf-Aufgabe) bzw. „Habe ich selbst gesendet“ tippt („offer_selbst“: ohne E-Mail, nur WhatsApp und
// Anruf). Der Status „Angebot gesendet“ allein startet nichts mehr (onLeadStatus), dann gilt die klassische Wiedervorlage.
//
// Bedenkzeit und Rückruf (Paket P5, Ole 17.11.2026, lib/bedenkzeit.ts, lib/rueckruf.ts): „meldet sich am …“ beendet die
// laufende Angebots-Abfolge und legt „offer_bedenkzeit“ bzw. „offer_selbst_bedenkzeit“ an, die am Tag neu startet (Tage
// ab neustartAt), zuerst mit einer WhatsApp zum Angebot (nie die Terminvorschlags-Vorlage followup). Endet sie vorher
// (Antwort des Leads, Schalter aus), steht am Tag die Aufgabe „Bedenkzeit vorbei“ auf „Heute“. „Rückruf gewünscht“
// pausiert die Angebots-Abfolge bis zwei Tage nach dem Zeitfenster (pauseAngebotsAbfolge, alle Schritte rücken nach).
//
// E-Mails in der Abfolge (Pakete M4/M6, Ole 18.11.2026, docs/plan-mail-vorlagen.md): Mail-Schritte gehen über die zentrale
// Funktion (lib/mail/abfolgen-mail.ts → sendeVorlagenMail: Stufe, Sperren, Idempotenz, höchstens eine automatische Mail je
// Lead und Tag), 2 Std. nach der WhatsApp desselben Anlasses: No-Show-Rettung („nicht_erschienen“), Neustart nach der
// Bedenkzeit beim Versand über die App („wie_besprochen“), Angebot Tag 5 („nachfassen_angebot“). Begleit-Abfolgen laufen
// neben den anderen (keine verdrängt die andere): „nicht_erreicht_mail“ (einmal nach dem 2. gezählten Anrufversuch,
// lib/call-attempts.ts) und „unterlagen“ (Erinnerung 3 Tage nach der Mail „Unterlagen fehlen“, danach eine Aufgabe).
//
// Nächste Nachrichten (Paket P6, Ole 17.11.2026, lib/nachrichtenplan-aktionen.ts): Der Vermittler kann am Kontakt einzelne
// Schritte überspringen (LeadSequence.uebersprungen: beim Fälligwerden ohne Versand weitergeschaltet), den nächsten Schritt
// verschieben (nextAt, die folgenden rücken über neustartAt mit), sofort senden (runSequences mit nurId und sofort) und
// alle Nachrichten an den Lead pausieren (Lead.nachrichtenPausiertAt: Abfolgen warten).
//
// Termin-Nachfassen (Ole, 17.11.2026): Antwortet der Lead 2 Std. nach dem Terminvorschlag des Assistenten nicht, ist der
// erste Schritt von „Chat ruht“ ein kurzes Nachfassen mit denselben (bzw. neu berechneten, noch freien) Zeit-Knöpfen:
// nur im offenen 24-h-Fenster, Mo bis Sa 8 bis 20 Uhr (sonntags 10 bis 18 Uhr, Ole 22.11.2026), einmal; die übrigen Stopp-Gründe gelten wie immer (Termin
// gebucht, „Stopp“, Kein Interesse, Assistent pausiert, Anruf läuft).

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ohneAutoNachrichten } from "@/lib/lead-kontakt-sperre";
import { displayProduct } from "@/lib/products";
import { firstNameOf, NoTemplateError, noticeText, sendWhatsAppNotice, type NoticePurpose } from "@/lib/whatsapp/templates";
import { zweiTerminvorschlaege } from "@/lib/whatsapp/termin-vorschlaege";
import { WhatsAppUnavailableError } from "@/lib/whatsapp/stopp";
import { a, anredeZeile, type Ansprache, type AnredeKontakt } from "@/lib/ansprache";
import { anspracheOf } from "@/lib/whatsapp/reminders";
import { ansprechpartner } from "@/lib/lead-anrede";
import { isCallPlanNote } from "@/lib/call-plan";
import { anrufPausiert } from "@/lib/telefonat-server";
import type { VermittlerName } from "@/lib/whatsapp/gespraech";
import type { VorlageKey } from "@/lib/mail/vorlagen";
import type { Werte } from "@/lib/mail/platzhalter";
import { hatMailAntwort } from "@/lib/mail/kontakt-mail";
import { BEDENKZEIT_AUFGABE, bedenkzeitNeustartText, tagKurz } from "@/lib/bedenkzeit";

export type SequenceKind =
  | "not_reached"
  | "offer"
  | "offer_selbst"
  | "offer_bedenkzeit"
  | "offer_selbst_bedenkzeit"
  | "no_show"
  | "silent"
  | "recall"
  | "nicht_erreicht_mail"
  | "unterlagen";

/** Abfolgen zum Angebot (Nachfassen, Vorab-Check, Thema aus dem Termin). */
export const ANGEBOT_KINDS: SequenceKind[] = ["offer", "offer_selbst", "offer_bedenkzeit", "offer_selbst_bedenkzeit"];
/** Neustart nach der Bedenkzeit (Paket P5). */
export const BEDENKZEIT_KINDS: SequenceKind[] = ["offer_bedenkzeit", "offer_selbst_bedenkzeit"];
export const istAngebotsAbfolge = (kind: string | null | undefined) => (ANGEBOT_KINDS as string[]).includes(kind ?? "");
export const istBedenkzeitAbfolge = (kind: string | null | undefined) => (BEDENKZEIT_KINDS as string[]).includes(kind ?? "");
/** Begleit-Abfolgen (Pakete M4/M6): nur E-Mail bzw. Aufgabe, laufen neben den anderen und beenden keine. */
export const BEGLEIT_KINDS: SequenceKind[] = ["nicht_erreicht_mail", "unterlagen"];
export const istBegleitAbfolge = (kind: string | null | undefined) => (BEGLEIT_KINDS as string[]).includes(kind ?? "");
/** Aufgabe nach der Erinnerung „Unterlagen fehlen“ (gleicher Text wie UNTERLAGEN_NOTE in lib/mail/termin-erinnerung.ts). */
export const UNTERLAGEN_AUFGABE = "Unterlagen nachfassen";
/** Aufgabe, wenn der Assistent keine freien Zeiten findet (Ole, 22.11.2026, lib/whatsapp/bot.ts): persönlich melden. */
export const KALENDER_VOLL_AUFGABE = "Kalender voll: Lead anrufen und Termin vereinbaren";

const DAY = 24 * 60 * 60 * 1000;
const DONE_STATUSES = new Set(["abschluss", "kein interesse", "disqualifiziert"]);
const STOP_WORDS = /^\s*(stopp?|stop|abmelden|keine (weiteren )?nachrichten|nicht mehr (schreiben|kontaktieren))\b/i;

/** hi = Anrede-Zeile nach Regel („Hallo Julia,“ bzw. „Guten Tag Frau Schneider,“ / „Guten Tag,“). */
// Kein Buchungslink in Nachrichten an Leads (Ole, 15.11.2026: „nur per Chat“): Termine bucht der Assistent im Gespräch.
type Ctx = { firstName: string; hi: string; kontakt: AnredeKontakt; topic: string; an: Ansprache; person?: VermittlerName };
/** Angaben für die Texte einer Abfolge (auch für die Vorschau im Nachrichtenplan, lib/nachrichtenplan.ts). */
export type SequenceCtx = Ctx;
const HOUR = 60 * 60 * 1000;
/** Mindestabstand zwischen zwei Schritten (z. B. wenn morgens zwei über Nacht fällige Schritte anstehen). */
const MIN_GAP_MS = 2 * HOUR;

type Step =
  | {
      day: number;
      action: "whatsapp";
      purpose: NoticePurpose;
      params: (c: Ctx) => string[];
      text: (c: Ctx) => string;
      fallbackNote: string;
      /** Nur als Freitext im offenen 24h-Fenster senden, sonst still überspringen (keine Vorlage doppelt). */
      onlyInWindow?: boolean;
      /** Zweck „followup“ mit zwei Terminvorschlägen: eigener Freitext (sonst der Text der Vorlage). */
      slotText?: (c: Ctx, zeiten: [string, string]) => string;
      /** Auch bei anderem Zweck zwei freie Zeiten anbieten (Freitext mit slotText und Zeit-Knöpfen; Vorlage ohne Zeiten). */
      slots?: boolean;
      /** Neue Vorlage noch nicht freigegeben: stattdessen diese (freigegebene) Vorlage, bevor es eine Anruf-Aufgabe wird. */
      fallback?: { purpose: NoticePurpose; params: (c: Ctx) => string[] };
    }
  | {
      day: number;
      action: "call";
      note: string;
      /** Push an den Vermittler (Ole, 17.11.2026: „Frau Becker anrufen: Fragen zum Angebot?“), nur wenn die Aufgabe neu ist */
      push?: boolean;
      /** Als Aufgabe (LeadTask dieser Art, lib/lead-aufgaben.ts) statt direkt als Wiedervorlage: wartet, bis sie frei ist */
      aufgabe?: string;
    }
  | {
      day: number;
      /** E-Mail an den Lead über den Lead-Mail-Baustein (lib/mail/lead-versand.ts); ohne Adresse übersprungen */
      action: "email";
      titel: string;
      /** Text aus der Vermittler-Vorlage (Kunden-Vorlage mit diesem Schlüssel, sonst Standardtext, lib/mail/vorlagen.ts) */
      vorlage: VorlageKey;
      /** Knöpfe im Rahmen: [Angebot ansehen] (falls das PDF noch da ist), [Rückruf wünschen] ({rueckruf_link}) */
      knoepfe?: ("angebot" | "rueckruf")[];
      /** Weitere Platzhalter-Werte */
      zusatz?: (c: Ctx) => Partial<Werte>;
    };

/** Vermittler für „das Angebot, das Herr Kannapinn Ihnen geschickt hat“ (ohne Namen neutral). */
const vom = (c: Ctx): VermittlerName => c.person ?? { nom: a(c.an, "dein Berater", "Ihr Berater"), dat: a(c.an, "deinem Berater", "Ihrem Berater") };

/** Angebot nach dem Termin, Tag 2: WhatsApp (gleiche Frage wie die freigegebene Vorlage followup_offer). */
const angebotTag2: Extract<Step, { action: "whatsapp" }> = {
  day: 2,
  action: "whatsapp",
  purpose: "followup_offer",
  params: (c) => [c.firstName, c.topic],
  text: (c) =>
    a(c.an, `${c.hi} konntest du dir das Angebot zu ${c.topic} schon anschauen? Ist für dich eher der Beitrag oder die Leistung entscheidend?`, `${c.hi} konnten Sie sich das Angebot zu ${c.topic} schon anschauen? Ist für Sie eher der Beitrag oder die Leistung entscheidend?`),
  fallbackNote: "Angebot nachfassen: anrufen",
};
const angebotAnruf: Extract<Step, { action: "call" }> = { day: 3, action: "call", note: "Angebot nachfassen: anrufen", push: true };
const angebotLetzteWa = (selbst: boolean): Extract<Step, { action: "whatsapp" }> => ({
  day: 10,
  action: "whatsapp",
  purpose: "followup_last",
  params: (c) => [c.firstName],
  text: (c) =>
    selbst
      ? a(
          c.an,
          `${c.hi} ich melde mich ein letztes Mal zum Angebot, das ${vom(c).nom} dir geschickt hat: Ist das Thema für dich noch aktuell? Wenn nicht, ist das völlig in Ordnung, dann melde ich mich nicht weiter.`,
          `${c.hi} ich melde mich ein letztes Mal zum Angebot, das ${vom(c).nom} Ihnen geschickt hat: Ist das Thema für Sie noch aktuell? Wenn nicht, ist das völlig in Ordnung, dann melde ich mich nicht weiter.`,
        )
      : a(
          c.an,
          `${c.hi} ich melde mich ein letztes Mal zu deinem Angebot für ${c.topic}: Ist das Thema für dich noch aktuell? Wenn nicht, ist das völlig in Ordnung, dann melde ich mich nicht weiter.`,
          `${c.hi} ich melde mich ein letztes Mal zu Ihrem Angebot für ${c.topic}: Ist das Thema für Sie noch aktuell? Wenn nicht, ist das völlig in Ordnung, dann melde ich mich nicht weiter.`,
        ),
  fallbackNote: "Angebot: letzter Versuch, anrufen",
});
const angebotSchluss: Extract<Step, { action: "call" }> = { day: 12, action: "call", note: "Angebot nachfassen: zum Schluss anrufen" };
const angebotMail: Extract<Step, { action: "email" }> = {
  day: 5,
  action: "email",
  titel: "E-Mail mit [Rückruf wünschen]",
  vorlage: "nachfassen_angebot",
  knoepfe: ["angebot", "rueckruf"],
};
/** Neustart nach der Bedenkzeit (Paket M4): 2 Std. nach der WhatsApp die Mail „Wie besprochen“ (nur Versand über die App). */
const bedenkzeitMail: Extract<Step, { action: "email" }> = { day: 2 / 24, action: "email", titel: "E-Mail „Wie besprochen“", vorlage: "wie_besprochen" };
/** Nach der Bedenkzeit (Paket P5): WhatsApp zum Angebot, Vorlage offer_bedenkzeit (bis zur Freigabe followup_offer). */
const bedenkzeitWa = (selbst: boolean): Extract<Step, { action: "whatsapp" }> => ({
  day: 0,
  action: "whatsapp",
  purpose: "offer_bedenkzeit",
  params: (c) => [c.firstName, c.topic],
  text: (c) => bedenkzeitNeustartText({ an: c.an, hi: c.hi, topic: c.topic, person: c.person, selbst }),
  fallback: { purpose: "followup_offer", params: (c) => [c.firstName, c.topic] },
  fallbackNote: BEDENKZEIT_AUFGABE,
});

export const SEQUENCES: Record<SequenceKind, { label: string; steps: Step[] }> = {
  not_reached: {
    label: "Nicht erreicht",
    steps: [
      {
        day: 0,
        action: "whatsapp",
        purpose: "followup",
        params: (c) => [c.firstName],
        text: (c) =>
          a(c.an, `${c.hi} ich habe gerade versucht, dich anzurufen. Wann passt es dir am besten? Antworte einfach hier, dann melde ich mich zu deiner Wunschzeit.`, `${c.hi} ich habe gerade versucht, Sie anzurufen. Wann passt es Ihnen am besten? Antworten Sie einfach hier, dann melde ich mich zu Ihrer Wunschzeit.`),
        slotText: (c, [z1, z2]) =>
          a(c.an, `${c.hi} ich habe gerade versucht, dich anzurufen. Passt dir für ein kurzes Gespräch ${z1} oder ${z2}?`, `${c.hi} ich habe gerade versucht, Sie anzurufen. Passt Ihnen für ein kurzes Gespräch ${z1} oder ${z2}?`),
        fallbackNote: "Nicht erreicht: nochmal anrufen",
      },
      { day: 2, action: "call", note: "Nachfassen: nochmal anrufen" },
      {
        day: 6,
        action: "whatsapp",
        purpose: "followup_last",
        params: (c) => [c.firstName],
        text: (c) =>
          a(c.an, `${c.hi} ich melde mich ein letztes Mal: Ist das Thema für dich noch aktuell? Wenn nicht, ist das völlig in Ordnung, dann melde ich mich nicht weiter. Alles Gute!`, `${c.hi} ich melde mich ein letztes Mal: Ist das Thema für Sie noch aktuell? Wenn nicht, ist das völlig in Ordnung, dann melde ich mich nicht weiter. Alles Gute!`),
        fallbackNote: "Letzter Versuch: anrufen",
      },
    ],
  },
  // Angebot über die App gesendet (Ole, 17.11.2026, Ergänzung C)
  offer: {
    label: "Angebot gesendet",
    steps: [
      angebotTag2,
      angebotAnruf,
      angebotMail,
      angebotLetzteWa(false),
      angebotSchluss,
    ],
  },
  // Nach der Bedenkzeit neu (Paket P5): Tage ab neustartAt, sonst wie „offer“ bzw. „offer_selbst“
  offer_bedenkzeit: {
    label: "Bedenkzeit zum Angebot",
    steps: [bedenkzeitWa(false), bedenkzeitMail, angebotAnruf, angebotMail, angebotLetzteWa(false), angebotSchluss],
  },
  offer_selbst_bedenkzeit: {
    label: "Bedenkzeit zum Angebot",
    steps: [bedenkzeitWa(true), angebotAnruf, angebotLetzteWa(true), angebotSchluss],
  },
  // Angebot vom Vermittler selbst gesendet (Ergänzung B): keine E-Mail von uns, nur WhatsApp und Anruf
  offer_selbst: {
    label: "Angebot selbst gesendet",
    steps: [
      {
        ...angebotTag2,
        purpose: "followup_offer_selbst",
        params: (c) => [c.firstName, vom(c).nom],
        text: (c) =>
          a(
            c.an,
            `${c.hi} konntest du dir das Angebot, das ${vom(c).nom} dir geschickt hat, schon anschauen? Ist für dich eher der Beitrag oder die Leistung entscheidend?`,
            `${c.hi} konnten Sie sich das Angebot, das ${vom(c).nom} Ihnen geschickt hat, schon anschauen? Ist für Sie eher der Beitrag oder die Leistung entscheidend?`,
          ),
        // Bis zur Freigabe der neuen Vorlage: die freigegebene followup_offer („das Angebot zu Haftpflicht und Hausrat“)
        fallback: { purpose: "followup_offer", params: (c) => [c.firstName, c.topic] },
      },
      angebotAnruf,
      angebotLetzteWa(true),
      angebotSchluss,
    ],
  },
  // No-Show-Rettung (Ole, 17.11.2026): am gleichen Tag zwei neue Zeiten, am nächsten Tag einmal nachfassen, dann Ende.
  // Ohne Kalender bzw. außerhalb des 24-h-Fensters: die Vorlage „Nachfassen nach verpasstem Termin“ bzw. die kurze
  // Nachfrage; ohne freigegebene Vorlage eine Anruf-Aufgabe (wie bisher).
  no_show: {
    label: "Nicht erschienen",
    steps: [
      {
        day: 0,
        action: "whatsapp",
        purpose: "followup_noshow",
        slots: true,
        params: (c) => [c.firstName],
        text: (c) => `${c.hi} kein Problem, so etwas passiert. Sollen wir einen neuen Termin finden?`,
        slotText: (c, [z1, z2]) =>
          a(
            c.an,
            `${c.hi} kein Problem, so etwas passiert. Sollen wir einen neuen Termin finden? Passt dir ${z1} oder ${z2}?`,
            `${c.hi} kein Problem, so etwas passiert. Sollen wir einen neuen Termin finden? Passt Ihnen ${z1} oder ${z2}?`,
          ),
        fallbackNote: "Nicht erschienen: neuen Termin vereinbaren",
      },
      // Paket M4: am selben Tag, 2 Std. nach der WhatsApp, die Mail „Nicht erschienen“ (entfällt bei Antwort oder Buchung)
      { day: 2 / 24, action: "email", titel: "E-Mail mit Link für einen neuen Termin", vorlage: "nicht_erschienen" },
      {
        day: 1,
        action: "whatsapp",
        purpose: "followup",
        params: (c) => [c.firstName],
        text: (c) =>
          a(
            c.an,
            `${c.hi} kurze Nachfrage: Sollen wir einen neuen Termin finden? Antworte einfach hier, dann schlage ich dir Zeiten vor.`,
            `${c.hi} kurze Nachfrage: Sollen wir einen neuen Termin finden? Antworten Sie einfach hier, dann schlage ich Ihnen Zeiten vor.`,
          ),
        slotText: (c, [z1, z2]) =>
          a(c.an, `${c.hi} kurze Nachfrage zum neuen Termin: Passt dir ${z1} oder ${z2}?`, `${c.hi} kurze Nachfrage zum neuen Termin: Passt Ihnen ${z1} oder ${z2}?`),
        fallbackNote: "Nicht erschienen: neuen Termin vereinbaren",
      },
    ],
  },
  // Chat ruht (Ole, 15.11.2026: „schon nach wenigen Stunden … recht aggressiv, der Interessent hat ja
  // Interesse gezeigt“; „nach 6–10 Stunden nochmal nachhaken“): startet bei jeder Nachricht des Assistenten neu
  // (restartSilentSequence) und läuft, solange der Lead nicht antwortet: 2 Std., 8 Std., ca. 20 Std. (im offenen Fenster als
  // Freitext, sonst als Vorlage, Ole 22.11.2026), 3 Tage. Außerhalb des Fensters jede Vorlage nur einmal (followup,
  // followup_nudge, followup_last).
  silent: {
    label: "Chat ruht",
    steps: [
      {
        day: 2 / 24,
        action: "whatsapp",
        purpose: "followup",
        params: (c) => [c.firstName],
        text: (c) =>
          a(
            c.an,
            `${c.hi} kurze Nachfrage zu ${c.topic}: Antworte einfach hier, dann geht es direkt weiter. Es dauert nur noch einen Moment, dann kann ich dir Termine vorschlagen.`,
            `${c.hi} kurze Nachfrage zu ${c.topic}: Antworten Sie einfach hier, dann geht es direkt weiter. Es dauert nur noch einen Moment, dann kann ich Ihnen Termine vorschlagen.`,
          ),
        fallbackNote: "Keine Reaktion im Chat: anrufen",
      },
      {
        day: 8 / 24,
        action: "whatsapp",
        purpose: "followup_nudge",
        params: (c) => [c.firstName],
        text: (c) =>
          a(
            c.an,
            `${c.hi} sollen wir mit ${c.topic} weitermachen? Es dauert nur ein paar Minuten.`,
            `${c.hi} sollen wir mit ${c.topic} weitermachen? Es dauert nur ein paar Minuten.`,
          ),
        fallbackNote: "Keine Reaktion im Chat: anrufen",
      },
      {
        day: 20 / 24,
        action: "whatsapp",
        purpose: "followup",
        onlyInWindow: true,
        params: (c) => [c.firstName],
        text: (c) =>
          `${c.hi} ich wollte mich noch einmal melden. ${a(c.an, "Wann passt es dir für ein kurzes Gespräch? Antworte einfach hier, dann schlage ich dir Zeiten vor.", "Wann passt es Ihnen für ein kurzes Gespräch? Antworten Sie einfach hier, dann schlage ich Ihnen Zeiten vor.")}`,
        fallbackNote: "Keine Reaktion im Chat: anrufen",
      },
      {
        day: 3,
        action: "whatsapp",
        purpose: "followup_last",
        params: (c) => [c.firstName],
        text: (c) =>
          `${c.hi} ${a(c.an, "ich melde mich ein letztes Mal: Ist das Thema für dich noch aktuell?", "ich melde mich ein letztes Mal: Ist das Thema für Sie noch aktuell?")} Wenn nicht, ist das völlig in Ordnung, dann melde ich mich nicht weiter.`,
        fallbackNote: "Letzter Versuch: anrufen",
      },
    ],
  },
  // Lead bittet um später („melden Sie sich morgen“, Ole 15.11.2026): der Assistent legt sich selbst eine
  // Wiedervorlage (scheduleBotRecall) und meldet sich zur vereinbarten Zeit. Unabhängig vom Schalter
  // „Automatisch nachfassen“, weil der Lead ausdrücklich darum gebeten hat.
  recall: {
    label: "Assistent meldet sich wieder",
    steps: [
      {
        day: 0,
        action: "whatsapp",
        purpose: "followup",
        params: (c) => [c.firstName],
        text: (c) =>
          a(
            c.an,
            `${c.hi} wie besprochen melde ich mich wieder zu ${c.topic}. Passt es dir jetzt? Dann machen wir direkt weiter.`,
            `${c.hi} wie besprochen melde ich mich wieder zu ${c.topic}. Passt es Ihnen jetzt? Dann machen wir direkt weiter.`,
          ),
        slotText: (c, [z1, z2]) =>
          a(
            c.an,
            `${c.hi} wie besprochen melde ich mich wieder zu ${c.topic}. Passt dir für ein kurzes Gespräch ${z1} oder ${z2}?`,
            `${c.hi} wie besprochen melde ich mich wieder zu ${c.topic}. Passt Ihnen für ein kurzes Gespräch ${z1} oder ${z2}?`,
          ),
        fallbackNote: "Lead wollte, dass wir uns wieder melden: anrufen",
      },
    ],
  },
  // Paket M4: einmal nach dem 2. gezählten erfolglosen Anrufversuch, 2 Std. nach einer etwaigen WhatsApp (lib/call-attempts.ts)
  nicht_erreicht_mail: {
    label: "Nicht erreicht: E-Mail",
    steps: [{ day: 0, action: "email", titel: "E-Mail mit den nächsten Anrufzeiten", vorlage: "nicht_erreicht" }],
  },
  // Paket M6: Erinnerung 3 Tage nach der Mail „Unterlagen fehlen“ ohne Antwort oder Upload, danach eine Aufgabe für Sie
  unterlagen: {
    label: "Unterlagen fehlen",
    steps: [
      { day: 3, action: "email", titel: "Erinnerung per E-Mail", vorlage: "unterlagen_fehlen" },
      { day: 5, action: "call", note: UNTERLAGEN_AUFGABE, aufgabe: "unterlagen_fehlen" },
    ],
  },
};

export type SequenceLogEntry = {
  at: string;
  step: number;
  action: "whatsapp" | "call" | "email" | "stop" | "plan";
  /** sent | template | call_task | kept_followup | skipped | failed | stopped | planned */
  result: string;
  detail?: string;
  /** tatsächlich gesendeter Zweck (z. B. followup_nudge statt followup ohne Kalender), für „keine Vorlage doppelt“ */
  purpose?: string;
};

/** Mo–Sa 9–19 Uhr Berlin (wie Bestandskunden-Kampagnen); Termin-Nachfassen: 8–20 Uhr. */
export function inSendWindow(now: Date, stunden: { von: number; bis: number } = { von: 9, bis: 19 }, sonntag: { von: number; bis: number } | null = null): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const wd = parts.find((p) => p.type === "weekday")?.value;
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  if (wd === "Sun") return !!sonntag && hour >= sonntag.von && hour < sonntag.bis;
  return hour >= stunden.von && hour < stunden.bis;
}

/** Erster Zeitpunkt ab `at` im Versandfenster (volle Stunden), für die Vorschau „Nächste Nachrichten“. */
export function naechstesSendefenster(at: Date, stunden: { von: number; bis: number } = { von: 9, bis: 19 }, sonntag: { von: number; bis: number } | null = null): Date {
  if (inSendWindow(at, stunden, sonntag)) return at;
  const H = 60 * 60 * 1000;
  let d = new Date(Math.ceil(at.getTime() / H) * H);
  for (let i = 0; i < 96 && !inSendWindow(d, stunden, sonntag); i++) d = new Date(d.getTime() + H);
  return d;
}

/**
 * 24-Stunden-Fenster (Ole, 22.11.2026: „die morgige Nachricht sollte noch im 24h-Fenster kommen“): Würde ein Schritt von
 * „Chat ruht“ wegen der Versandzeiten (nachts, sonntags ab 18 Uhr) erst nach Schluss des WhatsApp-Fensters rausgehen,
 * kommt er stattdessen spätestens 30 Minuten vor Fensterschluss, zur letzten Versandzeit davor. Frühestens 30 Minuten
 * ab jetzt; geht das nicht, bleibt der Plan. Rein.
 */
export function imChatFensterVorziehen(o: { due: Date; fensterBis: Date | null; now: Date; sonntag?: { von: number; bis: number } | null }): Date {
  const { due, fensterBis, now } = o;
  if (!fensterBis || fensterBis.getTime() <= now.getTime()) return due;
  const sonntag = o.sonntag ?? null;
  const tatsaechlich = naechstesSendefenster(due, CHAT_RUHT_STUNDEN, sonntag);
  const puffer = 30 * 60 * 1000;
  if (tatsaechlich.getTime() <= fensterBis.getTime() - puffer) return due;
  let t = new Date(fensterBis.getTime() - puffer);
  for (let i = 0; i < 200 && !inSendWindow(t, CHAT_RUHT_STUNDEN, sonntag); i++) t = new Date(t.getTime() - 15 * 60 * 1000);
  if (!inSendWindow(t, CHAT_RUHT_STUNDEN, sonntag) || t.getTime() < now.getTime() + puffer) return due;
  return t.getTime() < due.getTime() ? t : due;
}

/** Zeitfenster für das Termin-Nachfassen nach einem Terminvorschlag (Ole, 17.11.2026). */
export const TERMIN_NACHFASS_STUNDEN = { von: 8, bis: 20 } as const;
/**
 * „Chat ruht“ auch sonntags (Ole, 22.11.2026: „ja, sonntags auch nachfassen“, Anlass: erster Lohmann-Lead antwortete
 * sonntags, das Nachfassen hätte bis Montag gewartet). Kürzeres Fenster als werktags; andere Abfolgen bleiben Mo bis Sa.
 */
export const SONNTAG_NACHFASS_STUNDEN = { von: 10, bis: 18 } as const;
/** „Chat ruht“ werktags ab 8 Uhr (Ole, 22.11.2026: „ja, generell ab 8 Uhr“), sonst wie das Versandfenster bis 19 Uhr. */
export const CHAT_RUHT_STUNDEN = { von: 8, bis: 19 } as const;
/**
 * Mindestabstand zwischen zwei Nachrichten von „Chat ruht“ (Ole, 22.11.2026: „die zweite Nachricht um 11 Uhr ist zu nah an
 * der ersten, lieber am Nachmittag“): Rücken Schritte wegen der Versandzeiten zusammen (z. B. 8 Uhr und 10 Uhr),
 * kommt der nächste frühestens 5 Stunden später. Andere Abfolgen: 2 Stunden (MIN_GAP_MS).
 */
export const CHAT_RUHT_ABSTAND_MS = 5 * 60 * 60 * 1000;

async function enabledFor(customerId: string): Promise<boolean> {
  const agent = await prisma.agentConfig.findUnique({ where: { customerId }, select: { active: true, followUpSequencesEnabled: true } });
  return !!agent?.active && !!agent.followUpSequencesEnabled;
}

function appendLog(log: Prisma.JsonValue, entry: SequenceLogEntry): Prisma.InputJsonValue {
  const list = Array.isArray(log) ? (log as unknown as SequenceLogEntry[]) : [];
  return [...list, entry] as unknown as Prisma.InputJsonValue;
}

/**
 * Abfolge starten (wenn eingeschaltet). Läuft schon eine Abfolge derselben Art,
 * bleibt sie (kein Neustart bei wiederholtem „Nicht erreicht“); andere laufende
 * Abfolgen des Leads werden beendet. Liefert die Abfolge oder null.
 */
export async function startSequence(leadId: string, kind: SequenceKind, now = new Date()) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true, customerId: true, erasedAt: true } });
  if (!lead || lead.erasedAt) return null;
  if (!(await enabledFor(lead.customerId))) return null;
  const running = await prisma.leadSequence.findMany({ where: { leadId, stoppedAt: null } });
  const same = running.find((r) => r.kind === kind);
  if (same) return same;
  // Begleit-Abfolgen (E-Mail „Nicht erreicht“, Erinnerung „Unterlagen fehlen“) laufen weiter
  for (const r of running.filter((x) => !istBegleitAbfolge(x.kind))) {
    await prisma.leadSequence.update({
      where: { id: r.id },
      data: {
        stoppedAt: now,
        stopReason: `Neue Abfolge: ${SEQUENCES[kind].label}`,
        nextAt: null,
        log: appendLog(r.log, { at: now.toISOString(), step: -1, action: "stop", result: "stopped", detail: `Neue Abfolge: ${SEQUENCES[kind].label}` }),
      },
    });
  }
  return prisma.leadSequence.create({
    data: { leadId, customerId: lead.customerId, kind, step: 0, startedAt: now, nextAt: new Date(now.getTime() + SEQUENCES[kind].steps[0].day * DAY) },
  });
}

/**
 * „Chat ruht“ nach einer Nachricht des Assistenten (neu) starten: läuft schon eine, beginnt sie von vorn.
 * Nicht, wenn eine andere Abfolge läuft (Nicht erreicht, Angebot, Nicht erschienen), ein Termin
 * ansteht oder der Lead abgeschlossen ist.
 */
export async function restartSilentSequence(leadId: string, now = new Date()) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true, customerId: true, erasedAt: true, status: true, stornoState: true, waUnavailableAt: true, abschlussGemeldetAt: true } });
  if (!lead || lead.erasedAt || lead.stornoState) return null;
  // Lead hat im Chat gemeldet, dass er abgeschlossen hat (lib/abschluss-server.ts): kein Nachfassen, der Vermittler trägt ein
  if (lead.abschlussGemeldetAt) return null;
  // Kein WhatsApp (lib/whatsapp/kein-whatsapp.ts): kein Nachfassen im Chat, der Vermittler ruft an
  if (lead.waUnavailableAt) return null;
  if (DONE_STATUSES.has((lead.status ?? "").trim().toLowerCase())) return null;
  if (!(await enabledFor(lead.customerId))) return null;
  const upcoming = await prisma.appointment.count({ where: { leadId, status: "booked", startsAt: { gt: now } } });
  if (upcoming > 0) return null;
  const running = await prisma.leadSequence.findMany({ where: { leadId, stoppedAt: null }, select: { id: true, kind: true } });
  if (running.some((r) => r.kind !== "silent" && !istBegleitAbfolge(r.kind))) return null;
  const nextAt = new Date(now.getTime() + SEQUENCES.silent.steps[0].day * DAY);
  const same = running.find((r) => r.kind === "silent");
  if (same) return prisma.leadSequence.update({ where: { id: same.id }, data: { step: 0, startedAt: now, nextAt, neustartAt: null, uebersprungen: [] } });
  return prisma.leadSequence.create({ data: { leadId, customerId: lead.customerId, kind: "silent", step: 0, startedAt: now, nextAt } });
}

const fmtWhen = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);

/**
 * Der Lead möchte später kontaktiert werden: Assistent legt sich eine Wiedervorlage (Abfolge „recall“).
 * Andere laufende Abfolgen enden (auch „Chat ruht“). Zeitpunkt frühestens in 15 Minuten, höchstens 90 Tage (bis
 * 22.11.2026: 60; Terminwünsche bis 90 Tage im Voraus, lib/whatsapp/termin-vorschlaege.ts fernerTerminwunsch).
 */
export async function scheduleBotRecall(leadId: string, at: Date, note: string | null, now = new Date()) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true, customerId: true, erasedAt: true } });
  if (!lead || lead.erasedAt) return null;
  const agent = await prisma.agentConfig.findUnique({ where: { customerId: lead.customerId }, select: { active: true } });
  if (!agent?.active) return null;
  const when = new Date(Math.min(Math.max(at.getTime(), now.getTime() + 15 * 60 * 1000), now.getTime() + 90 * DAY));
  // Angebot liegt beim Lead (Paket P5): Bedenkzeit, danach startet das Nachfassen zum Angebot neu (nie „followup“)
  if (await imAngebotsstand(leadId, now)) return startBedenkzeit(leadId, when, { quelle: "lead", notiz: note, now });
  await stopSequences(leadId, "Lead möchte später kontaktiert werden", { now });
  const detail = `meldet sich ${fmtWhen(when)} Uhr${note ? ` („${note.replace(/\s+/g, " ").trim().slice(0, 80)}“)` : ""}`;
  return prisma.leadSequence.create({
    data: {
      leadId,
      customerId: lead.customerId,
      kind: "recall",
      step: 0,
      startedAt: now,
      nextAt: when,
      log: [{ at: now.toISOString(), step: -1, action: "plan", result: "planned", detail }] as unknown as Prisma.InputJsonValue,
    },
  });
}

/** Laufende Abfolgen eines Leads beenden. Optional nur die seit `since` gestarteten bzw. alle außer bestimmten Arten. */
export async function stopSequences(leadId: string, reason: string, opts: { since?: Date; now?: Date; ausser?: SequenceKind[]; nurId?: string } = {}): Promise<number> {
  const now = opts.now ?? new Date();
  const running = await prisma.leadSequence.findMany({
    where: {
      leadId,
      stoppedAt: null,
      ...(opts.nurId ? { id: opts.nurId } : {}),
      ...(opts.since ? { startedAt: { gte: opts.since } } : {}),
      ...(opts.ausser?.length ? { kind: { notIn: opts.ausser } } : {}),
    },
    select: { id: true, log: true },
  });
  for (const r of running) {
    await prisma.leadSequence.update({
      where: { id: r.id },
      data: { stoppedAt: now, stopReason: reason, nextAt: null, log: appendLog(r.log, { at: now.toISOString(), step: -1, action: "stop", result: "stopped", detail: reason }) },
    });
  }
  return running.length;
}

/**
 * Liegt beim Lead ein Angebot (Paket P5)? Laufendes Nachfassen zum Angebot, Phase „Angebot gesendet“ oder ein in den
 * letzten 60 Tagen gesendetes Angebot; nicht nach Abschluss, Absage, Disqualifizierung.
 */
export async function imAngebotsstand(leadId: string, now = new Date()): Promise<boolean> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { status: true, erasedAt: true } });
  if (!lead || lead.erasedAt) return false;
  const s = (lead.status ?? "").trim().toLowerCase();
  if (DONE_STATUSES.has(s)) return false;
  if (s === "angebot gesendet") return true;
  if (await prisma.leadSequence.count({ where: { leadId, stoppedAt: null, kind: { in: ANGEBOT_KINDS } } })) return true;
  return (await prisma.appointment.count({ where: { leadId, angebotGesendetAt: { gt: new Date(now.getTime() - 60 * DAY) } } })) > 0;
}

/**
 * Bedenkzeit setzen (Paket P5): laufende Abfolgen enden („Pausiert: Bedenkzeit bis …“), die Angebots-Abfolge startet am
 * Tag `bis` neu (offer_bedenkzeit bzw. offer_selbst_bedenkzeit, je nachdem, wie das Angebot rausging). Unabhängig vom
 * Schalter „Automatisch nachfassen“: Ist er am Tag aus, steht stattdessen die Aufgabe auf „Heute“.
 */
export async function startBedenkzeit(
  leadId: string,
  bis: Date,
  opts: { quelle: "lead" | "vermittler"; notiz?: string | null; userId?: string | null; now?: Date },
) {
  const now = opts.now ?? new Date();
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true, customerId: true, erasedAt: true, followUpNote: true } });
  if (!lead || lead.erasedAt) return null;
  const running = await prisma.leadSequence.findMany({ where: { leadId, stoppedAt: null }, select: { kind: true } });
  const laufend = running.find((r) => istAngebotsAbfolge(r.kind))?.kind;
  const selbst = laufend
    ? laufend === "offer_selbst" || laufend === "offer_selbst_bedenkzeit"
    : (await prisma.appointment.findFirst({ where: { leadId, angebotGesendetAt: { not: null } }, orderBy: { angebotGesendetAt: "desc" }, select: { angebotVersand: true } }))?.angebotVersand === "selbst";
  const tag = tagKurz(bis);
  await stopSequences(leadId, `Pausiert: Bedenkzeit bis ${tag}`, { now });
  const n = (opts.notiz ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const detail = `Bedenkzeit bis ${tag} (${opts.quelle === "lead" ? "Wunsch im Chat" : "von Ihnen eingetragen"})${n ? `: „${n}“` : ""}`;
  const seq = await prisma.leadSequence.create({
    data: {
      leadId,
      customerId: lead.customerId,
      kind: selbst ? "offer_selbst_bedenkzeit" : "offer_bedenkzeit",
      step: 0,
      startedAt: now,
      nextAt: bis,
      neustartAt: bis,
      log: [{ at: now.toISOString(), step: -1, action: "plan", result: "planned", detail }] as unknown as Prisma.InputJsonValue,
    },
  });
  // Die klassische Wiedervorlage „Angebot nachfassen“ bzw. eine frühere Bedenkzeit-Aufgabe entfällt
  if (lead.followUpNote === "Angebot nachfassen" || lead.followUpNote === BEDENKZEIT_AUFGABE) {
    await prisma.lead.update({ where: { id: leadId }, data: { followUpAt: null, followUpNote: null } });
  }
  const { logLeadHistory } = await import("@/lib/lead-history");
  await logLeadHistory(leadId, "wiedervorlage", `${detail}, Nachfassen zum Angebot startet dann neu`, { customerId: lead.customerId, userId: opts.userId ?? null }).catch(() => null);
  return seq;
}

/**
 * Angebots-Abfolge pausieren (Paket P5, „Rückruf gewünscht“): alle Schritte rücken so weit nach, dass der nächste
 * frühestens `bis` fällig ist; der Vorab-Check kommt davor neu. Liefert die Zahl der pausierten Abfolgen.
 */
export async function pauseAngebotsAbfolge(leadId: string, bis: Date, grund: string, now = new Date()): Promise<number> {
  const running = await prisma.leadSequence.findMany({ where: { leadId, stoppedAt: null, kind: { in: ANGEBOT_KINDS } } });
  for (const r of running) {
    const next = r.nextAt ?? now;
    const shift = Math.max(0, bis.getTime() - Math.max(next.getTime(), now.getTime()));
    const base = r.neustartAt ?? r.startedAt;
    await prisma.leadSequence.update({
      where: { id: r.id },
      data: {
        nextAt: new Date(Math.max(next.getTime(), now.getTime()) + shift),
        neustartAt: new Date(base.getTime() + shift),
        vorabCheckStep: null,
        log: appendLog(r.log, { at: now.toISOString(), step: -1, action: "plan", result: "paused", detail: `Pausiert bis ${fmtWhen(bis)} Uhr: ${grund}` }),
      },
    });
  }
  return running.length;
}

/** Status-Wechsel (zentral über syncFollowUpWithStatus): Angebot → Abfolge starten, Ende → stoppen. */
export async function onLeadStatus(leadId: string, status: string | null | undefined, now = new Date()): Promise<{ started: boolean }> {
  const s = (status ?? "").trim().toLowerCase();
  if (DONE_STATUSES.has(s)) {
    // Nach dem Abschluss läuft die Erinnerung „Unterlagen fehlen“ weiter (Paket M6)
    await stopSequences(leadId, `Phase: ${status}`, { now, ...(s === "abschluss" ? { ausser: ["unterlagen" as const] } : {}) });
    return { started: false };
  }
  // „Angebot gesendet“ allein startet kein Nachfassen mehr (Paket P3): erst der Versand über die App bzw. „Habe ich selbst
  // gesendet“ (startAngebotNachfassen). Bis dahin gilt die klassische Wiedervorlage (lib/lead-followup.ts).
  return { started: false };
}

/** Nachfassen zum Angebot starten (Weg „app“ bzw. „selbst“, lib/angebot-senden-server.ts). Liefert die Abfolge oder null. */
export async function startAngebotNachfassen(leadId: string, weg: "app" | "selbst", now = new Date()) {
  return startSequence(leadId, weg === "app" ? "offer" : "offer_selbst", now);
}

/** Thema für „Angebot zu …“ – wie beim manuellen Nachfassen (lib/whatsapp/followup.ts). */
export function topicOf(formData: Prisma.JsonValue | null, source: string | null, an: Ansprache = "sie"): string {
  if (Array.isArray(formData)) {
    const hit = (formData as { label?: unknown; value?: unknown }[]).find((a) => a?.label === "Versicherungsinteresse" && typeof a.value === "string" && a.value.trim());
    if (hit) return String(hit.value).trim().slice(0, 60);
  }
  return source ? displayProduct(source) : a(an, "deiner Anfrage", "Ihrer Anfrage");
}

/** Grund, warum eine Abfolge vor dem nächsten Schritt endet – oder null. */
export async function stopReasonFor(seq: { leadId: string; customerId: string; startedAt: Date; kind?: string }, now = new Date()): Promise<string | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: seq.leadId },
    select: { status: true, stornoState: true, erasedAt: true, phone: true, abschlussGemeldetAt: true, source: true },
  });
  if (!lead || lead.erasedAt) return "Lead gelöscht";
  // Produkt ohne automatische Nachrichten (Ole, 20.11.2026: PKV-Tarifoptimierung, lib/lead-kontakt-sperre.ts)
  if (ohneAutoNachrichten(lead.source)) return "Produkt ohne automatische Nachrichten";
  const unterlagen = seq.kind === "unterlagen";
  if (!unterlagen && lead.abschlussGemeldetAt && lead.abschlussGemeldetAt.getTime() >= seq.startedAt.getTime()) return "Lead meldet: schon abgeschlossen";
  if (lead.stornoState) return "Lead reklamiert";
  const s = (lead.status ?? "").trim().toLowerCase();
  // „Unterlagen fehlen“ gehört oft zum Abschluss (Paket M6): endet nur bei Absage
  if (DONE_STATUSES.has(s) && !(unterlagen && s === "abschluss")) return `Phase: ${lead.status}`;
  if (unterlagen) {
    // Der Kontakt hat inzwischen Unterlagen geschickt bzw. Sie haben welche abgelegt
    const neu = await prisma.leadFile.count({ where: { leadId: seq.leadId, createdAt: { gt: seq.startedAt }, kind: { not: "angebot" } } });
    if (neu > 0) return "Unterlagen sind da";
  }
  if (istBegleitAbfolge(seq.kind)) {
    // E-Mails folgen der Stufe je Vorlage (lib/mail/ablauf.ts), nicht dem Schalter „Automatisch nachfassen“
  } else if (seq.kind === "recall") {
    const agent = await prisma.agentConfig.findUnique({ where: { customerId: seq.customerId }, select: { active: true } });
    if (!agent?.active) return "Assistent ausgeschaltet";
  } else if (!(await enabledFor(seq.customerId))) return "Automatisches Nachfassen ausgeschaltet";
  // Neu gebuchter oder noch bevorstehender Termin → nicht weiter nachfassen.
  const booked = unterlagen ? 0 : await prisma.appointment.count({ where: { leadId: seq.leadId, status: "booked", OR: [{ createdAt: { gt: seq.startedAt } }, { startsAt: { gt: now } }] } });
  if (booked > 0) return "Termin gebucht";
  const reply = await prisma.message.findFirst({
    where: {
      direction: "inbound",
      // Wiedervorlage bzw. Bedenkzeit: ein kurzes „Danke, bis dann“ direkt danach hebt sie nicht auf
      createdAt: { gt: seq.kind === "recall" || istBedenkzeitAbfolge(seq.kind) ? new Date(seq.startedAt.getTime() + 60 * 60 * 1000) : seq.startedAt },
      conversation: { customerId: seq.customerId, OR: [{ leadId: seq.leadId }, ...(lead.phone ? [{ contactPhone: lead.phone }] : [])] },
    },
    orderBy: { createdAt: "desc" },
    select: { body: true },
  });
  if (reply) return STOP_WORDS.test(reply.body ?? "") ? "Abgemeldet („Stopp“)" : "Lead hat geantwortet";
  // Antwort per E-Mail an die Antwortadresse (Paket M2, lib/mail/eingang.ts); automatische Antworten zählen nicht
  if (await hatMailAntwort(seq.leadId, seq.kind === "recall" ? new Date(seq.startedAt.getTime() + 60 * 60 * 1000) : seq.startedAt)) return "Lead hat per E-Mail geantwortet";
  if (seq.kind === "silent") {
    // Der Vermittler hat übernommen (Assistent pausiert oder eigene Nachricht): kein Nachfassen im Namen des Assistenten
    const conv = await prisma.conversation.findFirst({
      where: { customerId: seq.customerId, OR: [{ leadId: seq.leadId }, ...(lead.phone ? [{ contactPhone: lead.phone }] : [])] },
      orderBy: { lastMessageAt: "desc" },
      select: { id: true, botActive: true, optedOutAt: true },
    });
    if (conv?.optedOutAt) return "Abgemeldet („Stopp“)";
    if (conv && !conv.botActive) return "Assistent pausiert";
    if (conv) {
      const human = await prisma.message.count({
        where: { conversationId: conv.id, direction: "outbound", createdAt: { gt: seq.startedAt }, NOT: { sentBy: { in: ["bot", "system"] } } },
      });
      if (human > 0) return "Vermittler schreibt selbst";
    }
  }
  if (lead.phone) {
    const revoked = await prisma.consentOptIn.findFirst({ where: { customerId: seq.customerId, contactPhone: lead.phone, revokedAt: { not: null } }, select: { id: true } });
    if (revoked) return "Einwilligung widerrufen";
  }
  return null;
}

/**
 * Anruf-Aufgabe: Wiedervorlage für heute – eine eigene, spätere Wiedervorlage bleibt bestehen.
 * Läuft der Anrufplan (lib/call-plan.ts, „Anrufversuch X von 6“), plant er die Anrufe: keine zweite Aufgabe.
 */
export async function createCallTask(leadId: string, note: string, now: Date): Promise<"call_task" | "kept_followup"> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { followUpAt: true, followUpNote: true } });
  if (lead?.followUpAt && lead.followUpAt.getTime() > now.getTime()) return "kept_followup";
  if (lead?.followUpAt && isCallPlanNote(lead.followUpNote)) return "kept_followup";
  await prisma.lead.update({ where: { id: leadId }, data: { followUpAt: now, followUpNote: note, callbackSnoozedUntil: null } });
  return "call_task";
}

/** Stopp-Gründe, nach denen am Tag der Bedenkzeit die Aufgabe „Bedenkzeit vorbei“ kommt. */
const BEDENKZEIT_AUFGABE_GRUENDE = new Set(["Lead hat geantwortet", "Lead hat per E-Mail geantwortet", "Automatisches Nachfassen ausgeschaltet"]);

export type SequenceRunResult = { due: number; sent: number; tasks: number; stopped: number; waiting: number; failed: number };

/**
 * Fällige Schritte abarbeiten (Cron alle 5 Minuten). Mit `nurId` und `sofort` („Jetzt senden“ am Kontakt, Paket P6): nur
 * diese Abfolge, auch außerhalb des Versandfensters und während einer Pause; die Stopp-Gründe gelten trotzdem.
 */
export async function runSequences(now = new Date(), opts: { nurId?: string; sofort?: boolean } = {}): Promise<SequenceRunResult> {
  const res: SequenceRunResult = { due: 0, sent: 0, tasks: 0, stopped: 0, waiting: 0, failed: 0 };
  const due = await prisma.leadSequence.findMany({
    // Ruhende Konten (lib/ruhend.ts): kein Nachfassen; „Alle pausieren“ am Kontakt (P6): Schritte warten
    where: {
      stoppedAt: null,
      nextAt: { lte: now },
      ...(opts.nurId ? { id: opts.nurId } : {}),
      lead: { customer: { dormantSince: null }, ...(opts.sofort ? {} : { nachrichtenPausiertAt: null }) },
    },
    orderBy: { nextAt: "asc" },
    take: 100,
  });
  const windowOpen = inSendWindow(now);
  for (const seq of due) {
    res.due++;
    const def = SEQUENCES[seq.kind as SequenceKind];
    const step = def?.steps[seq.step];
    if (!def || !step) {
      await prisma.leadSequence.update({ where: { id: seq.id }, data: { stoppedAt: now, stopReason: "Abgeschlossen", nextAt: null } });
      continue;
    }
    const reason = await stopReasonFor(seq, now);
    if (reason) {
      // Begleit-Abfolgen prüfen ihre Stopp-Gründe selbst: eine endet allein, die übrigen lassen sie weiterlaufen
      await stopSequences(seq.leadId, reason, istBegleitAbfolge(seq.kind) ? { now, nurId: seq.id } : { now, ausser: BEGLEIT_KINDS });
      // Bedenkzeit (P5): Antwort vorher bzw. Nachfassen aus, der Tag bleibt als Aufgabe für den Vermittler
      if (istBedenkzeitAbfolge(seq.kind) && seq.step === 0 && BEDENKZEIT_AUFGABE_GRUENDE.has(reason)) {
        if ((await createCallTask(seq.leadId, BEDENKZEIT_AUFGABE, now)) === "call_task") res.tasks++;
      }
      res.stopped++;
      continue;
    }
    // Vom Vermittler übersprungen (P6): ohne Versand weiter, nicht aufs Versandfenster warten
    const skip = seq.uebersprungen.includes(seq.step);
    // Offener Terminvorschlag (erster Schritt „Chat ruht“): Nachfassen mit den Zeit-Knöpfen, Mo bis Sa 8 bis 20 Uhr,
    // sonntags 10 bis 18 Uhr (wie alle Schritte von „Chat ruht“, Ole 22.11.2026)
    const terminNachfass =
      !skip && seq.kind === "silent" && seq.step === 0 ? await import("@/lib/whatsapp/termin-strecke").then((m) => m.offenerTerminvorschlag(seq.leadId, seq.customerId)).catch(() => null) : null;
    const sonntag = seq.kind === "silent" ? SONNTAG_NACHFASS_STUNDEN : null;
    const imFenster = terminNachfass ? inSendWindow(now, TERMIN_NACHFASS_STUNDEN, sonntag) : sonntag ? inSendWindow(now, CHAT_RUHT_STUNDEN, sonntag) : windowOpen;
    // WhatsApp und E-Mail nur im Versandfenster – Schritt wartet, Anruf-Aufgaben jederzeit.
    if (!skip && !opts.sofort && (step.action === "whatsapp" || step.action === "email") && !imFenster) {
      res.waiting++;
      continue;
    }
    // Vermittler telefoniert gerade bzw. hat noch kein Ergebnis eingetragen (lib/telefonat.ts): kein Nachfassen, Schritt wartet
    if (!skip && !opts.sofort && step.action === "whatsapp" && (await anrufPausiert(seq.leadId, now))) {
      res.waiting++;
      continue;
    }
    // Schritt beanspruchen (nie doppelt, auch bei parallelen Läufen).
    const next = def.steps[seq.step + 1];
    const abstand = seq.kind === "silent" && !skip ? CHAT_RUHT_ABSTAND_MS : MIN_GAP_MS;
    let naechsterAt = next ? new Date(Math.max((seq.neustartAt ?? seq.startedAt).getTime() + next.day * DAY, now.getTime() + abstand)) : null;
    // „Chat ruht“: WhatsApp-Schritt noch im 24-Stunden-Fenster statt am nächsten Morgen danach (imChatFensterVorziehen)
    if (naechsterAt && next?.action === "whatsapp" && seq.kind === "silent") {
      const conv = await prisma.conversation.findFirst({ where: { leadId: seq.leadId }, orderBy: { lastMessageAt: "desc" }, select: { windowExpiresAt: true } }).catch(() => null);
      naechsterAt = imChatFensterVorziehen({ due: naechsterAt, fensterBis: conv?.windowExpiresAt ?? null, now, sonntag: SONNTAG_NACHFASS_STUNDEN });
    }
    const claimed = await prisma.leadSequence.updateMany({
      where: { id: seq.id, step: seq.step, stoppedAt: null },
      data: next
        ? { step: seq.step + 1, nextAt: naechsterAt }
        : { step: seq.step + 1, nextAt: null, stoppedAt: now, stopReason: "Abgeschlossen" },
    });
    if (claimed.count === 0) continue;

    let entry: SequenceLogEntry;
    if (skip) {
      entry = { at: now.toISOString(), step: seq.step, action: step.action, result: "skipped", detail: "von Ihnen" };
    } else if (step.action === "call" && step.aufgabe) {
      // Aufgabe über LeadTask (P7): verdrängt keine andere Wiedervorlage, rückt nach, sobald sie frei ist
      const { planeAufgabe } = await import("@/lib/lead-aufgaben");
      const r = await planeAufgabe({ leadId: seq.leadId, customerId: seq.customerId, kind: step.aufgabe, note: step.note, dueAt: now }, now);
      entry = { at: now.toISOString(), step: seq.step, action: "call", result: r === "aktiv" ? "call_task" : "kept_followup", detail: r === "wartet" ? "Aufgabe wartet, bis die Wiedervorlage frei ist" : undefined };
      if (r === "aktiv") res.tasks++;
    } else if (step.action === "call") {
      const r = await createCallTask(seq.leadId, step.note, now);
      entry = { at: now.toISOString(), step: seq.step, action: "call", result: r };
      if (r === "call_task") res.tasks++;
      if (r === "call_task" && step.push) {
        await import("@/lib/angebot-senden-server")
          .then((m) => m.angebotAnrufPushSenden(seq.leadId))
          .catch((e) => console.error("[lead-sequences push]", e));
      }
    } else if (step.action === "email") {
      entry = await import("@/lib/mail/abfolgen-mail")
        .then((m) => m.sendeAbfolgenMail(seq, step, now))
        .catch((e): SequenceLogEntry => ({ at: now.toISOString(), step: seq.step, action: "email", result: "failed", detail: (e instanceof Error ? e.message : String(e)).slice(0, 160) }));
      if (entry.result === "sent") res.sent++;
      else if (entry.result === "failed") res.failed++;
    } else {
      entry = terminNachfass ? await sendTerminNachfass(seq, terminNachfass, now) : await sendStep(seq, step, now);
      if (entry.result === "sent" || entry.result === "template") res.sent++;
      else if (entry.result === "call_task") res.tasks++;
      else if (entry.result === "failed") res.failed++;
    }
    const fresh = await prisma.leadSequence.findUnique({ where: { id: seq.id }, select: { log: true } });
    await prisma.leadSequence.update({ where: { id: seq.id }, data: { log: appendLog(fresh?.log ?? [], entry) } });
  }
  return res;
}

/**
 * Termin-Nachfassen: „Kurze Nachfrage: Passt Ihnen heute um 16 Uhr oder morgen um 10 Uhr für den Videotermin mit Herrn
 * Kannapinn?“ mit [Heute 16 Uhr] [Morgen 10 Uhr] [Andere Zeit]. Nur als Freitext im offenen 24-h-Fenster, sonst still
 * übersprungen (die weiteren Schritte von „Chat ruht“ bleiben).
 */
async function sendTerminNachfass(
  seq: { leadId: string; customerId: string; step: number },
  v: { conversationId: string; starts: string[]; windowExpiresAt: Date | null },
  now: Date,
): Promise<SequenceLogEntry> {
  const base = { at: now.toISOString(), step: seq.step, action: "whatsapp" as const };
  if (!v.windowExpiresAt || v.windowExpiresAt.getTime() <= now.getTime()) return { ...base, result: "skipped", detail: "Termin-Nachfassen: 24h-Fenster geschlossen" };
  const strecke = await import("@/lib/whatsapp/termin-strecke");
  const zeiten = await strecke.noch2FreieZeiten(seq.customerId, seq.leadId, v.starts, now);
  if (!zeiten) return { ...base, result: "skipped", detail: "Termin-Nachfassen: keine freien Zeiten" };
  const k = await strecke.streckenKontext(v.conversationId, now);
  if (!k) return { ...base, result: "skipped", detail: "Termin-Nachfassen: Chat nicht gefunden" };
  const { terminKnoepfe, terminNachfassText, zeitKurz } = await import("@/lib/whatsapp/gespraech");
  const text = terminNachfassText(k.an, k.person, [zeitKurz(new Date(zeiten[0]), now), zeitKurz(new Date(zeiten[1]), now)]);
  const knoepfe = terminKnoepfe(zeiten, now);
  try {
    const { mode } = await sendWhatsAppNotice({
      customerId: seq.customerId,
      to: k.phone,
      purpose: "followup",
      params: [],
      text,
      leadId: seq.leadId,
      textButtons: knoepfe.map((b) => b.title),
      buttonPayloads: knoepfe.map((b) => b.id),
    });
    if (mode !== "text") return { ...base, result: "failed", detail: "Termin-Nachfassen: unerwartet als Vorlage" };
    await strecke.merke(v.conversationId, strecke.STRECKE.vorschlag, { starts: zeiten, nachfassen: true });
    return { ...base, result: "sent", detail: "Termin-Nachfassen mit Zeit-Knöpfen" };
  } catch (err) {
    return { ...base, result: "failed", detail: (err instanceof Error ? err.message : String(err)).slice(0, 160) };
  }
}

/** Ging die Vorlage dieses Zwecks seit dem (Neu-)Start schon als Vorlage raus? (Log-Ergebnis „template“) */
function vorlageSchonGesendet(seq: { kind?: string; log?: Prisma.JsonValue; startedAt?: Date; neustartAt?: Date | null }, purpose: string): boolean {
  const def = seq.kind ? SEQUENCES[seq.kind as SequenceKind] : null;
  if (!def) return true;
  const ab = (seq.neustartAt ?? seq.startedAt)?.getTime() ?? 0;
  const log = Array.isArray(seq.log) ? (seq.log as unknown as SequenceLogEntry[]) : [];
  // Ältere Einträge ohne Zweck: „followup“ ohne Kalender ging als followup_nudge raus, beide zählen dann als gleich
  const gleich = (p: string | undefined) => p === purpose || (!!p && [p, purpose].every((x) => x === "followup" || x === "followup_nudge"));
  return log.some((e) => e.result === "template" && new Date(e.at).getTime() >= ab && e.step >= 0 && (e.purpose ? e.purpose === purpose : gleich((def.steps[e.step] as { purpose?: string } | undefined)?.purpose)));
}

async function sendStep(
  seq: { leadId: string; customerId: string; step: number; kind?: string; log?: Prisma.JsonValue; startedAt?: Date; neustartAt?: Date | null },
  step: Extract<Step, { action: "whatsapp" }>,
  now: Date,
): Promise<SequenceLogEntry> {
  const base = { at: now.toISOString(), step: seq.step, action: "whatsapp" as const };
  const [lead, account] = await Promise.all([
    prisma.lead.findUnique({ where: { id: seq.leadId }, select: { name: true, phone: true, formData: true, source: true, waConsent: true, waUnavailableAt: true } }),
    prisma.whatsAppAccount.findUnique({ where: { customerId: seq.customerId }, select: { status: true } }),
  ]);
  // Kein WhatsApp (Nummer nicht erreichbar, lib/whatsapp/kein-whatsapp.ts): Anruf statt WhatsApp, außer der Lead hat selbst geschrieben
  const noWa = !!lead?.waUnavailableAt && lead.phone
    ? (await prisma.message.count({ where: { direction: "inbound", conversation: { customerId: seq.customerId, contactPhone: lead.phone } } })) === 0
    : false;
  if (!lead?.phone || account?.status !== "connected" || lead.waConsent === "nein" || noWa) {
    const r = await createCallTask(seq.leadId, step.fallbackNote, now);
    return {
      ...base,
      result: r,
      detail: !lead?.phone ? "Keine Handynummer" : lead.waConsent === "nein" ? "Keine WhatsApp-Einwilligung im Formular" : noWa ? "Nicht per WhatsApp erreichbar" : "WhatsApp nicht verbunden",
    };
  }
  const an = await anspracheOf(seq.customerId);
  const who = await ansprechpartner({ customerId: seq.customerId, leadId: seq.leadId, phone: lead.phone, name: lead.name });
  const angebot = istAngebotsAbfolge(seq.kind);
  const ctx: Ctx = {
    firstName: firstNameOf(lead.name),
    hi: anredeZeile(an, who.kontakt),
    kontakt: who.kontakt,
    // Angebot: Thema aus der Auswahl im Termin („Haftpflicht und Hausrat“), sonst aus dem Leadformular
    topic: (angebot ? await import("@/lib/angebot-senden-server").then((m) => m.angebotThemaFuerLead(seq.leadId)).catch(() => null) : null) ?? topicOf(lead.formData, lead.source, an),
    an,
    person: (await import("@/lib/whatsapp/gespraech")).vermittlerName(an, { name: who.vermittler.name, anrede: who.vermittler.anrede, fallback: who.advisor || who.firm }),
  };
  let fensterZu = false;
  if (step.onlyInWindow) {
    const conv = await prisma.conversation.findUnique({
      where: { customerId_contactPhone: { customerId: seq.customerId, contactPhone: lead.phone } },
      select: { windowExpiresAt: true },
    });
    if (!conv?.windowExpiresAt || conv.windowExpiresAt.getTime() <= now.getTime()) {
      // Fenster zu (Ole, 22.11.2026: „ja, dann als Vorlage schicken“): als Vorlage, außer dieselbe Vorlage ging in diesem
      // Durchlauf schon raus (keine doppelte Vorlage mit gleichem Text; Prüfung unten mit dem tatsächlichen Zweck)
      fensterZu = true;
    }
  }
  let purpose = step.purpose;
  let params = step.params(ctx);
  // Freitext (offenes Fenster) = unser Text mit Anrede nach Regel; außerhalb wählt sendWhatsAppNotice
  // die freigegebene Vorlage passend zu Ansprache und Anrede.
  let text = step.text(ctx);
  let buttons: { buttonPayloads?: string[]; textButtons?: string[]; legacyParams?: string[] } = {};
  // Nachfassen mit zwei konkreten Zeiten aus dem Kalender (Ole, 15.11.2026); ohne Kalender die kurze Nachfrage
  if (purpose === "followup") {
    const zeiten = await zweiTerminvorschlaege(seq.customerId, seq.leadId);
    if (zeiten) {
      params = [...params, ...zeiten.labels];
      text = step.slotText ? step.slotText(ctx, zeiten.labels) : noticeText("followup", ctx.an, who, ctx.kontakt, zeiten.labels);
      // Ältere freigegebene „followup“-Fassung (nur Name): ohne Zeiten
      buttons = { buttonPayloads: zeiten.payloads, legacyParams: [ctx.firstName] };
    } else {
      purpose = "followup_nudge";
      buttons = { textButtons: [] };
    }
  } else if (step.slots && step.slotText) {
    // No-Show-Rettung: zwei neue Zeiten mit Zeit-Knöpfen im Freitext; als Vorlage ohne Zeiten (Payloads passen dort nicht)
    const zeiten = await zweiTerminvorschlaege(seq.customerId, seq.leadId);
    if (zeiten) {
      const { terminKnoepfe, zeitKurz } = await import("@/lib/whatsapp/gespraech");
      text = step.slotText(ctx, [zeitKurz(new Date(zeiten.starts[0]), now), zeitKurz(new Date(zeiten.starts[1]), now)]);
      const knoepfe = terminKnoepfe(zeiten.starts, now);
      buttons = { textButtons: knoepfe.map((b) => b.title), buttonPayloads: knoepfe.map((b) => b.id) };
    }
  }
  if (fensterZu && vorlageSchonGesendet(seq, purpose)) return { ...base, result: "skipped", detail: "24h-Fenster geschlossen, Vorlage schon gesendet" };
  try {
    const { mode } = await sendWhatsAppNotice({
      customerId: seq.customerId,
      to: lead.phone,
      purpose,
      params,
      text,
      leadId: seq.leadId,
      contactName: lead.name,
      anrede: ctx.kontakt,
      ...buttons,
    });
    return { ...base, result: mode === "template" ? "template" : "sent", purpose };
  } catch (err) {
    if (err instanceof NoTemplateError && step.fallback) {
      // Neue Vorlage noch nicht freigegeben: die bisherige (freigegebene) Vorlage
      try {
        const { mode } = await sendWhatsAppNotice({
          customerId: seq.customerId,
          to: lead.phone,
          purpose: step.fallback.purpose,
          params: step.fallback.params(ctx),
          text,
          leadId: seq.leadId,
          contactName: lead.name,
          anrede: ctx.kontakt,
        });
        return { ...base, result: mode === "template" ? "template" : "sent", detail: `Vorlage ${step.fallback.purpose}` };
      } catch (err2) {
        if (!(err2 instanceof NoTemplateError)) return { ...base, result: "failed", detail: (err2 instanceof Error ? err2.message : String(err2)).slice(0, 160) };
      }
    }
    if (err instanceof WhatsAppUnavailableError) {
      // Festnetznummer (lib/whatsapp/festnetz.ts) bzw. kein WhatsApp: nichts gesendet, Anruf statt WhatsApp
      const r = await createCallTask(seq.leadId, step.fallbackNote, now);
      return { ...base, result: r, detail: "Nicht per WhatsApp erreichbar" };
    }
    if (err instanceof NoTemplateError) {
      const r = await createCallTask(seq.leadId, step.fallbackNote, now);
      return { ...base, result: r, detail: "Keine freigegebene Vorlage, Anruf-Aufgabe statt WhatsApp" };
    }
    return { ...base, result: "failed", detail: (err instanceof Error ? err.message : String(err)).slice(0, 160) };
  }
}

/** Für die Anzeige im Lead: Abfolgen mit lesbaren Einträgen (neueste zuerst). */
export async function loadLeadSequences(leadId: string) {
  const list = await prisma.leadSequence.findMany({ where: { leadId }, orderBy: { startedAt: "desc" }, take: 5 });
  return list.map((s) => {
    const def = SEQUENCES[s.kind as SequenceKind];
    const total = def?.steps.length ?? 0;
    const log = (Array.isArray(s.log) ? (s.log as unknown as SequenceLogEntry[]) : []).map((e) => ({ at: e.at, text: describe(e, total) }));
    const nextStep = def?.steps[s.step];
    return {
      id: s.id,
      kind: s.kind,
      step: s.step,
      label: def?.label ?? s.kind,
      active: !s.stoppedAt,
      startedAt: s.startedAt.toISOString(),
      stopReason: s.stopReason,
      next: !s.stoppedAt && nextStep && s.nextAt ? { at: s.nextAt.toISOString(), text: nextStep.action === "whatsapp" ? "WhatsApp" : nextStep.action === "email" ? "E-Mail" : "Anruf-Aufgabe" } : null,
      entries: log,
    };
  });
}

export function describe(e: SequenceLogEntry, total: number): string {
  const n = `(Schritt ${e.step + 1} von ${total})`;
  if (e.action === "stop" && e.detail?.startsWith("Pausiert")) return e.detail;
  if (e.action === "stop") return `Abfolge beendet: ${e.detail ?? "gestoppt"}`;
  if (e.action === "plan" && e.result === "paused") return e.detail ?? "Pausiert";
  if (e.action === "plan" && /^(Bedenkzeit|E-Mail|Erinnerung)/.test(e.detail ?? "")) return e.detail!;
  if (e.action === "plan") return `Wiedervorlage vom Assistenten: ${e.detail ?? "meldet sich später"}`;
  if (e.action === "call" && e.result === "skipped") return `Anruf-Aufgabe übersprungen (${e.detail ?? "von Ihnen"}) ${n}`;
  if (e.action === "call") return e.result === "kept_followup" ? `Anruf fällig, Ihre eigene Wiedervorlage bleibt ${n}` : `Anruf-Aufgabe auf „Heute“ angelegt ${n}`;
  if (e.action === "email") {
    if (e.result === "sent") return `${e.detail ?? "Nachfassen"}: E-Mail gesendet ${n}`;
    if (e.result === "skipped") return `E-Mail übersprungen${e.detail ? ` (${e.detail})` : ""} ${n}`;
    return `E-Mail konnte nicht gesendet werden ${n}`;
  }
  switch (e.result) {
    case "sent":
    case "template":
      return `Nachfassen: WhatsApp gesendet ${n}`;
    case "call_task":
      return `WhatsApp nicht möglich${e.detail ? ` (${e.detail.replace(/ – .*$/, "")})` : ""} – Anruf-Aufgabe angelegt ${n}`;
    case "kept_followup":
      return `WhatsApp nicht möglich, Ihre Wiedervorlage bleibt ${n}`;
    case "skipped":
      return `WhatsApp übersprungen${e.detail ? ` (${e.detail})` : ""} ${n}`;
    default:
      return `WhatsApp konnte nicht gesendet werden ${n}`;
  }
}
