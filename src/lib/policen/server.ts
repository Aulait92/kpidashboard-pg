// Policen vor dem Termin per WhatsApp (Ole, 17.11.2026, neu gefasst 18.11.2026 nach der Rechtsprüfung
// docs/recht/policen-whatsapp-gesundheitsdaten.md): Eingang, Einwilligung, Widerruf, Ansicht, Löschung, Erinnerungen.
// Texte: lib/policen/bitte.ts und lib/policen/regeln.ts. Ablage: lib/policen/ablage.ts (privater EU-Bucket).
// Aufgerufen aus lib/whatsapp/gateway.ts (eingehende Bilder/PDFs und Antworten).
//
// KEINE KI (Ole, 18.11.2026): Dieses Modul importiert keinen KI-Client und gibt Dateien, Dateinamen und Begleittexte
// an niemanden außer dem verschlüsselten Speicher und dem zuständigen Vermittler. Keine OCR, keine Zuordnung, kein
// Auslesen, kein Widerruf per KI, für alle Sparten. Der Assistent läuft bei eingehenden Medien nicht (gateway.ts:
// handled bzw. botErlaubt = false). Abgesichert durch tests/unit/policen.test.ts („keine KI“) und
// tests/integration/policen-whatsapp.test.ts (KI-Client wird beim Dokumenteingang nie aufgerufen).
//
// Tor (A2): Ohne Einwilligung wird nichts von Meta/360dialog abgerufen; nur die Media-ID bleibt höchstens 24 Stunden,
// die Nachfrage kommt einmal je Lead. Nachweis (A3): PolicenNachweis, nur anhängen. Widerruf (A4): sofort alles löschen.
// Logs (A7): keine Inhalte, Dateinamen, Medien-Adressen; Push neutral „Neue Unterlagen von {Lead}“.
// „ohne KI“ (A9): Stichwort vor oder nach „Einverstanden“ (auch als Begleittext einer Datei, nur Regeln, bitte.ts
// istOhneKi): Nachweis „ohne_ki“, Einwilligung mit ki = false, feste Bestätigung, ausgelesene Werte gelöscht
// (kiAbwaehlen), künftig nichts ausgelesen (lib/policen/ohne-ki.ts). Der Assistent antwortet darauf nicht.
//
// Sicherheit vor dem breiten Start (Ole, 18.11.2026): Virenprüfung jeder Datei vor der Ablage (lib/sicherheit/
// virenpruefung.ts; Befund: verwerfen, Lead neutral informieren, Vermittler-Hinweis, Änderungsprotokoll; ungeprüft:
// ablegen, aber erst nach der Prüfung anbieten), Öffnen nur mit Zwei-Faktor-Login (AVV § 5), jede Löschung im
// Löschprotokoll (lib/loeschprotokoll.ts), eigener Datenschlüssel je Datei (Crypto-Shredding, ablage.ts Format 2).

import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { decryptBytes, decryptSecret } from "@/lib/encryption";
import { logLeadHistory } from "@/lib/lead-history";
import { asAnsprache, type Ansprache, type Salutation } from "@/lib/ansprache";
import { ansprechpartner } from "@/lib/lead-anrede";
import { advisorDisplayName, firmDisplayName } from "@/lib/advisor-name";
import { vermittlerName } from "@/lib/whatsapp/gespraech";
import { sendWhatsAppMessage } from "@/lib/whatsapp/gateway";
import { ladeMedia, loescheMedia } from "@/lib/policen/media";
import { ablageBereit, holeAb, legeAb, listeAb, loescheAb } from "@/lib/policen/ablage";
import { entscheide, meldeUngeprueft, pruefeAufViren, virenKonfig } from "@/lib/sicherheit/virenpruefung";
import { protokolliereLoeschung } from "@/lib/loeschprotokoll";
import { zweiFaktorAktiv } from "@/lib/totp-account";
import {
  abschlussSchritt,
  angekommenKurzText,
  angekommenText,
  ANGEKOMMEN_RE,
  ausText,
  BEHALTEN_VERMERK,
  CHAT_HINWEIS,
  dateiname,
  DATENSCHUTZ_VERSION,
  formatText,
  gesundheitAusText,
  gesundheitFreigegeben,
  GESUNDHEIT_FREIGABE_SELECT,
  istAbschluss,
  istGesundheitsbezug,
  istWiderruf,
  istZustimmung,
  loeschDatum,
  mimeErlaubt,
  minderjaehrig,
  minderjaehrigLautChat,
  minderjaehrigText,
  nichtGeladenText,
  policenNotAus,
  POLICEN_MAX_BYTES,
  POLICEN_MAX_JE_LEAD,
  sparteAusText,
  sparteLabel,
  spaeterText,
  typAusInhalt,
  virenText,
  typAusMime,
  WARTEN_STUNDEN,
  ERINNERUNG_OPTIN_TEXT,
  ERINNERUNG_OPTIN_VERSION,
  widerrufText,
  zuGrossText,
  gesundheitInText,
  type Person,
  type PolicenTyp,
} from "@/lib/policen/regeln";
import {
  einwilligungsAntwort,
  einwilligungTextVersionAus,
  EINWILLIGUNG_RE,
  istOhneKi,
  lieberNichtText,
  NACHFRAGE_RE,
  nachEinwilligungText,
  ohneKiBestaetigung,
  ohneStichwort,
  policenEinwilligung,
  policenNachfrage,
  type BitteVermittler,
  type Nachricht,
} from "@/lib/policen/bitte";
import { kiAbgelehnt, NACHWEIS_OHNE_KI } from "@/lib/policen/ohne-ki";
import { bestaetigung, istNeinDanke, KNOPF_ZUSTIMMEN, FORMULAR, neinDankeAntwort, PAYLOAD_NEIN_DANKE, PAYLOAD_SPAETER, tagText, uhrzeitText } from "@/lib/policen/flow/texte";

export type EingehendesMedium = { type: string; id?: string | null; mime_type?: string | null; filename?: string | null; caption?: string | null };

/** Policen-Funktion an? Ablage eingerichtet (privater EU-Bucket, Schlüssel) und kein Notschalter. */
export const policenAn = () => ablageBereit() && !policenNotAus();

type Chat = { id: string; customerId: string; leadId: string; contactPhone: string; contactName: string | null; minderjaehrig: boolean };

async function chatOf(conversationId: string): Promise<Chat | null> {
  const c = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, customerId: true, leadId: true, contactPhone: true, contactName: true, qualificationData: true, lead: { select: { erasedAt: true, formData: true } } },
  });
  if (!c?.leadId || c.lead?.erasedAt) return null;
  // Formular oder im Chat bestätigtes Geburtsdatum unter 18 (lib/whatsapp/geburt-chat.ts)
  const minderjaehrigJa = minderjaehrig(c.lead?.formData) || minderjaehrigLautChat(c.qualificationData);
  return { id: c.id, customerId: c.customerId, leadId: c.leadId, contactPhone: c.contactPhone, contactName: c.contactName, minderjaehrig: minderjaehrigJa };
}

type Sprecher = { an: Ansprache; person: Person; vermittler: BitteVermittler; firma: string | null; datenschutzUrl: string | null; gesundheitAn: boolean };

/** Ansprache, Vermittler, Firma, Datenschutzhinweis und Freigabe Kranken/BU/Leben (wie im Assistenten). */
async function sprecher(chat: Chat): Promise<Sprecher> {
  const [customer, erst] = await Promise.all([
    prisma.customer.findUnique({ where: { id: chat.customerId }, select: { name: true, leadAddress: true, ...GESUNDHEIT_FREIGABE_SELECT } }),
    prisma.erstinformation.findUnique({ where: { customerId: chat.customerId }, select: { firma: true } }).catch(() => null),
  ]);
  const an = asAnsprache(customer?.leadAddress);
  const who = await ansprechpartner({ customerId: chat.customerId, leadId: chat.leadId, phone: chat.contactPhone, name: chat.contactName });
  const advisor = who.advisor || advisorDisplayName(customer?.name) || (an === "du" ? "deinem Berater" : "Ihrem Berater");
  const person = vermittlerName(an, { name: who.vermittler.name, anrede: who.vermittler.anrede, fallback: advisor });
  const eigeneUrl = (customer?.policenDatenschutzUrl ?? "").trim();
  const datenschutzUrl = /^https:\/\//i.test(eigeneUrl)
    ? eigeneUrl
    : await import("@/lib/policen/verantwortlicher").then((m) => m.policenDatenschutzUrl(chat.customerId)).catch(() => null);
  return {
    an,
    person,
    vermittler: { ...person, anrede: (who.vermittler.anrede as Salutation | null | undefined) ?? null, name: who.vermittler.name ?? null },
    firma: erst?.firma?.trim() || firmDisplayName(customer?.name) || null,
    datenschutzUrl,
    gesundheitAn: gesundheitFreigegeben(customer),
  };
}

/**
 * Bitte um Policen und Einwilligung für diesen Chat (Vermittler, Firma, Datenschutzhinweis, Freigabe Kranken/BU/Leben
 * wie beim Eingang). null = Funktion aus, kein Lead oder minderjährig laut Formular. Für den Assistenten (P2) und
 * lib/policen/assistent.ts.
 */
