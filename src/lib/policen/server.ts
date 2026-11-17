// Policen vor dem Termin per WhatsApp (Ole, 17.11.2026): Eingang, Einwilligung, Widerruf, Ansicht, Löschung.
// Regeln und Texte: lib/policen/regeln.ts. Aufgerufen aus lib/whatsapp/gateway.ts (eingehende Bilder/PDFs und Antworten).

import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { decryptBytes, decryptSecret, encryptBytes } from "@/lib/encryption";
import { ohneGedankenstriche } from "@/lib/gedankenstriche";
import { logLeadHistory } from "@/lib/lead-history";
import { asAnsprache, type Ansprache } from "@/lib/ansprache";
import { ansprechpartner } from "@/lib/lead-anrede";
import { advisorDisplayName } from "@/lib/advisor-name";
import { vermittlerName } from "@/lib/whatsapp/gespraech";
import { sendButtons } from "@/lib/whatsapp/dialog360";
import { sendWhatsAppMessage } from "@/lib/whatsapp/gateway";
import { logConsent } from "@/lib/bestand/einwilligung-server";
import { ladeMedia } from "@/lib/policen/media";
import { klassifiziere, liesAus } from "@/lib/policen/ki";
import {
  ablehnungText,
  angekommenText,
  ANGEKOMMEN_RE,
  auszugZeile,
  cleanAuszug,
  dateiname,
  einwilligungText,
  EINWILLIGUNG_RE,
  entscheide,
  formatText,
  gesundheitAusText,
  istAbschluss,
  istAblehnung,
  istWiderruf,
  istZustimmung,
  KNOPF_JA,
  KNOPF_NEIN,
  loeschDatum,
  mimeErlaubt,
  nichtGeladenText,
  PAYLOAD_JA,
  PAYLOAD_NEIN,
  policenGesundheitAn,
  POLICEN_MAX_BYTES,
  POLICEN_MAX_JE_LEAD,
  sparteLabel,
  typAusInhalt,
  WARTEN_STUNDEN,
  widerrufText,
  zuGrossText,
  type Person,
  type PolicenTyp,
} from "@/lib/policen/regeln";

/** Quelle im Einwilligungsprotokoll (BestandConsentLog.source). */
export const CONSENT_SOURCE = "policen_gesundheit";

export type EingehendesMedium = { type: string; id?: string | null; mime_type?: string | null; filename?: string | null; caption?: string | null };

type Chat = { id: string; customerId: string; leadId: string; contactPhone: string; contactName: string | null };

async function chatOf(conversationId: string): Promise<Chat | null> {
  const c = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, customerId: true, leadId: true, contactPhone: true, contactName: true, lead: { select: { erasedAt: true } } },
  });
  if (!c?.leadId || c.lead?.erasedAt) return null;
  return { id: c.id, customerId: c.customerId, leadId: c.leadId, contactPhone: c.contactPhone, contactName: c.contactName };
}

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

/** „Danke, ist angekommen.“ höchstens einmal je zwei Minuten (mehrere Fotos auf einmal). */
async function bestaetige(chat: Chat, now: Date) {
  const recent = await prisma.message.findMany({
    where: { conversationId: chat.id, direction: "outbound", createdAt: { gte: new Date(now.getTime() - 2 * 60 * 1000) } },
    select: { body: true },
  });
  if (recent.some((m) => ANGEKOMMEN_RE.test(m.body ?? ""))) return;
  await send(chat, angekommenText());
}

