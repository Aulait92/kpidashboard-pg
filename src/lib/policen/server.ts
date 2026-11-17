// Policen vor dem Termin per WhatsApp (Ole, 17.11.2026): Eingang, Einwilligung, Widerruf, Ansicht, Löschung.
// Regeln und Texte: lib/policen/regeln.ts. Aufgerufen aus lib/whatsapp/gateway.ts (eingehende Bilder/PDFs und Antworten).
//
// Schalter POLICEN_GESUNDHEIT_AN aus: wie bisher (KI ordnet zu, Unterlagen mit Gesundheitsbezug werden verworfen).
// Schalter an (docs/recht-gesundheitsunterlagen.md Abschnitt b): Einwilligung möglichst vorher (Einladung mit Knöpfen,
// lib/policen/assistent.ts). Ohne Einwilligung wird eine Datei mit möglichem Gesundheitsbezug weder geladen noch an die
// KI gegeben; nur die Media-ID bleibt bis zu 24 Stunden, die Frage kommt einmal erneut. Nach der Einwilligung ordnet die
// KI solche Unterlagen nur über einen EU-Endpunkt zu, sonst gar nicht.

import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { decryptBytes, decryptSecret, encryptBytes } from "@/lib/encryption";
import { logLeadHistory } from "@/lib/lead-history";
import { asAnsprache, type Ansprache } from "@/lib/ansprache";
import { ansprechpartner } from "@/lib/lead-anrede";
import { advisorDisplayName } from "@/lib/advisor-name";
import { vermittlerName } from "@/lib/whatsapp/gespraech";
import { sendWhatsAppMessage } from "@/lib/whatsapp/gateway";
import { logConsent } from "@/lib/bestand/einwilligung-server";
import { ladeMedia } from "@/lib/policen/media";
import { klassifiziere, liesAus, widerrufKi } from "@/lib/policen/ki";
import { verantwortlicherFuer } from "@/lib/policen/verantwortlicher";
import {
  abschlussSchritt,
  ablehnungText,
  angekommenText,
  ANGEKOMMEN_RE,
  auszugZeile,
  BEHALTEN_VERMERK,
  cleanAuszug,
  dateiname,
  einwilligungDankeText,
  einwilligungText,
  EINWILLIGUNG_KNOEPFE,
  EINWILLIGUNG_RE,
  EINWILLIGUNG_VERSION,
  entscheide,
  formatText,
  gesundheitAusText,
  istAbschluss,
  istAblehnung,
  istWiderruf,
  istZustimmung,
  loeschDatum,
  MAX_EINWILLIGUNGSFRAGEN,
  mimeErlaubt,
  minderjaehrig,
  nichtGeladenText,
  PAYLOAD_JA,
  PAYLOAD_NEIN,
  policenGesundheitAn,
  policenKiEu,
  POLICEN_MAX_BYTES,
  POLICEN_MAX_JE_LEAD,
  sparteLabel,
  typAusInhalt,
  typAusMime,
  vorabEinordnung,
  WARTEN_STUNDEN,
  widerrufText,
  widerrufVerdacht,
  zuGrossText,
  type Person,
  type PolicenTyp,
  type Sparte,
} from "@/lib/policen/regeln";

/** Quelle im Einwilligungsprotokoll (BestandConsentLog.source). */
export const CONSENT_SOURCE = "policen_gesundheit";

export type EingehendesMedium = { type: string; id?: string | null; mime_type?: string | null; filename?: string | null; caption?: string | null };

type Chat = { id: string; customerId: string; leadId: string; contactPhone: string; contactName: string | null; minderjaehrig: boolean };

async function chatOf(conversationId: string): Promise<Chat | null> {
  const c = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, customerId: true, leadId: true, contactPhone: true, contactName: true, lead: { select: { erasedAt: true, formData: true } } },
  });
  if (!c?.leadId || c.lead?.erasedAt) return null;
  return { id: c.id, customerId: c.customerId, leadId: c.leadId, contactPhone: c.contactPhone, contactName: c.contactName, minderjaehrig: minderjaehrig(c.lead?.formData) };
}

/**
 * Gesundheitsunterlagen für diesen Chat erlaubt? Schalter POLICEN_GESUNDHEIT_AN und kein minderjähriger Lead laut
 * Formular (docs/recht-gesundheitsunterlagen.md Abschnitt e, Punkt 11): sonst wie Schalter aus (verwerfen, Hinweis).
 */
const gesundheitErlaubt = (chat: Chat) => policenGesundheitAn() && !chat.minderjaehrig;

/** Ansprache und Vermittler als Person (wie im Assistenten, lib/whatsapp/bot.ts). */
async function sprecher(chat: Chat): Promise<{ an: Ansprache; person: Person }> {
  const customer = await prisma.customer.findUnique({ where: { id: chat.customerId }, select: { name: true, leadAddress: true } });
  const an = asAnsprache(customer?.leadAddress);
  const who = await ansprechpartner({ customerId: chat.customerId, leadId: chat.leadId, phone: chat.contactPhone, name: chat.contactName });
  const advisor = who.advisor || advisorDisplayName(customer?.name) || (an === "du" ? "deinem Berater" : "Ihrem Berater");
  return { an, person: vermittlerName(an, { name: who.vermittler.name, anrede: who.vermittler.anrede, fallback: advisor }) };
}