export async function policenBitteFuerChat(conversationId: string): Promise<import("@/lib/policen/bitte").PolicenBitte | null> {
  if (!policenAn()) return null;
  const chat = await chatOf(conversationId);
  if (!chat || chat.minderjaehrig) return null;
  const sp = await sprecher(chat);
  const { policenBitte } = await import("@/lib/policen/bitte");
  return policenBitte(sp);
}

/** Chat und Sprecher für die Policen-Strecke v2 (lib/policen/flow/server.ts). null = kein Lead-Chat. */
export async function policenSprecherFuerChat(conversationId: string): Promise<{ chat: Chat; sp: Sprecher } | null> {
  const chat = await chatOf(conversationId);
  if (!chat) return null;
  return { chat, sp: await sprecher(chat) };
}

async function apiKeyOf(customerId: string): Promise<string | null> {
  const acc = await prisma.whatsAppAccount.findUnique({ where: { customerId }, select: { status: true, apiKeyEnc: true } });
  return acc?.status === "connected" && acc.apiKeyEnc ? decryptSecret(acc.apiKeyEnc) : null;
}

const send = (chat: Chat, n: Nachricht | string) =>
  typeof n === "string"
    ? sendWhatsAppMessage({ customerId: chat.customerId, to: chat.contactPhone, body: n, sentBy: "bot" })
    : sendWhatsAppMessage({ customerId: chat.customerId, to: chat.contactPhone, body: n.text, sentBy: "bot", buttons: n.knoepfe.length ? n.knoepfe : null, footer: n.fusszeile });

/** Fehler ohne Inhalte protokollieren (A7). */
const logFehler = (wo: string, e: unknown) => console.error(`[policen ${wo}]`, e instanceof Error ? e.name : "Fehler");

/** Datei bei 360dialog/Meta löschen, sobald sie nicht mehr gebraucht wird (bestmöglich). */
async function mediaWeg(customerId: string, mediaIds: (string | null | undefined)[], apiKey?: string | null) {
  const ids = mediaIds.filter((x): x is string => !!x);
  if (!ids.length) return;
  const key = apiKey ?? (await apiKeyOf(customerId).catch(() => null));
  if (!key) return;
  await Promise.all(ids.map((id) => loescheMedia(key, id).catch(() => false)));
}

/** Ausgehende Nachrichten an diesen Lead (alle Chats des Leads), neueste zuerst. */
async function ausgehend(leadId: string, filter?: string) {
  return prisma.message.findMany({
    where: { conversation: { leadId }, direction: "outbound", ...(filter ? { body: { contains: filter } } : {}) },
    orderBy: { createdAt: "desc" },
    select: { body: true, waMessageId: true },
    take: 200,
  });
}

// ─── Nachweis (A3, nur anhängen) ────────────────────────────────────────────

type NachweisArt = "einwilligung" | "abgelehnt" | "widerruf" | "erinnerung_optin" | "erinnerung_stopp" | typeof NACHWEIS_OHNE_KI;

async function nachweis(o: {
  customerId: string;
  leadId: string | null;
  phone: string;
  art: NachweisArt;
  quelle: "whatsapp" | "buchung" | "vermittler" | "system";
  ki?: boolean | null;
  wortlaut?: string | null;
  textVersion?: string | null;
  datenschutzUrl?: string | null;
  waMessageId?: string | null;
  frageWaMessageId?: string | null;
  vermittlerName?: string | null;
  vermittlerUserId?: string | null;
  /** SHA-256 des Wortlauts (Policen-Strecke v2, Formular) */
  textHash?: string | null;
  at?: Date;
}) {
  const vermittlerUserId =
    o.vermittlerUserId !== undefined ? o.vermittlerUserId : o.leadId ? ((await prisma.lead.findUnique({ where: { id: o.leadId }, select: { assignedUserId: true } }))?.assignedUserId ?? null) : null;
  return prisma.policenNachweis.create({
    data: {
      customerId: o.customerId,
      leadId: o.leadId,
      phone: o.phone,
      art: o.art,
      quelle: o.quelle,
      ki: o.ki ?? null,
      wortlaut: o.wortlaut ?? null,
      textVersion: o.textVersion ?? null,
      datenschutzVersion: o.datenschutzUrl ? DATENSCHUTZ_VERSION : null,
      datenschutzUrl: o.datenschutzUrl ?? null,
      waMessageId: o.waMessageId ?? null,
      frageWaMessageId: o.frageWaMessageId ?? null,
      vermittlerUserId,
      vermittlerName: o.vermittlerName ?? null,
      textHash: o.textHash ?? null,
      ...(o.at ? { createdAt: o.at } : {}),
    },
    select: { id: true, createdAt: true },
  });
}

/** Aktive Einwilligung dieses Kontakts: letzter Eintrag (Einwilligung, Ablehnung, Widerruf) ist eine Einwilligung. */
export async function aktiveEinwilligung(customerId: string, phone: string) {
  const last = await prisma.policenNachweis.findFirst({
    where: { customerId, phone, art: { in: ["einwilligung", "abgelehnt", "widerruf"] } },
    orderBy: { createdAt: "desc" },
    select: { id: true, art: true, createdAt: true, ki: true },
  });
  return last?.art === "einwilligung" ? last : null;
}

/**
 * Hat der Lead schon Policen geschickt (gespeichert)? Für die Erinnerung der Termin-Strecke (Stopp beim ersten
 * Dokument) und die Bereitlegen-Liste.
 */
export async function hatPolicenDokumente(leadId: string | null | undefined): Promise<boolean> {
  return !!leadId && (await prisma.leadDocument.count({ where: { leadId, status: "gespeichert" } })) > 0;
}

/**
 * Darf die Termin-Strecke (P2) an die Policen erinnern (Rechtsprüfung A8, § 7 UWG)? Nur wenn: Funktion an,
 * protokolliertes WhatsApp-Opt-in aus der Buchung (erinnerungOptIn) ohne späteren Stopp, kein „Lieber nicht“, kein
 * Widerruf, kein „STOPP“, noch kein Dokument, und ein gebuchter Termin in der Zukunft (nicht abgesagt). Jede Erinnerung
 * nennt den Abmeldehinweis „STOP“ (P2).
 */
export async function policenErinnerungStatus(leadId: string, now = new Date()): Promise<{ darf: boolean; grund: string }> {
  if (!policenAn()) return { darf: false, grund: "funktion_aus" };
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { customerId: true, phone: true, erasedAt: true } });
  if (!lead || lead.erasedAt) return { darf: false, grund: "kein_lead" };
  const arten = await prisma.policenNachweis.findMany({ where: { leadId }, orderBy: { createdAt: "asc" }, select: { art: true } });
  const letzteOptIn = arten.map((x) => x.art).lastIndexOf("erinnerung_optin");
  if (letzteOptIn < 0) return { darf: false, grund: "kein_optin" };
  if (arten.slice(letzteOptIn).some((x) => x.art === "erinnerung_stopp")) return { darf: false, grund: "stopp" };
  if (arten.some((x) => x.art === "abgelehnt")) return { darf: false, grund: "lieber_nicht" };
  if (arten.some((x) => x.art === "widerruf")) return { darf: false, grund: "widerruf" };
  if (await hatPolicenDokumente(leadId)) return { darf: false, grund: "dokument_da" };
  const conv = await prisma.conversation.findFirst({ where: { leadId }, orderBy: { lastMessageAt: "desc" }, select: { optedOutAt: true } });
  if (conv?.optedOutAt) return { darf: false, grund: "stopp" };
  const termin = await prisma.appointment.findFirst({ where: { leadId, status: "booked", startsAt: { gt: now } }, select: { id: true } });
  if (!termin) return { darf: false, grund: "kein_termin" };
  return { darf: true, grund: "ok" };
}
export async function darfPolicenErinnern(leadId: string, now = new Date()): Promise<boolean> {
  return (await policenErinnerungStatus(leadId, now)).darf;
}


/** Opt-in aus der Buchung protokollieren (nicht vorausgewählt, nur wenn angehakt). */
export async function erinnerungOptIn(o: { customerId: string; leadId: string | null; phone: string; at?: Date }) {
  return nachweis({ ...o, art: "erinnerung_optin", quelle: "buchung", wortlaut: ERINNERUNG_OPTIN_TEXT, textVersion: ERINNERUNG_OPTIN_VERSION });
}

async function setzeBody(messageId: string | null, body: string) {
  if (messageId) await prisma.message.update({ where: { id: messageId }, data: { body } }).catch(() => null);
}

async function loeschfristFuer(leadId: string, eingang: Date): Promise<Date | null> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { appointments: { where: { status: { not: "cancelled" } }, select: { startsAt: true } } } });
  return loeschDatum({ termine: lead?.appointments.map((x) => x.startsAt) ?? [], eingang });
}

/** Eingangsbestätigung höchstens einmal je Lead (Ole, 18.11.2026). */
async function bestaetigeEinmal(chat: Chat, an: Ansprache, kurzSonst = false) {
  const schon = (await ausgehend(chat.leadId, "ist angekommen")).some((m) => ANGEKOMMEN_RE.test(m.body ?? ""));
  if (!schon) await send(chat, angekommenText(an));
  else if (kurzSonst) await send(chat, angekommenKurzText());
}

/**
 * Dokumente samt Dateien im Bucket und Medien bei Meta löschen. Mit dem Eintrag ist auch der Datenschlüssel vernichtet
 * (Crypto-Shredding); jede Löschung steht im Löschprotokoll (greift nach einer Wiederherstellung erneut).
 */
