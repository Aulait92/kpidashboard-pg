// Ablauf der Termin-Strecke nach der Buchung (Ole, 17.11.2026; Reihenfolge P2), Texte in lib/whatsapp/gespraech.ts:
//   Buchungsnachricht (Termin sofort reserviert)
//     → nur ohne bekannte E-Mail-Adresse: Frage nach der Adresse; kommt sie, geht die Einladung nach (emailAntwort)
//     → Komplettcheck [Ja, gern] [Nein, danke] (Kennzeichen am Termin, bei Ja 45 Min.)
//     → fehlende Angaben fürs Angebot (Rechner-Tabelle), eine Frage pro Nachricht (Assistent, bot.ts)
//     → nur bei „Ja, gern“: Frage nach bestehenden Verträgen → Antwort (KI-Extraktion, tolerant) am Lead, Policen-Einladung
//     → Abschluss: Bereitlegen (höchstens 3 Punkte) und Kalenderfrage [Ja] [Mache ich gleich] → zugesagt.
// Die Daten fürs Hauptangebot kommen vor den Freitext-Schritten (Verträge, Policen); der Ja/Nein-Knopf bleibt vorne.
// Antwortet der Lead nicht, wird nicht nachgehakt, aber nach einer Stunde der nächste Schritt geschickt
// (runStreckeAbschliessen, WhatsApp-Cron; nur im 24-h-Fenster, Mo bis Sa 8 bis 20 Uhr): E-Mail-Frage → Komplettcheck,
// Komplettcheck → erste Angebotsfrage (sonst Abschluss), Vertragsfrage → Abschluss (die Verträge entfallen). Solange
// Angebotsfragen offen sind, nie der Abschluss.
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
  bereitlegenListe,
  einladungUnterwegs,
  istFamilie,
  KALENDER_KNOEPFE,
  KOMPLETTCHECK_KNOEPFE,
  komplettcheckFrage,
  knoepfeFuerText,
  VERTRAEGE_BEREITLEGEN_RE,
  vermittlerName,
  vertragsFrage,
  zeitLang,
  zusageDank,
  type Knopf,
  type VermittlerName,
} from "@/lib/whatsapp/gespraech";
import { normalisiereVertraege, sagtKeine, VORVERTRAEGE_SCHEMA, vertraegeAusText, type Vorvertraege, type Vorvertrag } from "@/lib/whatsapp/vorvertraege";

/** Merker (interne Nachrichten) der Strecke. */
export const STRECKE = {
  vorschlag: "termin_vorschlag",
  /** Frage nach der E-Mail-Adresse (Termin ohne bekannte Adresse reserviert) */
  emailFrage: "email_frage",
  komplettFrage: "komplettcheck_frage",
  komplett: "komplettcheck",
  vertragsfrage: "vertragsfrage",
  vorvertraege: "vorvertraege",
  /** Erste Angebotsfrage von der App gestellt (nach dem Komplettcheck bzw. als Rückfall) */
  angebotsfragen: "angebotsfragen",
  abschluss: "strecke_abschluss",
} as const;

const HOUR = 60 * 60 * 1000;

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
  komplettFrageAt: Date | null;
  komplettBeantwortet: boolean;
  angebotsfragenAt: Date | null;
  vertragsfrageAt: Date | null;
  vorvertraegeErfasst: boolean;
  abschlussAt: Date | null;
};

const STAND_KINDS: string[] = [STRECKE.emailFrage, STRECKE.komplettFrage, STRECKE.komplett, STRECKE.angebotsfragen, STRECKE.vertragsfrage, STRECKE.vorvertraege, STRECKE.abschluss];

