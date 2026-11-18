// Angebot nach dem Termin senden und nachfassen, Datenbank-Teil (Paket P3, Ole 17.11.2026). Regeln und Texte:
// lib/angebot-senden.ts. Abfolgen: lib/lead-sequences.ts („offer“, „offer_selbst“).
//
//   ladeAngebotInfo        Daten fürs Blatt „Angebot senden“ (abgelegte PDFs, Kundenlink, Kanäle, Stand)
//   angebotSenden          Weg „app“: WhatsApp (Freitext im 24-h-Fenster, sonst die vorbereitete Vorlage offer_send) UND
//                          E-Mail mit PDF (Lead-Mail-Baustein), Kennzeichen am Termin, Nachfassen „offer“
//   angebotSelbst          Weg „selbst“: Kennzeichen, Nachfassen „offer_selbst“ (nur WhatsApp und Anruf)
//   angebotAblegen         PDF zum Termin vermerken („Angebot abgelegt am“), z. B. nach „Habe ich selbst gesendet“
//   sendeNachfassMail      Schritt „email“ der Abfolge (Tag 5) mit [Rückruf wünschen]
//   rueckrufWunsch         Minimalseite /rueckruf/<token>: Aufgabe und Push an den Vermittler, Nachfassen endet
//   runAngebotVorabCheck   Vorab-Check-Push am Vorabend jedes automatischen Nachfassens (WhatsApp, E-Mail), je Schritt einmal
// Team: Pushes an den zuständigen Berater, Mails über sein Postfach bzw. mit seinem Namen (lead-versand.ts).

import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { a, asAnsprache, anredeZeile, type Ansprache } from "@/lib/ansprache";
import { STANDARD_VORLAGEN_JE, type VorlageKey } from "@/lib/mail/vorlagen";
import { ansprechpartner } from "@/lib/lead-anrede";
import { logLeadHistory } from "@/lib/lead-history";
import { appointmentScope, type TeamCtx } from "@/lib/team";
import { publicUrlOr } from "@/lib/public-url";
import { leadLabel } from "@/lib/showup";
import { beitragAus, beitragEffektiv, cleanAngebote, gewaehlte } from "@/lib/angebote-daten";
import {
  ANGEBOT_LINK_TAGE,
  ANGEBOT_WIEDERVORLAGE,
  RUECKRUF_NOTIZ,
  angebotAnrufPush,
  angebotAnrufTag,
  angebotMail,
  angebotVorteile,
  mailWerte,
  vorlagenMail,
  type MailKnopf,
  type MailVorlageText,
  angebotThema,
  angebotVorlageParams,
  angebotWhatsAppText,
  kombiSatz,
  naechsterVersand,
  rueckrufPush,
  vorabCheckFaellig,
  vorabCheckPush,
  type AngebotWeg,
} from "@/lib/angebot-senden";
import { SEQUENCES, startAngebotNachfassen, stopSequences, topicOf, type SequenceCtx, type SequenceKind, type SequenceLogEntry } from "@/lib/lead-sequences";
import type { Werte } from "@/lib/mail/platzhalter";

const DAY = 24 * 60 * 60 * 1000;

type PushPayload = { title: string; body: string; url: string; tag: string };
export type PushFn = (userId: string | null, customerId: string, p: PushPayload) => Promise<unknown>;
const standardPush: PushFn = async (userId, customerId, p) => {
  const m = await import("@/lib/push");
  return userId ? m.sendToUser(userId, p) : m.sendToBuyersOfCustomer(customerId, p);
};

const neuerToken = () => randomBytes(24).toString("base64url");
const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

/** Link auf das Angebots-PDF für den Lead. */
export const angebotUrl = (token: string) => publicUrlOr(`/ihr-angebot/${token}`);
/** Link „Rückruf wünschen“. */
export const rueckrufUrl = (token: string) => publicUrlOr(`/rueckruf/${token}`);

type AuswahlZeile = { sparte: string; gesellschaft: string | null; tarif: string | null; beitrag: number | null };