async function loescheDokumente(where: { leadId?: string; customerId?: string; id?: { in: string[] }; status?: string }, grund: string): Promise<number> {
  const docs = await prisma.leadDocument.findMany({ where, select: { id: true, customerId: true, leadId: true, storageKey: true, waMediaId: true } });
  if (!docs.length) return 0;
  await loescheAb(docs.map((d) => d.storageKey)).catch((e) => logFehler("ablage löschen", e));
  const del = await prisma.leadDocument.deleteMany({ where: { id: { in: docs.map((d) => d.id) } } });
  await protokolliereLoeschung(docs.map((d) => ({ art: "policen_dokument" as const, entityId: d.id, customerId: d.customerId, ref: d.storageKey, grund })));
  for (const cid of new Set(docs.map((d) => d.customerId))) {
    await mediaWeg(cid, docs.filter((d) => d.customerId === cid).map((d) => d.waMediaId)).catch(() => null);
  }
  return del.count;
}

/**
 * weiter = false: erledigt, aber keine Antwort auf die Policen-Bitte (Termin-Strecke geht nicht weiter). art: Art der
 * Antwort für den Merker der Strecke (v2: „flow“, „spaeter“).
 */
type Ergebnis = { handled: boolean; gespeichert?: string; verworfen?: string; wartet?: boolean; weiter?: boolean; art?: string };

/**
 * Eingehendes Bild oder Dokument im Lead-Chat. handled = true: beantwortet, der Assistent muss nichts mehr tun.
 * Ohne Lead (private Chats, Support) passiert nichts: nichts wird geladen. Keine KI.
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
  const sp = await sprecher(chat);
  const { an, person } = sp;
  const antworte = async (text: string) => {
    if (o.botErlaubt) await send(chat, text).catch((e) => logFehler("antwort", e));
  };
  const fertig = (verworfen?: string): Ergebnis => ({ handled: o.botErlaubt, ...(verworfen ? { verworfen } : {}) });
  const apiKey = await apiKeyOf(chat.customerId);

  // Funktion aus (Ablage nicht eingerichtet bzw. Notschalter): nichts abrufen, freundlich auf den Termin verweisen
  if (!policenAn()) {
    await setzeBody(o.messageId, "Dokument nicht gespeichert (Funktion aus)");
    await mediaWeg(chat.customerId, [mediaId], apiKey);
    await antworte(ausText(an));
    return fertig("funktion_aus");
  }
  if (!mimeErlaubt(o.medium.mime_type)) {
    await setzeBody(o.messageId, "Dokument nicht gespeichert (Format nicht lesbar)");
    await antworte(formatText(an));
    return fertig("format");
  }
  if ((await prisma.leadDocument.count({ where: { leadId: chat.leadId } })) >= POLICEN_MAX_JE_LEAD) {
    await setzeBody(o.messageId, "Dokument nicht gespeichert (zu viele Unterlagen)");
    return { handled: false, verworfen: "limit" };
  }
  if (!apiKey) return { handled: false };

  // Minderjährig laut Formular: keine Einwilligung, nichts abrufen
  if (chat.minderjaehrig) {
    await setzeBody(o.messageId, "Dokument nicht gespeichert (minderjährig laut Formular)");
    await audit("policen.verworfen", { entity: "Lead", entityId: chat.leadId, customerId: chat.customerId, details: { grund: "minderjaehrig" }, actor: { role: "system" } });
    await mediaWeg(chat.customerId, [mediaId], apiKey);
    await antworte(minderjaehrigText(an, person));
    return fertig("minderjaehrig");
  }

  // Kranken/BU/Leben für diesen Vermittler nicht freigegeben (A5): laut Dateiname bzw. Begleittext (Regeln, keine KI)
  const text = `${o.medium.filename ?? ""} ${o.medium.caption ?? ""}`;
  const sparte = sparteAusText(text);
  if (!sp.gesundheitAn && (istGesundheitsbezug(sparte) || gesundheitInText(text))) {
    await setzeBody(o.messageId, "Dokument nicht gespeichert (Kranken, BU, Leben nicht freigegeben)");
    await audit("policen.verworfen", { entity: "Lead", entityId: chat.leadId, customerId: chat.customerId, details: { grund: "gesundheit_nicht_freigegeben" }, actor: { role: "system" } });
    await mediaWeg(chat.customerId, [mediaId], apiKey);
    await antworte(gesundheitAusText(an, person));
    return fertig("gesundheit_aus");
  }

  // „ohne KI“ als Begleittext (A9): festhalten und bestätigen, die Datei läuft danach normal weiter
  if (istOhneKi(o.medium.caption) && !istWiderruf(o.medium.caption)) {
    await kiAbwaehlen(chat, sp, { text: o.medium.caption ?? null, waMessageId: null, now });
    await send(chat, ohneKiBestaetigung(an)).catch((e) => logFehler("ohne ki", e));
  }

  const consent = await aktiveEinwilligung(chat.customerId, chat.contactPhone);
  if (!consent) {
    return warteAufEinwilligung(chat, sp, { messageId: o.messageId, mediaId, typ: typAusMime(o.medium.mime_type), fileName: dateiname(o.medium.filename, typAusMime(o.medium.mime_type), now), sparte, botErlaubt: o.botErlaubt, apiKey });
  }

  const dl = await ladeMedia(apiKey, mediaId, POLICEN_MAX_BYTES);
  if (!dl.ok) {
    await setzeBody(o.messageId, dl.grund === "zu_gross" ? "Dokument nicht gespeichert (über 10 MB)" : "Dokument konnte nicht geladen werden");
    await antworte(dl.grund === "zu_gross" ? zuGrossText(an) : nichtGeladenText(an));
    if (dl.grund === "fehler") console.error("[policen laden] fehler");
    return fertig(dl.grund);
  }
  const typ = typAusInhalt(dl.data);
  if (!typ) {
    await setzeBody(o.messageId, "Dokument nicht gespeichert (Format nicht lesbar)");
    await mediaWeg(chat.customerId, [mediaId], apiKey);
    await antworte(formatText(an));
    return fertig("format");
  }
  // Virenprüfung vor der Ablage (lib/sicherheit/virenpruefung.ts)
  const viren = await virenpruefung(chat, { data: dl.data, messageId: o.messageId, mediaId, apiKey });
  if (viren === "verworfen") {
    await antworte(virenText(an));
    return fertig("virus");
  }
  if (viren === "abgelehnt") {
    await antworte(spaeterText(an));
    return fertig("virenpruefung");
  }
  const id = await speichere(chat, { messageId: o.messageId, typ, fileName: dateiname(o.medium.filename, typ, now), data: dl.data, sparte, consent: { id: consent.id, at: consent.createdAt }, virenStatus: viren, now }).catch((e) => {
    logFehler("ablage", e);
    return null;
  });
  if (!id) {
    await setzeBody(o.messageId, "Dokument konnte nicht gespeichert werden");
    await antworte(nichtGeladenText(an));
    return fertig("ablage");
  }
  await mediaWeg(chat.customerId, [mediaId], apiKey);
  if (o.botErlaubt) await bestaetigeEinmal(chat, an).catch((e) => logFehler("bestätigung", e));
  // Weitere Dokumente nach der Bestätigung: still angenommen, der Assistent antwortet nicht
  return { handled: o.botErlaubt, gespeichert: id };
}

/**
 * Keine Einwilligung (A2): nichts abrufen, nur die WhatsApp-Media-ID merken (höchstens 24 Stunden) und einmal je Lead
 * mit dem Einwilligungstext nachfragen. Assistent aus (Vermittler hat übernommen): keine Rückfrage, verwerfen.
 */
async function warteAufEinwilligung(
  chat: Chat,
  sp: Sprecher,
  x: { messageId: string | null; mediaId: string; typ: PolicenTyp; fileName: string; sparte: string | null; botErlaubt: boolean; apiKey: string },
): Promise<Ergebnis> {
  if (!x.botErlaubt) {
    await setzeBody(x.messageId, "Dokument nicht gespeichert (keine Einwilligung)");
    await audit("policen.verworfen", { entity: "Lead", entityId: chat.leadId, customerId: chat.customerId, details: { grund: "keine_einwilligung" }, actor: { role: "system" } });
    await mediaWeg(chat.customerId, [x.mediaId], x.apiKey);
    return { handled: false, verworfen: "keine_einwilligung" };
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
      size: 0,
      sparte: x.sparte,
      gesundheitsbezug: true,
    },
  });
  await setzeBody(x.messageId, `${CHAT_HINWEIS} (wartet auf Einwilligung)`);
  const gefragt = (await ausgehend(chat.leadId, "Bevor ich")).some((m) => NACHFRAGE_RE.test(m.body ?? ""));
  if (!gefragt) await send(chat, policenNachfrage(sp)).catch((e) => logFehler("nachfrage", e));
  return { handled: true, wartet: true };
}

/**
 * Virenprüfung einer eingegangenen Datei (vor der Ablage). sauber/ungeprueft: ablegen (ungeprüft wird erst nach der
 * Prüfung angeboten, Hinweis an die Admins). verworfen: Befund, nichts gespeichert, Medium bei Meta gelöscht, Vermittler
 * informiert, Änderungsprotokoll (Antwort an den Lead macht der Aufrufer). abgelehnt: Pflicht an, Prüfung nicht möglich.
 */