/** Stand der Strecke für einen Termin (aus den Merkern). */
export async function streckenStand(conversationId: string, appointmentId: string): Promise<StreckenStand> {
  const rows = await prisma.message.findMany({
    where: { conversationId, direction: "internal", kind: { in: STAND_KINDS }, body: { contains: appointmentId } },
    orderBy: { createdAt: "asc" },
    select: { kind: true, createdAt: true },
  });
  const at = (k: string) => rows.find((r) => r.kind === k)?.createdAt ?? null;
  return {
    emailFrageAt: at(STRECKE.emailFrage),
    komplettFrageAt: at(STRECKE.komplettFrage),
    komplettBeantwortet: !!at(STRECKE.komplett),
    angebotsfragenAt: at(STRECKE.angebotsfragen),
    vertragsfrageAt: at(STRECKE.vertragsfrage),
    vorvertraegeErfasst: !!at(STRECKE.vorvertraege),
    abschlussAt: at(STRECKE.abschluss),
  };
}

/** Komplettcheck erledigt: beantwortet oder (Rückfall) übersprungen, weil die Angebotsfragen schon laufen. */
export function komplettcheckErledigt(s: StreckenStand): boolean {
  return s.komplettBeantwortet || !!s.angebotsfragenAt;
}

/** Ist die Frage nach der E-Mail-Adresse offen (gestellt, Komplettcheck noch nicht)? */
export function emailFrageOffen(s: StreckenStand): boolean {
  return !!s.emailFrageAt && !s.komplettFrageAt && !s.abschlussAt;
}

async function sende(k: StreckenKontext, body: string, buttons?: Knopf[] | null): Promise<void> {
  const { sendWhatsAppMessage } = await import("@/lib/whatsapp/gateway");
  await sendWhatsAppMessage({ customerId: k.customerId, to: k.phone, body, sentBy: "bot", buttons: buttons ?? null });
}

/**
 * Komplettcheck-Frage mit Knöpfen (Text und Knöpfe; der Aufrufer sendet und setzt den Merker). Mit prefix (z. B. „Danke!
 * Die Einladung … ist unterwegs.“) entfällt das „Danke!“ am Anfang der Frage.
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

/**
 * Nachricht nach der letzten Angebotsfrage (für bot.ts, ohne Senden): bei Komplettcheck „Ja“ die Vertragsfrage (falls
 * noch nicht gestellt), sonst der Abschluss. merker = Art der Nachricht (der Aufrufer setzt ihn nach dem Senden).
 */
export async function nachAngebotsfragen(k: StreckenKontext): Promise<{ text: string; buttons: Knopf[] | null; merker: string; vorher?: Vorher | null } | null> {
  if (!k.termin) return null;
  const stand = await streckenStand(k.conversationId, k.termin.id);
  if (stand.abschlussAt) return null;
  if (k.termin.komplettcheck === true && !stand.vertragsfrageAt) return { text: vertragsFrage(k.an, k.familie, "Danke!"), buttons: null, merker: STRECKE.vertragsfrage };
  if (stand.vertragsfrageAt && !stand.vorvertraegeErfasst) return null;
  const m = await abschlussNachricht(k, "direkt");
  return { ...m, merker: STRECKE.abschluss };
}

/**
 * Policen vorab (lib/policen): Wurde der Lead eingeladen, Policen zu schicken, heißt der Punkt „übrige Policen, falls
 * nicht geschickt“ (nur bei Komplettcheck „Ja“ steht er überhaupt in der Liste).
 */
async function mitPolicenHinweis(k: StreckenKontext, liste: string[]): Promise<string[]> {
  if (!liste.some((x) => VERTRAEGE_BEREITLEGEN_RE.test(x))) return liste;
  const eingeladen = (await prisma.message.count({ where: { conversationId: k.conversationId, direction: "outbound", body: { contains: "Fotos oder PDFs" } } })) > 0;
  if (!eingeladen) return liste;
  const ersatz = a(k.an, "deine übrigen Policen, falls du sie nicht geschickt hast", "Ihre übrigen Policen, falls Sie sie nicht geschickt haben");
  return liste.map((x) => (VERTRAEGE_BEREITLEGEN_RE.test(x) ? ersatz : x));
}

type AbschlussArt = "komplett_nein" | "vertraege" | "ohne_antwort" | "direkt";

/** Eigene Nachricht vor dem Abschluss (Policen-Einladung mit Einwilligungsknöpfen). */
export type Vorher = { text: string; buttons: Knopf[] | null };

