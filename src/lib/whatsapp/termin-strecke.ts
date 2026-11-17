// Ablauf der Termin-Strecke nach der Buchung (Ole, 17.11.2026), Texte in lib/whatsapp/gespraech.ts:
//   Buchungsnachricht → Angebotsfragen (Rechner-Tabelle) → Komplettcheck [Ja, gern] [Nein, danke]
//     „Ja, gern“  → Kennzeichen am Termin, Frage nach bestehenden Verträgen → Antwort (KI-Extraktion, tolerant) am Lead
//                   speichern → Abschluss
//     „Nein, danke“ → Abschluss
//   Abschluss: Bereitlegen (höchstens 3 Punkte) und Kalenderfrage [Ja] [Mache ich gleich] → zugesagt.
// Antwortet der Lead auf Komplettcheck oder Vertragsfrage nicht, wird nicht nachgehakt: nach einer Stunde schließt die
// App die Strecke trotzdem mit dem Abschluss ab (runStreckeAbschliessen, WhatsApp-Cron; nur im 24-h-Fenster,
// Mo bis Sa 8 bis 20 Uhr).
// Merker je Termin als interne Nachrichten (kind, body mit appointmentId), damit nichts doppelt geht.
//
// Außerdem: offener Terminvorschlag (für das Nachfassen nach 2 Std., lib/lead-sequences.ts) und freie Zeiten dafür.

import Anthropic from "@anthropic-ai/sdk";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { advisorDisplayName } from "@/lib/advisor-name";
import { a, asAnsprache, type Ansprache } from "@/lib/ansprache";
import { ansprechpartner } from "@/lib/lead-anrede";
import { redactHealthText, splitHealthAnswers } from "@/lib/gesundheitsdaten";
import { spartenDesLeads } from "@/lib/preise/rechner-angaben";
import {
  abschlussEinleitung,
  abschlussText,
  bereitlegenListe,
  istFamilie,
  KALENDER_KNOEPFE,
  KOMPLETTCHECK_KNOEPFE,
  komplettcheckFrage,
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
  komplettFrage: "komplettcheck_frage",
  komplett: "komplettcheck",
  vertragsfrage: "vertragsfrage",
  vorvertraege: "vorvertraege",
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
  komplettFrageAt: Date | null;
  komplettBeantwortet: boolean;
  vertragsfrageAt: Date | null;
  vorvertraegeErfasst: boolean;
  abschlussAt: Date | null;
};

/** Stand der Strecke für einen Termin (aus den Merkern). */
export async function streckenStand(conversationId: string, appointmentId: string): Promise<StreckenStand> {
  const rows = await prisma.message.findMany({
    where: { conversationId, direction: "internal", kind: { in: [STRECKE.komplettFrage, STRECKE.komplett, STRECKE.vertragsfrage, STRECKE.vorvertraege, STRECKE.abschluss] }, body: { contains: appointmentId } },
    orderBy: { createdAt: "asc" },
    select: { kind: true, createdAt: true },
  });
  const at = (k: string) => rows.find((r) => r.kind === k)?.createdAt ?? null;
  return {
    komplettFrageAt: at(STRECKE.komplettFrage),
    komplettBeantwortet: !!at(STRECKE.komplett),
    vertragsfrageAt: at(STRECKE.vertragsfrage),
    vorvertraegeErfasst: !!at(STRECKE.vorvertraege),
    abschlussAt: at(STRECKE.abschluss),
  };
}

async function sende(k: StreckenKontext, body: string, buttons?: Knopf[] | null): Promise<void> {
  const { sendWhatsAppMessage } = await import("@/lib/whatsapp/gateway");
  await sendWhatsAppMessage({ customerId: k.customerId, to: k.phone, body, sentBy: "bot", buttons: buttons ?? null });
}

/** Komplettcheck-Frage mit Knöpfen (Text und Knöpfe; der Aufrufer sendet und setzt den Merker mit komplettFrageGesendet). */
export function komplettcheckNachricht(k: Pick<StreckenKontext, "an" | "person" | "familie">, prefix?: string | null): { text: string; buttons: Knopf[] } {
  return { text: [prefix, komplettcheckFrage(k.an, k.person, k.familie)].filter(Boolean).join(" "), buttons: KOMPLETTCHECK_KNOEPFE };
}

/**
 * Policen vorab (lib/policen): Wurde der Lead eingeladen, Policen zu schicken, heißt der Punkt „übrige Policen, falls
 * nicht geschickt“; hat er schon welche geschickt und es gibt keine weiteren Verträge, entfällt er.
 */