async function apiKeyOf(customerId: string): Promise<string | null> {
  const acc = await prisma.whatsAppAccount.findUnique({ where: { customerId }, select: { status: true, apiKeyEnc: true } });
  return acc?.status === "connected" && acc.apiKeyEnc ? decryptSecret(acc.apiKeyEnc) : null;
}

const send = (chat: Chat, body: string) => sendWhatsAppMessage({ customerId: chat.customerId, to: chat.contactPhone, body, sentBy: "bot" });

/** Dieselbe kurze Antwort höchstens einmal je zwei Minuten (mehrere Fotos auf einmal). */
async function einmalig(chat: Chat, now: Date, re: RegExp, text: string) {
  const recent = await prisma.message.findMany({
    where: { conversationId: chat.id, direction: "outbound", createdAt: { gte: new Date(now.getTime() - 2 * 60 * 1000) } },
    select: { body: true },
  });
  if (recent.some((m) => re.test(m.body ?? ""))) return;
  await send(chat, text);
}
const bestaetige = (chat: Chat, now: Date) => einmalig(chat, now, ANGEKOMMEN_RE, angekommenText());

/** Einwilligungsfrage mit zwei Knöpfen (interaktive Nachricht im 24-Stunden-Fenster). */
async function frageEinwilligung(chat: Chat, text: string) {
  await sendWhatsAppMessage({ customerId: chat.customerId, to: chat.contactPhone, body: text, sentBy: "bot", buttons: EINWILLIGUNG_KNOEPFE }).catch((e) =>
    console.error("[policen einwilligung]", e instanceof Error ? e.message : e),
  );
}

/** Bisher gesendete Einwilligungsfragen in diesem Chat (Einladung mit Einwilligung zählt mit). */
async function einwilligungsFragen(conversationId: string): Promise<{ anzahl: number; letzte: string | null }> {
  const rows = await prisma.message.findMany({
    where: { conversationId, direction: "outbound", body: { contains: "Gesundheitsangaben" } },
    orderBy: { createdAt: "desc" },
    select: { body: true },
  });
  const fragen = rows.filter((m) => EINWILLIGUNG_RE.test(m.body ?? ""));
  return { anzahl: fragen.length, letzte: fragen[0]?.body ?? null };
}

/** Aktive Einwilligung dieses Kontakts (letzter Eintrag im Protokoll ist „erteilt“). */
export async function aktiveEinwilligung(customerId: string, phone: string) {
  const last = await prisma.bestandConsentLog.findFirst({
    where: { customerId, channel: "whatsapp", source: CONSENT_SOURCE, address: phone },
    orderBy: { createdAt: "desc" },
    select: { id: true, action: true, createdAt: true },
  });
  return last?.action === "erteilt" ? last : null;
}

/** Angaben des Leads für die Einordnung ohne Inhalt: Vertragsliste (Chat, Komplettcheck) und Produkt. */
async function leadAngaben(chat: Chat): Promise<string[]> {
  const c = await prisma.conversation.findUnique({
    where: { id: chat.id },
    select: { qualificationData: true, lead: { select: { source: true, vorvertraege: true } } },
  });
  const q = (c?.qualificationData ?? {}) as Record<string, unknown>;
  const vv = (c?.lead?.vorvertraege ?? null) as { liste?: { sparte?: unknown }[] } | null;
  return [
    q.vorhanden,
    q.komplettcheck,
    c?.lead?.source,
    ...(Array.isArray(vv?.liste) ? vv.liste.map((x) => x?.sparte) : []),
  ].filter((x): x is string => typeof x === "string" && !!x.trim());
}

async function setzeBody(messageId: string | null, body: string) {
  if (messageId) await prisma.message.update({ where: { id: messageId }, data: { body } }).catch(() => null);
}

async function loeschfristFuer(leadId: string, eingang: Date): Promise<Date | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { status: true, closedAt: true, appointments: { where: { status: { not: "cancelled" } }, select: { startsAt: true } } },
  });
  return loeschDatum({ termine: lead?.appointments.map((x) => x.startsAt) ?? [], eingang, abschluss: istAbschluss(lead?.status), abschlussAm: lead?.closedAt });
}

type Ergebnis = { handled: boolean; gespeichert?: string; verworfen?: string };

/**
 * Eingehendes Bild oder Dokument im Lead-Chat. handled = true: beantwortet, der Assistent muss nichts mehr tun.
 * Ohne Lead (private Chats, Support) passiert nichts: nichts wird geladen.
 */
