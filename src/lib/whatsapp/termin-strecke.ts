// Ablauf der Termin-Strecke nach der Buchung (Ole, 17.11.2026; Reihenfolge P2), Texte in lib/whatsapp/gespraech.ts:
//   Buchungsnachricht kurz (Zeit fest im Kalender des Vermittlers, Link; die Einladung an den Lead ist ausstehend)
//     → nur Tierkranken (TKV, Ole 18.11.2026): feste Tierfragen, eine pro Nachricht, nur was fehlt (Gesundheit zuerst,
//       lib/whatsapp/tier-fragen.ts; Antworten ohne Assistent, tierAntwort), danach der Komplettcheck
//     → Komplettcheck [Ja, gern] [Nein, danke] (Kennzeichen am Termin); bei Ja 45 Min.: frei → verlängert, belegt →
//       zwei andere Zeiten mit 45 Min. [Zeit 1] [Zeit 2] [Zeit behalten] (lib/komplettcheck-dauer.ts)
//     → „Entscheidet noch jemand mit, zum Beispiel Ihr Partner?“ [Ja, gemeinsam] [Nein, ich allein] (Ole, 21.11.2026; nicht
//       bei Alleinstehenden bzw. bekannter Antwort); bei „gemeinsam“ kommen beide zum Termin (Angabe entscheidung).
//       Seit 21.11.2026 spät steht die Frage schon VOR dem Terminvorschlag (partnerVorStand, Splittest partner_vor_termin
//       Fassung a); hier nach der Buchung nur noch, wenn sie davor unbeantwortet blieb (bzw. in Fassung b)
//     → fehlende Angaben fürs Angebot (Rechner-Tabelle), eine Frage pro Nachricht (Assistent, bot.ts)
//     → nur bei „Ja, gern“: Frage nach bestehenden Verträgen → Antwort (KI-Extraktion, tolerant) am Lead
//     → Policen-Bitte (nur Sachprodukte, genau einmal) [Schicke ich gleich] [Nicht zur Hand]
//     → Schluss: Bereitlegen in einer Zeile, „Zum Schluss: Die Einladung … geht an … Stimmt die Adresse?“
//       [Ja, stimmt] [Andere Adresse] bzw. ohne Adresse die freiwillige Frage danach.
// Die Einladung an den Lead geht genau einmal, sobald Adresse und Komplettcheck feststehen (lib/calendar/einladung.ts),
// ohne Antwort nach 30 Min. (kurzfristig 5 Min., spätestens 60 Min. vor Beginn; ohne Adresse ein Link per WhatsApp,
// lib/whatsapp/einladung-rueckfall.ts).
// Antwortet der Lead nicht, wird nicht nachgehakt, aber nach einer Stunde der nächste Schritt geschickt
// (runStreckeAbschliessen, WhatsApp-Cron; nur im 24-h-Fenster, Mo bis Sa 8 bis 20 Uhr): Tierfrage → Komplettcheck, Komplettcheck → erste
// Angebotsfrage, Zeitangebot → Zeit behalten, „Entscheidet noch jemand mit?“ → erste Angebotsfrage, Vertragsfrage → Policen-Bitte (die Verträge entfallen, die Bitte nicht),
// Policen-Bitte → Schluss. Solange Angebotsfragen offen sind, nie der Schluss.
// Policen-Erinnerungen (höchstens 2): 24 Std. nach der Buchung (nur mit Opt-in, nur bei mehr als 2 Tagen bis zum Termin,
// runPolicenErinnerung) und ein Satz in der Vortags-Erinnerung (auch ohne Opt-in, A8 a, policenVortagSatzFuer, lib/whatsapp/reminders.ts);
// Schluss, sobald eine Police da ist oder der Lead keine hat.
// Merker je Termin als interne Nachrichten (kind, body mit appointmentId), damit nichts doppelt geht.
//
// Außerdem: offener Terminvorschlag (für das Nachfassen nach 2 Std., lib/lead-sequences.ts) und freie Zeiten dafür.

import Anthropic from "@anthropic-ai/sdk";
import { jsonAusAntwort, jsonAusgabe } from "@/lib/ki-json";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { advisorDisplayName } from "@/lib/advisor-name";
import { a, asAnsprache, type Ansprache } from "@/lib/ansprache";
import type { Variante } from "@/lib/experimente";
import { ansprechpartner } from "@/lib/lead-anrede";
import { redactHealthText, splitHealthAnswers } from "@/lib/gesundheitsdaten";
import { folgefragen, folgefrageText, spartenDesLeads, type Folgefrage } from "@/lib/preise/rechner-angaben";
import { istKfzProdukt } from "@/lib/whatsapp/produkt-fragen";
import {
  abschlussEinleitung,
  abschlussText,
  adresseUnvollstaendig,
  andereAdresseFrage,
  bereitlegenFuerLead,
  EINGETRAGEN_KNOEPFE,
  ENTSCHEIDUNG,
  EMAIL_KNOEPFE,
  eingetragenDank,
  eingetragenFrage,
  einladungUnterwegs,
  kalenderNochmalText,
  istFamilie,
  KOMPLETTCHECK_KNOEPFE,
  komplettcheckFrage,
  knoepfeFuerText,
  knopfZeit,
  PARTNER_KNOEPFE,
  partnerBekannt,
  partnerDank,
  partnerFrage,
  partnerFrageNoetig,
  VERTRAEGE_BEREITLEGEN_RE,
  vermittlerName,
  vertragsFrage,
  zeitKurz,
  zeitLang,
  zusageDank,
  type Knopf,
  type VermittlerName,
} from "@/lib/whatsapp/gespraech";
import { detailNachfrageText, detailVerstaendlich, istTierStrecke, offeneTierFragen, tierAntwortAuswerten, tierFrage, type TierFrageKey } from "@/lib/whatsapp/tier-fragen";
import { cleanQualificationData, mergeQualificationData } from "@/lib/whatsapp/qualification";
import {
  antwortAuswerten,
  anzahlHauptfragen,
  feldWert,
  FERTIG,
  frageNachricht,
  fragenPlan,
  mehrfachFertig,
  mehrfachRest,
  mehrfachWeiterNachricht,
  mehrfachWert,
  nachfrageText,
  offeneFragen,
  restText,
  vorbereitungAusText,
  type Antwort,
  type Auswertung,
  type FrageNachricht,
  type FragenQuelle,
  type GeplanteFrage,
} from "@/lib/vorbereitung/fragen";
import { aktiveSparten, buendelGewuenscht, engineSparten, fragenAktiv, SPARTEN_DEFINITIONEN } from "@/lib/vorbereitung/sparten";
import { tkvAngabenNormal } from "@/lib/tkv-umfang";
import { tkvUmfangMerken } from "@/lib/tkv-umfang-server";
import { ZWISCHEN_TEXT } from "@/lib/whatsapp/zwischenfrage";
import { DATUM_NACHFRAGE_RE, datumMerkerAus, datumSchritt } from "@/lib/whatsapp/datum-nachfrage";
import type { DatumArt } from "@/lib/datum-antwort";
import {
  fehlendeVersicherer,
  normalisiereVertraege,
  sagtKeine,
  versichererNachfrage,
  versichererZuordnen,
  VERTRAG_SPARTEN,
  VORVERTRAEGE_SCHEMA,
  vertraegeAusText,
  vorvertraegeAus,
  type VertragSparte,
  type Vorvertraege,
  type Vorvertrag,
} from "@/lib/whatsapp/vorvertraege";

/** Sparte im Satz für „… habe ich ergänzt“. */
const SPARTE_KURZ: Partial<Record<VertragSparte, string>> = { "Private Krankenversicherung": "die private Krankenversicherung" };

/** Merker (interne Nachrichten) der Strecke. */
export const STRECKE = {
  vorschlag: "termin_vorschlag",
  /** Frage nach der E-Mail-Adresse (Schluss ohne Adresse bzw. nach „Andere Adresse“, body.andere) */
  emailFrage: "email_frage",
  /** Adresse bestätigt bzw. neue genannt */
  emailOk: "email_ok",
  komplettFrage: "komplettcheck_frage",
  komplett: "komplettcheck",
  /** Komplettcheck „Ja“, Zeit danach belegt: zwei andere Zeiten mit 45 Min. angeboten */
  langAngebot: "komplett_zeiten",
  langAntwort: "komplett_zeiten_antwort",
  vertragsfrage: "vertragsfrage",
  vorvertraege: "vorvertraege",
  /** Einmalige Nachfrage nach den Gesellschaften (body.sparten: Sparten ohne Versicherer), Ole 19.11.2026 */
  versichererFrage: "versicherer_frage",
  /** Erste Angebotsfrage von der App gestellt (nach dem Komplettcheck bzw. als Rückfall) */
  angebotsfragen: "angebotsfragen",
  /** Policen-Bitte (body.police: Wort für die Erinnerung, null = alle Policen) */
  policenBitte: "policen_bitte",
  /** Reaktion auf die Policen-Bitte (Knopf bzw. Antwort; body.art: gleich, spaeter, keine, ohne_antwort) */
  policenAntwort: "policen_antwort",
  /** Policen-Erinnerung 24 Std. nach der Buchung bzw. am Vortag (body.art: tag, vortag) */
  policenErinnerung: "policen_erinnerung",
  abschluss: "strecke_abschluss",
  /** Nach „Einladung ist unterwegs“: Frage „Konnten Sie den Termin eintragen?“ bzw. die Antwort darauf (body.ja) */
  eingetragenFrage: "eingetragen_frage",
  eingetragen: "eingetragen_antwort",
  /** Tierfrage gestellt (TKV, body.key: lib/whatsapp/tier-fragen.ts TierFrageKey) */
  tierFrage: "tier_frage",
  /** Tierfrage beantwortet (body.keys: beantwortete Fragen) */
  tierAntwort: "tier_antwort",
  /** Einmalige Nachfrage bei unverständlicher Antwort auf eine Tierfrage (body.key), Ole 20.11.2026 */
  tierNachfrage: "tier_nachfrage",
  /**
   * Einmalige Nachfrage bei einem unklaren Datum auf die Angebotsfrage nach dem Geburtsdatum (body.feld, vorschlaege,
   * roh, andere; lib/whatsapp/datum-nachfrage.ts), Ole 21.11.2026
   */
  datumNachfrage: "datum_nachfrage",
  /** Zusage-Frage unter der Buchungsbestätigung (Splittest termin_zusage, Fassung b) */
  zusageFrage: "zusage_frage",
  /** Antwort auf die Zusage-Frage (body.art: ja, andere, ohne_antwort) */
  zusageAntwort: "zusage_antwort",
  /** „Entscheidet noch jemand mit?“ nach dem Komplettcheck (Ole, 21.11.2026; body.bekannt: Partner schon bekannt) */
  partnerFrage: "partner_frage",
  /** Antwort darauf (body.art: mit, allein, ohne_antwort) */
  partnerAntwort: "partner_antwort",
  /**
   * Dieselbe Frage VOR dem Terminvorschlag (Ole, 21.11.2026 spät; Splittest partner_vor_termin Fassung a), noch ohne
   * Termin (body.bekannt). Eigene Merker, damit der Stand je Termin (streckenStand) unberührt bleibt.
   */
  partnerVorFrage: "partner_frage_vor",
  /** Antwort darauf (body.art: mit, allein, ohne_antwort, termin = inzwischen gebucht) */
  partnerVorAntwort: "partner_antwort_vor",
  /**
   * Frage nach der Vorbereitung in der Bestätigung (Vorlage ab v5, Ole 26.11.2026; body.via: bestaetigung, ops) bzw. die
   * Nachfrage am Folgetag (booking_prep_nudge) und die Antwort darauf (body.art: ja, termin)
   */
  vorbereitungFrage: "vorbereitung_frage",
  vorbereitungNachfrage: "vorbereitung_nachfrage",
  vorbereitungAntwort: "vorbereitung_antwort",
  /** Fragen-Engine (lib/vorbereitung/fragen.ts): Frage gestellt (body.id), beantwortet (body.id, art), einmal nachgefragt */
  angabeFrage: "angabe_frage",
  angabeAntwort: "angabe_antwort",
  angabeNachfrage: "angabe_nachfrage",
  /** Mehrfachauswahl: eine Zeile gewählt, Frage bleibt offen (body.id, opt) */
  angabeTeil: "angabe_teil",
  /** „Rest im Termin“ (body.offen: Bezeichnungen der offenen Fragen) */
  angabenRest: "angaben_rest",
} as const;

const HOUR = 60 * 60 * 1000;
/** Dauer mit Komplettcheck (wie lib/showup.ts KOMPLETTCHECK_DAUER_MIN). */
const LANG_MIN = 45;

// ─── Policen-Bitte in der Strecke (Text und Knöpfe: lib/policen/bitte.ts) ────────────────────────────────────────────

/** Höchstens so viele Policen-Erinnerungen (24 Std. nach Buchung und Vortag). */
export const MAX_POLICEN_ERINNERUNGEN = 2;

/** Sagt der Lead, er habe keine Policen bzw. Versicherungen („habe keine“, „keine“, „nichts“)? */
export function sagtKeinePolicen(text: string | null | undefined): boolean {
  const t = (text ?? "").toLowerCase().trim();
  return sagtKeine(t) || /^(ich )?(hab(e)?|habe ich|hab ich) (noch |leider |gar )?(keine|nichts)\b|(gibt('s| es)|sind) (noch |leider )?keine\b/.test(t);
}

/** Antwort auf „Nicht zur Hand“ (erster Satz des Schlusses). */
export function policenSpaeterText(an: Ansprache): string {
  return a(an, "Kein Problem, ich erinnere dich rechtzeitig vor dem Termin daran.", "Kein Problem, ich erinnere Sie rechtzeitig vor dem Termin daran.");
}

/** Eigene Erinnerung 24 Std. nach der Buchung (nur bei mehr als 2 Tagen bis zum Termin). police = null: alle Policen. */
export function policenErinnerungText(an: Ansprache, person: { nom: string }, police: string | null, kfz = false): string {
  // Kfz-Lead (Ole, 21.11.2026): die zwei Unterlagen für den Beitrag
  const was = kfz
    ? a(an, "deinen Fahrzeugschein und die letzte Rechnung deiner Kfz-Versicherung", "Ihren Fahrzeugschein und die letzte Rechnung Ihrer Kfz-Versicherung")
    : police
      ? a(an, `deine ${police}`, `Ihre ${police}`)
      : a(an, "deine Policen für Haftpflicht, Hausrat oder Kfz", "Ihre Policen für Haftpflicht, Hausrat oder Kfz");
  return a(
    an,
    `Kurze Erinnerung: Hast du ${was} schon zur Hand? Einfach abfotografieren und hier schicken, dann kann ${person.nom} alles vorbereiten.\n\nKeine Nachrichten mehr? Antworte einfach STOP.`,
    `Kurze Erinnerung: Haben Sie ${was} schon zur Hand? Einfach abfotografieren und hier schicken, dann kann ${person.nom} alles vorbereiten.\n\nKeine Nachrichten mehr? Antworten Sie einfach STOP.`,
  );
}

/**
 * Satz im Nutzensatz der Vortags-Terminerinnerung (A8 a, Rechtsprüfung 19.11.2026): freiwillig, Sparte nie nennen,
 * ohne Zeilenumbruch (steht in einer Vorlagen-Variable). person = Vermittler im Nominativ, sonst „Ihr Berater“.
 * Kfz-Lead (Ole, 22.11.2026): „Unterlagen“ statt „Policen“ (Fahrzeugschein und Rechnung sind keine Policen).
 */
export function policenVortagSatz(an: Ansprache, person?: { nom: string } | null, kfz = false): string {
  const wer = person?.nom?.trim() || a(an, "dein Berater", "Ihr Berater");
  const was = kfz ? a(an, "deine Unterlagen", "Ihre Unterlagen") : a(an, "deine Policen", "Ihre Policen");
  const foto = kfz ? "Fotos reichen" : "ein Foto reicht";
  return a(
    an,
    `Wenn du magst, schick vorab ${was} hier in den Chat (${foto}), dann kann sich ${wer} schon vorbereiten. Geht aber auch ohne.`,
    `Wenn Sie mögen, schicken Sie vorab ${was} hier in den Chat (${foto}), dann kann sich ${wer} schon vorbereiten. Geht aber auch ohne.`,
  );
}

/**
 * Policen-Bitte der Strecke (Ole, 17.11.2026 spät; Text und Einwilligung aus dem Policen-Modul, lib/policen/bitte.ts
 * über policenBitteFuerChat): jeder Lead genau einmal. Erst die Bitte (Text), dann die Einwilligung als eigene
 * interaktive Nachricht („Einverstanden“ / „Lieber nicht“, Rechtsprüfung A1), die das Policen-Modul beantwortet.
 * null = schon gebeten, Funktion aus (Notschalter, Ablage nicht eingerichtet), Minderjährige, Lead sagt „keine
 * Versicherungen“ bzw. gelöschter Lead.
 */
async function policenBitteSchritt(k: StreckenKontext, einleitung: string | null, ohneFlow = false): Promise<Schritt | null> {
  if (!k.leadId) return null;
  const lead = await prisma.lead.findUnique({ where: { id: k.leadId }, select: { erasedAt: true, vorvertraege: true } });
  if (!lead || lead.erasedAt) return null;
  const vv = lead.vorvertraege as { keine?: unknown; liste?: unknown } | null;
  if (vv && vv.keine === true && !(Array.isArray(vv.liste) && vv.liste.length)) return null;
  // Tierkranken ohne Komplettcheck: die Bitte nennt Haftpflicht, Hausrat und Kfz, passt also nicht (Ole, 18.11.2026)
  // Policen-Strecke v2 (POLICEN_FLOW, lib/policen/flow): Chat-Nachricht mit Formular statt Bitte und Einwilligung; die
  // Nachricht nennt keine Sparten, darum auch für Tierkranken (Formular ohne Gesundheitssatz). Gesendet wird in
  // sendeSchritt bzw. bot.ts (flow = true); text ist nur die Einleitung für den Rückfall.
  // ohneFlow: Rückfall, nachdem das Senden des Formulars scheiterte (sendeSchritt bzw. bot.ts)
  const flow = ohneFlow ? false : await import("@/lib/policen/flow/server").then((m) => m.policenFlowMoeglich(k.conversationId)).catch(() => false);
  if (flow) return { text: einleitung ?? "Danke!", buttons: null, merker: STRECKE.policenBitte, daten: { police: null, flow: true }, flow: true };
  if (istTierStrecke(k.source) && k.termin?.komplettcheck !== true) return null;
  const { policenBitteFuerChat } = await import("@/lib/policen/server");
  const b = await policenBitteFuerChat(k.conversationId);
  if (!b) return null;
  return {
    text: [einleitung, b.text].filter(Boolean).join(" "),
    buttons: b.knoepfe.length ? b.knoepfe : null,
    merker: STRECKE.policenBitte,
    daten: { police: null },
    folge: { text: b.einwilligung.text, buttons: b.einwilligung.knoepfe, footer: b.einwilligung.fusszeile },
  };
}

/** Mo bis Sa 8 bis 20 Uhr (deutsche Zeit): Nachrichten der App ohne Anstoß des Leads. */
export function inStreckenFenster(now: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const wd = parts.find((p) => p.type === "weekday")?.value;
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  return wd !== "Sun" && hour >= 8 && hour < 20;
}

function formAnswers(raw: unknown): { label: string; value: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((x) => (x && typeof x === "object" && typeof x.label === "string" && typeof x.value === "string" ? [{ label: x.label, value: x.value }] : []));
}

export type StreckenKontext = {
  conversationId: string;
  customerId: string;
  phone: string;
  email: string | null;
  leadId: string | null;
  source: string | null;
  formular: { label: string; value: string }[];
  angaben: unknown;
  an: Ansprache;
  person: VermittlerName;
  familie: boolean;
  termin: { id: string; startsAt: Date; confirmedAt: Date | null; komplettcheck: boolean | null } | null;
};

/** Alles, was die Strecke für eine Nachricht braucht (Ansprache, Vermittler, Angaben, kommender Termin). */
export async function streckenKontext(conversationId: string, now = new Date()): Promise<StreckenKontext | null> {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, customerId: true, contactPhone: true, contactName: true, contactEmail: true, leadId: true, qualificationData: true },
  });
  if (!conv) return null;
  const [lead, customer, termin] = await Promise.all([
    conv.leadId ? prisma.lead.findUnique({ where: { id: conv.leadId }, select: { source: true, formData: true, email: true, name: true } }) : null,
    prisma.customer.findUnique({ where: { id: conv.customerId }, select: { name: true, leadAddress: true } }),
    prisma.appointment.findFirst({
      where: { status: "booked", startsAt: { gt: now }, OR: [{ conversationId }, ...(conv.leadId ? [{ leadId: conv.leadId }] : [])] },
      orderBy: { startsAt: "asc" },
      select: { id: true, startsAt: true, confirmedAt: true, komplettcheck: true },
    }),
  ]);
  const an = asAnsprache(customer?.leadAddress);
  const who = await ansprechpartner({ customerId: conv.customerId, leadId: conv.leadId, phone: conv.contactPhone, name: lead?.name ?? conv.contactName });
  const advisorName = who.advisor || advisorDisplayName(customer?.name) || a(an, "deinem Berater", "Ihrem Berater");
  const formular = splitHealthAnswers(formAnswers(lead?.formData)).normal;
  return {
    conversationId: conv.id,
    customerId: conv.customerId,
    phone: conv.contactPhone,
    email: conv.contactEmail ?? lead?.email ?? null,
    leadId: conv.leadId,
    source: lead?.source ?? null,
    formular,
    angaben: conv.qualificationData,
    an,
    person: vermittlerName(an, { name: who.vermittler.name, anrede: who.vermittler.anrede, fallback: advisorName }),
    familie: istFamilie(formular, conv.qualificationData),
    termin,
  };
}