/** Thema aus der Auswahl im Termin (gewählte Sparten), null ohne Angebote; dazu die Zeilen für {vorteil_1} bis 3. */
function themaAus(offersJson: unknown): { thema: string | null; rabatt: { prozent: number } | null; zeilen: AuswahlZeile[] } {
  if (!offersJson) return { thema: null, rabatt: null, zeilen: [] };
  const d = cleanAngebote(offersJson);
  const items = gewaehlte(d).filter((i) => !i.zusatz);
  const thema = items.length ? angebotThema(items.map((i) => i.sparte), "") : null;
  const zeilen = items.map((i) => ({ sparte: i.sparte, gesellschaft: i.gesellschaft, tarif: i.tarif, beitrag: beitragEffektiv(i) }));
  return { thema: thema || null, rabatt: beitragAus(d).rabatt, zeilen };
}

/** Text einer Vermittler-Vorlage (lib/mail/vorlagen.ts): die Kunden-Vorlage mit diesem Schlüssel, sonst der Standard. */
export async function mailVorlage(customerId: string, key: VorlageKey, an: Ansprache): Promise<MailVorlageText> {
  const eigen = await prisma.mailTemplate.findFirst({ where: { customerId, standardKey: key }, orderBy: { createdAt: "asc" }, select: { subject: true, body: true } }).catch(() => null);
  if (eigen?.body.trim()) return { subject: eigen.subject, body: eigen.body };
  const std = STANDARD_VORLAGEN_JE[an].find((v) => v.key === key) ?? STANDARD_VORLAGEN_JE.sie.find((v) => v.key === key)!;
  return { subject: std.subject, body: std.body };
}

/** Thema des zuletzt gesendeten Angebots eines Leads („Haftpflicht und Hausrat“) für das Nachfassen. */
export async function angebotThemaFuerLead(leadId: string): Promise<string | null> {
  const list = await prisma.appointment.findMany({ where: { leadId }, orderBy: { startsAt: "desc" }, take: 5, select: { offersJson: true, angebotGesendetAt: true } });
  const t = list.find((x) => x.angebotGesendetAt && x.offersJson) ?? list.find((x) => x.offersJson);
  return themaAus(t?.offersJson).thema;
}

const leadSelect = {
  id: true,
  customerId: true,
  name: true,
  phone: true,
  email: true,
  status: true,
  source: true,
  formData: true,
  contactOverrides: true,
  waConsent: true,
  waUnavailableAt: true,
  erasedAt: true,
  assignedUserId: true,
  customer: { select: { leadAddress: true } },
} as const;

async function terminMitLead(appointmentId: string, ctx: TeamCtx) {
  return prisma.appointment.findFirst({
    where: { id: appointmentId, ...appointmentScope(ctx), leadId: { not: null } },
    select: {
      id: true,
      startsAt: true,
      status: true,
      offersJson: true,
      offersConfirmedAt: true,
      shareToken: true,
      shareExpiresAt: true,
      angebotAbgelegtAt: true,
      angebotGesendetAt: true,
      angebotVersand: true,
      angebotKanaele: true,
      angebotDateiId: true,
      angebotToken: true,
      lead: { select: leadSelect },
    },
  });
}

async function chatVon(customerId: string, leadId: string, phone: string | null) {
  return prisma.conversation.findFirst({
    where: { customerId, OR: [{ leadId }, ...(phone ? [{ contactPhone: phone }] : [])] },
    orderBy: { lastMessageAt: "desc" },
    select: { id: true, windowExpiresAt: true, optedOutAt: true, contactEmail: true, _count: { select: { messages: { where: { direction: "inbound" } } } } },
  });
}

export type AngebotInfo = {
  appointmentId: string;
  leadId: string;
  name: string;
  /** Angebots-PDFs unter Dokumente am Kontakt, neueste zuerst */
  dateien: { id: string; fileName: string; createdAt: string }[];
  /** Vorausgewählt: das am Termin abgelegte bzw. das neueste */
  vorausgewaehlt: string | null;
  /** Kundenlink zur Beratungspräsentation: aktiv (schon geteilt), möglich (Angebote bestätigt) oder nicht */
  kundenlink: "aktiv" | "moeglich" | null;
  whatsapp: { moeglich: boolean; grund: string | null; fensterOffen: boolean; vorlage: boolean };
  email: string | null;
  thema: string;
  kombi: string | null;
  stand: { abgelegtAt: string | null; gesendetAt: string | null; versand: string | null; kanaele: string | null };
  /** Termin schon mit Ergebnis „Angebot gesendet“ (sonst setzt das Senden das Ergebnis) */
  ergebnisGesetzt: boolean;
  /** Vorschau der WhatsApp (Link als Platzhalter) */
  vorschau: string;
};