async function virenpruefung(chat: Chat, x: { data: Buffer; messageId: string | null; mediaId: string | null; apiKey: string | null }): Promise<"sauber" | "ungeprueft" | "verworfen" | "abgelehnt"> {
  const e = await pruefeAufViren(x.data);
  const d = entscheide(e);
  if (d === "annehmen") return "sauber";
  if (d === "ungeprueft") {
    await meldeUngeprueft("policen", e.status === "ungeprueft" ? e.grund : "fehler");
    return "ungeprueft";
  }
  await mediaWeg(chat.customerId, [x.mediaId], x.apiKey);
  if (d === "ablehnen") {
    await setzeBody(x.messageId, "Dokument nicht gespeichert (Prüfung nicht möglich)");
    await audit("policen.verworfen", { entity: "Lead", entityId: chat.leadId, customerId: chat.customerId, details: { grund: "virenpruefung_fehlt" }, actor: { role: "system" } });
    return "abgelehnt";
  }
  await setzeBody(x.messageId, "Dokument nicht gespeichert (Sicherheitsprüfung)");
  await befundMelden(chat.customerId, chat.leadId, e.status === "befund" ? e.signatur : "unbekannt", "whatsapp");
  return "verworfen";
}

/** Befund: Änderungsprotokoll, Verlauf und neutraler Hinweis an den Vermittler (ohne Dateinamen). */
async function befundMelden(customerId: string, leadId: string, signatur: string, quelle: "whatsapp" | "nachpruefung") {
  await audit("viren.befund", { entity: "Lead", entityId: leadId, customerId, details: { quelle: `policen_${quelle}`, signatur }, actor: { role: "system" } });
  await logLeadHistory(leadId, "dokument", "Datei vom Kunden bei der Virenprüfung abgelehnt und gelöscht", { customerId, userId: null });
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { name: true } });
  const { notifyLeadPush } = await import("@/lib/team");
  await notifyLeadPush(leadId, {
    title: `Datei von ${lead?.name?.trim() || "Ihrem Kontakt"} nicht angenommen`,
    body: "Die Sicherheitsprüfung hat eine Datei abgelehnt. Ihr Kontakt wurde gebeten, sie neu zu schicken.",
    tag: `policen-virus:${leadId}`,
    url: `/buyer/leads/${leadId}#dokumente`,
  }).catch(() => null);
}

async function speichere(
  chat: Chat,
  x: { messageId: string | null; typ: PolicenTyp; fileName: string; data: Buffer; sparte: string | null; consent: { id: string; at: Date }; virenStatus: "sauber" | "ungeprueft"; now: Date },
): Promise<string> {
  // Erst in den Bucket (eigener Datenschlüssel, verpackt mit dem Schlüssel des Mandanten), dann der Eintrag
  const { storageKey, dateiSchluessel } = await legeAb(chat.customerId, chat.leadId, x.data);
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
      storageKey,
      dateiSchluessel,
      virenStatus: x.virenStatus,
      kind: "police",
      sparte: x.sparte,
      // Jede Police kann Gesundheitsangaben enthalten (keine KI-Prüfung): immer so behandeln
      gesundheitsbezug: true,
      consentId: x.consent.id,
      consentAt: x.consent.at,
      deleteAfter: await loeschfristFuer(chat.leadId, x.now),
    },
  });
  await setzeBody(x.messageId, CHAT_HINWEIS);
  // Verlauf und Push ohne Dateinamen (A7)
  await logLeadHistory(chat.leadId, "dokument", "Dokument per WhatsApp erhalten (mit Einwilligung)", { customerId: chat.customerId, userId: null });
  const lead = await prisma.lead.findUnique({ where: { id: chat.leadId }, select: { name: true } });
  const { notifyLeadPush } = await import("@/lib/team");
  await notifyLeadPush(chat.leadId, {
    title: `Neue Unterlagen von ${lead?.name?.trim() || "Ihrem Kontakt"}`,
    body: "In der Terminvorbereitung ansehen.",
    tag: `policen-neu:${chat.leadId}`,
    url: `/buyer/leads/${chat.leadId}#dokumente`,
  }).catch(() => null);
  return doc.id;
}

type Antwort = { kind: string; text: string | null; payload: string | null; waMessageId?: string | null; frageWaMessageId?: string | null };

/**
 * Antwort des Leads, die Policen betrifft: Knopf „Einverstanden“ bzw. „Lieber nicht“, getipptes Ja/Nein direkt nach
 * der Einwilligungsnachricht, Widerruf (nur Regeln, keine KI). handled = true: erledigt, der Assistent antwortet nicht.
 */
export async function handlePolicenAntwort(conversationId: string, m: Antwort, now = new Date()): Promise<Ergebnis> {
  const chat = await chatOf(conversationId);
  if (!chat) return { handled: false };

  // Policen-Strecke v2 (lib/policen/flow): „Später“ bzw. „Nein, danke“ (Knopf; getippt nur direkt nach einer Erinnerung
  // bzw. der Antwort auf „Später“). Diese Knöpfe gibt es nur in der v2-Strecke.
  if (m.payload === PAYLOAD_SPAETER) {
    const { handleSpaeter } = await import("@/lib/policen/flow/server");
    return handleSpaeter(conversationId, now);
  }
  if (m.payload === PAYLOAD_NEIN_DANKE || (m.kind === "text" && istNeinDanke(m.text) && (await nachFlowErinnerung(chat)))) {
    return neinDanke(chat, { waMessageId: m.waMessageId ?? null, now });
  }

  const knopf = m.kind === "button" || m.kind === "interactive";
  // Stichwort „ohne KI“ (A9, nur Regeln); ein Widerruf geht vor
  const ohneKi = m.kind === "text" && istOhneKi(m.text) && !istWiderruf(m.text);
  let antwort = einwilligungsAntwort(m.payload) ?? (knopf && !m.payload ? einwilligungsAntwort(m.text) : null);
  if (!antwort && m.kind === "text") {
    // Getippt: nur direkt nach der Einwilligungsnachricht (bzw. der Nachfrage)
    const last = await prisma.message.findFirst({ where: { conversationId: chat.id, direction: "outbound" }, orderBy: { createdAt: "desc" }, select: { body: true } });
    if (EINWILLIGUNG_RE.test(last?.body ?? "")) {
      if (ohneKi) {
        // „Ja, aber ohne KI“: Zustimmung nur zum Speichern; „Nein, ohne KI“ bleibt nur das Stichwort
        const rest = ohneStichwort(m.text);
        antwort = einwilligungsAntwort(rest) === "ja" || istZustimmung(rest) ? "ja" : null;
      } else {
        antwort = einwilligungsAntwort(m.text) ?? (istZustimmung(m.text) ? "ja" : /^(nein|nein,? danke|lieber nicht)[.!]?$/i.test((m.text ?? "").trim()) ? "nein" : null);
      }
    }
  }
  if (ohneKi && (await policenImGespraech(chat))) {
    const sp = await sprecher(chat);
    await kiAbwaehlen(chat, sp, { text: m.text, waMessageId: m.waMessageId ?? null, now });
    await send(chat, ohneKiBestaetigung(sp.an));
    if (antwort !== "ja") return { handled: true, weiter: false };
    // Einwilligung (nur Speichern) eine Millisekunde nach dem Stichwort: eindeutige Reihenfolge im Nachweis
    await beantworteEinwilligung(chat, { waMessageId: m.waMessageId ?? null, frageWaMessageId: m.frageWaMessageId ?? null, antwort: (m.text ?? "").trim(), now: new Date(now.getTime() + 1) });
    return { handled: true };
  }
  if (antwort === "ja") return beantworteEinwilligung(chat, { waMessageId: m.waMessageId ?? null, frageWaMessageId: m.frageWaMessageId ?? null, antwort: (m.text ?? "").trim() || "Einverstanden", now });
  if (antwort === "nein") {
    await loescheDokumente({ leadId: chat.leadId, status: "wartet" }, "lieber_nicht");
    await nachweis({ customerId: chat.customerId, leadId: chat.leadId, phone: chat.contactPhone, art: "abgelehnt", quelle: "whatsapp", waMessageId: m.waMessageId ?? null, frageWaMessageId: m.frageWaMessageId ?? null, at: now });
    await audit("policen.lieber_nicht", { entity: "Lead", entityId: chat.leadId, customerId: chat.customerId, actor: { role: "lead" } });
    await send(chat, lieberNichtText((await sprecher(chat)).an));
    return { handled: true };
  }

  if (m.kind === "text" && m.text?.trim()) {
    const [docs, consent] = await Promise.all([prisma.leadDocument.count({ where: { leadId: chat.leadId } }), aktiveEinwilligung(chat.customerId, chat.contactPhone)]);
    if (!docs && !consent) return { handled: false };
    // Nur Regeln (regeln.ts istWiderruf), keine KI
    if (!istWiderruf(m.text)) return { handled: false };
    await widerrufe({ customerId: chat.customerId, leadId: chat.leadId, phone: chat.contactPhone, via: "whatsapp", userId: null, waMessageId: m.waMessageId ?? null });
    await send(chat, widerrufText((await sprecher(chat)).an));
    return { handled: true };
  }
  return { handled: false };
}

/**
 * Betrifft dieser Chat die Policen? Einwilligung gefragt, ein Nachweis oder Unterlagen vorhanden. Sonst ist „ohne KI“
 * eine ganz normale Nachricht für den Assistenten bzw. den Vermittler.
 */
