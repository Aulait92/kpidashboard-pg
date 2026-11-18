// Ablauf der Termin-Strecke nach der Buchung (Ole, 17.11.2026; Reihenfolge P2), Texte in lib/whatsapp/gespraech.ts:
//   Buchungsnachricht kurz (Zeit fest im Kalender des Vermittlers, Link; die Einladung an den Lead ist ausstehend)
//     → nur Tierkranken (TKV, Ole 18.11.2026): feste Tierfragen, eine pro Nachricht, nur was fehlt (Gesundheit zuerst,
//       lib/whatsapp/tier-fragen.ts; Antworten ohne Assistent, tierAntwort), danach der Komplettcheck
//     → Komplettcheck [Ja, gern] [Nein, danke] (Kennzeichen am Termin); bei Ja 45 Min.: frei → verlängert, belegt →
//       zwei andere Zeiten mit 45 Min. [Zeit 1] [Zeit 2] [Zeit behalten] (lib/komplettcheck-dauer.ts)
//     → fehlende Angaben fürs Angebot (Rechner-Tabelle), eine Frage pro Nachricht (Assistent, bot.ts)
//     → nur bei „Ja, gern“: Frage nach bestehenden Verträgen → Antwort (KI-Extraktion, tolerant) am Lead
//     → Policen-Bitte (nur Sachprodukte, genau einmal) [Schicke ich gleich] [Nicht zur Hand]
//     → Schluss: Bereitlegen in einer Zeile, „Zum Schluss: Die Einladung … geht an … Stimmt die Adresse?“
//       [Ja, stimmt] [Andere Adresse] bzw. ohne Adresse die freiwillige Frage danach.
// Die Einladung an den Lead geht genau einmal, sobald Adresse und Komplettcheck feststehen (lib/calendar/einladung.ts),
// ohne Antwort spätestens nach 15 Min. (kurzfristig 5 Min., spätestens 60 Min. vor Beginn).
// Antwortet der Lead nicht, wird nicht nachgehakt, aber nach einer Stunde der nächste Schritt geschickt
// (runStreckeAbschliessen, WhatsApp-Cron; nur im 24-h-Fenster, Mo bis Sa 8 bis 20 Uhr): Tierfrage → Komplettcheck, Komplettcheck → erste
// Angebotsfrage, Zeitangebot → Zeit behalten, Vertragsfrage → Policen-Bitte (die Verträge entfallen, die Bitte nicht),
// Policen-Bitte → Schluss. Solange Angebotsfragen offen sind, nie der Schluss.
// Policen-Erinnerungen (höchstens 2): 24 Std. nach der Buchung (nur bei mehr als 2 Tagen bis zum Termin,
// runPolicenErinnerung) und eine Zeile in der Vortags-Erinnerung (policenVortagSatzFuer, lib/whatsapp/reminders.ts);
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
import { ansprechpartner } from "@/lib/lead-anrede";
import { redactHealthText, splitHealthAnswers } from "@/lib/gesundheitsdaten";
import { folgefragen, folgefrageText, spartenDesLeads, type Folgefrage } from "@/lib/preise/rechner-angaben";
import {
  abschlussEinleitung,
  abschlussText,
  adresseUnvollstaendig,
  andereAdresseFrage,
  bereitlegenFuerLead,
  EINGETRAGEN_KNOEPFE,
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
  VERTRAEGE_BEREITLEGEN_RE,
  vermittlerName,
  vertragsFrage,
  zeitKurz,
  zeitLang,
  zusageDank,
  type Knopf,
  type VermittlerName,
} from "@/lib/whatsapp/gespraech";
import { istTierStrecke, offeneTierFragen, tierAntwortAuswerten, tierFrage, type TierFrageKey } from "@/lib/whatsapp/tier-fragen";
import { mergeQualificationData } from "@/lib/whatsapp/qualification";
import { normalisiereVertraege, sagtKeine, VORVERTRAEGE_SCHEMA, vertraegeAusText, type Vorvertraege, type Vorvertrag } from "@/lib/whatsapp/vorvertraege";

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
export function policenErinnerungText(an: Ansprache, person: { nom: string }, police: string | null): string {
  const was = police ? a(an, `deine ${police}`, `Ihre ${police}`) : a(an, "deine Policen für Haftpflicht, Hausrat oder Kfz", "Ihre Policen für Haftpflicht, Hausrat oder Kfz");
  return a(
    an,
    `Kurze Erinnerung: Hast du ${was} schon zur Hand? Einfach abfotografieren und hier schicken, dann kann ${person.nom} alles vorbereiten.\n\nKeine Nachrichten mehr? Antworte einfach STOP.`,
    `Kurze Erinnerung: Haben Sie ${was} schon zur Hand? Einfach abfotografieren und hier schicken, dann kann ${person.nom} alles vorbereiten.\n\nKeine Nachrichten mehr? Antworten Sie einfach STOP.`,
  );
}