/**
 * Abschluss-Nachricht (Bereitlegen-Liste, Policen-Bitte, Einladung, Kalenderfrage), ohne Senden. Die Policen-Bitte
 * bekommt jeder Lead genau einmal (Ole, 17.11.2026, P2): kam sie noch nicht (Komplettcheck „Nein“, keine Antwort), steht
 * sie hier, bei Komplettcheck „Ja“ für alle Verträge, sonst eng für die angefragte Sparte; braucht sie
 * Einwilligungsknöpfe, geht sie als eigene Nachricht vorher (vorher).
 */
export async function abschlussNachricht(k: StreckenKontext, art: AbschlussArt): Promise<{ text: string; buttons: Knopf[] | null; vorher: Vorher | null }> {
  const quelle = { formular: k.formular, angaben: k.angaben };
  const sparten = spartenDesLeads(k.source, quelle);
  const bitte = await import("@/lib/policen/assistent")
    .then((m) => m.policenBitteFuerStrecke({ conversationId: k.conversationId, an: k.an, person: k.person, voll: k.termin?.komplettcheck === true }))
    .catch(() => null);
  const text = abschlussText({
    policen: bitte?.kurz ?? null,
    an: k.an,
    person: k.person,
    bereitlegen: await mitPolicenHinweis(k, bereitlegenListe(k.source, sparten, k.an, { quelle, komplettcheck: k.termin?.komplettcheck === true })),
    email: k.email,
    nachFragen: true,
    einleitung: art === "direkt" ? null : abschlussEinleitung(k.an, k.person, art),
  });
  return { text, buttons: k.termin?.confirmedAt ? null : KALENDER_KNOEPFE, vorher: bitte?.einladung ?? null };
}

/** Abschluss mit Bereitlegen-Liste und Kalenderfrage senden (einmal je Termin). */
export async function sendeAbschluss(k: StreckenKontext, art: AbschlussArt): Promise<boolean> {
  if (!k.termin) return false;
  const stand = await streckenStand(k.conversationId, k.termin.id);
  if (stand.abschlussAt) return false;
  const m = await abschlussNachricht(k, art);
  await merke(k.conversationId, STRECKE.abschluss, { appointmentId: k.termin.id, art });
  if (m.vorher) await sende(k, m.vorher.text, m.vorher.buttons);
  await sende(k, m.text, m.buttons);
  return true;
}

/**
 * Antwort auf den Komplettcheck (Knopf oder vom Assistenten erkannt): Kennzeichen am Termin, dann die nächste offene
 * Angebotsfrage; sind keine offen, bei ja die Vertragsfrage, bei nein der Abschluss. true = erledigt (der Assistent
 * schreibt nichts dazu).
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
  // Komplettcheck braucht Zeit (Ole, 17.11.2026): Termin auf 45 Min. verlängern, sonst Hinweis an den Vermittler
  if (ja) await import("@/lib/komplettcheck-dauer").then((m) => m.komplettcheckVerlaengern(k.termin!.id, { now }));
  if (stand.abschlussAt) return true;
  // Erst die Angaben fürs Hauptangebot (P2), dann bei ja die Verträge
  if (await sendeAngebotsfrage(k, ja ? "Super!" : "Alles klar.")) return true;
  if (ja) {
    if (!stand.vertragsfrageAt) {
      await merke(conversationId, STRECKE.vertragsfrage, { appointmentId: k.termin.id });
      await sende(k, vertragsFrage(k.an, k.familie));
    }
    return true;
  }
  await sendeAbschluss(k, "komplett_nein");
  return true;
}

/**
 * Antwort auf die Frage nach der E-Mail-Adresse (Termin schon reserviert): enthält die Nachricht eine Adresse, wird sie
 * übernommen, die Einladung geht nach, und gleich folgt der Komplettcheck. false = keine Adresse erkannt (Assistent).
 */