async function policenImGespraech(chat: Chat): Promise<boolean> {
  const [nachweise, docs] = await Promise.all([
    prisma.policenNachweis.count({ where: { leadId: chat.leadId, art: { in: ["einwilligung", "abgelehnt", "widerruf", NACHWEIS_OHNE_KI] } } }),
    prisma.leadDocument.count({ where: { leadId: chat.leadId } }),
  ]);
  if (nachweise || docs) return true;
  return (await ausgehend(chat.leadId, "meine hier gesendeten Policen")).some((r) => EINWILLIGUNG_RE.test(r.body ?? ""));
}

/**
 * Stichwort „ohne KI“ (Auflage A9): Nachweis „ohne_ki“ (einmal, gilt dauerhaft für diesen Lead), eine bestehende
 * Einwilligung mit KI als Einwilligung nur zum Speichern fortschreiben (ki = false, gleicher Wortlaut mit Vermerk),
 * ausgelesene Werte löschen (Auszüge samt Korrekturen, bisheriger Vertrag aus der Police auf der Folie). Die
 * gespeicherten Unterlagen bleiben. Bestätigung an den Lead macht der Aufrufer.
 */
async function kiAbwaehlen(chat: Chat, sp: Sprecher, o: { text: string | null; waMessageId: string | null; now: Date }): Promise<void> {
  const schon = await kiAbgelehnt(chat.leadId);
  const vermittlerName = sp.vermittler.name ?? sp.person.nom;
  if (!(await prisma.policenNachweis.count({ where: { leadId: chat.leadId, art: NACHWEIS_OHNE_KI } }))) {
    const z = await zugestimmt(chat, sp, null);
    const nachricht = (o.text ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
    await nachweis({
      customerId: chat.customerId,
      leadId: chat.leadId,
      phone: chat.contactPhone,
      art: NACHWEIS_OHNE_KI,
      quelle: "whatsapp",
      ki: false,
      wortlaut: `Stichwort „ohne KI“ per WhatsApp: „${nachricht}“\n\nZur Einwilligung: ${z.wortlaut}`,
      textVersion: einwilligungTextVersionAus(z.wortlaut),
      datenschutzUrl: sp.datenschutzUrl,
      waMessageId: o.waMessageId,
      frageWaMessageId: z.frageWaMessageId,
      vermittlerName,
      at: o.now,
    });
  }
  const consent = await aktiveEinwilligung(chat.customerId, chat.contactPhone);
  if (consent && consent.ki !== false) {
    const alt = await prisma.policenNachweis.findUnique({ where: { id: consent.id }, select: { wortlaut: true, textVersion: true, datenschutzUrl: true, frageWaMessageId: true } });
    await nachweis({
      customerId: chat.customerId,
      leadId: chat.leadId,
      phone: chat.contactPhone,
      art: "einwilligung",
      quelle: "whatsapp",
      ki: false,
      wortlaut: `${alt?.wortlaut ?? ""}\n\nEinschränkung per WhatsApp: „ohne KI“ (nur speichern, nicht automatisch auslesen)`.trim(),
      textVersion: alt?.textVersion ?? null,
      datenschutzUrl: alt?.datenschutzUrl ?? sp.datenschutzUrl,
      waMessageId: o.waMessageId,
      frageWaMessageId: alt?.frageWaMessageId ?? null,
      vermittlerName,
      // nach dem Stichwort (eindeutige Reihenfolge im Nachweis)
      at: new Date(o.now.getTime() + 1),
    });
  }
  const geloescht = await loescheKiWerte(chat.customerId, chat.leadId);
  if (!schon || geloescht) {
    await audit("policen.ohne_ki", { entity: "Lead", entityId: chat.leadId, customerId: chat.customerId, details: { geloescht, nachKlick: !!consent }, actor: { role: "lead" } });
    await logLeadHistory(chat.leadId, "dokument", "Kontakt möchte kein automatisches Auslesen der Unterlagen („ohne KI“)", { customerId: chat.customerId, userId: null });
  }
}

/**
 * Automatisch ausgelesene Werte des Leads löschen (A9): alle Auszüge (auch geprüfte bzw. korrigierte) mit Eintrag im
 * Löschprotokoll, dazu der daraus übernommene bisherige Vertrag in Tarifauswahl und Folie. Die Unterlagen bleiben,
 * ein vom Vermittler ausdrücklich in den Bestand übernommener Vertrag auch.
 */
async function loescheKiWerte(customerId: string, leadId: string): Promise<number> {
  const rows = await prisma.policenAuszug.findMany({ where: { leadId }, select: { id: true, customerId: true } });
  if (rows.length) {
    await prisma.policenAuszug.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
    await protokolliereLoeschung(rows.map((r) => ({ art: "policen_auszug" as const, entityId: r.id, customerId: r.customerId, grund: "ohne_ki" })));
  }
  await import("@/lib/bisheriger-vertrag-server")
    .then((m) => m.policeWerteEntfernen(leadId, customerId))
    .catch((e) => logFehler("bisheriger vertrag", e));
  return rows.length;
}

/** Wortlaut, dem der Lead zugestimmt hat: die zuletzt gesendete Einwilligungsnachricht, so wie sie rausging. */
async function zugestimmt(chat: Chat, sp: Sprecher, frageWaMessageId: string | null): Promise<{ wortlaut: string; frageWaMessageId: string | null }> {
  const rows = await ausgehend(chat.leadId, "meine hier gesendeten Policen");
  const frage = (frageWaMessageId && rows.find((r) => r.waMessageId === frageWaMessageId)) || rows.find((r) => EINWILLIGUNG_RE.test(r.body ?? ""));
  if (frage?.body) return { wortlaut: frage.body, frageWaMessageId: frageWaMessageId ?? frage.waMessageId ?? null };
  const e = policenEinwilligung(sp);
  return { wortlaut: `${e.text}\n\n${e.fusszeile ?? ""}`.trim(), frageWaMessageId };
}

async function beantworteEinwilligung(chat: Chat, o: { waMessageId: string | null; frageWaMessageId: string | null; antwort: string; now: Date }): Promise<Ergebnis> {
  const sp = await sprecher(chat);
  const { an, person } = sp;

  if (chat.minderjaehrig) {
    await loescheDokumente({ leadId: chat.leadId, status: "wartet" }, "minderjaehrig");
    await send(chat, minderjaehrigText(an, person));
    return { handled: true };
  }

  // Nachweis (A3; ein zweiter Tipp ändert nichts): Wortlaut wie gesendet mit Fußzeile und Knopftext, Textversion,
  // Zeitpunkt, Nummer, Lead, WhatsApp-IDs von Antwort und Frage, Vermittler, Datenschutzhinweis mit Version, ki = true
  // (false nach „ohne KI“, A9)
  let consent = await aktiveEinwilligung(chat.customerId, chat.contactPhone);
  if (!consent) {
    const z = await zugestimmt(chat, sp, o.frageWaMessageId);
    // „ohne KI“ vorher bzw. dabei geschrieben (A9): Einwilligung nur zum Speichern
    const ki = !(await kiAbgelehnt(chat.leadId));
    const n = await nachweis({
      customerId: chat.customerId,
      leadId: chat.leadId,
      phone: chat.contactPhone,
      art: "einwilligung",
      quelle: "whatsapp",
      ki,
      wortlaut: `${z.wortlaut}\n\nAntwort (Knopf): „${o.antwort.slice(0, 40)}“${ki ? "" : "\n\nPer WhatsApp: „ohne KI“ (nur speichern, nicht automatisch auslesen)"}`,
      textVersion: einwilligungTextVersionAus(z.wortlaut),
      datenschutzUrl: sp.datenschutzUrl,
      waMessageId: o.waMessageId,
      frageWaMessageId: z.frageWaMessageId,
      vermittlerName: sp.vermittler.name ?? sp.person.nom,
      at: o.now,
    });
    consent = { id: n.id, art: "einwilligung", createdAt: n.createdAt, ki };
    await audit("policen.einwilligung", { entity: "Lead", entityId: chat.leadId, customerId: chat.customerId, details: { nachweisId: n.id }, actor: { role: "lead" } });
    await logLeadHistory(chat.leadId, "dokument", "Einwilligung zu Policen per WhatsApp erteilt", { customerId: chat.customerId, userId: null });
  }
  const pending = await prisma.leadDocument.findMany({ where: { leadId: chat.leadId, status: "wartet" }, orderBy: { createdAt: "asc" } });
  if (!pending.length) {
    await send(chat, nachEinwilligungText(an));
    return { handled: true };
  }

  // Jetzt erst abrufen und ablegen (A2)
  const apiKey = await apiKeyOf(chat.customerId);
  let ok = 0;
  let virus = 0;
  let spaeter = 0;
  for (const p of pending) {
    const dl = apiKey && p.waMediaId ? await ladeMedia(apiKey, p.waMediaId, POLICEN_MAX_BYTES) : null;
    const typ = dl?.ok ? typAusInhalt(dl.data) : null;
    await prisma.leadDocument.delete({ where: { id: p.id } }).catch(() => null);
    await mediaWeg(chat.customerId, [p.waMediaId], apiKey);
    if (!dl?.ok || !typ) {
      await setzeBody(p.messageId, "Dokument konnte nicht geladen werden");
      continue;
    }
    const viren = await virenpruefung(chat, { data: dl.data, messageId: p.messageId, mediaId: null, apiKey });
    if (viren === "verworfen") {
      virus++;
      continue;
    }
    if (viren === "abgelehnt") {
      spaeter++;
      continue;
    }
    const id = await speichere(chat, { messageId: p.messageId, typ, fileName: p.fileName, data: dl.data, sparte: p.sparte, consent: { id: consent.id, at: consent.createdAt }, virenStatus: viren, now: o.now }).catch((e) => {
      logFehler("ablage", e);
      return null;
    });
    if (id) ok++;
  }
  if (ok) await bestaetigeEinmal(chat, an, true);
  if (virus) await send(chat, virenText(an));
  else if (spaeter) await send(chat, spaeterText(an));
  else if (!ok) await send(chat, nichtGeladenText(an));
  return { handled: true };
}

// ─── Policen-Strecke v2: Formular (WhatsApp Flow), „Nein, danke“ ────────────

/** Unsere letzte Nachricht war eine Erinnerung bzw. die Antwort auf „Später“ (dann ist ein getipptes „Nein“ gemeint). */
const NACH_ERINNERUNG_RE = /Kein Interesse\? (Tipp|Tippen Sie) „Nein, danke“|^Alles klar, kein Problem\. (Dein|Ihr) Termin findet so oder so statt\. Ich erinnere/;
async function nachFlowErinnerung(chat: Chat): Promise<boolean> {
  const last = await prisma.message.findFirst({ where: { conversationId: chat.id, direction: "outbound" }, orderBy: { createdAt: "desc" }, select: { body: true } });
  return NACH_ERINNERUNG_RE.test(last?.body ?? "");
}

/**
 * „Nein, danke“ (A8): keine Erinnerungen mehr (Nachweis „erinnerung_stopp“, wie STOPP nur für die Erinnerungen),
 * kurze Antwort mit Termin. Keine Ablehnung der Einwilligung, nichts wird gelöscht.
 */
async function neinDanke(chat: Chat, o: { waMessageId: string | null; now: Date }): Promise<Ergebnis> {
  await nachweis({ customerId: chat.customerId, leadId: chat.leadId, phone: chat.contactPhone, art: "erinnerung_stopp", quelle: "whatsapp", wortlaut: "„Nein, danke“ per WhatsApp", waMessageId: o.waMessageId, at: o.now });
  await audit("policen.nein_danke", { entity: "Lead", entityId: chat.leadId, customerId: chat.customerId, actor: { role: "lead" } });
  const termin = await prisma.appointment.findFirst({ where: { leadId: chat.leadId, status: "booked", startsAt: { gt: o.now } }, orderBy: { startsAt: "asc" }, select: { startsAt: true } });
  await send(chat, neinDankeAntwort(termin ? { tag: tagText(termin.startsAt, o.now), uhrzeit: uhrzeitText(termin.startsAt) } : {}));
  return { handled: true, weiter: false };
}

/**
 * Formular „Policen senden“ abgeschickt (Webhook nfm_reply, Policen-Strecke v2). Der Klick auf „Zustimmen & senden“
 * ist die Einwilligung (A1); vorher ist nichts an uns gegangen (kein data_exchange, A2). Ablauf:
 *   1. Token gegen den Merker der gesendeten Nachricht (nur Chats dieses Leads), sonst nichts speichern.
 *   2. Nachweis (A3, nur anhängen): Wortlaut des Formulars wie gesendet mit Häkchen-Stand, Textversion (.g/.s),
 *      SHA-256 des Wortlauts, Zeit, ki (Häkchen „Lieber ohne KI: nur speichern“ gesetzt → false), WhatsApp-IDs,
 *      Vermittler, Datenschutzhinweis. ki = false: bereits ausgelesene Werte löschen (wie „ohne KI“, A9).
 *   3. Dateien laden (Media-ID über 360dialog mit sha256-Prüfung bzw. verschlüsselt von der CDN, flow/krypto.ts),
 *      Format prüfen, Virenprüfung (ClamAV), verschlüsselt ablegen wie Policen-Fotos, Medium bei Meta löschen.
 *   4. Bestätigung mit Anzahl und Knopf „Weitere senden“ (öffnet das Formular erneut), Fußzeile Widerruf.
 * Ausgelesen wird danach im Hintergrund (gateway.ts → auslesen nachEingang; nur mit ki = true und freigegebener
 * Sparte, K1/K2). Keine KI in diesem Modul.
 */
export async function handleFlowAntwort(o: {
  conversationId: string;
  messageId: string | null;
  responseJson: unknown;
  waMessageId: string | null;
  frageWaMessageId: string | null;
  botErlaubt: boolean;
  now?: Date;
}): Promise<Ergebnis> {
  const now = o.now ?? new Date();
  const chat = await chatOf(o.conversationId);
  if (!chat) return { handled: false };
  const flow = await import("@/lib/policen/flow/server");
  const antwort = flow.leseFlowAntwort(o.responseJson);
  const merker = antwort ? await flow.flowMerker(chat.leadId, antwort.token) : null;
  const antworte = async (text: string) => {
    if (o.botErlaubt) await send(chat, text).catch((e) => logFehler("antwort", e));
  };
  if (!antwort || !merker) {
    await setzeBody(o.messageId, "Formular ohne gültige Zuordnung (nichts gespeichert)");
    await audit("policen.verworfen", { entity: "Lead", entityId: chat.leadId, customerId: chat.customerId, details: { grund: "formular_unbekannt" }, actor: { role: "system" } });
    return { handled: true, weiter: false };
  }
  const sp = await sprecher(chat);
  const { an, person } = sp;
  const apiKey = await apiKeyOf(chat.customerId);
  const ids = antwort.dateien.map((d) => d.id);
  if (!policenAn()) {
    await setzeBody(o.messageId, "Dokument nicht gespeichert (Funktion aus)");
    await mediaWeg(chat.customerId, ids, apiKey);
    await antworte(ausText(an));
    return { handled: true, weiter: false };
  }
  if (chat.minderjaehrig) {
    await setzeBody(o.messageId, "Dokument nicht gespeichert (minderjährig laut Formular)");
    await mediaWeg(chat.customerId, ids, apiKey);
    await antworte(minderjaehrigText(an, person));
    return { handled: true, weiter: false };
  }

  // Einwilligung protokollieren (A3)
  const ki = !antwort.ohneKi;
  const vorher = await aktiveEinwilligung(chat.customerId, chat.contactPhone);
  const n = await nachweis({
    customerId: chat.customerId,
    leadId: chat.leadId,
    phone: chat.contactPhone,
    art: "einwilligung",
    quelle: "whatsapp",
    ki,
    wortlaut: `${merker.wortlaut}\n\nAntwort: Knopf „${KNOPF_ZUSTIMMEN}“ im Formular, Häkchen „${FORMULAR.ohneKi}“: ${ki ? "nicht gesetzt" : "gesetzt"}`,
    textVersion: merker.textVersion,
    textHash: merker.hash,
    datenschutzUrl: merker.datenschutzUrl || sp.datenschutzUrl,
    waMessageId: o.waMessageId,
    frageWaMessageId: merker.waMessageId ?? o.frageWaMessageId,
    vermittlerName: sp.vermittler.name ?? person.nom,
    at: now,
  });
  await audit("policen.einwilligung", { entity: "Lead", entityId: chat.leadId, customerId: chat.customerId, details: { nachweisId: n.id, quelle: "formular", ki }, actor: { role: "lead" } });
  await logLeadHistory(chat.leadId, "dokument", ki ? "Einwilligung zu Policen per WhatsApp-Formular erteilt" : "Einwilligung zu Policen per WhatsApp-Formular erteilt (ohne KI: nur speichern)", { customerId: chat.customerId, userId: null });
  if (!ki) {
    const geloescht = await loescheKiWerte(chat.customerId, chat.leadId);
    if (vorher?.ki !== false || geloescht) await audit("policen.ohne_ki", { entity: "Lead", entityId: chat.leadId, customerId: chat.customerId, details: { geloescht, quelle: "formular" }, actor: { role: "lead" } });
  }

  // Dateien laden, prüfen, ablegen
  let ok = 0;
  let virus = 0;
  let spaeter = 0;
  let format = 0;
  let gross = 0;
  let gesundheit = 0;
  let fehler = 0;
  const fehlerGruende: string[] = [];
  for (const d of antwort.dateien) {
    if ((await prisma.leadDocument.count({ where: { leadId: chat.leadId } })) >= POLICEN_MAX_JE_LEAD) {
      await mediaWeg(chat.customerId, [d.id], apiKey);
      continue;
    }
    const sparte = sparteAusText(d.name);
    if (!sp.gesundheitAn && (istGesundheitsbezug(sparte) || gesundheitInText(d.name))) {
      gesundheit++;
      await mediaWeg(chat.customerId, [d.id], apiKey);
      continue;
    }
    const dl = apiKey ? await flow.ladeFlowDatei(apiKey, d, POLICEN_MAX_BYTES) : ({ ok: false, grund: "fehler" } as const);
    if (!dl.ok) {
      if (dl.grund === "zu_gross") gross++;
      else {
        fehler++;
        // Ursache ohne Inhalt protokollieren (Codes wie cdn 403, hash, hmac, enc_hash, ohne id; Ole 19.11.2026: Foto kam nicht an)
        fehlerGruende.push(`${("detail" in dl && dl.detail) || "unbekannt"} (${d.cdnUrl && d.encryption ? "cdn" : d.id ? "media" : "ohne quelle"})`);
      }
      await mediaWeg(chat.customerId, [d.id], apiKey);
      continue;
    }
    const typ = typAusInhalt(dl.data);
    if (!typ) {
      format++;
      await mediaWeg(chat.customerId, [d.id], apiKey);
      continue;
    }
    const viren = await virenpruefung(chat, { data: dl.data, messageId: null, mediaId: d.id, apiKey });
    if (viren === "verworfen") {
      virus++;
      continue;
    }
    if (viren === "abgelehnt") {
      spaeter++;
      continue;
    }
    const id = await speichere(chat, { messageId: null, typ, fileName: dateiname(d.name, typ, now), data: dl.data, sparte, consent: { id: n.id, at: n.createdAt }, virenStatus: viren, now }).catch((e) => {
      logFehler("ablage", e);
      return null;
    });
    if (id) ok++;
    await mediaWeg(chat.customerId, [d.id], apiKey);
  }
  await setzeBody(o.messageId, `Formular „Policen senden“: ${ok === 1 ? "1 Dokument" : `${ok} Dokumente`} für den Vermittler`);
  if (fehler) console.error("[policen formular] dateien nicht geladen", fehler, fehlerGruende.join(", "));
  if (!antwort.dateien.length) console.error("[policen formular] Antwort ohne Dateien");
  // Aufbau der Antwort ohne Inhalte (nur Schlüssel und Typen), um Abweichungen von Meta/360dialog zu erkennen
  if (fehler || !antwort.dateien.length) console.error("[policen formular] aufbau", formularAufbau(o.responseJson));

  if (o.botErlaubt) {
    const c = await flow.flowChat(chat.id, now).catch(() => null);
    if (ok && c) await flow.sendeBestaetigung(chat.id, bestaetigung(c.text, ok, ki), now).catch((e) => logFehler("bestätigung", e));
    if (virus) await antworte(virenText(an));
    else if (spaeter) await antworte(spaeterText(an));
    else if (gesundheit) await antworte(gesundheitAusText(an, person));
    else if (format) await antworte(formatText(an));
    else if (gross) await antworte(zuGrossText(an));
    else if (!ok) await antworte(nichtGeladenText(an));
  }
  return { handled: true, art: "flow" };
}

/** Widerruf (A4): alle Unterlagen des Leads sofort löschen (Bucket, Media-IDs), Nachweis, Vermittler informieren. */
async function widerrufe(o: { customerId: string; leadId: string; phone: string | null; via: "whatsapp" | "vermittler"; userId: string | null; waMessageId?: string | null }): Promise<number> {
  const geloescht = await loescheDokumente({ leadId: o.leadId }, "widerruf");
  if (o.phone) {
    await nachweis({
      customerId: o.customerId,
      leadId: o.leadId,
      phone: o.phone,
      art: "widerruf",
      quelle: o.via === "whatsapp" ? "whatsapp" : "vermittler",
      waMessageId: o.waMessageId ?? null,
      wortlaut: o.via === "whatsapp" ? "Widerruf per WhatsApp" : "Widerruf über den Vermittler",
    });
  }
  await audit("policen.widerruf", { entity: "Lead", entityId: o.leadId, customerId: o.customerId, details: { geloescht, via: o.via }, actor: o.via === "whatsapp" ? { role: "lead" } : { id: o.userId, role: "BUYER" } });
  await logLeadHistory(
    o.leadId,
    "dokument",
    o.via === "whatsapp" ? `Einwilligung per WhatsApp widerrufen, Dokumente gelöscht (${geloescht})` : `Einwilligung widerrufen, Dokumente gelöscht (${geloescht})`,
    { customerId: o.customerId, userId: o.userId },
  );
  if (o.via === "whatsapp") {
    const { notifyLeadPush } = await import("@/lib/team");
    await notifyLeadPush(o.leadId, {
      title: "Unterlagen gelöscht (Widerruf)",
      body: "Ein Kontakt hat seine Einwilligung widerrufen. Die Unterlagen sind gelöscht.",
      tag: `policen-widerruf:${o.leadId}`,
      url: `/buyer/leads/${o.leadId}#dokumente`,
    }).catch(() => null);
  }
  return geloescht;
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
  /** Sparte laut Dateiname bzw. Begleittext (keine KI), sonst null */
  sparte: string | null;
  consentAt: string | null;
  /** Öffnen/Herunterladen erlaubt (nie in der Admin-Vorschau, nur mit Zwei-Faktor-Login, nur geprüfte Dateien) */
  ansehen: boolean;
  /** Warum nicht: Zwei-Faktor-Login fehlt bzw. Virenprüfung steht aus (null: erlaubt oder Admin-Vorschau) */
  gesperrt: "zwei_faktor" | "pruefung" | null;
  /** Geplante automatische Löschung (null: behalten bzw. keine Frist) */
  loeschtAm: string | null;
  /** „Beratungsdokumentation behalten“: Zeitpunkt und Vermerk */
  behaltenAt: string | null;
  behaltenVermerk: string | null;
  /** Kennzeichnen möglich (Lead mit Abschluss) */
  behaltenMoeglich: boolean;
};

/**
 * Gespeicherte Dokumente am Lead (ohne Inhalt). Aufrufer prüfen vorher, dass der Login den Lead sehen darf
 * (leadScope: Inhaber bzw. zuständiger Berater). preview = Admin in „Als Kunde ansehen“: weder Dateiname noch Inhalt.
 * userId: Login, der öffnen will (Zwei-Faktor-Pflicht, AVV § 5); ohne userId kein Öffnen.
 */
export async function listUnterlagen(leadId: string, opts: { preview: boolean; userId?: string | null }): Promise<UnterlageView[]> {
  const [rows, lead, zweiFaktor] = await Promise.all([
    prisma.leadDocument.findMany({
      where: { leadId, status: "gespeichert" },
      orderBy: { createdAt: "desc" },
      select: { id: true, fileName: true, size: true, createdAt: true, sparte: true, consentAt: true, deleteAfter: true, behaltenAt: true, behaltenVermerk: true, virenStatus: true },
    }),
    prisma.lead.findUnique({ where: { id: leadId }, select: { status: true } }),
    !opts.preview && opts.userId ? zweiFaktorAktiv(opts.userId) : Promise.resolve(false),
  ]);
  const abschluss = istAbschluss(lead?.status);
  return rows.map((r) => {
    const gesperrt = opts.preview ? null : !zweiFaktor ? ("zwei_faktor" as const) : r.virenStatus === "ungeprueft" ? ("pruefung" as const) : null;
    return {
    id: r.id,
    fileName: opts.preview ? CHAT_HINWEIS : r.fileName,
    size: r.size,
    createdAt: r.createdAt.toISOString(),
    sparte: r.sparte ? sparteLabel(r.sparte) : null,
    consentAt: r.consentAt?.toISOString() ?? null,
    // Ungeprüfte Dateien: Öffnen versucht die Prüfung nachzuholen (ladeUnterlage), Link bleibt deshalb da
    ansehen: !opts.preview && zweiFaktor,
    gesperrt,
    loeschtAm: r.behaltenAt ? null : (r.deleteAfter?.toISOString() ?? null),
    behaltenAt: r.behaltenAt?.toISOString() ?? null,
    behaltenVermerk: r.behaltenVermerk,
    behaltenMoeglich: abschluss || !!r.behaltenAt,
    };
  });
}

/**
 * Datei zum Öffnen bzw. Herunterladen (entschlüsselt). null = nicht gefunden oder nicht erlaubt (Admin-Vorschau, kein
 * Login). { gesperrt }: Zwei-Faktor-Login fehlt (AVV § 5) bzw. Virenprüfung noch nicht möglich; „befund“: beim
 * Nachprüfen gefunden und gelöscht. Jeder Abruf steht im Änderungsprotokoll (policen.abruf). Aufrufer prüfen leadScope.
 */
export async function ladeUnterlage(
  leadId: string,
  docId: string,
  ctx: { customerId: string; preview: boolean; userId: string | null; email?: string | null; download?: boolean },
): Promise<{ fileName: string; mimeType: string; data: Buffer } | { gesperrt: "zwei_faktor" | "pruefung" | "befund" } | null> {
  if (ctx.preview || !ctx.userId) return null;
  const doc = await prisma.leadDocument.findFirst({
    where: { id: docId, leadId, customerId: ctx.customerId, status: "gespeichert" },
    select: { id: true, fileName: true, mimeType: true, storageKey: true, dateiSchluessel: true, data: true, virenStatus: true },
  });
  if (!doc) return null;
  if (!(await zweiFaktorAktiv(ctx.userId))) return { gesperrt: "zwei_faktor" };
  const data = doc.storageKey ? await holeAb(ctx.customerId, doc.storageKey, doc.dateiSchluessel) : doc.data ? decryptBytes(doc.data) : null;
  if (!data) return null;
  if (doc.virenStatus === "ungeprueft") {
    const nach = await pruefeNach({ id: doc.id, customerId: ctx.customerId, leadId }, data);
    if (nach !== "sauber") return { gesperrt: nach === "befund" ? "befund" : "pruefung" };
  }
  await audit("policen.abruf", {
    entity: "LeadDocument",
    entityId: doc.id,
    customerId: ctx.customerId,
    details: { leadId, art: ctx.download ? "herunterladen" : "oeffnen" },
    actor: { id: ctx.userId, email: ctx.email ?? null, role: "BUYER" },
  });
  return { fileName: doc.fileName, mimeType: doc.mimeType, data };
}

/** Eine Unterlage löschen (Vermittler im Kontakt). */
export async function loescheUnterlage(leadId: string, docId: string, customerId: string, userId: string | null): Promise<boolean> {
  const n = await loescheDokumente({ customerId, leadId, id: { in: [docId] } }, "vermittler");
  if (!n) return false;
  await logLeadHistory(leadId, "dokument", "Dokument vom Kunden gelöscht", { customerId, userId });
  await audit("policen.geloescht", { entity: "LeadDocument", entityId: docId, customerId, details: { leadId }, actor: { id: userId, role: "BUYER" } });
  return true;
}

/**
 * „Beratungsdokumentation behalten“ setzen bzw. aufheben (Vermittler im Kontakt, nur bei Abschluss). Gesetzt: keine
 * automatische Löschung, mit Zeitpunkt, Login und Vermerk. Aufgehoben: wieder 90 Tage nach dem Termin.
 */
export async function behalteUnterlage(
  leadId: string,
  docId: string,
  ctx: { customerId: string; userId: string | null; behalten: boolean; vermerk?: string | null; now?: Date },
): Promise<boolean> {
  const doc = await prisma.leadDocument.findFirst({ where: { id: docId, leadId, customerId: ctx.customerId, status: "gespeichert" }, select: { id: true, createdAt: true } });
  if (!doc) return false;
  const now = ctx.now ?? new Date();
  const vermerk = (ctx.vermerk ?? "").replace(/\s+/g, " ").trim().slice(0, 200) || BEHALTEN_VERMERK;
  await prisma.leadDocument.update({
    where: { id: doc.id },
    data: ctx.behalten
      ? { behaltenAt: now, behaltenVonId: ctx.userId, behaltenVermerk: vermerk, deleteAfter: null }
      : { behaltenAt: null, behaltenVonId: null, behaltenVermerk: null, erinnertAt: null, deleteAfter: await loeschfristFuer(leadId, doc.createdAt) },
  });
  await logLeadHistory(leadId, "dokument", ctx.behalten ? `Dokument vom Kunden wird behalten: ${vermerk}` : "Dokument vom Kunden wird nicht mehr behalten, automatische Löschung wieder an", {
    customerId: ctx.customerId,
    userId: ctx.userId,
  });
  await audit("policen.behalten", { entity: "LeadDocument", entityId: doc.id, customerId: ctx.customerId, details: { leadId, behalten: ctx.behalten, vermerk: ctx.behalten ? vermerk : null }, actor: { id: ctx.userId, role: "BUYER" } });
  return true;
}

// ─── Virenprüfung nachholen (beim Öffnen und im Cron) ───────────────────────

/** Ungeprüfte Unterlage prüfen: sauber → anbieten; Befund → löschen, Lead neutral informieren, Vermittler-Hinweis. */
async function pruefeNach(doc: { id: string; customerId: string; leadId: string }, data: Buffer): Promise<"sauber" | "befund" | "ungeprueft"> {
  const e = await pruefeAufViren(data);
  if (e.status === "ungeprueft") return "ungeprueft";
  if (e.status === "sauber") {
    await prisma.leadDocument.update({ where: { id: doc.id }, data: { virenStatus: "sauber" } }).catch(() => null);
    return "sauber";
  }
  await loescheDokumente({ id: { in: [doc.id] } }, "virus");
  await befundMelden(doc.customerId, doc.leadId, e.signatur, "nachpruefung");
  // Lead neutral informieren (bestmöglich; außerhalb des 24-Stunden-Fensters schickt WhatsApp nichts)
  const conv = await prisma.conversation.findFirst({ where: { leadId: doc.leadId, customerId: doc.customerId }, orderBy: { lastMessageAt: "desc" }, select: { id: true } });
  const chat = conv ? await chatOf(conv.id) : null;
  if (chat) await send(chat, virenText((await sprecher(chat)).an)).catch((err) => logFehler("virus antwort", err));
  return "befund";
}

/**
 * Ungeprüfte Unterlagen nachprüfen, sobald die Virenprüfung erreichbar ist (WhatsApp-Cron, höchstens `max` je Lauf).
 * Ohne Konfiguration: nichts.
 */
export async function pruefeUngepruefteNach(max = 20): Promise<{ geprueft: number; befund: number }> {
  if (!virenKonfig()) return { geprueft: 0, befund: 0 };
  const docs = await prisma.leadDocument.findMany({
    where: { status: "gespeichert", virenStatus: "ungeprueft" },
    orderBy: { createdAt: "asc" },
    take: max,
    select: { id: true, customerId: true, leadId: true, storageKey: true, dateiSchluessel: true, data: true },
  });
  let geprueft = 0;
  let befund = 0;
  for (const d of docs) {
    try {
      const data = d.storageKey ? await holeAb(d.customerId, d.storageKey, d.dateiSchluessel) : d.data ? decryptBytes(d.data) : null;
      if (!data) continue;
      const r = await pruefeNach(d, data);
      if (r === "ungeprueft") break; // Dienst gerade nicht erreichbar: nächster Lauf
      geprueft++;
      if (r === "befund") befund++;
    } catch (e) {
      logFehler("nachprüfen", e);
    }
  }
  return { geprueft, befund };
}

// ─── Löschfristen (täglicher Cron) ──────────────────────────────────────────

const tag = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);