export async function handleInboundMedia(o: {
  conversationId: string;
  messageId: string | null;
  medium: EingehendesMedium;
  botErlaubt: boolean;
  now?: Date;
}): Promise<Ergebnis> {
  const now = o.now ?? new Date();
  const chat = await chatOf(o.conversationId);
  if (!chat || !o.medium.id) return { handled: false };
  const mediaId = o.medium.id;
  const { an, person } = await sprecher(chat);
  const antworte = async (text: string) => {
    if (o.botErlaubt) await send(chat, text).catch((e) => console.error("[policen antwort]", e));
  };
  const caption = (o.medium.caption ?? "").trim().slice(0, 300);
  const fertig = (verworfen?: string): Ergebnis => ({ handled: o.botErlaubt, ...(verworfen ? { verworfen } : {}) });

  if (!mimeErlaubt(o.medium.mime_type)) {
    await setzeBody(o.messageId, "Dokument empfangen, nicht gespeichert (Format nicht lesbar)");
    await antworte(formatText(an));
    return fertig("format");
  }
  if ((await prisma.leadDocument.count({ where: { leadId: chat.leadId } })) >= POLICEN_MAX_JE_LEAD) {
    await setzeBody(o.messageId, "Dokument empfangen, nicht gespeichert (zu viele Unterlagen)");
    return { handled: false, verworfen: "limit" };
  }
  const apiKey = await apiKeyOf(chat.customerId);
  if (!apiKey) return { handled: false };

  /** Datei laden und Typ am Inhalt prüfen; bei Fehlern antworten. */
  const lade = async (): Promise<{ data: Buffer; typ: PolicenTyp } | Ergebnis> => {
    const dl = await ladeMedia(apiKey, mediaId, POLICEN_MAX_BYTES);
    if (!dl.ok) {
      await setzeBody(o.messageId, dl.grund === "zu_gross" ? "Dokument empfangen, nicht gespeichert (über 10 MB)" : "Dokument empfangen, konnte nicht geladen werden");
      await antworte(dl.grund === "zu_gross" ? zuGrossText(an) : nichtGeladenText(an));
      if (dl.grund === "fehler") console.error("[policen laden]", dl.detail);
      return fertig(dl.grund);
    }
    const typ = typAusInhalt(dl.data);
    if (!typ) {
      await setzeBody(o.messageId, "Dokument empfangen, nicht gespeichert (Format nicht lesbar)");
      await antworte(formatText(an));
      return fertig("format");
    }
    return { data: dl.data, typ };
  };

  const gesundheitAn = gesundheitErlaubt(chat);
  if (gesundheitAn) {
    // Vor dem Laden, ohne KI: nur Dateiname, Begleittext und Angaben des Leads
    const vorab = vorabEinordnung({ text: `${o.medium.filename ?? ""} ${caption}`, leadAngaben: await leadAngaben(chat) });
    if (vorab.gesundheitMoeglich) {
      const consent = await aktiveEinwilligung(chat.customerId, chat.contactPhone);
      if (!consent) {
        return warteAufEinwilligung(chat, {
          messageId: o.messageId,
          mediaId,
          typ: typAusMime(o.medium.mime_type),
          fileName: dateiname(o.medium.filename, typAusMime(o.medium.mime_type), now),
          size: 0,
          sparte: vorab.sparte,
          botErlaubt: o.botErlaubt,
          an,
          person,
          now,
        });
      }
      const geladen = await lade();
      if (!("data" in geladen)) return geladen;
      const fileName = dateiname(o.medium.filename, geladen.typ, now);
      const id = await speichereNachEinwilligung(chat, { ...geladen, fileName, caption, messageId: o.messageId, vorSparte: vorab.sparte, consent: { id: consent.id, at: consent.createdAt }, now });
      if (o.botErlaubt) await bestaetige(chat, now);
      return { handled: o.botErlaubt, gespeichert: id };
    }
  }

  const geladen = await lade();
  if (!("data" in geladen)) return geladen;
  const { data, typ } = geladen;
  const fileName = dateiname(o.medium.filename, typ, now);
  // Nur Zuordnung (Sparte, Gesundheitsbezug), keine Inhalte. Schalter an: nur Dateien, die laut Name, Begleittext und
  // Angaben des Leads Sachversicherungen sind; auch sie gehen über den EU-Endpunkt, wenn er eingerichtet ist (eine
  // Datei kann trotzdem Gesundheitsangaben enthalten, Abschnitt e Punkt 8).
  const eu = gesundheitAn ? policenKiEu() : null;
  const ki = await klassifiziere(data, typ, { endpunkt: eu });
  const e = entscheide({ ki, text: `${fileName} ${caption}` });

  if (e.gesundheit) {
    // Schalter aus (bis der Anwalt geprüft hat): Datei verwerfen, freundlicher Hinweis
    if (!gesundheitAn) {
      await setzeBody(o.messageId, "Dokument empfangen, nicht gespeichert (Gesundheitsangaben möglich)");
      await audit("policen.verworfen", { entity: "Lead", entityId: chat.leadId, customerId: chat.customerId, details: { grund: "gesundheit_aus", sparte: e.sparte }, actor: { role: "system" } });
      await antworte(gesundheitAusText(an, person));
      return fertig("gesundheit_aus");
    }
    const consent = await aktiveEinwilligung(chat.customerId, chat.contactPhone);
    if (consent) {
      const id = await speichere(chat, { messageId: o.messageId, typ, fileName, data, sparte: e.sparte, gesundheit: true, consent: { id: consent.id, at: consent.createdAt }, now });
      await setzeBody(o.messageId, "Dokument empfangen (Gesundheitsangaben möglich)");
      if (o.botErlaubt) await bestaetige(chat, now);
      return { handled: o.botErlaubt, gespeichert: id };
    }
    // Inhalt verwerfen, nur die Media-ID merken und fragen
    return warteAufEinwilligung(chat, { messageId: o.messageId, mediaId, typ, fileName, size: data.length, sparte: e.sparte, botErlaubt: o.botErlaubt, an, person, now });
  }

  const id = await speichere(chat, { messageId: o.messageId, typ, fileName, data, sparte: e.sparte, gesundheit: false, consent: null, now });
  await setzeBody(o.messageId, `Dokument empfangen: ${fileName}${caption ? `\n${caption}` : ""}`);
  if (o.botErlaubt) await bestaetige(chat, now);
  // Vertragsdaten auslesen (nur Sachversicherungen; Fehler stören den Chat nicht)
  if (ki?.police !== false && e.sparte !== "sonstig") await auslesen(id, data, typ, e.sparte, eu);
  return { handled: o.botErlaubt, gespeichert: id };
}