/** Merker setzen (interne Nachricht). */
export async function merke(conversationId: string, kind: string, payload: Record<string, unknown>): Promise<void> {
  await prisma.message.create({ data: { conversationId, direction: "internal", kind, body: JSON.stringify(payload), sentBy: "bot" } });
}

export type StreckenStand = {
  emailFrageAt: Date | null;
  /** Letzte Frage nach der Adresse bzw. letzte Bestätigung (mehrmals „Andere Adresse“ möglich) */
  emailFrageLetzte: Date | null;
  emailFrageAndere: boolean;
  emailOkLetzte: Date | null;
  komplettFrageAt: Date | null;
  komplettBeantwortet: boolean;
  langAngebotAt: Date | null;
  langAntwortAt: Date | null;
  angebotsfragenAt: Date | null;
  vertragsfrageAt: Date | null;
  vorvertraegeErfasst: boolean;
  /** Nachfrage nach den Gesellschaften gestellt (wartet auf Antwort, solange vorvertraegeErfasst false ist) */
  versichererFrage: { at: Date; sparten: VertragSparte[]; anzahl: number } | null;
  policenBitteAt: Date | null;
  /** Wort der Policen-Bitte für die Erinnerung (null = alle Policen) */
  policenPolice: string | null;
  policenAntwortAt: Date | null;
  policenKeine: boolean;
  policenErinnerungen: number;
  /** Bitte als Formular gesendet (Policen-Strecke v2): Erinnerungen über lib/policen/flow/server.ts */
  policenFlow: boolean;
  abschlussAt: Date | null;
  abschlussMitEmail: boolean;
  /** Letzte Tierfrage (TKV) und beantwortete Tierfragen */
  tierFrageLetzte: { at: Date; key: string } | null;
  tierBeantwortet: string[];
  /** Zusage-Frage (Splittest termin_zusage, Fassung b) gestellt bzw. beantwortet (art: ja, andere, ohne_antwort) */
  zusageFrageAt: Date | null;
  zusageAntwort: { at: Date; art: string } | null;
  /** „Entscheidet noch jemand mit?“ gestellt bzw. beantwortet (Ole, 21.11.2026) */
  partnerFrageAt: Date | null;
  partnerAntwortAt: Date | null;
};

const STAND_KINDS: string[] = [
  STRECKE.emailFrage,
  STRECKE.emailOk,
  STRECKE.komplettFrage,
  STRECKE.komplett,
  STRECKE.langAngebot,
  STRECKE.langAntwort,
  STRECKE.angebotsfragen,
  STRECKE.vertragsfrage,
  STRECKE.vorvertraege,
  STRECKE.versichererFrage,
  STRECKE.policenBitte,
  STRECKE.policenAntwort,
  STRECKE.policenErinnerung,
  STRECKE.abschluss,
  STRECKE.tierFrage,
  STRECKE.tierAntwort,
  STRECKE.zusageFrage,
  STRECKE.zusageAntwort,
  STRECKE.partnerFrage,
  STRECKE.partnerAntwort,
];