/** Einwilligungsfrage mit zwei Knöpfen (interaktive Nachricht im 24-Stunden-Fenster). */
async function frageEinwilligung(chat: Chat, text: string) {
  const { isOptedOut } = await import("@/lib/whatsapp/stopp");
  if (await isOptedOut(chat.customerId, chat.contactPhone)) return;
  const apiKey = await apiKeyOf(chat.customerId);
  if (!apiKey) return;
  const body = ohneGedankenstriche(text);
  const r = await sendButtons(apiKey, chat.contactPhone, body, [
    { id: PAYLOAD_JA, title: KNOPF_JA },
    { id: PAYLOAD_NEIN, title: KNOPF_NEIN },
  ]);
  await prisma.message.create({
    data: { conversationId: chat.id, direction: "outbound", kind: "text", body, waMessageId: r.messageId, status: "sent", sentBy: "bot" },
  });
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

async function setzeBody(messageId: string | null, body: string) {
  if (messageId) await prisma.message.update({ where: { id: messageId }, data: { body } }).catch(() => null);
}

async function loeschfristFuer(leadId: string, eingang: Date): Promise<Date | null> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { status: true, appointments: { where: { status: { not: "cancelled" } }, select: { startsAt: true } } } });
  return loeschDatum({ termine: lead?.appointments.map((x) => x.startsAt) ?? [], eingang, abschluss: istAbschluss(lead?.status) });
}

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
}): Promise<{ handled: boolean; gespeichert?: string; verworfen?: string }> {
  const now = o.now ?? new Date();
  const chat = await chatOf(o.conversationId);
  if (!chat || !o.medium.id) return { handled: false };
  const { an, person } = await sprecher(chat);
  const antworte = async (text: string) => {
    if (o.botErlaubt) await send(chat, text).catch((e) => console.error("[policen antwort]", e));
  };
  const caption = (o.medium.caption ?? "").trim().slice(0, 300);
  const fertig = (verworfen?: string) => ({ handled: o.botErlaubt, ...(verworfen ? { verworfen } : {}) });

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
  const dl = await ladeMedia(apiKey, o.medium.id, POLICEN_MAX_BYTES);
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
  const fileName = dateiname(o.medium.filename, typ, now);
  // Nur Zuordnung (Sparte, Gesundheitsbezug), keine Inhalte
  const ki = await klassifiziere(dl.data, typ, fileName);
  const e = entscheide({ ki, text: `${fileName} ${caption}` });

  if (e.gesundheit) {
    // Schalter aus (bis der Anwalt geprüft hat): Datei verwerfen, freundlicher Hinweis
    if (!policenGesundheitAn()) {
      await setzeBody(o.messageId, "Dokument empfangen, nicht gespeichert (Gesundheitsangaben möglich)");
      await audit("policen.verworfen", { entity: "Lead", entityId: chat.leadId, customerId: chat.customerId, details: { grund: "gesundheit_aus", sparte: e.sparte }, actor: { role: "system" } });
      await antworte(gesundheitAusText(an, person));
      return fertig("gesundheit_aus");
    }
    const consent = await aktiveEinwilligung(chat.customerId, chat.contactPhone);
    if (consent) {
      const id = await speichere(chat, { messageId: o.messageId, typ, fileName, data: dl.data, sparte: e.sparte, gesundheit: true, consent: { id: consent.id, at: consent.createdAt }, now });
      await setzeBody(o.messageId, "Dokument empfangen (Gesundheitsangaben möglich)");
      if (o.botErlaubt) await bestaetige(chat, now);
      return { handled: o.botErlaubt, gespeichert: id };
    }
    // Ohne Einwilligung nichts speichern. Assistent aus (Vermittler hat übernommen): keine Rückfrage, verwerfen.
    if (!o.botErlaubt) {
      await setzeBody(o.messageId, "Dokument empfangen, nicht gespeichert (Gesundheitsangaben möglich, keine Einwilligung)");
      return { handled: false, verworfen: "keine_einwilligung" };
    }
    // Nur die WhatsApp-Media-ID merken (kein Inhalt), Einwilligung erfragen; nach „Ja“ wird neu geladen
    const offen = await prisma.leadDocument.count({ where: { leadId: chat.leadId, status: "wartet" } });
    await prisma.leadDocument.create({
      data: {
        customerId: chat.customerId,
        leadId: chat.leadId,
        conversationId: chat.id,
        messageId: o.messageId,
        status: "wartet",
        waMediaId: o.medium.id,
        mimeType: typ,
        fileName,
        size: dl.data.length,
        sparte: e.sparte,
        gesundheitsbezug: true,
      },
    });
    await setzeBody(o.messageId, "Dokument empfangen (wartet auf Einwilligung)");
    if (!offen) await frageEinwilligung(chat, einwilligungText(an, person));
    return { handled: true };
  }

  const id = await speichere(chat, { messageId: o.messageId, typ, fileName, data: dl.data, sparte: e.sparte, gesundheit: false, consent: null, now });
  await setzeBody(o.messageId, `Dokument empfangen: ${fileName}${caption ? `\n${caption}` : ""}`);
  if (o.botErlaubt) await bestaetige(chat, now);
  // Vertragsdaten auslesen (nur Sachversicherungen; Fehler stören den Chat nicht)
  if (ki?.police !== false && e.sparte !== "sonstig") {
    const x = await liesAus(dl.data, typ, fileName);
    if (x) await prisma.leadDocument.update({ where: { id }, data: { extracted: x, extractedAt: new Date(), ...(x.sparte && !e.sparte ? { sparte: x.sparte } : {}) } }).catch(() => null);
  }
  return { handled: o.botErlaubt, gespeichert: id };
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
 * Antwort des Leads, die Unterlagen betrifft: Knopf zur Einwilligung, getipptes Ja/Nein direkt auf die Frage,
 * „Widerruf“ bzw. „Unterlagen löschen“. handled = true: erledigt, der Assistent antwortet nicht.
 */
export async function handlePolicenAntwort(
  conversationId: string,
  m: { kind: string; text: string | null; payload: string | null },
  now = new Date(),
): Promise<{ handled: boolean }> {
  const chat = await chatOf(conversationId);
  if (!chat) return { handled: false };

  if (m.kind === "text" && istWiderruf(m.text)) {
    const [docs, consent] = await Promise.all([prisma.leadDocument.count({ where: { leadId: chat.leadId } }), aktiveEinwilligung(chat.customerId, chat.contactPhone)]);
    if (!docs && !consent) return { handled: false };
    await widerrufe(chat, "whatsapp");
    await send(chat, widerrufText((await sprecher(chat)).an));
    return { handled: true };
  }

  const pending = await prisma.leadDocument.findMany({ where: { leadId: chat.leadId, status: "wartet" }, orderBy: { createdAt: "asc" } });
  if (!pending.length) return { handled: false };
  const payload = m.payload ?? "";
  let ja = payload === PAYLOAD_JA;
  let nein = payload === PAYLOAD_NEIN;
  if (!ja && !nein && m.kind === "text") {
    const last = await prisma.message.findFirst({ where: { conversationId: chat.id, direction: "outbound" }, orderBy: { createdAt: "desc" }, select: { body: true } });
    if (EINWILLIGUNG_RE.test(last?.body ?? "")) {
      ja = istZustimmung(m.text);
      nein = istAblehnung(m.text);
    }
  }
  if (!ja && !nein) return { handled: false };
  const { an, person } = await sprecher(chat);

  if (nein || !policenGesundheitAn()) {
    await prisma.leadDocument.deleteMany({ where: { leadId: chat.leadId, status: "wartet" } });
    await send(chat, nein ? ablehnungText() : gesundheitAusText(an, person));
    return { handled: true };
  }

  // Einwilligung protokollieren (Wortlaut, Zeitpunkt, Nummer), dann die Dateien erneut laden und speichern
  const consent = await logConsent({
    customerId: chat.customerId,
    existingCustomerId: null,
    channel: "whatsapp",
    action: "erteilt",
    source: CONSENT_SOURCE,
    text: einwilligungText(an, person),
    address: chat.contactPhone,
    confirmedAt: now,
    at: now,
  });
  await audit("policen.einwilligung", { entity: "Lead", entityId: chat.leadId, customerId: chat.customerId, details: { consentId: consent.id, unterlagen: pending.length }, actor: { role: "lead" } });
  const apiKey = await apiKeyOf(chat.customerId);
  let ok = 0;
  for (const p of pending) {
    const dl = apiKey && p.waMediaId ? await ladeMedia(apiKey, p.waMediaId, POLICEN_MAX_BYTES) : null;
    const typ = dl?.ok ? typAusInhalt(dl.data) : null;
    if (!dl?.ok || !typ) {
      await prisma.leadDocument.delete({ where: { id: p.id } }).catch(() => null);
      continue;
    }
    await prisma.leadDocument.update({
      where: { id: p.id },
      data: {
        status: "gespeichert",
        waMediaId: null,
        data: encryptBytes(dl.data),
        size: dl.data.length,
        mimeType: typ,
        consentId: consent.id,
        consentAt: now,
        deleteAfter: await loeschfristFuer(chat.leadId, now),
      },
    });
    await setzeBody(p.messageId, "Dokument empfangen (Gesundheitsangaben möglich)");
    ok++;
  }
  if (ok) await logLeadHistory(chat.leadId, "dokument", `${ok === 1 ? "Unterlage" : `${ok} Unterlagen`} per WhatsApp erhalten (Gesundheitsangaben möglich, mit Einwilligung)`, { customerId: chat.customerId, userId: null });
  await send(chat, ok ? angekommenText() : nichtGeladenText(an));
  return { handled: true };
}

/** Widerruf: alle Unterlagen des Leads sofort löschen, Widerruf protokollieren. */
async function widerrufe(chat: Chat, via: "whatsapp" | "vermittler") {
  const del = await prisma.leadDocument.deleteMany({ where: { leadId: chat.leadId } });
  if (await aktiveEinwilligung(chat.customerId, chat.contactPhone)) {
    await logConsent({ customerId: chat.customerId, existingCustomerId: null, channel: "whatsapp", action: "widerrufen", source: CONSENT_SOURCE, address: chat.contactPhone, text: via === "whatsapp" ? "Widerruf per WhatsApp" : "Widerruf über den Vermittler" });
  }
  await audit("policen.widerruf", { entity: "Lead", entityId: chat.leadId, customerId: chat.customerId, details: { geloescht: del.count, via }, actor: { role: via === "whatsapp" ? "lead" : "BUYER" } });
  await logLeadHistory(chat.leadId, "dokument", `Unterlagen auf Wunsch des Kunden gelöscht (${del.count})`, { customerId: chat.customerId, userId: null });
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
};

/** Gespeicherte Unterlagen am Lead (ohne Inhalt). preview = Admin in „Als Kunde ansehen“. */
export async function listUnterlagen(leadId: string, opts: { preview: boolean }): Promise<UnterlageView[]> {
  const rows = await prisma.leadDocument.findMany({
    where: { leadId, status: "gespeichert" },
    orderBy: { createdAt: "desc" },
    select: { id: true, fileName: true, size: true, createdAt: true, sparte: true, gesundheitsbezug: true, consentAt: true, extracted: true },
  });
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

// ─── Löschfristen (täglicher Cron) ──────────────────────────────────────────

/**
 * Ausstehende Einwilligungen nach 24 Stunden verwerfen; gespeicherte Unterlagen 30 Tage nach dem letzten Termin
 * (ohne Termin: nach dem Eingang) löschen, wenn kein Abschluss. Bei Abschluss bleibt die Unterlage (deleteAfter null).
 */
export async function prunePolicen(now = new Date()) {
  const wartet = await prisma.leadDocument.deleteMany({ where: { status: "wartet", createdAt: { lt: new Date(now.getTime() - WARTEN_STUNDEN * 60 * 60 * 1000) } } });
  const docs = await prisma.leadDocument.findMany({
    where: { status: "gespeichert" },
    select: { id: true, createdAt: true, deleteAfter: true, lead: { select: { status: true, appointments: { where: { status: { not: "cancelled" } }, select: { startsAt: true } } } } },
  });
  const loeschen: string[] = [];
  let aktualisiert = 0;
  for (const d of docs) {
    const datum = loeschDatum({ termine: d.lead.appointments.map((x) => x.startsAt), eingang: d.createdAt, abschluss: istAbschluss(d.lead.status) });
    if (datum && datum.getTime() <= now.getTime()) loeschen.push(d.id);
    else if ((datum?.getTime() ?? null) !== (d.deleteAfter?.getTime() ?? null)) {
      await prisma.leadDocument.update({ where: { id: d.id }, data: { deleteAfter: datum } });
      aktualisiert++;
    }
  }
  const geloescht = loeschen.length ? (await prisma.leadDocument.deleteMany({ where: { id: { in: loeschen } } })).count : 0;
  return { wartet: wartet.count, geloescht, aktualisiert };
}