/**
 * Täglich (api/whatsapp/cron): Media-IDs ohne Einwilligung nach 24 Stunden verwerfen. Gespeicherte Dokumente 90 Tage
 * nach dem letzten Termin (ohne Termin nach dem Eingang) löschen; bei Abschluss 14 Tage vorher Erinnerung an den
 * Vermittler. „Beratungsdokumentation behalten“: keine automatische Löschung. Verwaiste Dateien im Bucket (ohne
 * Eintrag, älter als ein Tag, z. B. nach Löschung eines Leads) werden mit gelöscht.
 */
export async function prunePolicen(now = new Date()) {
  const abgelaufen = await prisma.leadDocument.findMany({
    where: { status: "wartet", createdAt: { lt: new Date(now.getTime() - WARTEN_STUNDEN * 60 * 60 * 1000) } },
    select: { id: true },
  });
  const wartet = abgelaufen.length ? await loescheDokumente({ id: { in: abgelaufen.map((x) => x.id) } }, "ohne_einwilligung") : 0;

  const docs = await prisma.leadDocument.findMany({
    where: { status: "gespeichert" },
    select: {
      id: true,
      leadId: true,
      createdAt: true,
      deleteAfter: true,
      erinnertAt: true,
      behaltenAt: true,
      lead: { select: { status: true, name: true, appointments: { where: { status: { not: "cancelled" } }, select: { startsAt: true } } } },
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
    const datum = loeschDatum({ termine: d.lead.appointments.map((x) => x.startsAt), eingang: d.createdAt });
    if (!datum) continue;
    if (istAbschluss(d.lead.status)) {
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
  const geloescht = loeschen.length ? await loescheDokumente({ id: { in: loeschen } }, "frist") : 0;
  if (erinnern.size) {
    const { notifyLeadPush } = await import("@/lib/team");
    for (const [leadId, e] of erinnern) {
      const text = `Dokumente vom Kunden werden am ${tag(e.am)} gelöscht. Bitte in die Kundenakte übernehmen oder als Beratungsdokumentation behalten.`;
      await logLeadHistory(leadId, "dokument", text, { userId: null });
      await notifyLeadPush(leadId, {
        title: `Dokumente in die Kundenakte übernehmen: ${e.name ?? "Kontakt"}`,
        body: text,
        tag: `policen-erinnerung:${leadId}`,
        url: `/buyer/leads/${leadId}#dokumente`,
      }).catch(() => null);
    }
  }
  // Verwaiste Dateien im Bucket
  let verwaist = 0;
  try {
    const objekte = await listeAb();
    if (objekte.length) {
      const bekannt = new Set(
        (await prisma.leadDocument.findMany({ where: { storageKey: { in: objekte.map((x) => x.key) } }, select: { storageKey: true } })).map((x) => x.storageKey),
      );
      const weg = objekte.filter((x) => !bekannt.has(x.key) && x.at.getTime() < now.getTime() - 24 * 60 * 60 * 1000).map((x) => x.key);
      await loescheAb(weg);
      verwaist = weg.length;
    }
  } catch (e) {
    logFehler("verwaist", e);
  }
  return { wartet, geloescht, aktualisiert, erinnert: erinnern.size, verwaist };
}

/** Schlüssel und Typen der Formular-Antwort ohne Werte (Protokoll bei Ladefehlern). */
export function formularAufbau(raw: unknown): string {
  let j: unknown = raw;
  if (typeof raw === "string") {
    try {
      j = JSON.parse(raw);
    } catch {
      return "kein JSON";
    }
  }
  const art = (v: unknown): string => (Array.isArray(v) ? `array(${v.length})` : v === null ? "null" : typeof v);
  if (!j || typeof j !== "object") return art(j);
  return Object.entries(j as Record<string, unknown>)
    .map(([k, v]) => {
      if (Array.isArray(v) && v.length) {
        const e = v[0];
        const innen = e && typeof e === "object" ? `{${Object.entries(e as Record<string, unknown>).map(([ik, iv]) => `${ik}:${art(iv)}`).join(",")}}` : art(e);
        return `${k}:${art(v)}[${innen}]`;
      }
      return `${k}:${art(v)}`;
    })
    .join(" ");
}