const daten = (body: string | null): Record<string, unknown> => {
  try {
    const x = JSON.parse(body ?? "{}");
    return x && typeof x === "object" ? (x as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

/** Stand der Strecke für einen Termin (aus den Merkern). */
export async function streckenStand(conversationId: string, appointmentId: string): Promise<StreckenStand> {
  const rows = await prisma.message.findMany({
    where: { conversationId, direction: "internal", kind: { in: STAND_KINDS }, body: { contains: appointmentId } },
    orderBy: { createdAt: "asc" },
    select: { kind: true, createdAt: true, body: true },
  });
  const erste = (k: string) => rows.find((r) => r.kind === k) ?? null;
  const letzte = (k: string) => rows.filter((r) => r.kind === k).at(-1) ?? null;
  const at = (k: string) => erste(k)?.createdAt ?? null;
  const frage = letzte(STRECKE.emailFrage);
  const bitte = erste(STRECKE.policenBitte);
  const abschluss = erste(STRECKE.abschluss);
  return {
    emailFrageAt: at(STRECKE.emailFrage),
    emailFrageLetzte: frage?.createdAt ?? null,
    emailFrageAndere: daten(frage?.body ?? null).andere === true,
    emailOkLetzte: letzte(STRECKE.emailOk)?.createdAt ?? null,
    komplettFrageAt: at(STRECKE.komplettFrage),
    komplettBeantwortet: !!at(STRECKE.komplett),
    langAngebotAt: at(STRECKE.langAngebot),
    langAntwortAt: at(STRECKE.langAntwort),
    angebotsfragenAt: at(STRECKE.angebotsfragen),
    vertragsfrageAt: at(STRECKE.vertragsfrage),
    vorvertraegeErfasst: !!at(STRECKE.vorvertraege),
    // Letzte Nachfrage gilt (nach „Und PKV“ kommt höchstens eine zweite, Ole 20.11.2026); anzahl begrenzt auf zwei
    versichererFrage: (() => {
      const f = letzte(STRECKE.versichererFrage);
      const sp = f ? daten(f.body).sparten : null;
      const anzahl = rows.filter((r) => r.kind === STRECKE.versichererFrage).length;
      return f ? { at: f.createdAt, sparten: (Array.isArray(sp) ? sp : []).filter((x): x is VertragSparte => (VERTRAG_SPARTEN as readonly string[]).includes(x)), anzahl } : null;
    })(),
    policenBitteAt: bitte?.createdAt ?? null,
    policenPolice: typeof daten(bitte?.body ?? null).police === "string" ? (daten(bitte!.body).police as string) : null,
    policenAntwortAt: at(STRECKE.policenAntwort),
    policenKeine: rows.some((r) => r.kind === STRECKE.policenAntwort && daten(r.body).art === "keine"),
    policenErinnerungen: rows.filter((r) => r.kind === STRECKE.policenErinnerung && daten(r.body).gesendet !== false).length,
    policenFlow: daten(bitte?.body ?? null).flow === true,
    abschlussAt: abschluss?.createdAt ?? null,
    abschlussMitEmail: daten(abschluss?.body ?? null).mitEmail === true,
    tierFrageLetzte: (() => {
      const t = letzte(STRECKE.tierFrage);
      const key = t ? daten(t.body).key : null;
      return t && typeof key === "string" ? { at: t.createdAt, key } : null;
    })(),
    tierBeantwortet: rows
      .filter((r) => r.kind === STRECKE.tierAntwort)
      .flatMap((r) => {
        const k = daten(r.body).keys;
        return Array.isArray(k) ? k.filter((x): x is string => typeof x === "string") : [];
      }),
    zusageFrageAt: at(STRECKE.zusageFrage),
    zusageAntwort: (() => {
      const z = erste(STRECKE.zusageAntwort);
      return z ? { at: z.createdAt, art: String(daten(z.body).art ?? "") } : null;
    })(),
    partnerFrageAt: at(STRECKE.partnerFrage),
    partnerAntwortAt: at(STRECKE.partnerAntwort),
  };
}

/**
 * Wartet die Strecke auf die Antwort auf die Zusage-Frage (Splittest termin_zusage, Fassung b)? Solange kommt weder
 * Komplettcheck noch Tierfrage; ohne Antwort nach 1 Std. (runStreckeAbschliessen) bzw. nach dem Knopf.
 */
export function zusageOffen(s: StreckenStand): boolean {
  return !!s.zusageFrageAt && !s.zusageAntwort && !s.komplettFrageAt && !s.tierFrageLetzte && !s.abschlussAt;
}

/** Wartet die Strecke auf die Antwort auf „Entscheidet noch jemand mit?“ (nach dem Komplettcheck)? */
export function partnerFrageOffen(s: StreckenStand): boolean {
  return !!s.partnerFrageAt && !s.partnerAntwortAt && !s.abschlussAt;
}

/** Wartet die Strecke auf die Antwort auf eine Tierfrage (TKV, vor dem Komplettcheck)? */
export function tierFrageOffen(s: StreckenStand): boolean {
  return !!s.tierFrageLetzte && !s.tierBeantwortet.includes(s.tierFrageLetzte.key) && !s.komplettFrageAt && !s.abschlussAt;
}

/** Komplettcheck erledigt: beantwortet oder (Rückfall) übersprungen, weil die Angebotsfragen schon laufen. */
export function komplettcheckErledigt(s: StreckenStand): boolean {
  return s.komplettBeantwortet || !!s.angebotsfragenAt;
}

/** Angebot längerer Zeiten (Komplettcheck, Zeit belegt) offen? */
export function langAngebotOffen(s: StreckenStand): boolean {
  return !!s.langAngebotAt && !s.langAntwortAt;
}

/** Ist eine Frage nach der Adresse offen (Schluss ohne Adresse bzw. nach „Andere Adresse“)? */
export function emailFrageOffen(s: StreckenStand): boolean {
  return !!s.emailFrageLetzte && (!s.emailOkLetzte || s.emailOkLetzte < s.emailFrageLetzte);
}

/** Ist die Schlussfrage „Stimmt die Adresse?“ offen? */
export function adresseBestaetigenOffen(s: StreckenStand): boolean {
  return !!s.abschlussAt && s.abschlussMitEmail && !s.emailOkLetzte && !s.emailFrageLetzte;
}

/** Wartet die Strecke auf eine Reaktion auf die Policen-Bitte? */
export function policenBitteOffen(s: StreckenStand): boolean {
  return !!s.policenBitteAt && !s.policenAntwortAt && !s.abschlussAt;
}

/** Steht fest, ob es ein Komplettcheck wird (für die Einladung mit der endgültigen Dauer)? */
function komplettFest(s: StreckenStand, termin: { komplettcheck: boolean | null }): boolean {
  return termin.komplettcheck !== null || komplettcheckErledigt(s) || !!s.abschlussAt;
}

/** Einladung an den Lead, sobald Adresse und Komplettcheck feststehen (lib/calendar/einladung.ts). */
async function einladungPruefen(k: StreckenKontext, now: Date): Promise<void> {
  if (!k.termin) return;
  const s = await streckenStand(k.conversationId, k.termin.id);
  const { einladungWennFertig } = await import("@/lib/calendar/einladung");
  await einladungWennFertig(k.termin.id, { adresseFest: !!s.emailOkLetzte, komplettFest: komplettFest(s, k.termin) }, now);
}

async function sende(k: Pick<StreckenKontext, "customerId" | "phone">, body: string, buttons?: Knopf[] | null, liste?: FrageNachricht["liste"]): Promise<void> {
  const { sendWhatsAppMessage } = await import("@/lib/whatsapp/gateway");
  await sendWhatsAppMessage({ customerId: k.customerId, to: k.phone, body, sentBy: "bot", buttons: buttons ?? null, liste: liste ?? null });
}

/** Fassung der Komplettcheck-Frage (Splittest komplettcheck_text, lib/experimente.ts; Einheit Lead, sonst Chat). */
export async function komplettcheckVariante(einheit: string | null | undefined): Promise<Variante> {
  return import("@/lib/experimente").then((m) => m.variante("komplettcheck_text", einheit)).catch(() => "a" as const);
}

/**
 * Komplettcheck-Frage mit Knöpfen (Text und Knöpfe; der Aufrufer sendet und setzt den Merker). Mit prefix entfällt das
 * „Danke!“ am Anfang der Frage. variante: Splittest komplettcheck_text (ohne Angabe die neue Fassung b).
 */
export function komplettcheckNachricht(k: Pick<StreckenKontext, "an" | "person" | "familie"> & { variante?: Variante; source?: string | null }, prefix?: string | null): { text: string; buttons: Knopf[] } {
  const frage = komplettcheckFrage(k.an, k.person, k.familie, k.variante ?? "b", k.source);
  return { text: prefix ? `${prefix} ${frage.replace(/^Danke!\s*/, "")}` : frage, buttons: KOMPLETTCHECK_KNOEPFE };
}

/** Komplettcheck-Frage senden und merken (einmal je Termin). */
export async function sendeKomplettcheck(k: StreckenKontext, prefix?: string | null): Promise<boolean> {
  if (!k.termin) return false;
  const stand = await streckenStand(k.conversationId, k.termin.id);
  if (stand.komplettFrageAt || stand.abschlussAt) return false;
  const m = komplettcheckNachricht({ ...k, variante: await komplettcheckVariante(k.leadId ?? k.conversationId) }, prefix);
  await merke(k.conversationId, STRECKE.komplettFrage, { appointmentId: k.termin.id });
  await sende(k, m.text, m.buttons);
  return true;
}

/** Angebotsfragen, die noch offen sind (Rechner-Tabelle, aus Formular und Angaben des Assistenten). */
export function offeneAngebotsfragen(k: Pick<StreckenKontext, "source" | "formular" | "angaben">): Folgefrage[] {
  // Tierkranken: feste Tierfragen vor dem Komplettcheck (lib/whatsapp/tier-fragen.ts) statt der Rechner-Tabelle
  if (istTierStrecke(k.source)) return [];
  const quelle = { formular: k.formular, angaben: k.angaben };
  return folgefragen(spartenDesLeads(k.source, quelle), quelle);
}

/**
 * Nächste offene Angebotsfrage senden (die erste mit Nutzen „Damit Herr Kannapinn Ihnen gleich passende Beiträge
 * zeigen kann: …“), mit Knöpfen bei Ja/Nein. false = keine offen.
 */
export async function sendeAngebotsfrage(k: StreckenKontext, prefix?: string | null): Promise<boolean> {
  if (!k.termin) return false;
  const offen = offeneAngebotsfragen(k);
  if (!offen[0]) return false;
  const stand = await streckenStand(k.conversationId, k.termin.id);
  // Zwischenfrage vor dem Termin hatte schon „Damit … gleich passende Beiträge zeigen kann:“: nicht noch einmal
  const nutzenGesagt =
    !stand.angebotsfragenAt &&
    !!(await prisma.message.findFirst({ where: { conversationId: k.conversationId, direction: "outbound", body: { contains: ZWISCHEN_TEXT } }, select: { id: true } }));
  const frage = folgefrageText(offen[0], k.an, k.person.nom, !stand.angebotsfragenAt, { nutzenGesagt });
  if (!stand.angebotsfragenAt) await merke(k.conversationId, STRECKE.angebotsfragen, { appointmentId: k.termin.id });
  await sende(k, [prefix, frage].filter(Boolean).join(" "), knoepfeFuerText(frage, offen));
  return true;
}

/** Höchstlänge einer Antwort, die die App selbst als Datum prüft (längere Antworten mit mehr Inhalt: Assistent). */
const DATUM_ANTWORT_MAX = 60;

/**
 * Antwort auf die Angebotsfrage nach dem Geburtsdatum prüfen, ohne Assistent (Ole, 21.11.2026: „220.8.92“ wurde
 * übernommen). Gültig: als TT.MM.JJJJ speichern, dann die nächste Angebotsfrage bzw. der nächste Schritt der Strecke.
 * Kein gültiges Datum: genau einmal nachfragen (bei Tippfehler mit Vorschlag und Knöpfen), die zweite unklare Antwort
 * mit „(bitte im Termin prüfen)“ übernehmen und weiter. false = nicht zuständig (keine offene Geburtsdatumsfrage, keine
 * Zahl, Rückfrage, unter 18 bzw. „weiß nicht“): der Assistent antwortet wie bisher (geburt-chat.ts).
 */
export async function angebotDatumAntwort(conversationId: string, text: string, now = new Date()): Promise<boolean> {
  const roh = (text ?? "").replace(/\s+/g, " ").trim();
  if (!roh || roh.length > DATUM_ANTWORT_MAX) return false;
  const k = await streckenKontext(conversationId, now);
  if (!k?.termin) return false;
  if (offeneAngebotsfragen(k)[0]?.feld !== "geburt") return false;
  const stand = await streckenStand(conversationId, k.termin.id);
  if (!stand.angebotsfragenAt || stand.abschlussAt) return false;
  // Unsere letzte Nachricht muss die Frage nach dem Geburtsdatum bzw. unsere Nachfrage sein
  const letzte = await prisma.message.findFirst({ where: { conversationId, direction: "outbound" }, orderBy: { createdAt: "desc" }, select: { body: true, createdAt: true } });
  if (!letzte || !(/geburtsdatum/i.test(letzte.body ?? "") || DATUM_NACHFRAGE_RE.test(letzte.body ?? ""))) return false;
  const vorher = await prisma.message.findFirst({
    where: { conversationId, direction: "internal", kind: STRECKE.datumNachfrage, body: { contains: k.termin.id } },
    orderBy: { createdAt: "desc" },
    select: { body: true },
  });
  const s = datumSchritt({ art: "geburt", feld: "geburt", text: roh, an: k.an, merker: vorher ? datumMerkerAus(vorher.body) : null, jetzt: now });
  if (!s) return false;
  if (s.art === "fragen") {
    await merke(conversationId, STRECKE.datumNachfrage, { appointmentId: k.termin.id, feld: "geburt", ...s.merker });
    await sende(k, s.text, s.buttons);
    return true;
  }
  const angaben = { geburt: s.wert };
  const neu = mergeQualificationData(k.angaben, angaben);
  await prisma.conversation.update({ where: { id: conversationId }, data: { qualificationData: (neu ?? undefined) as Prisma.InputJsonValue | undefined } });
  await prisma.message.create({ data: { conversationId, direction: "internal", kind: "qualification", body: JSON.stringify({ angaben, via: "datum_pruefung" }), sentBy: "system" } });
  k.angaben = neu;
  if (!(await sendeAngebotsfrage(k, "Danke!"))) {
    const schritt = await naechsterSchritt(k, { einleitung: "Danke!" });
    if (schritt) await sendeSchritt(k, schritt);
    else await sende(k, "Danke, das habe ich notiert.");
  }
  await einladungPruefen(k, now);
  return true;
}

// ─── Tierfragen (TKV) nach der Buchung, vor dem Komplettcheck ─────────────────────────────────────────────────────────

/** Nächste offene Tierfrage (Text und Knöpfe), null = keine offen bzw. kein TKV-Lead. */
export function naechsteTierFrage(k: Pick<StreckenKontext, "source" | "formular" | "angaben" | "an" | "person">, beantwortet: readonly string[] = []) {
  const quelle = { source: k.source, formular: k.formular, angaben: k.angaben };
  const key = offeneTierFragen(quelle, new Set(beantwortet))[0];
  return key ? tierFrage(key, quelle, k.an, k.person.nom) : null;
}

/**
 * Erste Nachricht der Strecke nach der Buchungsnachricht (der Aufrufer sendet sie und setzt den Merker mit daten):
 * bei Tierkranken die erste offene Tierfrage, sonst der Komplettcheck. Steht schon eine Tierfrage offen, dieselbe noch
 * einmal (nach einer Rückfrage des Leads, die der Assistent beantwortet hat).
 */
export async function ersteNachBuchung(
  k: StreckenKontext,
  einleitung?: string | null,
): Promise<{ text: string; buttons: Knopf[] | null; merker: string; daten?: Record<string, unknown>; liste?: FrageNachricht["liste"] }> {
  // Fragen-Engine (Ole, 26.11.2026): zuerst die Angaben je gebuchter Sparte, danach Komplettcheck und Policen-Bitte
  const angabe = await angabeFrageNachricht(k, einleitung);
  if (angabe) return angabe;
  return ersteNachAngaben(k, einleitung);
}

/** Erste Nachricht nach den Angaben der Fragen-Engine: Tierfrage (TKV) bzw. der Komplettcheck. */
async function ersteNachAngaben(
  k: StreckenKontext,
  einleitung?: string | null,
): Promise<{ text: string; buttons: Knopf[] | null; merker: string; daten?: Record<string, unknown> }> {
  if (k.termin && istTierStrecke(k.source)) {
    const s = await streckenStand(k.conversationId, k.termin.id);
    const f = naechsteTierFrage(k, s.tierBeantwortet);
    if (f && !s.komplettFrageAt && !s.abschlussAt) return { text: mitEinleitung(f.text, einleitung), buttons: f.buttons, merker: STRECKE.tierFrage, daten: { key: f.key } };
  }
  const m = komplettcheckNachricht({ ...k, variante: await komplettcheckVariante(k.leadId ?? k.conversationId) }, einleitung);
  return { text: m.text, buttons: m.buttons, merker: STRECKE.komplettFrage };
}

/** „Danke!“ am Anfang durch die Einleitung ersetzen („Super, danke!“, „Noch eine kurze Frage:“), sonst davorsetzen. */
export function mitEinleitung(text: string, einleitung?: string | null): string {
  if (!einleitung) return text;
  return `${einleitung} ${text.replace(/^Danke!\s*/, "")}`;
}

/** Einleitungen nach der Zusage-Frage (Splittest termin_zusage, Fassung b, Ole 20.11.2026). */
export const ZUSAGE_EINLEITUNG = { ja: "Super, danke!", ohneAntwort: "Noch eine kurze Frage:" } as const;

/**
 * Erste Frage der Strecke nach der Zusage-Frage senden (Komplettcheck bzw. bei Tierkranken die erste offene Tierfrage),
 * mit Merker; die Zusage-Frage kommt nicht noch einmal. false = nichts gesendet (schon gefragt bzw. kein Termin).
 */
async function sendeErsteNachZusage(k: StreckenKontext, einleitung: string): Promise<boolean> {
  if (!k.termin) return false;
  const s = await streckenStand(k.conversationId, k.termin.id);
  if (s.komplettFrageAt || s.tierFrageLetzte || s.abschlussAt) return false;
  const m = await ersteNachBuchung(k, einleitung);
  await merke(k.conversationId, m.merker, { appointmentId: k.termin.id, ...(m.daten ?? {}) });
  await sende(k, m.text, m.buttons, m.liste);
  return true;
}

/**
 * Antwort auf die Zusage-Frage (Splittest termin_zusage, Fassung b; Knopf bzw. getippt):
 *   ja      → Termin zugesagt (Merker „zusage_knopf“), dann Komplettcheck bzw. Tierfrage mit „Super, danke!“ (eine Nachricht)
 *   andere  → wie „Bitte verschieben“: keine Erinnerungen zur alten Zeit, der Assistent bietet zwei freie Zeiten an und
 *             verlegt (der Aufrufer gibt ihm den Hinweis); danach der Komplettcheck wie bisher, die Zusage-Frage nicht erneut
 * Ereignisse für die Gegenproben: zusage_ja bzw. zusage_andere. true = erledigt (bei „andere“: vermerkt).
 */
export async function zusageAntwort(conversationId: string, art: "ja" | "andere", now = new Date()): Promise<boolean> {
  const k = await streckenKontext(conversationId, now);
  if (!k?.termin) return false;
  const stand = await streckenStand(conversationId, k.termin.id);
  if (!zusageOffen(stand)) return art === "ja" ? !!stand.zusageFrageAt : false; // doppelter bzw. alter Klick
  await merke(conversationId, STRECKE.zusageAntwort, { appointmentId: k.termin.id, art });
  await import("@/lib/experimente").then((m) => m.ereignis("termin_zusage", k.leadId, art === "ja" ? "zusage_ja" : "zusage_andere")).catch(() => null);
  // „andere“: Erinnerungen zur alten Zeit stoppt knopf.ts (wie „Bitte verschieben“), verlegt wird vom Assistenten
  if (art === "andere") return true;
  await zusagen(k, now, "zusage_knopf");
  if (k.leadId) {
    const { logLeadHistory } = await import("@/lib/lead-history");
    await logLeadHistory(k.leadId, "notiz", "Termin fest zugesagt (per WhatsApp)", { customerId: k.customerId, userId: null }).catch(() => null);
  }
  await sendeErsteNachZusage(k, ZUSAGE_EINLEITUNG.ja);
  return true;
}

/** Tierfragen, deren Antwort ein Datum ist (Prüfung mit einmaliger Nachfrage, lib/whatsapp/datum-nachfrage.ts). */
const TIER_DATUM: Partial<Record<TierFrageKey, DatumArt>> = {
  geburtTier: "geburtTier",
  vorhandenAblauf: "ablauf",
  geburt: "geburt",
  geburtEigen: "geburt",
  geburtNochmal: "geburt",
};

/**
 * Antwort auf die offene Tierfrage (Knopf tier:<key>:<wert> bzw. Text): Angabe speichern (Conversation.qualificationData,
 * erscheint in der Terminvorbereitung), dann die nächste offene Tierfrage bzw. der Komplettcheck. false = keine Antwort
 * auf die Frage (Rückfrage des Leads: der Assistent antwortet, die Frage kommt danach noch einmal).
 */
export async function tierAntwort(conversationId: string, text: string, knopf: { key: string; wert: string } | null = null, now = new Date()): Promise<boolean> {
  const k = await streckenKontext(conversationId, now);
  if (!k?.termin) return false;
  const stand = await streckenStand(conversationId, k.termin.id);
  if (!tierFrageOffen(stand)) return !!knopf; // doppelter bzw. alter Klick: nichts tun
  const key = (knopf?.key ?? stand.tierFrageLetzte!.key) as TierFrageKey;
  if (stand.tierBeantwortet.includes(key)) return true;
  const quelle = { source: k.source, formular: k.formular, angaben: k.angaben };
  // Unverständliche Antwort auf „Was war es ungefähr, und wann?“: genau einmal nachfragen, die zweite Antwort gilt
  if (key === "gesundheitDetail" && !knopf && !detailVerstaendlich(text)) {
    const schon = await prisma.message.findFirst({
      where: { conversationId, direction: "internal", kind: STRECKE.tierNachfrage, body: { contains: `"key":"${key}"` }, createdAt: { gte: stand.tierFrageLetzte?.at ?? new Date(0) } },
      select: { id: true },
    });
    if (!schon) {
      await merke(conversationId, STRECKE.tierNachfrage, { appointmentId: k.termin.id, key });
      await sende(k, detailNachfrageText(k.an, quelle));
      return true;
    }
  }
  // Datum (Geburt des Tieres, Ablauf der Versicherung, Geburtsdatum des Halters, Ole 21.11.2026): kein gültiges Datum
  // genau einmal nachfragen (bei Tippfehler mit Vorschlag), die zweite unklare Antwort mit Vermerk übernehmen
  let antwort = text;
  let ungeprueft = false;
  const datumArt = TIER_DATUM[key];
  if (datumArt && !knopf) {
    const vorher = await prisma.message.findFirst({
      where: { conversationId, direction: "internal", kind: STRECKE.tierNachfrage, body: { contains: `"key":"${key}"` }, createdAt: { gte: stand.tierFrageLetzte?.at ?? new Date(0) } },
      orderBy: { createdAt: "desc" },
      select: { body: true },
    });
    const s = datumSchritt({ art: datumArt, feld: key, text, an: k.an, merker: vorher ? datumMerkerAus(vorher.body) : null, jetzt: now });
    if (s?.art === "fragen") {
      await merke(conversationId, STRECKE.tierNachfrage, { appointmentId: k.termin.id, key, ...s.merker });
      await sende(k, s.text, s.buttons);
      return true;
    }
    if (s) antwort = s.wert;
    ungeprueft = s?.art === "vermerk";
  }
  const r = tierAntwortAuswerten(key, antwort, knopf?.wert ?? null, quelle, now, { ungeprueft });
  if (!r) return false;
  // Gewünschter Umfang (OP, voll, offen): einheitlicher Text und Merkmal am Lead (lib/tkv-umfang.ts)
  const tkv = tkvAngabenNormal(r.angaben);
  if (tkv.umfang) {
    r.angaben = tkv.angaben as typeof r.angaben;
    await tkvUmfangMerken(k.leadId, tkv.umfang);
  }
  const neu = mergeQualificationData(k.angaben, r.angaben);
  await prisma.conversation.update({ where: { id: conversationId }, data: { qualificationData: (neu ?? undefined) as Prisma.InputJsonValue | undefined } });
  k.angaben = neu;
  await merke(conversationId, STRECKE.tierAntwort, { appointmentId: k.termin.id, keys: r.beantwortet });
  const f = naechsteTierFrage(k, [...stand.tierBeantwortet, ...r.beantwortet]);
  if (f) {
    await merke(conversationId, STRECKE.tierFrage, { appointmentId: k.termin.id, key: f.key });
    // ohne „Danke!“ davor: Fragen, die selbst mit Dank beginnen, und die Bitte um ein passendes Datum
    await sende(k, /^(Danke\b|Das Datum)/.test(f.text) ? f.text : `Danke! ${f.text}`, f.buttons);
  } else {
    await sendeKomplettcheck(k);
  }
  await einladungPruefen(k, now);
  return true;
}

/** Nachricht der Strecke mit Merker (der Merker steht vor dem Senden, damit nichts doppelt geht). */
export type Schritt = {
  text: string;
  buttons: Knopf[] | null;
  merker: string;
  daten?: Record<string, unknown>;
  nachMerker?: string | null;
  /** Eigene Nachricht direkt danach (Einwilligung zur Policen-Bitte, interaktiv mit Fußzeile) */
  folge?: { text: string; buttons: Knopf[]; footer: string | null } | null;
  /** Policen-Strecke v2: statt text die Chat-Nachricht mit Formular senden (lib/policen/flow/server.ts) */
  flow?: boolean;
};

/**
 * Nächster Schritt nach den Angebotsfragen (ohne Senden): bei Komplettcheck „Ja“ die Vertragsfrage, dann die
 * Policen-Bitte (nur Sachprodukte, einmal), dann der Schluss. null = warten (Antwort offen) bzw. schon fertig.
 *   einleitung: vor Vertragsfrage bzw. Policen-Bitte („Super!“), schlussEinleitung: erster Satz des Schlusses
 *   vertraegeUeberspringen / policenUeberspringen: Rückfall ohne Antwort
 */
export async function naechsterSchritt(
  k: StreckenKontext,
  o: { einleitung?: string | null; schlussEinleitung?: string | null; vertraegeUeberspringen?: boolean; policenUeberspringen?: boolean; ohneFlow?: boolean } = {},
): Promise<Schritt | null> {
  if (!k.termin) return null;
  const stand = await streckenStand(k.conversationId, k.termin.id);
  if (stand.abschlussAt) return null;
  if (k.termin.komplettcheck === true && !stand.vertragsfrageAt) return { text: vertragsFrage(k.an, k.familie, o.einleitung ?? "Danke!", k.person), buttons: null, merker: STRECKE.vertragsfrage };
  if (stand.vertragsfrageAt && !stand.vorvertraegeErfasst && !o.vertraegeUeberspringen) return null;
  if (!stand.policenBitteAt) {
    const bitte = await policenBitteSchritt(k, o.einleitung ?? null, o.ohneFlow === true).catch(() => null);
    if (bitte) return bitte;
  }
  if (policenBitteOffen(stand) && !o.policenUeberspringen) return null;
  const m = await abschlussNachricht(k, o.schlussEinleitung ?? null);
  return { text: m.text, buttons: m.buttons, merker: STRECKE.abschluss, daten: { mitEmail: !!k.email }, nachMerker: k.email ? null : STRECKE.emailFrage };
}

/** Schritt senden und merken. */
export async function sendeSchritt(k: StreckenKontext, s: Schritt): Promise<void> {
  if (!k.termin) return;
  if (s.flow) {
    // Policen-Strecke v2: Formular senden. Scheitert das (Fehler bei 360dialog/Meta, Flow gestört) oder geht es nicht
    // raus, nie ohne Antwort aufhören (Produktionsfehler 19.11.2026): sofort die bisherige Bitte mit Einwilligung bzw.,
    // wo die nicht passt, der nächste Schritt. Merker erst nach dem Senden, damit der Rückfall die Bitte noch stellt.
    const r = await import("@/lib/policen/flow/server").then((m) => m.sendeFlowNachrichtSicher(k.conversationId, "bitte"));
    if (r.gesendet) {
      await merkeSchritt(k.conversationId, k.termin.id, s);
      return;
    }
    const alt = await rueckfallSchritt(k, s.text);
    if (alt) await sendeSchritt(k, alt);
    else await sende(k, s.text, null);
    return;
  }
  await merkeSchritt(k.conversationId, k.termin.id, s);
  await sende(k, s.text, s.buttons);
  if (s.folge) await sendeFolge(k, s.folge);
}

/** Schritt ohne Formular (Rückfall nach gescheitertem Flow-Versand): bisherige Policen-Bitte bzw. der Schluss. */
export async function rueckfallSchritt(k: StreckenKontext, einleitung: string | null): Promise<Schritt | null> {
  const alt = await naechsterSchritt(k, { einleitung, ohneFlow: true }).catch((e) => {
    console.error("[strecke rückfall]", e instanceof Error ? e.name : "Fehler");
    return null;
  });
  return alt && !alt.flow ? alt : null;
}

/** Folgenachricht eines Schritts (Einwilligung mit Knöpfen und Fußzeile). */
export async function sendeFolge(k: Pick<StreckenKontext, "customerId" | "phone">, f: NonNullable<Schritt["folge"]>): Promise<void> {
  const { sendWhatsAppMessage } = await import("@/lib/whatsapp/gateway");
  await sendWhatsAppMessage({ customerId: k.customerId, to: k.phone, body: f.text, sentBy: "bot", buttons: f.buttons.length ? f.buttons : null, footer: f.footer });
}

/** Merker eines Schritts (auch für bot.ts, wenn die Antwort des Assistenten ersetzt wird). */
export async function merkeSchritt(conversationId: string, appointmentId: string, s: Pick<Schritt, "merker" | "daten" | "nachMerker">): Promise<void> {
  await merke(conversationId, s.merker, { appointmentId, ...(s.daten ?? {}) });
  if (s.nachMerker) await merke(conversationId, s.nachMerker, { appointmentId });
}

/**
 * Bereitlegen: Wurde der Lead um Policen gebeten, heißt der Punkt „übrige Policen“ (nur bei Komplettcheck „Ja“ steht er
 * überhaupt in der Liste).
 */
async function mitPolicenHinweis(k: StreckenKontext, liste: string[]): Promise<string[]> {
  if (!liste.some((x) => VERTRAEGE_BEREITLEGEN_RE.test(x))) return liste;
  if (!k.termin || !(await streckenStand(k.conversationId, k.termin.id)).policenBitteAt) return liste;
  const ersatz = a(k.an, "deine übrigen Policen, falls du sie nicht geschickt hast", "Ihre übrigen Policen, falls Sie sie nicht geschickt haben");
  return liste.map((x) => (VERTRAEGE_BEREITLEGEN_RE.test(x) ? ersatz : x));
}

/** Bereitlegen-Liste zum Termin (eine Quelle für den WhatsApp-Schluss und die Termin-Mails, M3). */
async function bereitlegenFuer(k: StreckenKontext): Promise<string[]> {
  return mitPolicenHinweis(k, bereitlegenFuerLead({ source: k.source, formular: k.formular, angaben: k.angaben, an: k.an, komplettcheck: k.termin?.komplettcheck === true }));
}

/**
 * Vorbereitung für die Termin-Mails (Bestätigung bzw. Einladung und Vortags-Mail, Ole 18.11.2026, M3): dieselbe
 * Bereitlegen-Liste wie im WhatsApp-Schluss, Komplettcheck und Familie für den Komplettcheck-Satz.
 */
export async function bereitlegenFuerTermin(conversationId: string, appointmentId: string, now = new Date()): Promise<{ liste: string[]; komplettcheck: boolean; familie: boolean } | null> {
  const k = await streckenKontext(conversationId, now);
  if (!k) return null;
  const termin = await prisma.appointment.findUnique({ where: { id: appointmentId }, select: { id: true, startsAt: true, confirmedAt: true, komplettcheck: true } });
  if (!termin) return null;
  const liste = await bereitlegenFuer({ ...k, termin });
  return { liste, komplettcheck: termin.komplettcheck === true, familie: k.familie };
}

/** Schluss der Strecke (Bereitlegen in einer Zeile, Frage nach der Adresse), ohne Senden. */
export async function abschlussNachricht(k: StreckenKontext, einleitung: string | null): Promise<{ text: string; buttons: Knopf[] | null }> {
  const text = abschlussText({
    an: k.an,
    person: k.person,
    bereitlegen: await bereitlegenFuer(k),
    email: k.email,
    nachFragen: true,
    einleitung,
  });
  return { text, buttons: k.email ? EMAIL_KNOEPFE : null };
}

/**
 * Weiter nach dem Komplettcheck: zuerst „Entscheidet noch jemand mit?“ (einmal je Termin, nur wo nötig), dann die erste
 * offene Angebotsfrage, sonst der nächste Schritt.
 */
async function weiterNachKomplettcheck(k: StreckenKontext, prefix: string, schlussEinleitung: string | null): Promise<void> {
  if (await sendePartnerFrage(k, prefix)) return;
  await weiterZumAngebot(k, prefix, schlussEinleitung);
}

/** Erste offene Angebotsfrage, sonst der nächste Schritt (Vertragsfrage, Policen-Bitte bzw. Schluss). */
async function weiterZumAngebot(k: StreckenKontext, prefix: string | null, schlussEinleitung: string | null): Promise<void> {
  if (await sendeAngebotsfrage(k, prefix)) return;
  const s = await naechsterSchritt(k, { einleitung: prefix, schlussEinleitung });
  if (s) await sendeSchritt(k, s);
}

/**
 * Wer entscheidet mit? (Ole, 21.11.2026: „Wenn Partner mit entscheidet, wird Termin mit Partner gemacht, damit eine
 * Entscheidung getroffen werden kann.“) Frage mit Knöpfen [Ja, gemeinsam] [Nein, ich allein] in der Nachricht direkt nach
 * dem Komplettcheck (statt der ersten Angebotsfrage, die danach kommt). Nicht, wenn die Antwort bekannt ist, bei
 * Alleinstehenden laut Formular bzw. Chat und nicht, wenn die Strecke schon weiter ist. false = nicht gefragt.
 */
export async function sendePartnerFrage(k: StreckenKontext, prefix?: string | null): Promise<boolean> {
  if (!k.termin || !partnerFrageNoetig(k.formular, k.angaben)) return false;
  const stand = await streckenStand(k.conversationId, k.termin.id);
  if (stand.partnerFrageAt || stand.angebotsfragenAt || stand.vertragsfrageAt || stand.policenBitteAt || stand.abschlussAt) return false;
  const bekannt = partnerBekannt(k.formular, k.angaben);
  await merke(k.conversationId, STRECKE.partnerFrage, { appointmentId: k.termin.id, bekannt });
  await sende(k, [prefix, partnerFrage(k.an, bekannt, k.source)].filter(Boolean).join(" "), PARTNER_KNOEPFE);
  return true;
}

/**
 * Antwort auf „Entscheidet noch jemand mit?“ (Knopf, getippt bzw. ohne Antwort nach 1 Std.): Angabe speichern
 * (Conversation.qualificationData.entscheidung, erscheint in der Terminvorbereitung), bei „gemeinsam“ Vermerk im Verlauf
 * des Leads; dann weiter wie nach dem Komplettcheck, mit kurzem Dank als Einleitung. true = erledigt.
 */
export async function partnerAntwort(conversationId: string, art: "mit" | "allein" | "ohne_antwort", now = new Date()): Promise<boolean> {
  const k = await streckenKontext(conversationId, now);
  if (!k?.termin) return false;
  const stand = await streckenStand(conversationId, k.termin.id);
  if (!partnerFrageOffen(stand)) return art !== "ohne_antwort" && !!stand.partnerFrageAt; // doppelter bzw. alter Klick
  await merke(conversationId, STRECKE.partnerAntwort, { appointmentId: k.termin.id, art });
  if (art === "ohne_antwort") {
    if (!(await sendeAngebotsfrage(k))) {
      const s = await naechsterSchritt(k, { schlussEinleitung: abschlussEinleitung(k.an, k.person, "ohne_antwort") });
      if (s) await sendeSchritt(k, s);
    }
    return true;
  }
  k.angaben = await entscheidungSpeichern(conversationId, art, "partner_frage");
  const dank = partnerDank(k.an, art === "mit");
  await weiterZumAngebot(k, dank, `${dank} ${abschlussEinleitung(k.an, k.person, "ohne_antwort")}`);
  return true;
}

/**
 * Antwort auf „Entscheidet noch jemand mit?“ speichern (vor bzw. nach der Buchung): Conversation.qualificationData.entscheidung
 * (Terminvorbereitung, Seitenleiste im Chat), Protokoll, bei „gemeinsam“ Vermerk im Verlauf des Leads. Gibt die neuen Angaben zurück.
 */
export async function entscheidungSpeichern(conversationId: string, art: "mit" | "allein", via: "partner_frage" | "partner_frage_vor"): Promise<unknown> {
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { customerId: true, leadId: true, qualificationData: true } });
  const angaben = { entscheidung: art === "mit" ? ENTSCHEIDUNG.mit : ENTSCHEIDUNG.allein };
  const neu = mergeQualificationData(conv?.qualificationData, angaben);
  await prisma.conversation.update({ where: { id: conversationId }, data: { qualificationData: (neu ?? undefined) as Prisma.InputJsonValue | undefined } });
  await prisma.message.create({ data: { conversationId, direction: "internal", kind: "qualification", body: JSON.stringify({ angaben, via }), sentBy: "system" } });
  if (art === "mit" && conv?.leadId) {
    const { logLeadHistory } = await import("@/lib/lead-history");
    await logLeadHistory(conv.leadId, "notiz", `${ENTSCHEIDUNG.mit} (per WhatsApp)`, { customerId: conv.customerId, userId: null }).catch(() => null);
  }
  return neu;
}

// ─── „Entscheidet noch jemand mit?“ VOR dem Terminvorschlag (Ole, 21.11.2026 spät) ──────────────────────────────────
// Die App stellt die Frage statt des ersten Terminvorschlags (bot.ts, Splittest partner_vor_termin Fassung a) und schickt
// den Vorschlag nach der Antwort (Knopf bzw. getippt). Ohne Antwort kommt der Vorschlag nach PARTNER_VOR_WARTEN trotzdem
// (runPartnerVorTerminNachholen, WhatsApp-Cron), damit keine Buchung verloren geht. Bleibt die Frage unbeantwortet,
// kommt sie nach der Buchung noch einmal (sendePartnerFrage, nur solange entscheidung fehlt).

/** Wartezeit ohne Antwort, bis der Terminvorschlag trotzdem kommt (kurz, die Buchung geht vor). */
export const PARTNER_VOR_WARTEN = 30 * 60 * 1000;

export type PartnerVorStand = {
  /** Frage gestellt (letzte), mit bekanntem Partner */
  frageAt: Date | null;
  bekannt: boolean;
  /** Antwort bzw. Abschluss der Frage (mit, allein, ohne_antwort, termin) */
  antwortAt: Date | null;
  /** Terminvorschlag nach der Frage schon gesendet (z. B. vom Assistenten nach einer Rückfrage) */
  vorschlagDanach: boolean;
  /** Terminvorschläge im Chat insgesamt (die Frage kommt nur vor dem ersten) */
  vorschlaege: number;
};

/** Stand der Frage vor dem Terminvorschlag (aus den Merkern). */
export async function partnerVorStand(conversationId: string): Promise<PartnerVorStand> {
  const rows = await prisma.message.findMany({
    where: { conversationId, direction: "internal", kind: { in: [STRECKE.partnerVorFrage, STRECKE.partnerVorAntwort, STRECKE.vorschlag] } },
    orderBy: { createdAt: "asc" },
    select: { kind: true, createdAt: true, body: true },
  });
  const frage = rows.filter((r) => r.kind === STRECKE.partnerVorFrage).at(-1) ?? null;
  const nach = (k: string) => (frage ? (rows.find((r) => r.kind === k && r.createdAt >= frage.createdAt) ?? null) : null);
  return {
    frageAt: frage?.createdAt ?? null,
    bekannt: daten(frage?.body ?? null).bekannt === true,
    antwortAt: nach(STRECKE.partnerVorAntwort)?.createdAt ?? null,
    vorschlagDanach: !!nach(STRECKE.vorschlag),
    vorschlaege: rows.filter((r) => r.kind === STRECKE.vorschlag).length,
  };
}

/** Frage gestellt und noch nicht beantwortet (eine getippte bzw. geklickte Antwort zählt noch)? */
export function partnerVorUnbeantwortet(s: PartnerVorStand): boolean {
  return !!s.frageAt && !s.antwortAt;
}

/** Wartet der Terminvorschlag auf die Antwort (unbeantwortet und noch kein Vorschlag danach)? */
export function partnerVorOffen(s: PartnerVorStand): boolean {
  return partnerVorUnbeantwortet(s) && !s.vorschlagDanach;
}

/**
 * Knopf auf die Frage vor dem Terminvorschlag, wenn inzwischen schon ein Termin steht (z. B. über die Buchungsseite):
 * Angabe speichern, kurzer Dank (bei „gemeinsam“: beide zum Termin). true = erledigt; false = kein Termin bzw. Frage
 * nicht offen (dann übernimmt bot.ts: Terminvorschlag nach der Antwort).
 */
export async function partnerVorNachBuchung(conversationId: string, art: "mit" | "allein", now = new Date()): Promise<boolean> {
  const k = await streckenKontext(conversationId, now);
  if (!k?.termin) return false;
  if (!partnerVorUnbeantwortet(await partnerVorStand(conversationId))) return false;
  await merke(conversationId, STRECKE.partnerVorAntwort, { art });
  await entscheidungSpeichern(conversationId, art, "partner_frage_vor");
  await sende(k, partnerDank(k.an, art === "mit"));
  return true;
}

/**
 * Frage vor dem Terminvorschlag ohne Antwort: nach PARTNER_VOR_WARTEN (gerechnet ab der Frage bzw. der letzten Nachricht
 * des Leads) den Terminvorschlag trotzdem schicken (bot.ts runBotTurn mit partnerNachholen, ohne Assistent). Nur im
 * 24-h-Fenster, Mo bis Sa 8 bis 20 Uhr, nicht nach „Stopp“ bzw. bei pausiertem Assistenten. Steht schon ein Termin, wird
 * die Frage still geschlossen (sie kommt nach der Buchung noch einmal, solange die Angabe fehlt).
 */
export async function runPartnerVorTerminNachholen(now = new Date()): Promise<{ gesendet: number }> {
  if (!inStreckenFenster(now)) return { gesendet: 0 };
  const fragen = await prisma.message.findMany({
    where: { direction: "internal", kind: STRECKE.partnerVorFrage, createdAt: { lte: new Date(now.getTime() - PARTNER_VOR_WARTEN), gte: new Date(now.getTime() - 48 * HOUR) } },
    orderBy: { createdAt: "asc" },
    take: 50,
    select: { conversationId: true },
  });
  let gesendet = 0;
  for (const conversationId of new Set(fragen.map((f) => f.conversationId))) {
    try {
      const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { botActive: true, optedOutAt: true, windowExpiresAt: true } });
      if (!conv?.botActive || conv.optedOutAt || !conv.windowExpiresAt || conv.windowExpiresAt.getTime() <= now.getTime()) continue;
      const s = await partnerVorStand(conversationId);
      if (!partnerVorOffen(s)) continue;
      const letzte = await prisma.message.findFirst({ where: { conversationId, direction: "inbound", createdAt: { gt: s.frageAt! } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
      if ((letzte?.createdAt ?? s.frageAt!).getTime() > now.getTime() - PARTNER_VOR_WARTEN) continue;
      const termin = await prisma.appointment.findFirst({ where: { conversationId, status: "booked", startsAt: { gt: now } }, select: { id: true } });
      if (termin) {
        await merke(conversationId, STRECKE.partnerVorAntwort, { art: "termin" });
        continue;
      }
      const { runBotTurn } = await import("@/lib/whatsapp/bot");
      await runBotTurn(conversationId, { partnerNachholen: true });
      if ((await partnerVorStand(conversationId)).vorschlagDanach) gesendet++;
    } catch (e) {
      console.error("[strecke partner vor termin]", e instanceof Error ? e.message.slice(0, 120) : e);
    }
  }
  return { gesendet };
}

/** Zwei freie Zeiten mit 45 Min. (früheste und früheste an einem anderen Tag), null = keine. */
async function langeZeiten(k: StreckenKontext, now: Date): Promise<[string, string] | null> {
  try {
    const { suggestSlots } = await import("@/lib/calendar");
    const { pickTwoSlots } = await import("@/lib/whatsapp/termin-vorschlaege");
    const frei = (await suggestSlots(k.customerId, LANG_MIN, 40, "lead", 10, k.leadId)).filter((s) => new Date(s.start).getTime() > now.getTime() + HOUR);
    const two = pickTwoSlots(frei, { now });
    return two ? [two[0].start, two[1].start] : null;
  } catch {
    return null;
  }
}

/** Angebot längerer Zeiten (Komplettcheck, Zeit danach belegt) mit Knöpfen [Zeit 1] [Zeit 2] [Zeit behalten]; nie mit Dauer. */
export function langAngebotNachricht(k: Pick<StreckenKontext, "an" | "person">, zeiten: [string, string], now = new Date()): { text: string; buttons: Knopf[] } {
  const [z1, z2] = zeiten.map((x) => zeitKurz(new Date(x), now));
  const text = a(
    k.an,
    `Super! Für den Komplettcheck nimmt sich ${k.person.nom} gern etwas mehr Zeit, direkt nach deinem Termin ist aber schon etwas anderes geplant. Passt dir auch ${z1} oder ${z2}? Sonst bleibt es bei deiner Zeit.`,
    `Super! Für den Komplettcheck nimmt sich ${k.person.nom} gern etwas mehr Zeit, direkt nach Ihrem Termin ist aber schon etwas anderes geplant. Passt Ihnen auch ${z1} oder ${z2}? Sonst bleibt es bei Ihrer Zeit.`,
  );
  return { text, buttons: [...zeiten.map((iso) => ({ id: `lang:${iso}`, title: knopfZeit(new Date(iso), now) })), { id: "lang:behalten", title: "Zeit behalten" }] };
}

/**
 * Antwort auf den Komplettcheck (Knopf oder vom Assistenten erkannt): Kennzeichen am Termin; bei Ja 45 Min. (frei:
 * verlängert, belegt: zwei andere Zeiten anbieten), dann die nächste offene Angebotsfrage bzw. der nächste Schritt.
 * true = erledigt (der Assistent schreibt nichts dazu).
 */
export async function komplettcheckAntwort(conversationId: string, ja: boolean, now = new Date()): Promise<boolean> {
  const k = await streckenKontext(conversationId, now);
  if (!k?.termin) return false;
  const stand = await streckenStand(conversationId, k.termin.id);
  if (stand.komplettBeantwortet) return true; // doppelter Klick
  await prisma.appointment.update({ where: { id: k.termin.id }, data: { komplettcheck: ja } });
  k.termin.komplettcheck = ja;
  await merke(conversationId, STRECKE.komplett, { appointmentId: k.termin.id, ja });
  if (ja) await import("@/lib/experimente").then((m) => m.zielErreicht([k.leadId, conversationId], "komplettcheck_ja")).catch(() => null);
  if (ja && k.leadId) {
    const { logLeadHistory } = await import("@/lib/lead-history");
    await logLeadHistory(k.leadId, "notiz", "Komplettcheck gewünscht (per WhatsApp)", { customerId: k.customerId, userId: null });
  }
  if (ja) {
    const dauer = await import("@/lib/komplettcheck-dauer");
    const r = await dauer.komplettcheckVerlaengern(k.termin.id, { now, angebot: true });
    if (r === "belegt" && !stand.abschlussAt) {
      const zeiten = await langeZeiten(k, now);
      if (zeiten) {
        const m = langAngebotNachricht(k, zeiten, now);
        await merke(conversationId, STRECKE.langAngebot, { appointmentId: k.termin.id, starts: zeiten });
        await sende(k, m.text, m.buttons);
        return true;
      }
    }
    if (r === "belegt") await dauer.komplettcheckHinweis(k.termin.id, { now });
  }
  if (!stand.abschlussAt) await weiterNachKomplettcheck(k, ja ? "Super!" : "Alles klar.", ja ? null : abschlussEinleitung(k.an, k.person, "komplett_nein"));
  await einladungPruefen(k, now);
  return true;
}

/**
 * Antwort auf das Angebot längerer Zeiten: gewählte Zeit (derselbe Termin wird verlegt, wenn noch frei) bzw. „Zeit
 * behalten“ (Hinweis an den Vermittler), dann weiter wie nach dem Komplettcheck.
 */
export async function langeZeitAntwort(conversationId: string, wahl: string, now = new Date()): Promise<boolean> {
  const k = await streckenKontext(conversationId, now);
  if (!k?.termin) return false;
  const stand = await streckenStand(conversationId, k.termin.id);
  if (!langAngebotOffen(stand)) return true;
  await merke(conversationId, STRECKE.langAntwort, { appointmentId: k.termin.id, wahl });
  const dauer = await import("@/lib/komplettcheck-dauer");
  const bleibt = (t: Date) =>
    a(k.an, `Alles klar, es bleibt bei *${zeitLang(t)}*. ${k.person.nom} plant etwas mehr Zeit ein.`, `Alles klar, es bleibt bei *${zeitLang(t)}*. ${k.person.nom} plant etwas mehr Zeit ein.`);
  let prefix: string;
  if (wahl !== "behalten" && (await dauer.komplettcheckVerlegen(k.termin.id, wahl, { now })) === "verlegt") {
    k.termin.startsAt = new Date(wahl);
    prefix = a(k.an, `Super, dein Termin ist jetzt am *${zeitLang(k.termin.startsAt)}*.`, `Super, Ihr Termin ist jetzt am *${zeitLang(k.termin.startsAt)}*.`);
  } else {
    await dauer.komplettcheckHinweis(k.termin.id, { now });
    prefix = wahl === "behalten" ? bleibt(k.termin.startsAt) : `${a(k.an, "Die Zeit ist leider gerade weg.", "Die Zeit ist leider gerade weg.")} ${bleibt(k.termin.startsAt).replace(/^Alles klar, es/, "Dann")}`;
  }
  if (!stand.abschlussAt) await weiterNachKomplettcheck(k, prefix, null);
  else await sende(k, prefix);
  await einladungPruefen(k, now);
  return true;
}

/** Art der Reaktion aus dem Knopftitel der Policen-Bitte („Nicht zur Hand“ → später). */
export function policenKnopfArt(titel: string): "gleich" | "spaeter" {
  return /nicht|später|spaeter|gerade/i.test(titel) ? "spaeter" : "gleich";
}

/** Reaktion auf die Policen-Bitte (Knopf): „Schicke ich gleich“ bzw. „Nicht zur Hand“, dann der Schluss. */
export async function policenBitteAntwort(conversationId: string, art: "gleich" | "spaeter" | "keine", now = new Date()): Promise<boolean> {
  const k = await streckenKontext(conversationId, now);
  if (!k?.termin) return false;
  const stand = await streckenStand(conversationId, k.termin.id);
  if (!stand.policenBitteAt || stand.policenAntwortAt) return true;
  await merke(conversationId, STRECKE.policenAntwort, { appointmentId: k.termin.id, art });
  const einleitung = art === "gleich" ? a(k.an, "Super, danke!", "Super, vielen Dank!") : art === "spaeter" ? policenSpaeterText(k.an) : "Alles klar, danke!";
  const s = await naechsterSchritt(k, { schlussEinleitung: einleitung, vertraegeUeberspringen: true, policenUeberspringen: true });
  if (s) await sendeSchritt(k, s);
  else await sende(k, einleitung);
  return true;
}

/**
 * Das Policen-Modul hat eine Antwort auf die Einwilligung („Einverstanden“ / „Lieber nicht“) bzw. einen Widerruf
 * beantwortet (gateway.ts): ist die Policen-Bitte der Strecke offen, folgt jetzt der Schluss.
 */
export async function nachPolicenAntwort(conversationId: string, now = new Date(), art = "einwilligung"): Promise<boolean> {
  const k = await streckenKontext(conversationId, now);
  if (!k?.termin) return false;
  const stand = await streckenStand(conversationId, k.termin.id);
  if (!policenBitteOffen(stand)) return false;
  await merke(conversationId, STRECKE.policenAntwort, { appointmentId: k.termin.id, art });
  const s = await naechsterSchritt(k, { schlussEinleitung: abschlussEinleitung(k.an, k.person, "ohne_antwort"), vertraegeUeberspringen: true, policenUeberspringen: true });
  if (!s) return false;
  await sendeSchritt(k, s);
  return true;
}

/** Schluss: „Ja, stimmt“ (Knopf bzw. vom Assistenten erkannt). Einladung jetzt (einmal), kurze Antwort. */
export async function emailBestaetigt(conversationId: string, now = new Date()): Promise<boolean> {
  const k = await streckenKontext(conversationId, now);
  if (!k?.termin || !k.email) return false;
  const stand = await streckenStand(conversationId, k.termin.id);
  if (stand.emailOkLetzte && !emailFrageOffen(stand)) return true; // doppelter Klick
  if (langAngebotOffen(stand)) {
    await merke(conversationId, STRECKE.langAntwort, { appointmentId: k.termin.id, wahl: "behalten" });
    await import("@/lib/komplettcheck-dauer").then((m) => m.komplettcheckHinweis(k.termin!.id, { now }));
  }
  await merke(conversationId, STRECKE.emailOk, { appointmentId: k.termin.id });
  await zusagen(k, now, "email_bestaetigt");
  await einladungPruefen(k, now);
  await sende(k, einladungUnterwegs(k.an));
  return true;
}

/**
 * Nach „Die Einladung ist unterwegs“ (Ole, 18.11.2026): „Konnten Sie den Termin in Ihrem Kalender eintragen?“ mit
 * Knöpfen [Ja, eingetragen] [Nein, bitte nochmal]. Einmal je Termin, nur im offenen 24-h-Fenster (Knöpfe gehen nur dort).
 * Frühestens 10 Min. nach dem Versand, über den WhatsApp-Cron (Ole, 19.11.2026, einladung-rueckfall.ts runKalenderFrage).
 */
export async function eingetragenFragen(k: StreckenKontext, now: Date): Promise<boolean> {
  if (!k.termin) return false;
  const conv = await prisma.conversation.findUnique({ where: { id: k.conversationId }, select: { windowExpiresAt: true } });
  if (!conv?.windowExpiresAt || conv.windowExpiresAt <= now) return false;
  const schon = await prisma.message.findFirst({ where: { conversationId: k.conversationId, direction: "internal", kind: STRECKE.eingetragenFrage, body: { contains: k.termin.id } }, select: { id: true } });
  if (schon) return false;
  await merke(k.conversationId, STRECKE.eingetragenFrage, { appointmentId: k.termin.id });
  await sende(k, eingetragenFrage(k.an), EINGETRAGEN_KNOEPFE);
  return true;
}

/**
 * Antwort per Knopf auf die Frage nach dem Kalendereintrag: „Ja“ → kurzer Dank. „Nein“ → Termin noch einmal als Text mit
 * Links zum Eintragen (Google-Kalender und Kalenderdatei .ics über den Verwaltungs-Link).
 */
export async function eingetragenAntwort(conversationId: string, ja: boolean, now = new Date()): Promise<boolean> {
  const k = await streckenKontext(conversationId, now);
  if (!k?.termin) return false;
  await merke(conversationId, STRECKE.eingetragen, { appointmentId: k.termin.id, ja });
  if (ja) {
    await sende(k, eingetragenDank(k.an, k.termin.startsAt));
    return true;
  }
  const { customerEventById, googleCalendarUrl } = await import("@/lib/calendar/add-to-calendar");
  const ev = await customerEventById(k.termin.id).catch(() => null);
  const google = ev ? googleCalendarUrl({ ...ev, description: "" }) : null;
  const ics = ev?.token ? `${ev.manageUrl}/ics` : null;
  await sende(k, kalenderNochmalText({ an: k.an, start: k.termin.startsAt, person: k.person, google, ics, ort: ev?.mode === "onsite" ? ev.ort : null }));
  return true;
}

/** Schluss: „Andere Adresse“. Bis eine neue kommt, geht keine Einladung an die alte. */
export async function emailAndere(conversationId: string, now = new Date()): Promise<boolean> {
  const k = await streckenKontext(conversationId, now);
  if (!k?.termin) return false;
  await merke(conversationId, STRECKE.emailFrage, { appointmentId: k.termin.id, andere: true });
  await sende(k, andereAdresseFrage(k.an));
  return true;
}

/** Termin als zugesagt vermerken (Adresse bestätigt bzw. genannt). */
async function zusagen(k: StreckenKontext, now: Date, via: string): Promise<void> {
  if (!k.termin || k.termin.confirmedAt) return;
  await prisma.appointment.update({ where: { id: k.termin.id }, data: { confirmedAt: now } });
  await prisma.message.create({ data: { conversationId: k.conversationId, direction: "internal", kind: "appointment_confirmed", body: JSON.stringify({ appointmentId: k.termin.id, via }), sentBy: "system" } });
}

/**
 * Antwort mit einer E-Mail-Adresse (Frage nach der Adresse offen bzw. update_email): übernehmen, Einladung (einmal bzw.
 * als Aktualisierung an die neue Adresse), kurze Antwort. Mit „@“, aber unvollständig: noch einmal fragen.
 * false = keine Adresse erkannt (Assistent).
 */
export async function emailAntwort(conversationId: string, text: string, now = new Date()): Promise<boolean> {
  const email = emailAus(text);
  if (!email) {
    if (!/@/.test(text ?? "")) return false;
    const k = await streckenKontext(conversationId, now);
    if (!k) return false;
    await sende(k, adresseUnvollstaendig(k.an));
    return true;
  }
  await emailUebernehmen(conversationId, email, now);
  const k = await streckenKontext(conversationId, now);
  if (!k?.termin) return false;
  k.email = email;
  await merke(conversationId, STRECKE.emailOk, { appointmentId: k.termin.id });
  await zusagen(k, now, "email_genannt");
  await einladungPruefen(k, now);
  await sende(k, einladungUnterwegs(k.an, email));
  return true;
}

/** Erste E-Mail-Adresse in einem Text (klein geschrieben), sonst null. */
export function emailAus(text: string | null | undefined): string | null {
  const m = (text ?? "").match(/[^\s@<>(),;:"']+@[^\s@<>(),;:"']+\.[a-z]{2,}/i);
  return m ? m[0].replace(/[.]+$/, "").toLowerCase() : null;
}

/**
 * Neue E-Mail-Adresse übernehmen (Chat, Lead; die bisherige bleibt als weitere Adresse). Ging die Einladung schon an
 * eine andere Adresse: EINE Aktualisierung an die neue (gleiche UID), die alte bekommt nichts mehr.
 */
export async function emailUebernehmen(conversationId: string, email: string, now = new Date()): Promise<void> {
  const conv = await prisma.conversation.update({ where: { id: conversationId }, data: { contactEmail: email }, select: { leadId: true } });
  if (conv.leadId) {
    const bisher = await prisma.lead.findUnique({ where: { id: conv.leadId }, select: { email: true, weitereEmails: true } }).catch(() => null);
    const { mitNeuerEmail } = await import("@/lib/lead-emails");
    await prisma.lead.update({ where: { id: conv.leadId }, data: mitNeuerEmail({ alt: bisher?.email, weitere: bisher?.weitereEmails, neu: email }) }).catch(() => null);
  }
  const appt = await prisma.appointment.findFirst({
    where: { conversationId, status: "booked", startsAt: { gt: now } },
    orderBy: { startsAt: "asc" },
    select: { id: true, einladungAt: true, einladungAn: true },
  });
  const neu = !!appt?.einladungAt && appt.einladungAn !== email;
  if (appt && neu) await import("@/lib/calendar/einladung").then((m) => m.einladungAktualisieren(appt.id, "adresse", now));
  await merke(conversationId, "email_updated", { resent: neu });
}

/** Ist die Vertragsfrage offen (gestellt, noch nicht ausgewertet, kein Abschluss)? */
export async function vertragsfrageOffen(conversationId: string, appointmentId: string): Promise<Date | null> {
  const s = await streckenStand(conversationId, appointmentId);
  return s.vertragsfrageAt && !s.vorvertraegeErfasst && !s.abschlussAt ? s.vertragsfrageAt : null;
}

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";

/**
 * Freie Antwort auf die Vertragsfrage in eine Liste je Sparte bringen (KI-Extraktion als JSON nach Schema, tolerant).
 * Gesundheitsangaben werden vorher ausgeblendet; gespeichert werden nur Sparte, Gesellschaft und Person. Rückfall ohne
 * KI: Erkennung per Muster (vertraegeAusText).
 */
export async function extrahiereVertraege(text: string): Promise<{ liste: Vorvertrag[]; keine: boolean }> {
  const sauber = redactHealthText(text);
  if (sagtKeine(sauber)) return { liste: [], keine: true };
  try {
    const client = new Anthropic();
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 600,
      system:
        "Du liest die Antwort eines Interessenten auf die Frage, welche Versicherungen er schon hat. Trage jede genannte Versicherung mit Sparte ein, die Gesellschaft, den Tarifnamen und für wen nur, wenn genannt. Sei tolerant bei Abkürzungen und Tippfehlern (z. B. „PHV“ = Haftpflicht, „BU“ = Berufsunfähigkeit, „Auto“ = Kfz). Nur Versicherungen, die heute noch bestehen: ausgelaufene, gekündigte oder frühere Verträge („hatte ich mal“, „nicht mehr“) nicht eintragen. Nichts erfinden. Keine Gesundheitsangaben, Beträge oder sonstigen Tarifdetails.",
      output_config: jsonAusgabe(VORVERTRAEGE_SCHEMA),
      messages: [{ role: "user", content: sauber.slice(0, 2000) }],
    });
    const input = jsonAusAntwort(resp) as { vertraege?: unknown; keine?: unknown } | null;
    if (input) {
      const liste = normalisiereVertraege(input.vertraege);
      if (liste.length || input.keine === true) return { liste, keine: input.keine === true && !liste.length };
    }
  } catch (err) {
    console.error("[strecke vertraege]", err instanceof Error ? err.message.slice(0, 160) : err);
  }
  return { liste: vertraegeAusText(sauber), keine: false };
}


/**
 * Antwort auf die Vertragsfrage: auswerten, am Lead speichern, dann die Policen-Bitte bzw. der Schluss. Fehlt zu
 * genannten Sparten der Versicherer, kommt genau einmal die Nachfrage (Ole, 19.11.2026); deren Antwort ergänzt die
 * Gesellschaften (versichererAntwort), „weiß nicht“ bzw. keine Antwort: weiter ohne zweite Frage. true = erledigt.
 */
export async function vertraegeAntwort(conversationId: string, text: string, now = new Date()): Promise<boolean> {
  const k = await streckenKontext(conversationId, now);
  if (!k?.termin) return false;
  const stand = await streckenStand(conversationId, k.termin.id);
  if (stand.versichererFrage) return versichererAntwort(k, stand.versichererFrage.sparten, text, stand.versichererFrage.anzahl);
  const { liste, keine } = await extrahiereVertraege(text);
  const wert: Vorvertraege = { at: now.toISOString(), liste, ...(keine ? { keine: true } : {}) };
  if (k.leadId) await prisma.lead.update({ where: { id: k.leadId }, data: { vorvertraege: wert as unknown as Prisma.InputJsonValue } });
  const fehlend = fehlendeVersicherer(liste);
  const nachfrage = versichererNachfrage(fehlend, k.an, k.person.nom);
  if (nachfrage) {
    await merke(conversationId, STRECKE.versichererFrage, { appointmentId: k.termin.id, sparten: fehlend });
    await sende(k, nachfrage);
    return true;
  }
  await merke(conversationId, STRECKE.vorvertraege, { appointmentId: k.termin.id, anzahl: liste.length, keine });
  const s = await naechsterSchritt(k, { einleitung: "Danke!", schlussEinleitung: abschlussEinleitung(k.an, k.person, "vertraege") });
  if (s) await sendeSchritt(k, s);
  return true;
}

/**
 * Antwort auf die Nachfrage nach den Gesellschaften: zuordnen, ergänzen, weiter. Nennt der Lead statt einer
 * Gesellschaft einen weiteren Vertrag („Und PKV“, Ole 20.11.2026), wird er ergänzt und genau einmal noch nach den
 * Gesellschaften gefragt (höchstens zwei Nachfragen insgesamt).
 */
async function versichererAntwort(k: StreckenKontext, sparten: VertragSparte[], text: string, bisher = 1): Promise<boolean> {
  if (!k.termin) return false;
  const zu = versichererZuordnen(sparten, text);
  let neueOhne: VertragSparte[] = [];
  if (k.leadId) {
    const lead = await prisma.lead.findUnique({ where: { id: k.leadId }, select: { vorvertraege: true } });
    const v = vorvertraegeAus(lead?.vorvertraege);
    const vorhanden = new Set((v?.liste ?? []).map((x) => x.sparte));
    const neu = vertraegeAusText(text).filter((x) => !vorhanden.has(x.sparte) && x.sparte !== "Sonstige");
    if (Object.keys(zu).length || neu.length) {
      const basis = (v?.liste ?? []).map((x) => (!x.gesellschaft && zu[x.sparte] ? { ...x, gesellschaft: zu[x.sparte]! } : x));
      const liste = normalisiereVertraege([...basis, ...neu]);
      const wert = { ...(v ?? { at: new Date().toISOString() }), liste, keine: false } as Vorvertraege;
      await prisma.lead.update({ where: { id: k.leadId }, data: { vorvertraege: wert as unknown as Prisma.InputJsonValue } });
      neueOhne = neu.filter((x) => !x.gesellschaft).map((x) => x.sparte as VertragSparte);
    }
    if (neu.length && neueOhne.length && bisher < 2) {
      const offen = [...new Set([...sparten.filter((s) => !zu[s]), ...neueOhne])];
      const frage = versichererNachfrage(offen, k.an, k.person.nom);
      if (frage) {
        const genannt = neu.map((x) => SPARTE_KURZ[x.sparte as VertragSparte] ?? x.sparte);
        const ergaenzt = `${genannt.length === 1 ? genannt[0] : `${genannt.slice(0, -1).join(", ")} und ${genannt.at(-1)}`} habe ich ergänzt.`;
        await merke(k.conversationId, STRECKE.versichererFrage, { appointmentId: k.termin.id, sparten: offen });
        await sende(k, `Danke, ${ergaenzt} ${frage.replace(/^Danke! /, "")}`);
        return true;
      }
    }
  }
  await merke(k.conversationId, STRECKE.vorvertraege, { appointmentId: k.termin.id, nachfrage: true, ergaenzt: Object.keys(zu).length });
  const s = await naechsterSchritt(k, { einleitung: "Danke!", schlussEinleitung: abschlussEinleitung(k.an, k.person, "vertraege") });
  if (s) await sendeSchritt(k, s);
  return true;
}

/**
 * Buchung über die Buchungsseite (z. B. Buchungslink im Chat, Ole 20.11.2026: „Chat nach Buchung über die Seite
 * automatisch weiter“): Die Strecke im WhatsApp-Chat läuft von selbst weiter, ohne dass der Lead erst schreiben muss.
 *   - Komplettcheck auf der Bestätigungsseite beantwortet: direkt der nächste Schritt (Angebotsfragen, Vertragsfrage,
 *     Policen bzw. Schluss), wie nach dem Knopf im Chat.
 *   - Noch nicht beantwortet (Aufruf aus dem Cron, 15 Min. nach der Buchung): die erste Frage der Strecke im Chat
 *     (Tierfrage bzw. Komplettcheck).
 * Nur mit aktivem Assistenten, ohne Abmeldung und im offenen 24-Std.-Fenster; nie doppelt (Merker der Strecke).
 */
export async function weiterNachBuchungsseite(conversationId: string, appointmentId: string, now = new Date()): Promise<boolean> {
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { botActive: true, optedOutAt: true, windowExpiresAt: true } });
  if (!conv?.botActive || conv.optedOutAt || !conv.windowExpiresAt || conv.windowExpiresAt.getTime() <= now.getTime()) return false;
  const k = await streckenKontext(conversationId, now);
  if (!k?.termin || k.termin.id !== appointmentId) return false;
  const stand = await streckenStand(conversationId, appointmentId);
  if (stand.abschlussAt || stand.zusageFrageAt) return false;
  if (stand.komplettBeantwortet) {
    if (stand.angebotsfragenAt || stand.vertragsfrageAt || stand.policenBitteAt || stand.langAngebotAt || stand.partnerFrageAt) return false;
    const ja = k.termin.komplettcheck === true;
    // Fragen-Engine zuerst (danach weiter wie hier, weiterNachAngaben)
    if (await sendeAngabeFrage(k, ja ? "Super!" : "Alles klar.")) return true;
    await weiterNachKomplettcheck(k, ja ? "Super!" : "Alles klar.", ja ? null : abschlussEinleitung(k.an, k.person, "komplett_nein"));
    return true;
  }
  if (stand.komplettFrageAt || stand.tierFrageLetzte) return false;
  const m = await ersteNachBuchung(k);
  await merke(conversationId, m.merker, { appointmentId, ...(m.daten ?? {}), via: "buchungsseite" });
  await sende(k, m.text, m.buttons, m.liste);
  return true;
}