async function auslesen(id: string, data: Buffer, typ: PolicenTyp, sparte: string | null, endpunkt: ReturnType<typeof policenKiEu>) {
  const x = await liesAus(data, typ, { endpunkt });
  if (x) await prisma.leadDocument.update({ where: { id }, data: { extracted: x, extractedAt: new Date(), ...(x.sparte && !sparte ? { sparte: x.sparte } : {}) } }).catch(() => null);
}

/**
 * Keine Einwilligung: nichts laden bzw. Inhalt verwerfen, nur die WhatsApp-Media-ID merken (höchstens 24 Stunden) und
 * fragen. Höchstens zweimal je Chat (Einladung bzw. erste Frage und einmal erneut), danach verwerfen mit Hinweis.
 * Assistent aus (Vermittler hat übernommen): keine Rückfrage, verwerfen.
 */
async function warteAufEinwilligung(
  chat: Chat,
  x: { messageId: string | null; mediaId: string; typ: PolicenTyp; fileName: string; size: number; sparte: string | null; botErlaubt: boolean; an: Ansprache; person: Person; now: Date },
): Promise<Ergebnis> {
  if (!x.botErlaubt) {
    await setzeBody(x.messageId, "Dokument empfangen, nicht gespeichert (Gesundheitsangaben möglich, keine Einwilligung)");
    return { handled: false, verworfen: "keine_einwilligung" };
  }
  const offen = await prisma.leadDocument.count({ where: { leadId: chat.leadId, status: "wartet" } });
  if (!offen && (await einwilligungsFragen(chat.id)).anzahl >= MAX_EINWILLIGUNGSFRAGEN) {
    await setzeBody(x.messageId, "Dokument empfangen, nicht gespeichert (Gesundheitsangaben möglich, keine Einwilligung)");
    await audit("policen.verworfen", { entity: "Lead", entityId: chat.leadId, customerId: chat.customerId, details: { grund: "keine_einwilligung" }, actor: { role: "system" } });
    await einmalig(chat, x.now, /speichere ich hier nicht/, gesundheitAusText(x.an, x.person));
    return { handled: true, verworfen: "keine_einwilligung" };
  }
  await prisma.leadDocument.create({
    data: {
      customerId: chat.customerId,
      leadId: chat.leadId,
      conversationId: chat.id,
      messageId: x.messageId,
      status: "wartet",
      waMediaId: x.mediaId,
      mimeType: x.typ,
      fileName: x.fileName,
      size: x.size,
      sparte: x.sparte,
      gesundheitsbezug: true,
    },
  });
  await setzeBody(x.messageId, "Dokument empfangen (wartet auf Einwilligung)");
  if (!offen) await frageEinwilligung(chat, einwilligungText(x.an, await verantwortlicherFuer(chat.customerId, x.person), { nachDatei: true }));
  return { handled: true };
}

/**
 * Mit Einwilligung, Datei mit möglichem Gesundheitsbezug: KI-Zuordnung nur über den EU-Endpunkt; ohne ihn Sparte laut
 * Dateiname, Begleittext bzw. Angaben des Leads und „Gesundheitsangaben möglich“. Nur Sachversicherungen werden
 * ausgelesen (dann über denselben EU-Endpunkt).
 */