/** Daten fürs Blatt „Angebot senden“. null, wenn der Termin fehlt bzw. nicht sichtbar ist. */
export async function ladeAngebotInfo(appointmentId: string, ctx: TeamCtx, now = new Date()): Promise<AngebotInfo | null> {
  const t = await terminMitLead(appointmentId, ctx);
  const lead = t?.lead;
  if (!t || !lead || lead.erasedAt) return null;
  const [dateien, account, conv, vorlage, who] = await Promise.all([
    prisma.leadFile.findMany({ where: { leadId: lead.id, kind: "angebot" }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, fileName: true, createdAt: true } }),
    prisma.whatsAppAccount.findUnique({ where: { customerId: lead.customerId }, select: { status: true } }),
    chatVon(lead.customerId, lead.id, lead.phone),
    prisma.messageTemplate.count({ where: { customerId: lead.customerId, purpose: "offer_send", status: "approved" } }),
    ansprechpartner({ customerId: lead.customerId, leadId: lead.id, phone: lead.phone, name: lead.name }),
  ]);
  const an = asAnsprache(lead.customer.leadAddress);
  const { thema: themaTermin, rabatt } = themaAus(t.offersJson);
  const thema = themaTermin ?? topicOf(lead.formData, lead.source, an);
  const fensterOffen = !!conv?.windowExpiresAt && conv.windowExpiresAt.getTime() > now.getTime();
  const grund = !lead.phone
    ? "Keine Handynummer"
    : account?.status !== "connected"
      ? "WhatsApp nicht verbunden"
      : conv?.optedOutAt
        ? "Hat „Stopp“ geschrieben"
        : lead.waConsent === "nein" && !(conv?._count.messages ?? 0)
          ? "Keine WhatsApp-Einwilligung"
          : lead.waUnavailableAt && !(conv?._count.messages ?? 0)
            ? "Nicht per WhatsApp erreichbar"
            : null;
  const kombi = kombiSatz(rabatt, thema);
  const aktiv = !!t.shareToken && !!t.shareExpiresAt && t.shareExpiresAt.getTime() > now.getTime();
  return {
    appointmentId: t.id,
    leadId: lead.id,
    name: leadLabel(who.kontakt, lead.name),
    dateien: dateien.map((f) => ({ id: f.id, fileName: f.fileName, createdAt: f.createdAt.toISOString() })),
    vorausgewaehlt: (t.angebotDateiId && dateien.some((f) => f.id === t.angebotDateiId) ? t.angebotDateiId : dateien[0]?.id) ?? null,
    kundenlink: aktiv ? "aktiv" : t.offersConfirmedAt ? "moeglich" : null,
    whatsapp: { moeglich: !grund, grund, fensterOffen, vorlage: vorlage > 0 },
    email: lead.email?.trim() || conv?.contactEmail?.trim() || null,
    thema,
    kombi,
    stand: {
      abgelegtAt: t.angebotAbgelegtAt?.toISOString() ?? null,
      gesendetAt: t.angebotGesendetAt?.toISOString() ?? null,
      versand: t.angebotVersand,
      kanaele: t.angebotKanaele,
    },
    ergebnisGesetzt: t.status !== "booked" && (lead.status ?? "").toLowerCase() === "angebot gesendet",
    vorschau: angebotWhatsAppText({ an, kontakt: who.kontakt, thema, link: a(an, "[Link zu deinem Angebot]", "[Link zu Ihrem Angebot]"), kombi }),
  };
}

export type SendeErgebnis = { ok: true; kanaele: ("whatsapp" | "email")[]; hinweise: string[]; nachfassen: boolean } | { ok: false; error: string };

type SendeDeps = { now?: Date; userId?: string | null };