/**
 * Cron: Termine aus der Buchungsseite mit Chat, 15 Min. bis 24 Std. alt, deren Strecke im Chat nie begonnen hat
 * (Komplettcheck auf der Seite nicht beantwortet): erste Frage im Chat (weiterNachBuchungsseite).
 */
export async function runBuchungsseiteNachholen(now = new Date()): Promise<{ gesendet: number }> {
  if (!inStreckenFenster(now)) return { gesendet: 0 };
  const termine = await prisma.appointment.findMany({
    where: {
      status: "booked",
      conversationId: { not: null },
      startsAt: { gt: now },
      createdAt: { lte: new Date(now.getTime() - 15 * 60_000), gte: new Date(now.getTime() - 24 * HOUR) },
    },
    orderBy: { createdAt: "asc" },
    take: 30,
    select: { id: true, conversationId: true },
  });
  let gesendet = 0;
  for (const t of termine) {
    try {
      // Strecke schon begonnen (irgendein Merker zu diesem Termin): nichts tun
      const begonnen = await prisma.message.findFirst({
        where: { conversationId: t.conversationId!, direction: "internal", body: { contains: t.id }, kind: { in: Object.values(STRECKE) } },
        select: { id: true },
      });
      if (begonnen) continue;
      if (await weiterNachBuchungsseite(t.conversationId!, t.id, now)) gesendet++;
    } catch (err) {
      console.error("[strecke buchungsseite]", err instanceof Error ? err.message.slice(0, 160) : err);
    }
  }
  return { gesendet };
}