async function speichereNachEinwilligung(
  chat: Chat,
  x: { data: Buffer; typ: PolicenTyp; fileName: string; caption: string; messageId: string | null; vorSparte: string | null; consent: { id: string; at: Date }; now: Date },
): Promise<string> {
  const eu = policenKiEu();
  const ki = eu ? await klassifiziere(x.data, x.typ, { endpunkt: eu }) : null;
  const e = ki ? entscheide({ ki, text: `${x.fileName} ${x.caption}` }) : { sparte: x.vorSparte as Sparte | null, gesundheit: true };
  const id = await speichere(chat, { messageId: x.messageId, typ: x.typ, fileName: x.fileName, data: x.data, sparte: e.sparte, gesundheit: e.gesundheit, consent: x.consent, now: x.now });
  await setzeBody(x.messageId, e.gesundheit ? "Dokument empfangen (Gesundheitsangaben möglich)" : `Dokument empfangen: ${x.fileName}`);
  if (!e.gesundheit && ki?.police !== false && e.sparte !== "sonstig") await auslesen(id, x.data, x.typ, e.sparte, eu);
  return id;
}

async function speichere(
  chat: Chat,
  x: { messageId: string | null; typ: PolicenTyp; fileName: string; data: Buffer; sparte: string | null; gesundheit: boolean; consent: { id: string; at: Date } | null; now: Date },
): Promise<string> {
  const doc = await prisma.leadDocument.create({
    select: { id: true },
    data: {
      customerId: chat.customerId,
      leadId: chat.leadId,
      conversationId: chat.id,
      messageId: x.messageId,
      status: "gespeichert",
      mimeType: x.typ,
      fileName: x.fileName,
      size: x.data.length,
      data: encryptBytes(x.data),
      kind: x.sparte === "sonstig" ? "sonstig" : "police",
      sparte: x.sparte,
      gesundheitsbezug: x.gesundheit,
      consentId: x.consent?.id ?? null,
      consentAt: x.consent?.at ?? null,
      deleteAfter: await loeschfristFuer(chat.leadId, x.now),
    },
  });
  // Verlauf ohne Dateinamen bei Gesundheitsbezug
  await logLeadHistory(chat.leadId, "dokument", x.gesundheit ? "Unterlage per WhatsApp erhalten (Gesundheitsangaben möglich, mit Einwilligung)" : `Unterlage per WhatsApp erhalten: ${x.fileName}`, { customerId: chat.customerId, userId: null });
  return doc.id;
}

/**
 * Antwort des Leads, die Unterlagen betrifft: Knopf zur Einwilligung (auch auf die Einladung, ohne Datei), getipptes
 * Ja/Nein direkt auf die Frage, Widerruf (Regeln, sinngemäß per KI). handled = true: erledigt, der Assistent antwortet nicht.
 */
export async function handlePolicenAntwort(
  conversationId: string,
  m: { kind: string; text: string | null; payload: string | null; waMessageId?: string | null },
  now = new Date(),
): Promise<{ handled: boolean }> {
  const chat = await chatOf(conversationId);
  if (!chat) return { handled: false };

  const payload = m.payload ?? "";
  let ja = payload === PAYLOAD_JA;
  let nein = payload === PAYLOAD_NEIN;
  if (!ja && !nein && m.kind === "text") {
    // Getippt: nur direkt nach der Einwilligungsfrage
    const last = await prisma.message.findFirst({ where: { conversationId: chat.id, direction: "outbound" }, orderBy: { createdAt: "desc" }, select: { body: true } });
    if (EINWILLIGUNG_RE.test(last?.body ?? "")) {
      ja = istZustimmung(m.text);
      nein = istAblehnung(m.text);
    }
  }
  if (ja || nein) return beantworteEinwilligung(chat, { ja, waMessageId: m.waMessageId ?? null, now });

  if (m.kind === "text" && m.text?.trim()) {
    const [docs, consent] = await Promise.all([prisma.leadDocument.count({ where: { leadId: chat.leadId } }), aktiveEinwilligung(chat.customerId, chat.contactPhone)]);
    if (!docs && !consent) return { handled: false };
    // Eindeutig nach Regeln, sonst sinngemäß per KI (ohne KI gilt die Regel)
    const widerruf = istWiderruf(m.text) || (widerrufVerdacht(m.text) && (await widerrufKi(m.text)) === true);
    if (!widerruf) return { handled: false };
    await widerrufe({ customerId: chat.customerId, leadId: chat.leadId, phone: chat.contactPhone, via: "whatsapp", userId: null });
    await send(chat, widerrufText((await sprecher(chat)).an));
    return { handled: true };
  }
  return { handled: false };
}