/** Zeile im Nutzensatz der Vortags-Erinnerung (zweite und letzte Policen-Erinnerung). */
export function policenVortagSatz(an: Ansprache): string {
  return a(an, "Falls noch nicht geschehen: Schick gern noch kurz deine Policen hier in den Chat.", "Falls noch nicht geschehen: Schicken Sie gern noch kurz Ihre Policen hier in den Chat.");
}

/**
 * Policen-Bitte der Strecke (Ole, 17.11.2026 spät; Text und Einwilligung aus dem Policen-Modul, lib/policen/bitte.ts
 * über policenBitteFuerChat): jeder Lead genau einmal. Erst die Bitte (Text), dann die Einwilligung als eigene
 * interaktive Nachricht („Einverstanden“ / „Lieber nicht“, Rechtsprüfung A1), die das Policen-Modul beantwortet.
 * null = schon gebeten, Funktion aus (Notschalter, Ablage nicht eingerichtet), Minderjährige, Lead sagt „keine
 * Versicherungen“ bzw. gelöschter Lead.
 */
async function policenBitteSchritt(k: StreckenKontext, einleitung: string | null): Promise<Schritt | null> {
  if (!k.leadId) return null;
  const lead = await prisma.lead.findUnique({ where: { id: k.leadId }, select: { erasedAt: true, vorvertraege: true } });
  if (!lead || lead.erasedAt) return null;
  const vv = lead.vorvertraege as { keine?: unknown; liste?: unknown } | null;
  if (vv && vv.keine === true && !(Array.isArray(vv.liste) && vv.liste.length)) return null;
  // Tierkranken ohne Komplettcheck: die Bitte nennt Haftpflicht, Hausrat und Kfz, passt also nicht (Ole, 18.11.2026)
  // Policen-Strecke v2 (POLICEN_FLOW, lib/policen/flow): Chat-Nachricht mit Formular statt Bitte und Einwilligung; die
  // Nachricht nennt keine Sparten, darum auch für Tierkranken (Formular ohne Gesundheitssatz). Gesendet wird in
  // sendeSchritt bzw. bot.ts (flow = true); text ist nur die Einleitung für den Rückfall.
  const flow = await import("@/lib/policen/flow/server").then((m) => m.policenFlowMoeglich(k.conversationId)).catch(() => false);
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
  STRECKE.policenBitte,
  STRECKE.policenAntwort,
  STRECKE.policenErinnerung,
  STRECKE.abschluss,
  STRECKE.tierFrage,
  STRECKE.tierAntwort,
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
  };
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

async function sende(k: StreckenKontext, body: string, buttons?: Knopf[] | null): Promise<void> {
  const { sendWhatsAppMessage } = await import("@/lib/whatsapp/gateway");
  await sendWhatsAppMessage({ customerId: k.customerId, to: k.phone, body, sentBy: "bot", buttons: buttons ?? null });
}

/**
 * Komplettcheck-Frage mit Knöpfen (Text und Knöpfe; der Aufrufer sendet und setzt den Merker). Mit prefix entfällt das
 * „Danke!“ am Anfang der Frage.
 */
export function komplettcheckNachricht(k: Pick<StreckenKontext, "an" | "person" | "familie">, prefix?: string | null): { text: string; buttons: Knopf[] } {
  const frage = komplettcheckFrage(k.an, k.person, k.familie);
  return { text: prefix ? `${prefix} ${frage.replace(/^Danke!\s*/, "")}` : frage, buttons: KOMPLETTCHECK_KNOEPFE };
}