/** Frühere Kalenderfrage per Knopf (Nachrichten bis 17.11.2026): „Ja“ bzw. „Mache ich gleich“ → zugesagt. */
export async function kalenderAntwort(conversationId: string, art: "ja" | "gleich", now = new Date()): Promise<boolean> {
  const k = await streckenKontext(conversationId, now);
  if (!k?.termin) return false;
  await zusagen(k, now, `kalender_${art}`);
  const bis = `Bis ${zeitLang(k.termin.startsAt)}.`;
  const text =
    art === "ja"
      ? zusageDank(k.an, k.person, k.termin.startsAt)
      : k.email
        ? `Danke! ${a(k.an, "Die Einladung mit Kalendereintrag hast du per E-Mail.", "Die Einladung mit Kalendereintrag haben Sie per E-Mail.")} ${bis}`
        : `Danke! ${bis}`;
  await sende(k, text);
  return true;
}

/**
 * Strecke weiterführen, wenn der Lead nicht antwortet (Ole, 17.11.2026: nicht nachhaken; Reihenfolge P2): Nach über einer
 * Stunde ohne Antwort folgt der nächste Schritt.
 *   Tierfrage (TKV) → Komplettcheck (die übrigen Tierfragen klärt der Vermittler im Termin)
 *   Komplettcheck → erste offene Angebotsfrage, sind keine offen, der nächste Schritt
 *   Zeitangebot (Komplettcheck, belegt) → Zeit behalten, weiter
 *   Vertragsfrage → Policen-Bitte (die Verträge entfallen, die Bitte nicht)
 *   Policen-Bitte → Schluss
 * Solange Angebotsfragen offen sind, nie der Schluss; eine unbeantwortete Angebotsfrage bleibt stehen. Nur im offenen
 * 24-h-Fenster, Mo bis Sa 8 bis 20 Uhr, nicht nach „Stopp“ und nicht, wenn der Assistent pausiert ist.
 */