async function beantworteEinwilligung(chat: Chat, o: { ja: boolean; waMessageId: string | null; now: Date }): Promise<{ handled: boolean }> {
  const pending = await prisma.leadDocument.findMany({ where: { leadId: chat.leadId, status: "wartet" }, orderBy: { createdAt: "asc" } });
  const gesundheitAn = gesundheitErlaubt(chat);
  const { an, person } = await sprecher(chat);

  if (!o.ja || !gesundheitAn) {
    await prisma.leadDocument.deleteMany({ where: { leadId: chat.leadId, status: "wartet" } });
    if (!o.ja) await audit("policen.einwilligung_abgelehnt", { entity: "Lead", entityId: chat.leadId, customerId: chat.customerId, details: { unterlagen: pending.length }, actor: { role: "lead" } });
    await send(chat, o.ja ? gesundheitAusText(an, person) : ablehnungText());
    return { handled: true };
  }

  // Einwilligung protokollieren: Wortlaut der beantworteten Frage mit Version, Zeitpunkt, Nummer, Lead, ID der Antwort
  const frage = (await einwilligungsFragen(chat.id)).letzte ?? einwilligungText(an, await verantwortlicherFuer(chat.customerId, person));
  const consent = await logConsent({
    customerId: chat.customerId,
    existingCustomerId: null,
    channel: "whatsapp",
    action: "erteilt",
    source: CONSENT_SOURCE,
    text: frage,
    version: EINWILLIGUNG_VERSION,
    leadId: chat.leadId,
    waMessageId: o.waMessageId,
    address: chat.contactPhone,
    confirmedAt: o.now,
    at: o.now,
  });
  await audit("policen.einwilligung", { entity: "Lead", entityId: chat.leadId, customerId: chat.customerId, details: { consentId: consent.id, version: EINWILLIGUNG_VERSION, unterlagen: pending.length }, actor: { role: "lead" } });
  await logLeadHistory(chat.leadId, "dokument", "Einwilligung zu Unterlagen per WhatsApp erteilt (Gesundheitsangaben möglich)", { customerId: chat.customerId, userId: null });
  if (!pending.length) {
    await send(chat, einwilligungDankeText(an));
    return { handled: true };
  }

  // Jetzt erst laden und speichern
  const apiKey = await apiKeyOf(chat.customerId);
  let ok = 0;
  for (const p of pending) {
    const dl = apiKey && p.waMediaId ? await ladeMedia(apiKey, p.waMediaId, POLICEN_MAX_BYTES) : null;
    const typ = dl?.ok ? typAusInhalt(dl.data) : null;
    await prisma.leadDocument.delete({ where: { id: p.id } }).catch(() => null);
    if (!dl?.ok || !typ) continue;
    await speichereNachEinwilligung(chat, {
      data: dl.data,
      typ,
      fileName: p.fileName,
      caption: "",
      messageId: p.messageId,
      vorSparte: p.sparte,
      consent: { id: consent.id, at: o.now },
      now: o.now,
    });
    ok++;
  }
  await send(chat, ok ? angekommenText() : nichtGeladenText(an));
  return { handled: true };
}

/** Widerruf: alle Unterlagen des Leads sofort löschen (Dateien, Auszüge, Media-IDs), Widerruf protokollieren. */
async function widerrufe(o: { customerId: string; leadId: string; phone: string | null; via: "whatsapp" | "vermittler"; userId: string | null }): Promise<number> {
  const del = await prisma.leadDocument.deleteMany({ where: { leadId: o.leadId } });
  if (o.phone && (await aktiveEinwilligung(o.customerId, o.phone))) {
    await logConsent({
      customerId: o.customerId,
      existingCustomerId: null,
      channel: "whatsapp",
      action: "widerrufen",
      source: CONSENT_SOURCE,
      address: o.phone,
      leadId: o.leadId,
      actorUserId: o.userId,
      text: o.via === "whatsapp" ? "Widerruf per WhatsApp" : "Widerruf über den Vermittler",
    });
  }
  await audit("policen.widerruf", { entity: "Lead", entityId: o.leadId, customerId: o.customerId, details: { geloescht: del.count, via: o.via }, actor: o.via === "whatsapp" ? { role: "lead" } : { id: o.userId, role: "BUYER" } });
  await logLeadHistory(
    o.leadId,
    "dokument",
    o.via === "whatsapp" ? `Einwilligung per WhatsApp widerrufen, Unterlagen gelöscht (${del.count})` : `Einwilligung widerrufen, Unterlagen gelöscht (${del.count})`,
    { customerId: o.customerId, userId: o.userId },
  );
  if (o.via === "whatsapp") {
    const { notifyLeadPush } = await import("@/lib/team");
    await notifyLeadPush(o.leadId, {
      title: "Unterlagen gelöscht (Widerruf)",
      body: "Ein Kunde hat seine Einwilligung zu den per WhatsApp geschickten Unterlagen widerrufen. Die Unterlagen sind gelöscht.",
      tag: `policen-widerruf:${o.leadId}`,
      url: `/buyer/leads/${o.leadId}#dokumente`,
    }).catch(() => null);
  }
  return del.count;
}

/** Vermittler im Kontakt: „Einwilligung widerrufen / Unterlagen löschen“ (Widerruf, der ihn anders erreicht hat). */
export async function widerrufDurchVermittler(leadId: string, customerId: string, userId: string | null): Promise<{ geloescht: number } | null> {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, customerId }, select: { id: true, phone: true } });
  if (!lead) return null;
  const conv = await prisma.conversation.findFirst({ where: { leadId, customerId }, orderBy: { lastMessageAt: "desc" }, select: { contactPhone: true } });
  const geloescht = await widerrufe({ customerId, leadId, phone: conv?.contactPhone ?? lead.phone, via: "vermittler", userId });
  return { geloescht };
}

// ─── Vermittler-Ansicht ─────────────────────────────────────────────────────