/** Nach dem Versand bzw. „selbst gesendet“: Kennzeichen, Verlauf, Nachfassen starten, klassische Wiedervorlage weg. */
async function nachDemVersand(
  t: { id: string; angebotAbgelegtAt: Date | null; angebotToken: string | null },
  lead: { id: string; customerId: string },
  o: { weg: AngebotWeg; kanaele: string[]; datei: { id: string; createdAt: Date; fileName: string } | null; token: string | null; now: Date; userId: string | null },
): Promise<boolean> {
  await prisma.appointment.update({
    where: { id: t.id },
    data: {
      angebotGesendetAt: o.now,
      angebotVersand: o.weg,
      angebotKanaele: o.kanaele.join(",") || null,
      ...(o.datei ? { angebotDateiId: o.datei.id, angebotAbgelegtAt: t.angebotAbgelegtAt ?? o.now } : {}),
      ...(o.token ? { angebotToken: o.token } : {}),
    },
  });
  const wie = o.kanaele.length === 2 ? "per WhatsApp und E-Mail" : o.kanaele[0] === "whatsapp" ? "per WhatsApp" : "per E-Mail";
  await logLeadHistory(
    lead.id,
    "status",
    o.weg === "app" ? `Angebot gesendet ${wie}${o.datei ? `: ${o.datei.fileName}` : ""}` : `Angebot selbst gesendet${o.datei ? ` (abgelegt: ${o.datei.fileName})` : ""}`,
    { customerId: lead.customerId, userId: o.userId },
  );
  const seq = await startAngebotNachfassen(lead.id, o.weg, o.now).catch((e) => {
    console.error("[angebot nachfassen]", e);
    return null;
  });
  if (seq) await angebotWiedervorlageWeg(lead.id);
  return !!seq;
}

/** Die klassische Wiedervorlage „Angebot nachfassen“ entfällt, sobald die Abfolge nachfasst. */
export async function angebotWiedervorlageWeg(leadId: string): Promise<void> {
  const running = await prisma.leadSequence.count({ where: { leadId, stoppedAt: null, kind: { in: ["offer", "offer_selbst"] } } });
  if (!running) return;
  await prisma.lead.updateMany({ where: { id: leadId, followUpNote: ANGEBOT_WIEDERVORLAGE }, data: { followUpAt: null, followUpNote: null } });
}

/**
 * Weg „app“: Angebot per WhatsApp UND E-Mail senden. Gilt als gesendet, wenn mindestens ein Kanal geklappt hat; die
 * Gründe für einen fehlenden Kanal kommen als Hinweis zurück. dateiId: Angebots-PDF des Leads (Pflicht).
 */