/** Komplettcheck-Frage senden und merken (einmal je Termin). */
export async function sendeKomplettcheck(k: StreckenKontext, prefix?: string | null): Promise<boolean> {
  if (!k.termin) return false;
  const stand = await streckenStand(k.conversationId, k.termin.id);
  if (stand.komplettFrageAt || stand.abschlussAt) return false;
  const m = komplettcheckNachricht(k, prefix);
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
  const frage = folgefrageText(offen[0], k.an, k.person.nom, !stand.angebotsfragenAt);
  if (!stand.angebotsfragenAt) await merke(k.conversationId, STRECKE.angebotsfragen, { appointmentId: k.termin.id });
  await sende(k, [prefix, frage].filter(Boolean).join(" "), knoepfeFuerText(frage, offen));
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
): Promise<{ text: string; buttons: Knopf[] | null; merker: string; daten?: Record<string, unknown> }> {
  if (k.termin && istTierStrecke(k.source)) {
    const s = await streckenStand(k.conversationId, k.termin.id);
    const f = naechsteTierFrage(k, s.tierBeantwortet);
    if (f && !s.komplettFrageAt && !s.abschlussAt) return { text: f.text, buttons: f.buttons, merker: STRECKE.tierFrage, daten: { key: f.key } };
  }
  const m = komplettcheckNachricht(k);
  return { text: m.text, buttons: m.buttons, merker: STRECKE.komplettFrage };
}

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
  const r = tierAntwortAuswerten(key, text, knopf?.wert ?? null, quelle);
  if (!r) return false;
  const neu = mergeQualificationData(k.angaben, r.angaben);
  await prisma.conversation.update({ where: { id: conversationId }, data: { qualificationData: (neu ?? undefined) as Prisma.InputJsonValue | undefined } });
  k.angaben = neu;
  await merke(conversationId, STRECKE.tierAntwort, { appointmentId: k.termin.id, keys: r.beantwortet });
  const f = naechsteTierFrage(k, [...stand.tierBeantwortet, ...r.beantwortet]);
  if (f) {
    await merke(conversationId, STRECKE.tierFrage, { appointmentId: k.termin.id, key: f.key });
    await sende(k, /^Danke!/.test(f.text) ? f.text : `Danke! ${f.text}`, f.buttons);
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
  o: { einleitung?: string | null; schlussEinleitung?: string | null; vertraegeUeberspringen?: boolean; policenUeberspringen?: boolean } = {},
): Promise<Schritt | null> {
  if (!k.termin) return null;
  const stand = await streckenStand(k.conversationId, k.termin.id);
  if (stand.abschlussAt) return null;
  if (k.termin.komplettcheck === true && !stand.vertragsfrageAt) return { text: vertragsFrage(k.an, k.familie, o.einleitung ?? "Danke!"), buttons: null, merker: STRECKE.vertragsfrage };
  if (stand.vertragsfrageAt && !stand.vorvertraegeErfasst && !o.vertraegeUeberspringen) return null;
  if (!stand.policenBitteAt) {
    const bitte = await policenBitteSchritt(k, o.einleitung ?? null).catch(() => null);
    if (bitte) return bitte;
  }
  if (policenBitteOffen(stand) && !o.policenUeberspringen) return null;
  const m = await abschlussNachricht(k, o.schlussEinleitung ?? null);
  return { text: m.text, buttons: m.buttons, merker: STRECKE.abschluss, daten: { mitEmail: !!k.email }, nachMerker: k.email ? null : STRECKE.emailFrage };
}