export type UnterlageView = {
  id: string;
  fileName: string;
  size: number;
  createdAt: string;
  sparte: string | null;
  gesundheit: boolean;
  consentAt: string | null;
  auszug: string | null;
  /** Inhalt ansehen erlaubt (Admin-Vorschau: nie bei Gesundheitsbezug) */
  ansehen: boolean;
  /** Geplante automatische Löschung (null: behalten bzw. keine Frist) */
  loeschtAm: string | null;
  /** „Beratungsdokumentation behalten“: Zeitpunkt und Vermerk */
  behaltenAt: string | null;
  behaltenVermerk: string | null;
  /** Kennzeichnen möglich (Lead mit Abschluss) */
  behaltenMoeglich: boolean;
};

/** Gespeicherte Unterlagen am Lead (ohne Inhalt). preview = Admin in „Als Kunde ansehen“. */
export async function listUnterlagen(leadId: string, opts: { preview: boolean }): Promise<UnterlageView[]> {
  const [rows, lead] = await Promise.all([
    prisma.leadDocument.findMany({
      where: { leadId, status: "gespeichert" },
      orderBy: { createdAt: "desc" },
      select: { id: true, fileName: true, size: true, createdAt: true, sparte: true, gesundheitsbezug: true, consentAt: true, extracted: true, deleteAfter: true, behaltenAt: true, behaltenVermerk: true },
    }),
    prisma.lead.findUnique({ where: { id: leadId }, select: { status: true } }),
  ]);
  const abschluss = istAbschluss(lead?.status);
  return rows.map((r) => {
    const verdeckt = opts.preview && r.gesundheitsbezug;
    return {
      id: r.id,
      fileName: verdeckt ? "Unterlage (Inhalt nur für den Vermittler)" : r.fileName,
      size: r.size,
      createdAt: r.createdAt.toISOString(),
      sparte: r.sparte ? sparteLabel(r.sparte) : null,
      gesundheit: r.gesundheitsbezug,
      consentAt: r.consentAt?.toISOString() ?? null,
      auszug: r.gesundheitsbezug ? null : auszugZeile(cleanAuszug(r.extracted)),
      ansehen: !verdeckt,
      loeschtAm: r.behaltenAt ? null : (r.deleteAfter?.toISOString() ?? null),
      behaltenAt: r.behaltenAt?.toISOString() ?? null,
      behaltenVermerk: r.behaltenVermerk,
      behaltenMoeglich: abschluss || !!r.behaltenAt,
    };
  });
}

/** Datei zum Ansehen (entschlüsselt). null = nicht gefunden oder nicht erlaubt. */
export async function ladeUnterlage(
  leadId: string,
  docId: string,
  ctx: { customerId: string; preview: boolean; userId: string | null },
): Promise<{ fileName: string; mimeType: string; data: Buffer } | null> {
  const doc = await prisma.leadDocument.findFirst({ where: { id: docId, leadId, customerId: ctx.customerId, status: "gespeichert" } });
  if (!doc?.data) return null;
  // Gesundheitsbezug: nur der Vermittler selbst (kein Admin, keine Vorschau)
  if (doc.gesundheitsbezug && (ctx.preview || !ctx.userId)) return null;
  if (doc.gesundheitsbezug) {
    await audit("policen.ansehen", { entity: "LeadDocument", entityId: doc.id, customerId: ctx.customerId, details: { leadId }, actor: { id: ctx.userId, role: "BUYER" } });
  }
  return { fileName: doc.fileName, mimeType: doc.mimeType, data: decryptBytes(doc.data) };
}

/** Eine Unterlage löschen (Vermittler im Kontakt). */
export async function loescheUnterlage(leadId: string, docId: string, customerId: string, userId: string | null): Promise<boolean> {
  const doc = await prisma.leadDocument.findFirst({ where: { id: docId, leadId, customerId }, select: { id: true, fileName: true, gesundheitsbezug: true } });
  if (!doc) return false;
  await prisma.leadDocument.delete({ where: { id: doc.id } });
  await logLeadHistory(leadId, "dokument", doc.gesundheitsbezug ? "Unterlage gelöscht (Gesundheitsangaben möglich)" : `Unterlage gelöscht: ${doc.fileName}`, { customerId, userId });
  return true;
}

/**
 * „Beratungsdokumentation behalten“ setzen bzw. aufheben (Vermittler im Kontakt). Gesetzt: keine automatische Löschung,
 * mit Zeitpunkt, Login und Vermerk. Aufgehoben: Löschfrist wie üblich (nach Abschluss mit Erinnerung).
 */