export async function angebotSenden(appointmentId: string, ctx: TeamCtx, input: { dateiId: string; kundenlink: boolean }, deps: SendeDeps = {}): Promise<SendeErgebnis> {
  const now = deps.now ?? new Date();
  const t = await terminMitLead(appointmentId, ctx);
  const lead = t?.lead;
  if (!t || !lead || lead.erasedAt) return { ok: false, error: "Termin nicht gefunden." };
  const datei = await prisma.leadFile.findFirst({ where: { id: input.dateiId, leadId: lead.id }, select: { id: true, fileName: true, contentType: true, data: true, createdAt: true } });
  if (!datei) return { ok: false, error: "Bitte zuerst das Angebot als PDF hochladen." };

  const an = asAnsprache(lead.customer.leadAddress);
  const who = await ansprechpartner({ customerId: lead.customerId, leadId: lead.id, phone: lead.phone, name: lead.name });
  const { thema: themaTermin, rabatt, zeilen } = themaAus(t.offersJson);
  const thema = themaTermin ?? topicOf(lead.formData, lead.source, an);
  const kombi = kombiSatz(rabatt, thema);
  const token = t.angebotToken ?? neuerToken();
  // Link zuerst festhalten, damit er schon beim Öffnen aus der Nachricht funktioniert
  await prisma.appointment.update({ where: { id: t.id }, data: { angebotToken: token, angebotDateiId: datei.id } });
  const link = angebotUrl(token);
  let kundenlink: string | null = null;
  if (input.kundenlink) {
    const { kundenlinkErstellen } = await import("@/lib/termin-vorbereitung-server");
    const k = await kundenlinkErstellen(t.id, ctx, now);
    if (k) kundenlink = publicUrlOr(`/beratung/${k.token}`);
  }

  const kanaele: ("whatsapp" | "email")[] = [];
  const hinweise: string[] = [];

  // WhatsApp: im offenen Fenster Oles Text als Freitext, sonst die vorbereitete Vorlage (bis zur Freigabe: nur E-Mail)
  const conv = await chatVon(lead.customerId, lead.id, lead.phone);
  if (!lead.phone) hinweise.push("WhatsApp: keine Handynummer");
  else {
    try {
      const { firstNameOf, sendWhatsAppNotice } = await import("@/lib/whatsapp/templates");
      await sendWhatsAppNotice({
        customerId: lead.customerId,
        to: lead.phone,
        purpose: "offer_send",
        params: angebotVorlageParams({ firstName: firstNameOf(lead.name), thema, link }),
        text: angebotWhatsAppText({ an, kontakt: who.kontakt, thema, link, kundenlink, kombi }),
        leadId: lead.id,
        contactName: lead.name,
        anrede: who.kontakt,
        textButtons: [],
        manuell: true,
      });
      kanaele.push("whatsapp");
    } catch (err) {
      const { NoTemplateError } = await import("@/lib/whatsapp/templates");
      hinweise.push(
        err instanceof NoTemplateError
          ? "WhatsApp: Der Chat ruht seit über 24 Stunden, die Vorlage dafür ist noch nicht freigegeben"
          : `WhatsApp: ${(err instanceof Error ? err.message : String(err)).slice(0, 120)}`,
      );
    }
  }

  // E-Mail im Namen des Vermittlers mit dem PDF im Anhang (Lead-Mail-Baustein)
  const to = lead.email?.trim() || conv?.contactEmail?.trim() || null;
  if (!to) hinweise.push("E-Mail: keine Adresse bekannt");
  else {
    const { leadVersandKontext, sendeLeadMail } = await import("@/lib/mail/lead-versand");
    const k = await leadVersandKontext(lead.customerId, { leadId: lead.id, who });
    // Text aus der Vorlage „Angebot“ des Vermittlers; Vorteile aus der Auswahl im Termin (Kombi-Rabatt nur, wenn berechnet)
    const vorlage = await mailVorlage(lead.customerId, "angebot", an);
    // {anruf_tag}: der Tag der Anruf-Aufgabe im Nachfassen (Tag 3), damit Mail und Aufgabe zusammenpassen
    const anrufTag = SEQUENCES.offer.steps.find((x) => x.action === "call")?.day ?? 3;
    const werte = mailWerte({ an, kontakt: who.kontakt, thema, meinname: k.daten.name, now, extra: { ...angebotVorteile(zeilen, kombi), anruf_tag: angebotAnrufTag(now, anrufTag) } });
    const res = await sendeLeadMail(k, {
      to,
      inhalt: (sig) => angebotMail({ vorlage, werte, link, kundenlink, signatur: sig }),
      attachments: datei.data.length <= 10 * 1024 * 1024 ? [{ fileName: datei.fileName, contentType: datei.contentType, data: Buffer.from(datei.data) }] : undefined,
      protokoll: { customerId: lead.customerId, leadId: lead.id, art: "angebot", userId: deps.userId ?? ctx.userId },
    });
    if (res.sent) kanaele.push("email");
    else hinweise.push(res.reason === "not_configured" ? "E-Mail: Versand ist nicht eingerichtet" : `E-Mail: ${res.reason.slice(0, 120)}`);
  }

  if (!kanaele.length) return { ok: false, error: `Das Angebot ist nicht rausgegangen. ${hinweise.join(". ")}.` };
  const nachfassen = await nachDemVersand(t, lead, { weg: "app", kanaele, datei, token, now, userId: deps.userId ?? ctx.userId });
  return { ok: true, kanaele, hinweise, nachfassen };
}

/** Weg „selbst“: ein Tipp, Upload optional (dateiId). Nachfassen nur per WhatsApp und Anruf. */
export async function angebotSelbst(appointmentId: string, ctx: TeamCtx, input: { dateiId?: string | null } = {}, deps: SendeDeps = {}): Promise<SendeErgebnis> {
  const now = deps.now ?? new Date();
  const t = await terminMitLead(appointmentId, ctx);
  const lead = t?.lead;
  if (!t || !lead || lead.erasedAt) return { ok: false, error: "Termin nicht gefunden." };
  const datei = input.dateiId ? await prisma.leadFile.findFirst({ where: { id: input.dateiId, leadId: lead.id }, select: { id: true, fileName: true, createdAt: true } }) : null;
  const nachfassen = await nachDemVersand(t, lead, { weg: "selbst", kanaele: [], datei, token: null, now, userId: deps.userId ?? ctx.userId });
  return { ok: true, kanaele: [], hinweise: [], nachfassen };
}