/** Schritt senden und merken. */
export async function sendeSchritt(k: StreckenKontext, s: Schritt): Promise<void> {
  if (!k.termin) return;
  await merkeSchritt(k.conversationId, k.termin.id, s);
  if (s.flow) {
    await import("@/lib/policen/flow/server").then((m) => m.sendeFlowNachricht(k.conversationId, "bitte"));
    return;
  }
  await sende(k, s.text, s.buttons);
  if (s.folge) await sendeFolge(k, s.folge);
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

/** Weiter nach dem Komplettcheck: erste offene Angebotsfrage, sonst der nächste Schritt. */
async function weiterNachKomplettcheck(k: StreckenKontext, prefix: string, schlussEinleitung: string | null): Promise<void> {
  if (await sendeAngebotsfrage(k, prefix)) return;
  const s = await naechsterSchritt(k, { einleitung: prefix, schlussEinleitung });
  if (s) await sendeSchritt(k, s);
}

/** Zwei freie Zeiten mit 45 Min. (früheste und früheste an einem anderen Tag), null = keine. */
async function langeZeiten(k: StreckenKontext, now: Date): Promise<[string, string] | null> {
  try {
    const { suggestSlots } = await import("@/lib/calendar");
    const { pickTwoSlots } = await import("@/lib/whatsapp/termin-vorschlaege");
    const frei = (await suggestSlots(k.customerId, LANG_MIN, 8, "lead", 10, k.leadId)).filter((s) => new Date(s.start).getTime() > now.getTime() + HOUR);
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
  await eingetragenFragen(k, now);
  return true;
}

/**
 * Nach „Die Einladung ist unterwegs“ (Ole, 18.11.2026): „Konnten Sie den Termin in Ihrem Kalender eintragen?“ mit
 * Knöpfen [Ja, eingetragen] [Nein, bitte nochmal]. Einmal je Termin, nur im offenen 24-h-Fenster (Knöpfe gehen nur dort).
 */
async function eingetragenFragen(k: StreckenKontext, now: Date): Promise<void> {
  if (!k.termin) return;
  const conv = await prisma.conversation.findUnique({ where: { id: k.conversationId }, select: { windowExpiresAt: true } });
  if (!conv?.windowExpiresAt || conv.windowExpiresAt <= now) return;
  const schon = await prisma.message.findFirst({ where: { conversationId: k.conversationId, direction: "internal", kind: STRECKE.eingetragenFrage, body: { contains: k.termin.id } }, select: { id: true } });
  if (schon) return;
  await merke(k.conversationId, STRECKE.eingetragenFrage, { appointmentId: k.termin.id });
  await sende(k, eingetragenFrage(k.an), EINGETRAGEN_KNOEPFE);
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
  await eingetragenFragen(k, now);
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


/** Antwort auf die Vertragsfrage: auswerten, am Lead speichern, dann die Policen-Bitte bzw. der Schluss. true = erledigt. */
export async function vertraegeAntwort(conversationId: string, text: string, now = new Date()): Promise<boolean> {
  const k = await streckenKontext(conversationId, now);
  if (!k?.termin) return false;
  const { liste, keine } = await extrahiereVertraege(text);
  const wert: Vorvertraege = { at: now.toISOString(), liste, ...(keine ? { keine: true } : {}) };
  if (k.leadId) await prisma.lead.update({ where: { id: k.leadId }, data: { vorvertraege: wert as unknown as Prisma.InputJsonValue } });
  await merke(conversationId, STRECKE.vorvertraege, { appointmentId: k.termin.id, anzahl: liste.length, keine });
  const s = await naechsterSchritt(k, { einleitung: "Danke!", schlussEinleitung: abschlussEinleitung(k.an, k.person, "vertraege") });
  if (s) await sendeSchritt(k, s);
  return true;
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
      kind: { in: [STRECKE.tierFrage, STRECKE.komplettFrage, STRECKE.langAngebot, STRECKE.vertragsfrage, STRECKE.policenBitte] },
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
      // offen ist der jüngste Schritt
      const schritt: { art: "policen" | "vertraege" | "lang" | "komplett" | "tier"; seit: Date } | null = tierFrageOffen(stand)
        ? { art: "tier", seit: stand.tierFrageLetzte!.at }
        : policenBitteOffen(stand)
        ? { art: "policen", seit: stand.policenBitteAt! }
        : stand.vertragsfrageAt && !stand.vorvertraegeErfasst
          ? { art: "vertraege", seit: stand.vertragsfrageAt }
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
      await sende(k, policenErinnerungText(k.an, k.person, stand.policenPolice));
      gesendet++;
    } catch (err) {
      console.error("[policen erinnerung]", err instanceof Error ? err.message.slice(0, 160) : err);
    }
  }
  return { gesendet: gesendet + flow.gesendet };
}

/**
 * Zeile für den Nutzensatz der Vortags-Erinnerung (lib/whatsapp/reminders.ts), wenn noch keine Police da ist; zählt als
 * Policen-Erinnerung (merken = true beim Versand). null = keine Zeile.
 */
export async function policenVortagSatzFuer(appt: { id: string; conversationId: string | null; leadId: string | null }, an: Ansprache, o: { merken: boolean } = { merken: false }): Promise<string | null> {
  if (!appt.conversationId) return null;
  const stand = await streckenStand(appt.conversationId, appt.id);
  // v2: Erinnerung 2 ist eine eigene Nachricht am Vortag um 18 Uhr (lib/policen/flow/server.ts)
  if (stand.policenFlow) return null;
  if (!(await policenErinnernErlaubt(appt.conversationId, appt.leadId, stand))) return null;
  if (o.merken) await merke(appt.conversationId, STRECKE.policenErinnerung, { appointmentId: appt.id, art: "vortag" });
  return policenVortagSatz(an);
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