async function mitPolicenHinweis(k: StreckenKontext, liste: string[]): Promise<string[]> {
  const eingeladen = (await prisma.message.count({ where: { conversationId: k.conversationId, direction: "outbound", body: { contains: "Fotos oder PDFs" } } })) > 0;
  if (!eingeladen) return liste;
  const ersatz = a(k.an, "deine übrigen Policen, falls du sie nicht geschickt hast", "Ihre übrigen Policen, falls Sie sie nicht geschickt haben");
  return liste.map((x) => (/bisherigen? Policen/i.test(x) ? ersatz : x));
}

/** Abschluss mit Bereitlegen-Liste und Kalenderfrage senden (einmal je Termin). */
export async function sendeAbschluss(k: StreckenKontext, art: "komplett_nein" | "vertraege" | "ohne_antwort" | "direkt"): Promise<boolean> {
  if (!k.termin) return false;
  const stand = await streckenStand(k.conversationId, k.termin.id);
  if (stand.abschlussAt) return false;
  const quelle = { formular: k.formular, angaben: k.angaben };
  const sparten = spartenDesLeads(k.source, quelle);
  const text = abschlussText({
    an: k.an,
    person: k.person,
    bereitlegen: await mitPolicenHinweis(k, bereitlegenListe(k.source, sparten, k.an, { quelle, komplettcheck: k.termin.komplettcheck === true })),
    email: k.email,
    nachFragen: true,
    einleitung: art === "direkt" ? null : abschlussEinleitung(k.an, k.person, art),
  });
  await merke(k.conversationId, STRECKE.abschluss, { appointmentId: k.termin.id, art });
  await sende(k, text, k.termin.confirmedAt ? null : KALENDER_KNOEPFE);
  return true;
}

/**
 * Antwort auf den Komplettcheck (Knopf oder vom Assistenten erkannt): Kennzeichen am Termin, bei ja die Vertragsfrage,
 * bei nein gleich der Abschluss. true = erledigt (der Assistent schreibt nichts dazu).
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
    await merke(conversationId, STRECKE.vertragsfrage, { appointmentId: k.termin.id });
    await sende(k, vertragsFrage(k.an, k.familie));
    return true;
  }
  await sendeAbschluss(k, "komplett_nein");
  return true;
}

/** Ist die Vertragsfrage offen (gestellt, noch nicht ausgewertet, kein Abschluss)? */
export async function vertragsfrageOffen(conversationId: string, appointmentId: string): Promise<Date | null> {
  const s = await streckenStand(conversationId, appointmentId);
  return s.vertragsfrageAt && !s.vorvertraegeErfasst && !s.abschlussAt ? s.vertragsfrageAt : null;
}

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";

/**
 * Freie Antwort auf die Vertragsfrage in eine Liste je Sparte bringen (KI-Extraktion mit festem Werkzeug, tolerant).
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
      tools: [{ name: "vertraege_festhalten", description: "Bestehende Versicherungen des Interessenten festhalten.", input_schema: VORVERTRAEGE_SCHEMA as unknown as Anthropic.Tool.InputSchema }],
      tool_choice: { type: "tool", name: "vertraege_festhalten" },
      messages: [{ role: "user", content: sauber.slice(0, 2000) }],
    });
    const tu = resp.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (tu) {
      const input = tu.input as { vertraege?: unknown; keine?: unknown };
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
  if (policen) await sende(k, policen);
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
 * Strecke trotzdem abschließen (Ole, 17.11.2026: nicht nachhaken): Komplettcheck bzw. Vertragsfrage seit über einer
 * Stunde ohne Antwort → Abschluss mit Bereitlegen und Kalenderfrage. Nur im offenen 24-h-Fenster, Mo bis Sa 8 bis 20 Uhr,
 * nicht nach „Stopp“ und nicht, wenn der Assistent pausiert ist.
 */
export async function runStreckeAbschliessen(now = new Date()): Promise<{ gesendet: number }> {
  if (!inStreckenFenster(now)) return { gesendet: 0 };
  const offen = await prisma.message.findMany({
    where: { direction: "internal", kind: { in: [STRECKE.komplettFrage, STRECKE.vertragsfrage] }, createdAt: { lte: new Date(now.getTime() - HOUR), gte: new Date(now.getTime() - 48 * HOUR) } },
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
      // offen ist der jüngste Schritt: Vertragsfrage (ohne Auswertung) bzw. Komplettcheck (ohne Antwort)
      const seit = stand.vertragsfrageAt && !stand.vorvertraegeErfasst ? stand.vertragsfrageAt : stand.komplettFrageAt && !stand.komplettBeantwortet ? stand.komplettFrageAt : null;
      if (!seit || seit.getTime() > now.getTime() - HOUR) continue;
      const antwort = await prisma.message.count({ where: { conversationId: m.conversationId, direction: "inbound", createdAt: { gt: seit } } });
      if (antwort) continue;
      const k = await streckenKontext(m.conversationId, now);
      if (!k?.termin || k.termin.id !== appointmentId) continue;
      if (await sendeAbschluss(k, "ohne_antwort")) gesendet++;
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