/** PDF zum Termin vermerken („Angebot abgelegt am“), z. B. nach „Habe ich selbst gesendet“. */
export async function angebotAblegen(appointmentId: string, ctx: TeamCtx, dateiId: string, now = new Date()): Promise<boolean> {
  const t = await terminMitLead(appointmentId, ctx);
  if (!t?.lead) return false;
  const datei = await prisma.leadFile.findFirst({ where: { id: dateiId, leadId: t.lead.id }, select: { id: true } });
  if (!datei) return false;
  await prisma.appointment.update({ where: { id: t.id }, data: { angebotDateiId: datei.id, angebotAbgelegtAt: t.angebotAbgelegtAt ?? now } });
  return true;
}

/** Öffentlicher Link auf das Angebots-PDF: Datei oder null (unbekannt, abgelaufen, gelöscht). */
export async function ladeAngebotDatei(token: string, now = new Date()) {
  if (!TOKEN_RE.test(token)) return null;
  const t = await prisma.appointment.findUnique({
    where: { angebotToken: token },
    select: { angebotDateiId: true, angebotGesendetAt: true, leadId: true, lead: { select: { erasedAt: true } } },
  });
  if (!t?.angebotDateiId || !t.leadId || t.lead?.erasedAt) return null;
  if (t.angebotGesendetAt && t.angebotGesendetAt.getTime() + ANGEBOT_LINK_TAGE * DAY < now.getTime()) return null;
  return prisma.leadFile.findFirst({ where: { id: t.angebotDateiId, leadId: t.leadId }, select: { fileName: true, contentType: true, data: true } });
}

async function zustaendigUndName(leadId: string) {
  const l = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true, customerId: true, name: true, formData: true, contactOverrides: true, assignedUserId: true } });
  if (!l) return null;
  const { kontaktFromLead } = await import("@/lib/lead-anrede");
  return { lead: l, name: leadLabel(kontaktFromLead(l)) };
}

/** Tag 3 des Nachfassens: Push „Frau Becker anrufen: Fragen zum Angebot?“ an den zuständigen Berater. */
export async function angebotAnrufPushSenden(leadId: string, push: PushFn = standardPush): Promise<void> {
  const z = await zustaendigUndName(leadId);
  if (!z) return;
  await push(z.lead.assignedUserId, z.lead.customerId, angebotAnrufPush({ leadId, name: z.name }));
}

/** Rückruf-Token des Leads (anlegen, falls noch keiner da ist). */
export async function rueckrufToken(leadId: string): Promise<string> {
  const l = await prisma.lead.findUnique({ where: { id: leadId }, select: { rueckrufToken: true } });
  if (l?.rueckrufToken) return l.rueckrufToken;
  const token = neuerToken();
  const n = await prisma.lead.updateMany({ where: { id: leadId, rueckrufToken: null }, data: { rueckrufToken: token } });
  if (n.count) return token;
  return (await prisma.lead.findUniqueOrThrow({ where: { id: leadId }, select: { rueckrufToken: true } })).rueckrufToken!;
}

/**
 * Schritt „email“ einer Abfolge (z. B. Angebot Tag 5): Text aus der Vermittler-Vorlage des Schritts, Rahmen mit den
 * Knöpfen des Schritts ([Angebot ansehen], [Rückruf wünschen] bzw. {rueckruf_link}).
 */