export async function behalteUnterlage(
  leadId: string,
  docId: string,
  ctx: { customerId: string; userId: string | null; behalten: boolean; vermerk?: string | null; now?: Date },
): Promise<boolean> {
  const doc = await prisma.leadDocument.findFirst({ where: { id: docId, leadId, customerId: ctx.customerId, status: "gespeichert" }, select: { id: true, createdAt: true, fileName: true, gesundheitsbezug: true } });
  if (!doc) return false;
  const now = ctx.now ?? new Date();
  const vermerk = (ctx.vermerk ?? "").replace(/\s+/g, " ").trim().slice(0, 200) || BEHALTEN_VERMERK;
  await prisma.leadDocument.update({
    where: { id: doc.id },
    data: ctx.behalten
      ? { behaltenAt: now, behaltenVonId: ctx.userId, behaltenVermerk: vermerk, deleteAfter: null }
      : { behaltenAt: null, behaltenVonId: null, behaltenVermerk: null, erinnertAt: null, deleteAfter: await loeschfristFuer(leadId, doc.createdAt) },
  });
  const was = doc.gesundheitsbezug ? "Unterlage (Gesundheitsangaben möglich)" : `Unterlage ${doc.fileName}`;
  await logLeadHistory(leadId, "dokument", ctx.behalten ? `${was} wird behalten: ${vermerk}` : `${was} wird nicht mehr behalten, automatische Löschung wieder an`, { customerId: ctx.customerId, userId: ctx.userId });
  await audit("policen.behalten", { entity: "LeadDocument", entityId: doc.id, customerId: ctx.customerId, details: { leadId, behalten: ctx.behalten, vermerk: ctx.behalten ? vermerk : null }, actor: { id: ctx.userId, role: "BUYER" } });
  return true;
}

// ─── Löschfristen (täglicher Cron) ──────────────────────────────────────────

const tag = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);

/**
 * Ausstehende Einwilligungen nach 24 Stunden verwerfen. Gespeicherte Unterlagen ohne Abschluss 30 Tage nach dem letzten
 * Termin (ohne Termin: nach dem Eingang) löschen. Mit Abschluss 90 Tage nach dem Abschluss, 14 Tage vorher Erinnerung
 * an den Vermittler („In die Kundenakte übernehmen“). „Beratungsdokumentation behalten“: keine automatische Löschung.
 */
export async function prunePolicen(now = new Date()) {
  const wartet = await prisma.leadDocument.deleteMany({ where: { status: "wartet", createdAt: { lt: new Date(now.getTime() - WARTEN_STUNDEN * 60 * 60 * 1000) } } });
  const docs = await prisma.leadDocument.findMany({
    where: { status: "gespeichert" },
    select: {
      id: true,
      leadId: true,
      createdAt: true,
      deleteAfter: true,
      erinnertAt: true,
      behaltenAt: true,
      lead: { select: { status: true, closedAt: true, name: true, appointments: { where: { status: { not: "cancelled" } }, select: { startsAt: true } } } },
    },
  });
  const loeschen: string[] = [];
  const erinnern = new Map<string, { name: string | null; am: Date }>();
  let aktualisiert = 0;
  const setze = async (id: string, data: { deleteAfter: Date | null; erinnertAt?: Date }) => {
    await prisma.leadDocument.update({ where: { id }, data });
    aktualisiert++;
  };
  for (const d of docs) {
    const gleich = (x: Date | null) => (x?.getTime() ?? null) === (d.deleteAfter?.getTime() ?? null);
    if (d.behaltenAt) {
      if (d.deleteAfter) await setze(d.id, { deleteAfter: null });
      continue;
    }
    const abschluss = istAbschluss(d.lead.status);
    const datum = loeschDatum({ termine: d.lead.appointments.map((x) => x.startsAt), eingang: d.createdAt, abschluss, abschlussAm: d.lead.closedAt });
    if (!datum) continue;
    if (abschluss) {
      const s = abschlussSchritt({ datum, erinnertAt: d.erinnertAt, now });
      if (s.aktion === "loeschen") loeschen.push(d.id);
      else if (s.aktion === "erinnern") {
        await setze(d.id, { deleteAfter: s.deleteAfter, erinnertAt: now });
        const vorher = erinnern.get(d.leadId);
        if (!vorher || s.deleteAfter < vorher.am) erinnern.set(d.leadId, { name: d.lead.name, am: s.deleteAfter });
      } else if (!gleich(s.deleteAfter)) await setze(d.id, { deleteAfter: s.deleteAfter });
      continue;
    }
    if (datum.getTime() <= now.getTime()) loeschen.push(d.id);
    else if (!gleich(datum)) await setze(d.id, { deleteAfter: datum });
  }
  const geloescht = loeschen.length ? (await prisma.leadDocument.deleteMany({ where: { id: { in: loeschen } } })).count : 0;
  if (erinnern.size) {
    const { notifyLeadPush } = await import("@/lib/team");
    for (const [leadId, e] of erinnern) {
      const text = `Unterlagen vom Kunden werden am ${tag(e.am)} gelöscht. Bitte in die Kundenakte übernehmen oder als Beratungsdokumentation behalten.`;
      await logLeadHistory(leadId, "dokument", text, { userId: null });
      await notifyLeadPush(leadId, {
        title: `Unterlagen in die Kundenakte übernehmen: ${e.name ?? "Kontakt"}`,
        body: text,
        tag: `policen-erinnerung:${leadId}`,
        url: `/buyer/leads/${leadId}#dokumente`,
      }).catch(() => null);
    }
  }
  return { wartet: wartet.count, geloescht, aktualisiert, erinnert: erinnern.size };
}