export async function runStreckeAbschliessen(now = new Date()): Promise<{ gesendet: number }> {
  if (!inStreckenFenster(now)) return { gesendet: 0 };
  const offen = await prisma.message.findMany({
    where: {
      direction: "internal",
      kind: { in: [STRECKE.zusageFrage, STRECKE.tierFrage, STRECKE.komplettFrage, STRECKE.langAngebot, STRECKE.partnerFrage, STRECKE.vertragsfrage, STRECKE.versichererFrage, STRECKE.policenBitte] },
      createdAt: { lte: new Date(now.getTime() - HOUR), gte: new Date(now.getTime() - 48 * HOUR) },
    },
    orderBy: { createdAt: "asc" },
    take: 50,
    select: { conversationId: true, body: true, createdAt: true },
  });
  let gesendet = 0;
  const erledigt = new Set<string>();
  for (const m of offen) {
    const appointmentId = String(daten(m.body).appointmentId ?? "");
    if (!appointmentId || erledigt.has(appointmentId)) continue;
    erledigt.add(appointmentId);
    try {
      const conv = await prisma.conversation.findUnique({ where: { id: m.conversationId }, select: { botActive: true, optedOutAt: true, windowExpiresAt: true } });
      if (!conv?.botActive || conv.optedOutAt || !conv.windowExpiresAt || conv.windowExpiresAt.getTime() <= now.getTime()) continue;
      const stand = await streckenStand(m.conversationId, appointmentId);
      if (stand.abschlussAt) continue;
      // Zusage-Frage (Splittest termin_zusage, Fassung b) ohne Tipp: 1 Std. nach der Frage bzw. nach der letzten Nachricht
      // des Leads (eine Rückfrage hat der Assistent beantwortet) die erste Frage der Strecke mit „Noch eine kurze Frage:“
      if (zusageOffen(stand)) {
        const letzte = await prisma.message.findFirst({ where: { conversationId: m.conversationId, direction: "inbound", createdAt: { gt: stand.zusageFrageAt! } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
        const seit = letzte?.createdAt ?? stand.zusageFrageAt!;
        if (seit.getTime() > now.getTime() - HOUR) continue;
        const k = await streckenKontext(m.conversationId, now);
        if (!k?.termin || k.termin.id !== appointmentId) continue;
        await merke(m.conversationId, STRECKE.zusageAntwort, { appointmentId, art: "ohne_antwort" });
        if (await sendeErsteNachZusage(k, ZUSAGE_EINLEITUNG.ohneAntwort)) gesendet++;
        continue;
      }
      // „Entscheidet noch jemand mit?“ ohne klare Antwort: 1 Std. nach der Frage bzw. nach der letzten Nachricht des Leads
      // (eine Rückfrage hat der Assistent beantwortet) weiter mit der ersten Angebotsfrage bzw. dem nächsten Schritt
      if (partnerFrageOffen(stand)) {
        const letzte = await prisma.message.findFirst({ where: { conversationId: m.conversationId, direction: "inbound", createdAt: { gt: stand.partnerFrageAt! } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
        if ((letzte?.createdAt ?? stand.partnerFrageAt!).getTime() > now.getTime() - HOUR) continue;
        if (await partnerAntwort(m.conversationId, "ohne_antwort", now)) gesendet++;
        continue;
      }
      // offen ist der jüngste Schritt
      const schritt: { art: "policen" | "vertraege" | "lang" | "komplett" | "tier"; seit: Date } | null = tierFrageOffen(stand)
        ? { art: "tier", seit: stand.tierFrageLetzte!.at }
        : policenBitteOffen(stand)
        ? { art: "policen", seit: stand.policenBitteAt! }
        : stand.vertragsfrageAt && !stand.vorvertraegeErfasst
          ? { art: "vertraege", seit: stand.versichererFrage?.at ?? stand.vertragsfrageAt }
          : langAngebotOffen(stand)
            ? { art: "lang", seit: stand.langAngebotAt! }
            : stand.komplettFrageAt && !komplettcheckErledigt(stand)
              ? { art: "komplett", seit: stand.komplettFrageAt }
              : null;
      if (!schritt || schritt.seit.getTime() > now.getTime() - HOUR) continue;
      const antwort = await prisma.message.count({ where: { conversationId: m.conversationId, direction: "inbound", createdAt: { gt: schritt.seit } } });
      if (antwort) continue;
      const k = await streckenKontext(m.conversationId, now);
      if (!k?.termin || k.termin.id !== appointmentId) continue;
      let ok = false;
      if (schritt.art === "tier") {
        // Tierfrage ohne Antwort: der Rest bleibt offen (klärt der Vermittler im Termin), weiter mit dem Komplettcheck
        ok = await sendeKomplettcheck(k, "Noch eine kurze Frage:");
      } else if (schritt.art === "lang") {
        await langeZeitAntwort(m.conversationId, "behalten", now);
        ok = true;
      } else if (schritt.art === "komplett") {
        ok = (await sendeAngebotsfrage(k)) || (await sendeNaechsten(k, {}));
      } else if (!offeneAngebotsfragen(k).length) {
        if (schritt.art === "policen") await merke(m.conversationId, STRECKE.policenAntwort, { appointmentId, art: "ohne_antwort" });
        ok = await sendeNaechsten(k, { vertraegeUeberspringen: true, policenUeberspringen: schritt.art === "policen" });
      }
      if (ok) gesendet++;
    } catch (err) {
      console.error("[strecke abschluss]", err instanceof Error ? err.message.slice(0, 160) : err);
    }
  }
  return { gesendet };
}

async function sendeNaechsten(k: StreckenKontext, o: Parameters<typeof naechsterSchritt>[1]): Promise<boolean> {
  const s = await naechsterSchritt(k, { schlussEinleitung: abschlussEinleitung(k.an, k.person, "ohne_antwort"), ...o });
  if (!s) return false;
  await sendeSchritt(k, s);
  return true;
}

/** „Lieber nicht“ bzw. Widerruf als Text (zusätzlich zu den Nachweisen des Policen-Moduls): keine Erinnerungen mehr. */
const POLICEN_STOPP_RE = /^\s*lieber nicht\b|widerruf|lösch|loesch|keine (policen|unterlagen) (mehr|schicken)/i;

/**
 * Sind Policen-Erinnerungen erlaubt und sinnvoll? Rechtsprüfung A8 (darfPolicenErinnern im Policen-Modul: Funktion an,
 * protokolliertes Opt-in aus der Buchung, kein „Lieber nicht“, kein Widerruf, kein STOPP, noch kein Dokument, Termin
 * steht), gebeten, nicht „habe keine“, höchstens 2.
 */
export async function policenErinnernErlaubt(conversationId: string, leadId: string | null, stand: StreckenStand): Promise<boolean> {
  if (!leadId || !stand.policenBitteAt || stand.policenKeine || stand.policenErinnerungen >= MAX_POLICEN_ERINNERUNGEN) return false;
  const { darfPolicenErinnern } = await import("@/lib/policen/server");
  if (!(await darfPolicenErinnern(leadId))) return false;
  if ((await prisma.leadDocument.count({ where: { leadId } })) > 0) return false;
  // Lead sagt nach der Bitte, er habe keine bzw. möchte nicht
  const nachher = await prisma.message.findMany({ where: { conversationId, direction: "inbound", createdAt: { gt: stand.policenBitteAt } }, select: { body: true }, take: 30 });
  return !nachher.some((x) => sagtKeinePolicen(x.body ?? "") || POLICEN_STOPP_RE.test(x.body ?? ""));
}

/**
 * Policen-Erinnerung 24 Std. nach der Buchung (Ole, 17.11.2026 spät): nur bei mehr als 2 Tagen zwischen Buchung und
 * Termin, nur im offenen 24-h-Fenster (Freitext; die Vorlage ist nur vorbereitet, docs/beispielverlauf-p2.md). Da das
 * Fenster meist kurz nach 24 Std. schließt, geht sie spätestens 30 Min. vor dessen Ende raus (frühestens 12 Std. nach der
 * Buchung). Höchstens 2 Policen-Erinnerungen insgesamt (mit der Zeile am Vortag).
 */
export async function runPolicenErinnerung(now = new Date()): Promise<{ gesendet: number }> {
  if (!inStreckenFenster(now)) return { gesendet: 0 };
  // Policen-Strecke v2 (nur mit POLICEN_FLOW): eigene Erinnerungen 1 und 2 mit Formular-Knopf
  const flow = await import("@/lib/policen/flow/server")
    .then((m) => m.runPolicenFlowErinnerungen(now))
    .catch((err) => {
      console.error("[policen flow erinnerung]", err instanceof Error ? err.message.slice(0, 160) : err);
      return { gesendet: 0 };
    });
  const bitten = await prisma.message.findMany({
    where: { direction: "internal", kind: STRECKE.policenBitte, createdAt: { gte: new Date(now.getTime() - 7 * 24 * HOUR) } },
    select: { conversationId: true, body: true },
    take: 200,
  });
  let gesendet = 0;
  for (const b of bitten) {
    try {
      if (daten(b.body).flow === true) continue; // v2: siehe oben
      const appointmentId = String(daten(b.body).appointmentId ?? "");
      const t = appointmentId ? await prisma.appointment.findUnique({ where: { id: appointmentId }, select: { status: true, startsAt: true, createdAt: true, leadId: true } }) : null;
      if (!t || t.status !== "booked" || t.startsAt.getTime() <= now.getTime()) continue;
      if (t.startsAt.getTime() - t.createdAt.getTime() <= 2 * 24 * HOUR) continue;
      const stand = await streckenStand(b.conversationId, appointmentId);
      if (stand.policenErinnerungen > 0 || !(await policenErinnernErlaubt(b.conversationId, t.leadId, stand))) continue;
      const conv = await prisma.conversation.findUnique({ where: { id: b.conversationId }, select: { botActive: true, optedOutAt: true, windowExpiresAt: true } });
      if (!conv?.botActive || conv.optedOutAt || !conv.windowExpiresAt || conv.windowExpiresAt.getTime() <= now.getTime()) continue;
      const nachBuchung = now.getTime() - t.createdAt.getTime();
      const faellig = nachBuchung >= 24 * HOUR || (nachBuchung >= 12 * HOUR && conv.windowExpiresAt.getTime() - now.getTime() <= 30 * 60 * 1000);
      if (!faellig) continue;
      const k = await streckenKontext(b.conversationId, now);
      if (!k?.termin) continue;
      await merke(b.conversationId, STRECKE.policenErinnerung, { appointmentId, art: "tag" });
      await sende(k, policenErinnerungText(k.an, k.person, stand.policenPolice, istKfzProdukt(k.source)));
      gesendet++;
    } catch (err) {
      console.error("[policen erinnerung]", err instanceof Error ? err.message.slice(0, 160) : err);
    }
  }
  return { gesendet: gesendet + flow.gesendet };
}

/** Bisherige Policen-Erinnerungen im ganzen Chat (alle Termine, also auch vor einer Verschiebung). */
async function policenErinnerungenImChat(conversationId: string): Promise<{ gesamt: number; vortag: boolean }> {
  const rows = await prisma.message.findMany({ where: { conversationId, direction: "internal", kind: STRECKE.policenErinnerung }, select: { body: true } });
  const gesendet = rows.map((r) => daten(r.body)).filter((d) => d.gesendet !== false);
  return { gesamt: gesendet.length, vortag: gesendet.some((d) => d.art === "vortag") };
}

/**
 * Darf der Policen-Satz in die Vortags-Terminerinnerung (A8 a, Rechtsprüfung 19.11.2026)? Ohne Opt-in, weil er Teil der
 * ohnehin verschickten Servicenachricht ist. Nur nach gestellter Policen-Bitte, ohne Police, nicht „habe keine“ oder
 * „Lieber nicht“, kein STOP, Widerruf oder Abmeldung, nicht minderjährig, höchstens einmal je Lead (auch nach einer
 * Verschiebung) und zusammen höchstens 2 Policen-Erinnerungen. Pay-per-Lead-Leads haben keine Strecke und damit
 * keine Bitte. Gesundheitssparten: die Bitte geht nur, wo der Vermittler freigegeben hat (A5); der Satz nennt keine Sparte.
 */
export async function policenVortagSatzErlaubt(conversationId: string, leadId: string | null, stand: StreckenStand): Promise<boolean> {
  if (!leadId || !stand.policenBitteAt || stand.policenKeine) return false;
  const bisher = await policenErinnerungenImChat(conversationId);
  if (bisher.vortag || bisher.gesamt >= MAX_POLICEN_ERINNERUNGEN) return false;
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { optedOutAt: true } });
  if (conv?.optedOutAt) return false;
  const policen = await import("@/lib/policen/server");
  if (!(await policen.darfPolicenVortagSatz(leadId))) return false;
  const chat = await policen.policenSprecherFuerChat(conversationId).catch(() => null);
  if (!chat || chat.chat.minderjaehrig) return false;
  if ((await prisma.leadDocument.count({ where: { leadId } })) > 0) return false;
  const nachher = await prisma.message.findMany({ where: { conversationId, direction: "inbound", createdAt: { gt: stand.policenBitteAt } }, select: { body: true }, take: 30 });
  return !nachher.some((x) => sagtKeinePolicen(x.body ?? "") || POLICEN_STOPP_RE.test(x.body ?? ""));
}

/**
 * Satz für den Nutzensatz der Vortags-Erinnerung (lib/whatsapp/reminders.ts), wenn noch keine Police da ist; zählt als
 * Policen-Erinnerung (gemerkt nach dem Versand). Strecke v1 und v2: in v2 ersetzt er die eigene Nachricht am Vortag um
 * 18 Uhr (lib/policen/flow/server.ts). null = kein Satz.
 */
export async function policenVortagSatzFuer(
  appt: { id: string; conversationId: string | null; leadId: string | null },
  an: Ansprache,
  o: { merken?: boolean; person?: { nom: string } | null } = {},
): Promise<string | null> {
  if (!appt.conversationId) return null;
  const stand = await streckenStand(appt.conversationId, appt.id);
  if (!(await policenVortagSatzErlaubt(appt.conversationId, appt.leadId, stand))) return null;
  if (o.merken) await merke(appt.conversationId, STRECKE.policenErinnerung, { appointmentId: appt.id, art: "vortag" });
  return policenVortagSatz(an, o.person, await leadIstKfz(appt.leadId));
}

/** Kfz-Lead (Produkt aus der Quelle)? Fehler zählen als nein (dann der allgemeine Satz). */
async function leadIstKfz(leadId: string | null): Promise<boolean> {
  if (!leadId) return false;
  try {
    const l = await prisma.lead.findUnique({ where: { id: leadId }, select: { source: true } });
    return istKfzProdukt(l?.source ?? null);
  } catch {
    return false;
  }
}

/** Letzter Terminvorschlag im Chat, solange der Lead danach nicht geschrieben hat (für das Nachfassen). */
export async function offenerTerminvorschlag(leadId: string, customerId: string): Promise<{ conversationId: string; starts: string[]; at: Date; windowExpiresAt: Date | null } | null> {
  const conv = await prisma.conversation.findFirst({ where: { customerId, leadId }, orderBy: { lastMessageAt: "desc" }, select: { id: true, windowExpiresAt: true } });
  if (!conv) return null;
  const v = await prisma.message.findFirst({ where: { conversationId: conv.id, direction: "internal", kind: STRECKE.vorschlag }, orderBy: { createdAt: "desc" }, select: { body: true, createdAt: true } });
  if (!v) return null;
  const danach = await prisma.message.count({ where: { conversationId: conv.id, direction: "inbound", createdAt: { gt: v.createdAt } } });
  if (danach) return null;
  // Nach dem Vorschlag hat der Assistent etwas anderes geschrieben (z. B. eine Rückfrage): kein Termin-Nachfassen
  const spaeter = await prisma.message.findFirst({ where: { conversationId: conv.id, direction: "outbound", kind: { not: "document" }, createdAt: { gt: new Date(v.createdAt.getTime() + 5000) } }, select: { id: true } });
  if (spaeter) return null;
  let starts: string[] = [];
  try {
    const raw = (JSON.parse(v.body ?? "{}") as { starts?: unknown }).starts;
    starts = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
  } catch {
    starts = [];
  }
  return { conversationId: conv.id, starts, at: v.createdAt, windowExpiresAt: conv.windowExpiresAt };
}

/**
 * Zwei Zeiten fürs Nachfassen: dieselben, solange sie frei sind und noch mindestens eine Stunde hin ist, sonst neu
 * berechnet (früheste und früheste an einem anderen Tag). null = keine freien Zeiten bzw. kein Kalender.
 */
export async function noch2FreieZeiten(customerId: string, leadId: string, alt: string[], now = new Date()): Promise<[string, string] | null> {
  try {
    const { bookingDurationMin, suggestSlots } = await import("@/lib/calendar");
    const { pickTwoSlots } = await import("@/lib/whatsapp/termin-vorschlaege");
    const dauer = await bookingDurationMin(customerId, leadId).catch(() => 30);
    const frei = (await suggestSlots(customerId, dauer, 60, "lead", 10, leadId)).filter((s) => new Date(s.start).getTime() > now.getTime() + HOUR);
    const freiSet = new Set(frei.map((s) => new Date(s.start).getTime()));
    const behalten = alt.filter((s) => freiSet.has(new Date(s).getTime()));
    if (behalten.length >= 2) return [behalten[0], behalten[1]];
    const two = pickTwoSlots(frei);
    return two ? [two[0].start, two[1].start] : null;
  } catch {
    return null;
  }
}

// ─── Frage nach der Vorbereitung in der Bestätigung (ab v5) und Fragen-Engine (Ole, 26.11.2026) ─────────────────────
//
// Kundenfall Schwarzkopf (26.11.2026): Lead buchte über die Buchungsseite, bevor er im Chat geschrieben hatte. Die
// Bestätigung ging als Vorlage ohne Frage raus, das 24-h-Fenster blieb zu und die Vorbereitung (Angaben, Komplettcheck,
// Policen) begann nie. Ab v5 endet die Bestätigung mit „Darf ich Ihnen vorab ein paar kurze Fragen stellen?“
// [Ja, gern] [Lieber im Termin]:
//   Ja, gern          → die Strecke startet sofort: Fragen-Engine (falls Definition), dann Tierfragen bzw. Komplettcheck,
//                       Partner, Angebotsfragen, Vertragsfrage, Policen-Bitte, Schluss (wie nach einer Buchung im Chat)
//   Lieber im Termin  → „Alles klar, bis Montag!“, keine weiteren Fragen
//   keine Antwort     → einmal am Folgetag (Mo bis Sa 8 bis 20 Uhr) die Vorlage booking_prep_nudge mit denselben Knöpfen,
//                       dann Ruhe (runVorbereitungNachfassen)

const DAY = 24 * HOUR;
const berlinTag = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** „heute“, „morgen“ bzw. der Wochentag des Termins („Montag“), für „Alles klar, bis Montag!“. */
export function bisWann(startsAt: Date, now = new Date()): string {
  if (berlinTag(startsAt) === berlinTag(now)) return "heute";
  if (berlinTag(startsAt) === berlinTag(new Date(now.getTime() + DAY))) return "morgen";
  return new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "long" }).format(startsAt);
}

/** Kommender Termin zur Startzeit (für den Merker, wenn der Absender die ID nicht kennt). */
async function terminZurZeit(conversationId: string, leadId: string | null, startsAt: Date): Promise<string | null> {
  const t = await prisma.appointment.findFirst({
    where: { status: "booked", startsAt, OR: [{ conversationId }, ...(leadId ? [{ leadId }] : [])] },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return t?.id ?? null;
}

/** Frage nach der Vorbereitung gestellt (Bestätigung ab v5, Nachfrage am Folgetag bzw. Ops-Aktion): merken. */
export async function vorbereitungGefragt(
  conversationId: string,
  o: { appointmentId: string | null; leadId: string | null; startsAt: Date },
  via: "bestaetigung" | "nachfrage" | "ops",
): Promise<void> {
  const appointmentId = o.appointmentId ?? (await terminZurZeit(conversationId, o.leadId, o.startsAt));
  if (!appointmentId) return;
  await merke(conversationId, via === "nachfrage" ? STRECKE.vorbereitungNachfrage : STRECKE.vorbereitungFrage, { appointmentId, via });
}

export type VorbereitungStand = { frageAt: Date | null; nachfrageAt: Date | null; antwort: { at: Date; art: string } | null };

/** Stand der Frage nach der Vorbereitung für einen Termin. */
export async function vorbereitungStand(conversationId: string, appointmentId: string): Promise<VorbereitungStand> {
  const rows = await prisma.message.findMany({
    where: { conversationId, direction: "internal", kind: { in: [STRECKE.vorbereitungFrage, STRECKE.vorbereitungNachfrage, STRECKE.vorbereitungAntwort] }, body: { contains: appointmentId } },
    orderBy: { createdAt: "asc" },
    select: { kind: true, createdAt: true, body: true },
  });
  const erste = (k: string) => rows.find((r) => r.kind === k) ?? null;
  // letzte Antwort gilt („Ja, gern“, danach „Rest im Termin“)
  const antwort = rows.filter((r) => r.kind === STRECKE.vorbereitungAntwort).at(-1) ?? null;
  return {
    frageAt: erste(STRECKE.vorbereitungFrage)?.createdAt ?? null,
    nachfrageAt: erste(STRECKE.vorbereitungNachfrage)?.createdAt ?? null,
    antwort: antwort ? { at: antwort.createdAt, art: String(daten(antwort.body).art ?? "") } : null,
  };
}

/**
 * Antwort auf die Frage nach der Vorbereitung (Knopf vorbereitung:ja|termin, knopf.ts, bzw. getippt): „Ja, gern“ startet
 * die Strecke, „Lieber im Termin“ antwortet „Alles klar, bis Montag!“. Doppelter bzw. alter Klick: nichts tun.
 * false = kein kommender Termin (der Assistent antwortet).
 */
export async function vorbereitungAntwort(conversationId: string, art: "ja" | "termin", now = new Date()): Promise<boolean> {
  const k = await streckenKontext(conversationId, now);
  if (!k?.termin) return false;
  const v = await vorbereitungStand(conversationId, k.termin.id);
  if (v.antwort) return true;
  await merke(conversationId, STRECKE.vorbereitungAntwort, { appointmentId: k.termin.id, art });
  if (k.leadId) {
    const { logLeadHistory } = await import("@/lib/lead-history");
    await logLeadHistory(k.leadId, "notiz", art === "ja" ? "Vorbereitung per WhatsApp: Fragen vorab gern" : "Vorbereitung per WhatsApp: lieber im Termin", { customerId: k.customerId, userId: null }).catch(() => null);
  }
  if (art === "termin") {
    await sende(k, `Alles klar, bis ${bisWann(k.termin.startsAt, now)}!`);
    return true;
  }
  await starteVorbereitung(k, "Super, danke!");
  await einladungPruefen(k, now);
  return true;
}

export { vorbereitungAusText };

/**
 * Getippte Antwort, solange die Frage nach der Vorbereitung offen ist (gateway.ts vor dem Assistenten). true = erledigt.
 * Nur, wenn unsere letzte Nachricht im Chat die Frage war (Bestätigung bzw. Nachfrage).
 */
export async function vorbereitungFreitext(conversationId: string, text: string | null | undefined, now = new Date()): Promise<boolean> {
  const art = vorbereitungAusText(text);
  if (!art) return false;
  const k = await streckenKontext(conversationId, now);
  if (!k?.termin) return false;
  const v = await vorbereitungStand(conversationId, k.termin.id);
  if (!v.frageAt && !v.nachfrageAt) return false;
  if (v.antwort) return false;
  const letzte = await prisma.message.findFirst({ where: { conversationId, direction: "outbound" }, orderBy: { createdAt: "desc" }, select: { purpose: true } });
  if (letzte?.purpose !== "booking_confirmation" && letzte?.purpose !== "booking_prep_nudge") return false;
  return vorbereitungAntwort(conversationId, art, now);
}

/** Strecke starten (nach „Ja, gern“): Fragen-Engine, danach der erste Schritt nach den Angaben. */
async function starteVorbereitung(k: StreckenKontext, einleitung: string): Promise<void> {
  if (await sendeAngabeFrage(k, einleitung)) return;
  await weiterNachAngaben(k, einleitung);
}

/** Nach der Fragen-Engine: Komplettcheck (bzw. Tierfragen), war er schon beantwortet (Buchungsseite), der Schritt danach. */
async function weiterNachAngaben(k: StreckenKontext, einleitung: string): Promise<void> {
  if (!k.termin) return;
  const stand = await streckenStand(k.conversationId, k.termin.id);
  if (stand.abschlussAt) return;
  // Komplettcheck schon entschieden (Buchungsseite, Ole 26.11.2026: „hat der Lead auch schon ausgewählt“): nicht noch
  // einmal fragen, auch wenn der Merker im Chat fehlt (Termin ohne verknüpften Chat beim Klick)
  if (stand.komplettBeantwortet || k.termin.komplettcheck !== null) {
    if (stand.angebotsfragenAt || stand.vertragsfrageAt || stand.policenBitteAt || stand.langAngebotAt || stand.partnerFrageAt) return;
    const ja = k.termin.komplettcheck === true;
    await weiterNachKomplettcheck(k, einleitung, ja ? null : abschlussEinleitung(k.an, k.person, "komplett_nein"));
    return;
  }
  if (stand.komplettFrageAt || stand.tierFrageLetzte) return;
  const m = await ersteNachAngaben(k, einleitung);
  await merke(k.conversationId, m.merker, { appointmentId: k.termin.id, ...(m.daten ?? {}) });
  await sende(k, m.text, m.buttons);
}

/**
 * Cron: Nachfrage zur Vorbereitung einmal am Folgetag (Ole, 26.11.2026). Bestätigung mit Frage (Merker
 * vorbereitung_frage) vom Vortag bzw. letzten Werktag, keine Antwort und keine Nachricht des Leads seitdem, Termin steht
 * noch und ist mindestens 2 Std. entfernt. Nur Mo bis Sa 8 bis 20 Uhr; danach Ruhe. Solange die Vorlage nicht
 * freigegeben ist (Fenster zu), geht nichts raus.
 */
export async function runVorbereitungNachfassen(now = new Date()): Promise<{ gesendet: number; ohneVorlage: number }> {
  if (!inStreckenFenster(now)) return { gesendet: 0, ohneVorlage: 0 };
  const fragen = await prisma.message.findMany({
    where: { direction: "internal", kind: STRECKE.vorbereitungFrage, createdAt: { gte: new Date(now.getTime() - 3 * DAY), lte: new Date(now.getTime() - 6 * HOUR) } },
    orderBy: { createdAt: "asc" },
    take: 50,
    select: { conversationId: true, body: true, createdAt: true },
  });
  let gesendet = 0;
  let ohneVorlage = 0;
  for (const f of fragen) {
    const appointmentId = String(daten(f.body).appointmentId ?? "");
    if (!appointmentId || !nachfassTag(f.createdAt, now)) continue;
    try {
      const v = await vorbereitungStand(f.conversationId, appointmentId);
      if (v.antwort || v.nachfrageAt) continue;
      const geschrieben = await prisma.message.count({ where: { conversationId: f.conversationId, direction: "inbound", createdAt: { gt: f.createdAt } } });
      if (geschrieben) continue;
      const t = await prisma.appointment.findUnique({ where: { id: appointmentId }, select: { status: true, startsAt: true, leadId: true } });
      if (!t || t.status !== "booked" || t.startsAt.getTime() < now.getTime() + 2 * HOUR) continue;
      const conv = await prisma.conversation.findUnique({ where: { id: f.conversationId }, select: { customerId: true, contactPhone: true, contactName: true, optedOutAt: true, botActive: true, leadId: true } });
      if (!conv || conv.optedOutAt || !conv.botActive) continue;
      const { sendVorbereitungNachfrage } = await import("@/lib/whatsapp/reminders");
      try {
        await sendVorbereitungNachfrage({ customerId: conv.customerId, to: conv.contactPhone, name: conv.contactName, leadId: t.leadId ?? conv.leadId, startsAt: t.startsAt });
      } catch (err) {
        const { NoTemplateError } = await import("@/lib/whatsapp/templates");
        if (err instanceof NoTemplateError) {
          ohneVorlage++;
          continue;
        }
        throw err;
      }
      await merke(f.conversationId, STRECKE.vorbereitungNachfrage, { appointmentId, via: "nachfrage" });
      gesendet++;
    } catch (err) {
      console.error("[vorbereitung nachfassen]", err instanceof Error ? err.message.slice(0, 160) : err);
    }
  }
  return { gesendet, ohneVorlage };
}

/** Ist heute der Folgetag (nächster Tag Mo bis Sa) nach der Frage? Sonntag zählt nicht. */
export function nachfassTag(frageAt: Date, now: Date): boolean {
  let tag = new Date(frageAt.getTime() + DAY);
  if (new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", weekday: "short" }).format(tag) === "Sun") tag = new Date(tag.getTime() + DAY);
  return berlinTag(tag) === berlinTag(now);
}

// ─── Fragen-Engine (lib/vorbereitung/fragen.ts) ──────────────────────────────────────────────────────────────────────

export type AngabenStand = {
  letzteFrage: { id: string; at: Date } | null;
  erledigt: string[];
  nachgefragt: string[];
  rest: boolean;
  /** Antworten je Frage (für Bedingungen, Wiederholungen und abgeleitete Werte) */
  antworten: Record<string, Antwort>;
  /** Mehrfachauswahl: schon gewählte Zeilen der offenen Frage */
  teil: string[];
};

/** Stand der Fragen-Engine für einen Termin (aus den Merkern). */
export async function angabenStand(conversationId: string, appointmentId: string): Promise<AngabenStand> {
  const rows = await prisma.message.findMany({
    where: { conversationId, direction: "internal", kind: { in: [STRECKE.angabeFrage, STRECKE.angabeAntwort, STRECKE.angabeNachfrage, STRECKE.angabenRest, STRECKE.angabeTeil] }, body: { contains: appointmentId } },
    orderBy: { createdAt: "asc" },
    select: { kind: true, createdAt: true, body: true },
  });
  const f = rows.filter((r) => r.kind === STRECKE.angabeFrage).at(-1);
  const letzteFrage = f ? { id: String(daten(f.body).id ?? ""), at: f.createdAt } : null;
  const ids = (kind: string) => rows.filter((r) => r.kind === kind).map((r) => String(daten(r.body).id ?? ""));
  const antworten: Record<string, Antwort> = {};
  for (const r of rows.filter((x) => x.kind === STRECKE.angabeAntwort)) {
    const d = daten(r.body);
    if (typeof d.wert !== "string") continue;
    antworten[String(d.id ?? "")] = {
      wert: d.wert,
      ...(Array.isArray(d.opt) ? { opt: d.opt.map(String) } : {}),
      ...(d.teile && typeof d.teile === "object" ? { teile: d.teile as Record<string, number> } : {}),
    };
  }
  const teil = letzteFrage
    ? rows
        .filter((r) => r.kind === STRECKE.angabeTeil && r.createdAt >= letzteFrage.at && daten(r.body).id === letzteFrage.id)
        .flatMap((r) => (Array.isArray(daten(r.body).opt) ? (daten(r.body).opt as unknown[]).map(String) : []))
    : [];
  return { letzteFrage, erledigt: ids(STRECKE.angabeAntwort), nachgefragt: ids(STRECKE.angabeNachfrage), rest: rows.some((r) => r.kind === STRECKE.angabenRest), antworten, teil: [...new Set(teil)] };
}

/** Wartet die Engine auf eine Antwort? */
export function angabeFrageOffen(s: AngabenStand): boolean {
  return !!s.letzteFrage && !s.rest && !s.erledigt.includes(s.letzteFrage.id);
}

/** Sparten der Engine für einen Lead (gebuchte Sparten; feste Tierstrecke TKV ausgenommen, lib/whatsapp/tier-fragen.ts). */
function angabenSparten(k: Pick<StreckenKontext, "source" | "formular" | "angaben">): string[] {
  return istTierStrecke(k.source) ? [] : engineSparten(spartenDesLeads(k.source, { formular: k.formular, angaben: k.angaben }));
}

/** Fragenplan und Quelle für einen Lead (nur aktive Definitionen; Schalter VORBEREITUNG_FRAGEN je Kunde). */
function angabenPlan(k: Pick<StreckenKontext, "source" | "formular" | "angaben" | "customerId">, st: Pick<AngabenStand, "erledigt" | "antworten">): { plan: GeplanteFrage[]; quelle: FragenQuelle } {
  const quelle: FragenQuelle = { formular: k.formular, angaben: cleanQualificationData(k.angaben), erledigt: st.erledigt, antworten: st.antworten };
  return { plan: fragenPlan(angabenSparten(k), aktiveSparten(undefined, undefined, fragenAktiv(k.customerId)), quelle), quelle };
}

/** Nächste offene Frage der Engine als Nachricht mit Merker (ohne Senden); null = keine (mehr) offen. */
async function angabeFrageNachricht(
  k: StreckenKontext,
  einleitung?: string | null,
): Promise<{ text: string; buttons: Knopf[] | null; liste: FrageNachricht["liste"]; merker: string; daten: Record<string, unknown> } | null> {
  if (!k.termin) return null;
  const st = await angabenStand(k.conversationId, k.termin.id);
  if (st.rest) return null;
  const { plan, quelle } = angabenPlan(k, st);
  const offen = offeneFragen(plan, quelle);
  if (!offen[0]) return null;
  // Privatschutz als Bündel (Ole, 26.11.2026): keine eigene Strecke, aber am Lead vermerken
  if (!st.letzteFrage) {
    const sparten = angabenSparten(k);
    if (buendelGewuenscht(sparten)) await buendelVermerken(k, sparten);
  }
  const n = frageNachricht(offen[0], k.an, anzahlHauptfragen(offen), einleitung);
  return { text: n.text, buttons: n.buttons, liste: n.liste, merker: STRECKE.angabeFrage, daten: { id: offen[0].id } };
}

/** „Bündel gewünscht“ am Lead (vorbereitungsAngaben.buendel und Verlauf), einmal. */
async function buendelVermerken(k: StreckenKontext, sparten: string[]): Promise<void> {
  if (!k.leadId) return;
  const l = await prisma.lead.findUnique({ where: { id: k.leadId }, select: { vorbereitungsAngaben: true } });
  if ((l?.vorbereitungsAngaben as { buendel?: unknown } | null)?.buendel) return;
  const labels = SPARTEN_DEFINITIONEN.filter((d) => sparten.includes(d.sparte)).map((d) => d.label);
  await leadAngabenSpeichern(k.leadId, (x) => {
    x.buendel = labels;
  });
  const { logLeadHistory } = await import("@/lib/lead-history");
  await logLeadHistory(k.leadId, "notiz", `Bündel gewünscht: ${labels.join(", ")}`, { customerId: k.customerId, userId: null }).catch(() => null);
}

/** Nächste offene Frage der Engine senden und merken. false = keine offen. */
export async function sendeAngabeFrage(k: StreckenKontext, einleitung?: string | null): Promise<boolean> {
  const m = await angabeFrageNachricht(k, einleitung);
  if (!m || !k.termin) return false;
  await merke(k.conversationId, m.merker, { appointmentId: k.termin.id, ...m.daten });
  await sende(k, m.text, m.buttons, m.liste);
  return true;
}

/**
 * Angaben der Vorbereitung am Lead (Lead.vorbereitungsAngaben): je Frage Sparte, Bezeichnung und Wert, offene Punkte,
 * Bündel (Sparten, wenn Privatschutz als Bündel gewünscht ist).
 */
type LeadAngaben = { at: string; werte: Record<string, { sparte: string; label: string; wert: string }>; offen: string[]; rest?: boolean; buendel?: string[] };

async function leadAngabenSpeichern(leadId: string | null, fn: (x: LeadAngaben) => void): Promise<void> {
  if (!leadId) return;
  const l = await prisma.lead.findUnique({ where: { id: leadId }, select: { vorbereitungsAngaben: true } });
  const roh = (l?.vorbereitungsAngaben ?? null) as Partial<LeadAngaben> | null;
  const x: LeadAngaben = {
    at: new Date().toISOString(),
    werte: { ...(roh?.werte ?? {}) },
    offen: [...(roh?.offen ?? [])],
    ...(roh?.rest ? { rest: true } : {}),
    ...(roh?.buendel ? { buendel: roh.buendel } : {}),
  };
  fn(x);
  x.offen = [...new Set(x.offen)];
  await prisma.lead.update({ where: { id: leadId }, data: { vorbereitungsAngaben: x as unknown as Prisma.InputJsonValue } }).catch((e) => console.error("[vorbereitung lead]", e instanceof Error ? e.message.slice(0, 120) : e));
}

/** Wert einer Frage speichern: Angaben (Terminvorbereitung), Protokoll, Lead, Merker mit Antwort (für Bedingungen). */
async function angabeSpeichern(k: StreckenKontext, f: GeplanteFrage, r: { wert: string; opt?: string[]; teile?: Record<string, number>; offen?: string[] }, art: string, vermerk = false): Promise<void> {
  if (!k.termin) return;
  const vorher = cleanQualificationData(k.angaben)[f.feld];
  const neu = mergeQualificationData(k.angaben, { [f.feld]: feldWert(f, r.wert, vorher) });
  await prisma.conversation.update({ where: { id: k.conversationId }, data: { qualificationData: (neu ?? undefined) as Prisma.InputJsonValue | undefined } });
  await prisma.message.create({ data: { conversationId: k.conversationId, direction: "internal", kind: "qualification", body: JSON.stringify({ angaben: { [f.feld]: r.wert }, via: "vorbereitung_fragen" }), sentBy: "system" } });
  k.angaben = neu;
  await leadAngabenSpeichern(k.leadId, (x) => {
    x.werte[f.id] = { sparte: f.sparte, label: f.label, wert: r.wert };
    // unklare Antwort mit Vermerk bzw. Teilantwort: im Termin prüfen
    x.offen = [...(vermerk ? [...x.offen, f.label] : x.offen.filter((o) => o !== f.label)), ...(r.offen ?? [])];
  });
  await merke(k.conversationId, STRECKE.angabeAntwort, { appointmentId: k.termin.id, id: f.id, art, wert: r.wert, ...(r.opt ? { opt: r.opt } : {}), ...(r.teile ? { teile: r.teile } : {}) });
}

/** Abgeleitete Werte (z. B. Hausrat-Wohnfläche aus dem Wohngebäude) übernehmen, ohne zu fragen. */
async function abgeleiteteSpeichern(k: StreckenKontext): Promise<void> {
  if (!k.termin) return;
  for (let runde = 0; runde < 3; runde++) {
    const st = await angabenStand(k.conversationId, k.termin.id);
    const neu = angabenPlan(k, st).plan.filter((f) => f.abgeleitetWert && !st.erledigt.includes(f.id));
    if (!neu.length) return;
    for (const f of neu) await angabeSpeichern(k, f, f.abgeleitetWert!, "abgeleitet");
  }
}

/**
 * Antwort auf die offene Frage der Engine (Knopf vf:<id>:<option> bzw. vf:rest, knopf.ts; getippt: bot.ts). Wert in die
 * Angaben (Terminvorbereitung) und an den Lead, dann die nächste Frage bzw. der nächste Schritt. Mehrfachauswahl: nach
 * jeder Wahl „Noch etwas davon?“, bis „Das war alles“. Unklar: genau einmal nachfragen (nicht bei Fragen ohne
 * Nachfrage, z. B. Vorverträge), danach mit Vermerk weiter. „Rest im Termin“: freundlich stoppen, offene Punkte vermerken.
 * false = keine Frage offen bzw. keine Antwort darauf (der Assistent antwortet).
 */
export async function angabeAntwort(conversationId: string, text: string | null | undefined, knopf: { id: string; option: string } | { rest: true } | null = null, now = new Date()): Promise<boolean> {
  const k = await streckenKontext(conversationId, now);
  if (!k?.termin) return false;
  const st = await angabenStand(conversationId, k.termin.id);
  if (!angabeFrageOffen(st)) return !!knopf; // doppelter bzw. alter Klick
  const { plan, quelle } = angabenPlan(k, st);
  if (knopf && "rest" in knopf) return restImTermin(k, offeneFragen(plan, quelle), now);
  const f = plan.find((x) => x.id === (knopf?.id ?? st.letzteFrage!.id));
  if (!f || f.id !== st.letzteFrage!.id) return !!knopf;
  let r: Auswertung;
  if (f.typ === "mehrfach") {
    const opt = knopf?.option ?? null;
    if (opt === FERTIG.id || (!opt && st.teil.length && mehrfachFertig(text))) r = mehrfachWert(f, st.teil);
    else {
      const e = antwortAuswerten(f, text, opt, now);
      const exklusiv = e.art === "wert" && f.optionen?.some((o) => o.exklusiv && e.opt?.includes(o.id));
      if (e.art === "wert" && opt && !exklusiv) {
        const gewaehlt = [...new Set([...st.teil, ...(e.opt ?? [])])];
        if (mehrfachRest(f, gewaehlt).length) {
          // weitere Wahl möglich: „Noch etwas davon?“ (dieselbe Frage bleibt offen)
          await merke(conversationId, STRECKE.angabeTeil, { appointmentId: k.termin.id, id: f.id, opt: e.opt ?? [] });
          const n = mehrfachWeiterNachricht(f, k.an, gewaehlt);
          await sende(k, n.text, n.buttons, n.liste);
          return true;
        }
        r = mehrfachWert(f, gewaehlt);
      } else if (e.art === "wert" && st.teil.length) r = exklusiv ? mehrfachWert(f, st.teil) : mehrfachWert(f, [...st.teil, ...(e.opt ?? [])]);
      else r = e;
    }
  } else r = antwortAuswerten(f, text, knopf?.option ?? null, now);
  if (r.art === "rest") return restImTermin(k, offeneFragen(plan, quelle), now);
  let vermerk = false;
  if (r.art === "unklar") {
    if (!f.ohneNachfrage && !st.nachgefragt.includes(f.id)) {
      await merke(conversationId, STRECKE.angabeNachfrage, { appointmentId: k.termin.id, id: f.id });
      const n = st.teil.length ? mehrfachWeiterNachricht(f, k.an, st.teil) : frageNachricht(f, k.an, 1);
      await sende(k, nachfrageText(f, k.an), n.buttons, n.liste);
      return true;
    }
    const roh = (text ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
    if (!roh) return false;
    r = { art: "wert", wert: `${roh} (bitte im Termin prüfen)` };
    vermerk = true;
  }
  if (r.art === "wert") await angabeSpeichern(k, f, r, vermerk ? "vermerk" : "wert", vermerk);
  else {
    await leadAngabenSpeichern(k.leadId, (x) => x.offen.push(f.label));
    await merke(conversationId, STRECKE.angabeAntwort, { appointmentId: k.termin.id, id: f.id, art: r.art });
  }
  await abgeleiteteSpeichern(k);
  if (!(await sendeAngabeFrage(k, "Danke!"))) await weiterNachAngaben(k, "Danke!");
  return true;
}

/** „Rest im Termin“: freundlich stoppen, offene Punkte am Lead und im Verlauf vermerken (keine weiteren Fragen). */
async function restImTermin(k: StreckenKontext, offen: GeplanteFrage[], now: Date): Promise<boolean> {
  if (!k.termin) return false;
  const labels = offen.map((f) => f.label);
  await merke(k.conversationId, STRECKE.angabenRest, { appointmentId: k.termin.id, offen: labels });
  // wie „Lieber im Termin“: die übrige Strecke (Komplettcheck, Policen) entfällt
  await merke(k.conversationId, STRECKE.vorbereitungAntwort, { appointmentId: k.termin.id, art: "rest" });
  await leadAngabenSpeichern(k.leadId, (x) => {
    x.offen.push(...labels);
    x.rest = true;
  });
  if (k.leadId && labels.length) {
    const { logLeadHistory } = await import("@/lib/lead-history");
    await logLeadHistory(k.leadId, "notiz", `Im Termin klären: ${labels.join(", ")}`, { customerId: k.customerId, userId: null }).catch(() => null);
  }
  await sende(k, restText(k.an, k.person.nom, bisWann(k.termin.startsAt, now)));
  return true;
}

/**
 * Ops-Aktion buchung_vorbereitung_nachsenden (Ole, 26.11.2026, Kundenfall Schwarzkopf): die Bestätigung ab v5 mit der
 * Frage nach der Vorbereitung einmalig nachschicken. Nur mit kommendem Termin, WhatsApp-Chat ohne Abmeldung, noch keiner
 * Frage bzw. Antwort zur Vorbereitung für diesen Termin und, bei geschlossenem Fenster, freigegebener v5 (sonst nichts
 * senden). Im offenen Fenster geht dieselbe Frage als Freitext mit Knöpfen (sendVorbereitungNachfrage), ohne die ganze
 * Bestätigung zu wiederholen.
 */
export async function vorbereitungNachsenden(
  leadId: string,
  o: { vorschau?: boolean } = {},
  now = new Date(),
): Promise<{ gesendet: boolean; vorschau: boolean; wuerdeSenden: boolean; info: string; termin?: string; vorlage?: string | null; fensterOffen?: boolean }> {
  const nein = (info: string) => ({ gesendet: false, vorschau: !!o.vorschau, wuerdeSenden: false, info });
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true, customerId: true, name: true, phone: true } });
  if (!lead) return nein("Lead nicht gefunden.");
  const termin = await prisma.appointment.findFirst({
    where: { leadId, status: "booked", startsAt: { gt: new Date(now.getTime() + 2 * HOUR) } },
    orderBy: { startsAt: "asc" },
    select: { id: true, startsAt: true, mode: true, meetUrl: true, ort: true, conversationId: true },
  });
  if (!termin) return nein("Kein kommender Termin (mindestens 2 Std. entfernt).");
  const conv = termin.conversationId
    ? await prisma.conversation.findUnique({ where: { id: termin.conversationId }, select: { id: true, contactPhone: true, contactName: true, windowExpiresAt: true, optedOutAt: true } })
    : await prisma.conversation.findFirst({ where: { leadId, customerId: lead.customerId }, orderBy: { lastMessageAt: "desc" }, select: { id: true, contactPhone: true, contactName: true, windowExpiresAt: true, optedOutAt: true } });
  if (!conv) return nein("Kein WhatsApp-Chat zum Lead.");
  if (conv.optedOutAt) return nein("Lead hat „Stopp“ geschrieben.");
  const v = await vorbereitungStand(conv.id, termin.id);
  if (v.frageAt || v.nachfrageAt || v.antwort) return nein("Frage nach der Vorbereitung ging für diesen Termin schon raus (einmalig).");
  const fensterOffen = !!conv.windowExpiresAt && conv.windowExpiresAt.getTime() > now.getTime();
  const wann = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(termin.startsAt);
  let vorlage: string | null = null;
  // Fenster zu (Ole, 26.11.2026): Der Lead hat die Bestätigung schon. Bevorzugt die kurze Nachfrage (booking_prep_nudge,
  // „kurze Frage zu Ihrem Termin am …“) statt die ganze Bestätigung zu wiederholen; nur ohne freigegebene Nachfrage die
  // Bestätigung ab v5.
  let nurFrage = fensterOffen;
  if (!fensterOffen) {
    const { ansprechpartner } = await import("@/lib/lead-anrede");
    const who = await ansprechpartner({ customerId: lead.customerId, leadId, phone: conv.contactPhone, name: lead.name });
    const { pickTemplate, templateVersionOfName } = await import("@/lib/whatsapp/templates");
    const nudge = await pickTemplate(lead.customerId, "booking_prep_nudge", who.kontakt, { kiErst: false });
    if (nudge) {
      vorlage = nudge.tpl.name;
      nurFrage = true;
    } else {
      const pick = await pickTemplate(lead.customerId, "booking_confirmation", who.kontakt, { kiErst: false });
      if (!pick || templateVersionOfName(pick.tpl.name) < 5) return { ...nein(`Weder Nachfrage (booking_prep_nudge) noch Bestätigung mit der Frage (ab v5) sind freigegeben (zuletzt freigegebene Bestätigung: ${pick?.tpl.name ?? "keine"}). Nichts gesendet.`), fensterOffen, termin: wann };
      vorlage = pick.tpl.name;
    }
  }
  const info = fensterOffen
    ? `Fenster offen: Frage zur Vorbereitung als Freitext mit Knöpfen (Termin ${wann}).`
    : nurFrage
      ? `Nachfrage ${vorlage} mit Frage nach der Vorbereitung (Termin ${wann}).`
      : `Bestätigung ${vorlage} mit Frage nach der Vorbereitung (Termin ${wann}).`;
  if (o.vorschau) return { gesendet: false, vorschau: true, wuerdeSenden: true, info: `Vorschau: ${info}`, termin: wann, vorlage, fensterOffen };
  if (nurFrage) {
    const { sendVorbereitungNachfrage } = await import("@/lib/whatsapp/reminders");
    await sendVorbereitungNachfrage({ customerId: lead.customerId, to: conv.contactPhone, name: lead.name, leadId, startsAt: termin.startsAt });
    await vorbereitungGefragt(conv.id, { appointmentId: termin.id, leadId, startsAt: termin.startsAt }, "ops");
    // Gleicher Wortlaut wie die Nachfrage am Folgetag: nicht ein zweites Mal schicken
    await vorbereitungGefragt(conv.id, { appointmentId: termin.id, leadId, startsAt: termin.startsAt }, "nachfrage");
  } else {
    const { sendBookingConfirmation } = await import("@/lib/whatsapp/reminders");
    await sendBookingConfirmation({ customerId: lead.customerId, to: conv.contactPhone, name: lead.name, leadId, startsAt: termin.startsAt, mode: termin.mode, meetUrl: termin.meetUrl, ort: termin.ort, appointmentId: termin.id });
  }
  return { gesendet: true, vorschau: false, wuerdeSenden: true, info, termin: wann, vorlage, fensterOffen };
}