export async function sendeNachfassMail(
  seq: { leadId: string; customerId: string; step: number; kind?: string },
  step: { vorlage: VorlageKey; knoepfe?: ("angebot" | "rueckruf")[]; zusatz?: (c: SequenceCtx) => Partial<Werte> },
  now = new Date(),
): Promise<SequenceLogEntry> {
  const base = { at: now.toISOString(), step: seq.step, action: "email" as const };
  const lead = await prisma.lead.findUnique({ where: { id: seq.leadId }, select: leadSelect });
  if (!lead || lead.erasedAt) return { ...base, result: "skipped", detail: "Lead gelöscht" };
  const conv = await chatVon(lead.customerId, lead.id, lead.phone);
  const to = lead.email?.trim() || conv?.contactEmail?.trim() || null;
  if (!to) return { ...base, result: "skipped", detail: "keine E-Mail-Adresse" };
  const an = asAnsprache(lead.customer.leadAddress);
  const who = await ansprechpartner({ customerId: lead.customerId, leadId: lead.id, phone: lead.phone, name: lead.name });
  const termin = await prisma.appointment.findFirst({
    where: { leadId: lead.id, angebotGesendetAt: { not: null }, angebotToken: { not: null } },
    orderBy: { angebotGesendetAt: "desc" },
    select: { angebotToken: true, offersJson: true },
  });
  const knoepfe = step.knoepfe ?? [];
  const angebot = knoepfe.includes("angebot") && termin?.angebotToken && (await ladeAngebotDatei(termin.angebotToken, now)) ? angebotUrl(termin.angebotToken) : null;
  const rueckruf = knoepfe.includes("rueckruf") ? rueckrufUrl(await rueckrufToken(lead.id)) : null;
  const { firstNameOf } = await import("@/lib/whatsapp/templates");
  const { vermittlerName } = await import("@/lib/whatsapp/gespraech");
  const ctx: SequenceCtx = {
    firstName: firstNameOf(lead.name),
    hi: anredeZeile(an, who.kontakt),
    kontakt: who.kontakt,
    topic: themaAus(termin?.offersJson).thema ?? topicOf(lead.formData, lead.source, an),
    an,
    person: vermittlerName(an, { name: who.vermittler.name, anrede: who.vermittler.anrede, fallback: who.advisor || who.firm }),
  };
  const { leadVersandKontext, sendeLeadMail } = await import("@/lib/mail/lead-versand");
  const k = await leadVersandKontext(lead.customerId, { leadId: lead.id, who });
  const vorlage = await mailVorlage(lead.customerId, step.vorlage, an);
  const werte = mailWerte({ an, kontakt: who.kontakt, thema: ctx.topic, meinname: k.daten.name, now, extra: { ...(rueckruf ? { rueckruf_link: rueckruf } : {}), ...step.zusatz?.(ctx) } });
  const rahmen: MailKnopf[] = [
    ...(angebot ? [{ label: "Angebot ansehen", href: angebot, primary: !rueckruf }] : []),
    ...(rueckruf ? [{ label: "Rückruf wünschen", href: rueckruf }] : []),
  ];
  const res = await sendeLeadMail(k, {
    to,
    inhalt: (sig) => vorlagenMail({ vorlage, werte, knoepfe: rahmen, signatur: sig }),
    protokoll: { customerId: lead.customerId, leadId: lead.id, art: step.vorlage === "nachfassen_angebot" ? "angebot_nachfassen" : "manuell" },
  });
  return res.sent ? { ...base, result: "sent" } : { ...base, result: res.reason === "not_configured" ? "skipped" : "failed", detail: res.reason === "not_configured" ? "Versand nicht eingerichtet" : res.reason.slice(0, 160) };
}

/** Lead für die Rückruf-Seite (Name des Vermittlers, Ansprache). null bei unbekanntem Token. */
export async function ladeRueckruf(token: string) {
  if (!TOKEN_RE.test(token)) return null;
  const lead = await prisma.lead.findUnique({ where: { rueckrufToken: token }, select: { id: true, customerId: true, name: true, phone: true, erasedAt: true, rueckrufGewuenschtAt: true, customer: { select: { leadAddress: true, name: true } } } });
  if (!lead || lead.erasedAt) return null;
  const an = asAnsprache(lead.customer.leadAddress);
  const who = await ansprechpartner({ customerId: lead.customerId, leadId: lead.id, phone: lead.phone, name: lead.name });
  const { vermittlerName } = await import("@/lib/whatsapp/gespraech");
  const person = vermittlerName(an, { name: who.vermittler.name, anrede: who.vermittler.anrede, fallback: who.advisor || who.firm });
  return { leadId: lead.id, customerId: lead.customerId, an, person, gewuenschtAt: lead.rueckrufGewuenschtAt };
}