export async function emailAntwort(conversationId: string, text: string, now = new Date()): Promise<boolean> {
  const email = emailAus(text);
  if (!email) return false;
  await emailUebernehmen(conversationId, email, now);
  const k = await streckenKontext(conversationId, now);
  if (!k?.termin) return false;
  k.email = email;
  if (!(await sendeKomplettcheck(k, einladungUnterwegs(email)))) await sende(k, einladungUnterwegs(email));
  return true;
}

/** Erste E-Mail-Adresse in einem Text (klein geschrieben), sonst null. */
export function emailAus(text: string | null | undefined): string | null {
  const m = (text ?? "").match(/[^\s@<>(),;:"']+@[^\s@<>(),;:"']+\.[a-z]{2,}/i);
  return m ? m[0].replace(/[.]+$/, "").toLowerCase() : null;
}

/**
 * Neue E-Mail-Adresse übernehmen (Chat, Lead; die bisherige bleibt als weitere Adresse) und die Einladung zum
 * kommenden Termin (neu) schicken. true = Einladung gesendet.
 */
export async function emailUebernehmen(conversationId: string, email: string, now = new Date()): Promise<boolean> {
  const conv = await prisma.conversation.update({ where: { id: conversationId }, data: { contactEmail: email }, select: { leadId: true } });
  if (conv.leadId) {
    const bisher = await prisma.lead.findUnique({ where: { id: conv.leadId }, select: { email: true, weitereEmails: true } }).catch(() => null);
    const { mitNeuerEmail } = await import("@/lib/lead-emails");
    await prisma.lead.update({ where: { id: conv.leadId }, data: mitNeuerEmail({ alt: bisher?.email, weitere: bisher?.weitereEmails, neu: email }) }).catch(() => null);
  }
  const appt = await prisma.appointment.findFirst({ where: { conversationId, status: "booked", startsAt: { gt: now } }, orderBy: { startsAt: "asc" }, select: { id: true } });
  const { sendLeadEmail } = await import("@/lib/calendar/lead-email");
  const r = appt ? await sendLeadEmail(appt.id, "booked").catch(() => ({ sent: false })) : { sent: false };
  await merke(conversationId, "email_updated", { resent: r.sent });
  return r.sent;
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
        "Du liest die Antwort eines Interessenten auf die Frage, welche Versicherungen er schon hat. Trage jede genannte Versicherung mit Sparte ein, die Gesellschaft und für wen nur, wenn genannt. Sei tolerant bei Abkürzungen und Tippfehlern (z. B. „PHV“ = Haftpflicht, „BU“ = Berufsunfähigkeit, „Auto“ = Kfz). Nichts erfinden. Keine Gesundheitsangaben, Beträge oder Tarifdetails.",
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

/** Antwort auf die Vertragsfrage: auswerten, am Lead speichern, Abschluss senden. true = erledigt. */
export async function vertraegeAntwort(conversationId: string, text: string, now = new Date()): Promise<boolean> {
  const k = await streckenKontext(conversationId, now);
  if (!k?.termin) return false;
  const { liste, keine } = await extrahiereVertraege(text);
  const wert: Vorvertraege = { at: now.toISOString(), liste, ...(keine ? { keine: true } : {}) };
  if (k.leadId) await prisma.lead.update({ where: { id: k.leadId }, data: { vorvertraege: wert as unknown as Prisma.InputJsonValue } });
  await merke(conversationId, STRECKE.vorvertraege, { appointmentId: k.termin.id, anzahl: liste.length, keine });
  // Policen vorab (Ole, 17.11.2026, lib/policen): Einladung als eigene Nachricht vor dem Abschluss
  const policen = keine
    ? null
    : await import("@/lib/policen/assistent")
        .then((m) => m.einladungNachVertraegen({ conversationId, an: k.an, person: k.person, vertraegeText: text, anzahl: liste.length }))
        .catch(() => null);
  if (policen) await sende(k, policen.text, policen.buttons);
  await sendeAbschluss(k, "vertraege");
  return true;
}

/** Kalenderfrage per Knopf: „Ja“ bzw. „Mache ich gleich“ → zugesagt, kurze Antwort. */
export async function kalenderAntwort(conversationId: string, art: "ja" | "gleich", now = new Date()): Promise<boolean> {
  const k = await streckenKontext(conversationId, now);
  if (!k?.termin) return false;
  if (!k.termin.confirmedAt) {
    await prisma.appointment.update({ where: { id: k.termin.id }, data: { confirmedAt: now } });
    await prisma.message.create({ data: { conversationId, direction: "internal", kind: "appointment_confirmed", body: JSON.stringify({ appointmentId: k.termin.id, via: `kalender_${art}` }), sentBy: "system" } });
  }
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
 *   E-Mail-Frage → Komplettcheck
 *   Komplettcheck → erste offene Angebotsfrage, sind keine offen, der Abschluss
 *   Vertragsfrage → Abschluss (die Verträge entfallen)
 * Solange Angebotsfragen offen sind, nie der Abschluss; eine unbeantwortete Angebotsfrage bleibt stehen. Nur im offenen
 * 24-h-Fenster, Mo bis Sa 8 bis 20 Uhr, nicht nach „Stopp“ und nicht, wenn der Assistent pausiert ist.
 */
export async function runStreckeAbschliessen(now = new Date()): Promise<{ gesendet: number }> {
  if (!inStreckenFenster(now)) return { gesendet: 0 };
  const offen = await prisma.message.findMany({
    where: { direction: "internal", kind: { in: [STRECKE.emailFrage, STRECKE.komplettFrage, STRECKE.vertragsfrage] }, createdAt: { lte: new Date(now.getTime() - HOUR), gte: new Date(now.getTime() - 48 * HOUR) } },
    orderBy: { createdAt: "asc" },
    take: 50,
    select: { conversationId: true, body: true, createdAt: true },
  });
  let gesendet = 0;
  const erledigt = new Set<string>();
  for (const m of offen) {
    let appointmentId = "";
    try {
      appointmentId = String((JSON.parse(m.body ?? "{}") as { appointmentId?: unknown }).appointmentId ?? "");
    } catch {
      continue;
    }
    if (!appointmentId || erledigt.has(appointmentId)) continue;
    erledigt.add(appointmentId);
    try {
      const conv = await prisma.conversation.findUnique({ where: { id: m.conversationId }, select: { botActive: true, optedOutAt: true, windowExpiresAt: true } });
      if (!conv?.botActive || conv.optedOutAt || !conv.windowExpiresAt || conv.windowExpiresAt.getTime() <= now.getTime()) continue;
      const stand = await streckenStand(m.conversationId, appointmentId);
      if (stand.abschlussAt) continue;
      // offen ist der jüngste Schritt: Vertragsfrage (ohne Auswertung), Komplettcheck (ohne Antwort) bzw. E-Mail-Frage
      const schritt: { art: "vertraege" | "komplett" | "email"; seit: Date } | null =
        stand.vertragsfrageAt && !stand.vorvertraegeErfasst
          ? { art: "vertraege", seit: stand.vertragsfrageAt }
          : stand.komplettFrageAt && !komplettcheckErledigt(stand)
            ? { art: "komplett", seit: stand.komplettFrageAt }
            : stand.emailFrageAt && emailFrageOffen(stand)
              ? { art: "email", seit: stand.emailFrageAt }
              : null;
      if (!schritt || schritt.seit.getTime() > now.getTime() - HOUR) continue;
      const antwort = await prisma.message.count({ where: { conversationId: m.conversationId, direction: "inbound", createdAt: { gt: schritt.seit } } });
      if (antwort) continue;
      const k = await streckenKontext(m.conversationId, now);
      if (!k?.termin || k.termin.id !== appointmentId) continue;
      let ok = false;
      if (schritt.art === "email") ok = await sendeKomplettcheck(k);
      else if (offeneAngebotsfragen(k).length) ok = schritt.art === "komplett" ? await sendeAngebotsfrage(k) : false;
      else ok = await sendeAbschluss(k, "ohne_antwort");
      if (ok) gesendet++;
    } catch (err) {
      console.error("[strecke abschluss]", err instanceof Error ? err.message.slice(0, 160) : err);
    }
  }
  return { gesendet };
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