/**
 * „Rückruf wünschen“ (Minimalseite, Ausbau mit Zeitfenstern in P5): Aufgabe für heute auf „Heute“, Push an den
 * zuständigen Berater, Verlauf, Nachfassen zum Angebot endet (der Vermittler ruft an). Innerhalb einer Stunde nur
 * einmal (doppeltes Tippen, Vorschau von Mailprogrammen löst nichts aus: nur per Knopf, POST).
 */
export async function rueckrufWunsch(token: string, deps: { now?: Date; push?: PushFn } = {}): Promise<"ok" | "schon" | null> {
  const now = deps.now ?? new Date();
  const r = await ladeRueckruf(token);
  if (!r) return null;
  if (r.gewuenschtAt && now.getTime() - r.gewuenschtAt.getTime() < 60 * 60 * 1000) return "schon";
  await prisma.lead.update({ where: { id: r.leadId }, data: { rueckrufGewuenschtAt: now, followUpAt: now, followUpNote: RUECKRUF_NOTIZ, callbackSnoozedUntil: null } });
  await logLeadHistory(r.leadId, "wiedervorlage", "Rückruf gewünscht (Link in der E-Mail zum Angebot)", { customerId: r.customerId, userId: null });
  await stopSequences(r.leadId, "Lead wünscht Rückruf", { now });
  const z = await zustaendigUndName(r.leadId);
  if (z) await (deps.push ?? standardPush)(z.lead.assignedUserId, z.lead.customerId, rueckrufPush({ leadId: r.leadId, name: z.name })).catch((e) => console.error("[rueckruf push]", e));
  return "ok";
}

const ANGEBOT_ABFOLGEN: SequenceKind[] = ["offer", "offer_selbst"];

/**
 * Vorab-Check (Ole, 17.11.2026, Ergänzung C): Am Vorabend jedes automatischen Nachfassens zum Angebot (WhatsApp, E-Mail;
 * nicht vor Anruf-Aufgaben) bekommt der zuständige Berater einen Push mit Link auf das Nachfassen am Kontakt, dort kann er
 * es anhalten. Je Schritt einmal (LeadSequence.vorabCheckStep), nur 8 bis 21 Uhr; aus dem Lauf alle paar Minuten.
 */
export async function runAngebotVorabCheck(now = new Date(), push: PushFn = standardPush): Promise<{ gesendet: number }> {
  const seqs = await prisma.leadSequence.findMany({
    where: {
      stoppedAt: null,
      kind: { in: ANGEBOT_ABFOLGEN },
      nextAt: { not: null, lte: new Date(now.getTime() + 3 * DAY) },
      // „Alle pausieren“ am Kontakt (P6): kein Vorab-Check, solange pausiert
      lead: { erasedAt: null, customer: { dormantSince: null }, nachrichtenPausiertAt: null },
    },
    select: { id: true, leadId: true, kind: true, step: true, nextAt: true, vorabCheckStep: true, uebersprungen: true },
    take: 200,
  });
  let gesendet = 0;
  for (const s of seqs) {
    const step = SEQUENCES[s.kind as SequenceKind]?.steps[s.step];
    // Übersprungener Schritt (P6): nichts anzukündigen
    if (!step || step.action === "call" || s.vorabCheckStep === s.step || !s.nextAt || s.uebersprungen.includes(s.step)) continue;
    const versand = naechsterVersand(new Date(Math.max(s.nextAt.getTime(), now.getTime())));
    if (!vorabCheckFaellig({ now, versand })) continue;
    // Beanspruchen (nie doppelt, auch bei parallelen Läufen)
    const claimed = await prisma.leadSequence.updateMany({
      where: { id: s.id, step: s.step, stoppedAt: null, OR: [{ vorabCheckStep: null }, { vorabCheckStep: { not: s.step } }] },
      data: { vorabCheckStep: s.step },
    });
    if (!claimed.count) continue;
    const z = await zustaendigUndName(s.leadId);
    if (!z) continue;
    await push(z.lead.assignedUserId, z.lead.customerId, vorabCheckPush({ leadId: s.leadId, name: z.name, kanal: step.action, versand, now })).catch((e) => console.error("[angebot vorab-check]", e));
    gesendet++;
  }
  return { gesendet };
}
