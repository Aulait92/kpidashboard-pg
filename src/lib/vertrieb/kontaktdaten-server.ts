// Kontaktdaten automatisch übernehmen (Ole, 16.11.2026): E-Mail-Adressen und Telefonnummern aus
// Terminbuchungen (Calendly, eigene Buchungsseite), Mails am Kontakt (Absender und Signatur),
// Formularen und Instantly. Regeln:
// - Hauptadresse und Hauptnummer werden nie überschrieben; fehlen sie, wird der erste erkannte Wert Haupt.
// - Neue Werte kommen als weitere E-Mail (altEmails, über addContactEmail) bzw. weitere Nummer (SalesContactPhone).
// - Keine Doppelanlage: E-Mail klein geschrieben, Telefon als E.164 (phoneKey/phoneE164 aus dubletten.ts).
// - Keine eigenen Adressen/Nummern, keine System-Adressen, nichts aus zitiertem Verlauf oder Tool-Fußzeilen.
// - Von Hand entfernte Werte werden nicht erneut übernommen (detectedData.removed).
// - Jeder neue Wert: kurzer Verlaufseintrag „Neue Telefonnummer erkannt“ bzw. „Neue E-Mail-Adresse erkannt“.

import { htmlToText } from "@/lib/impressum";
import { claudeCall, runAgent, type LlmCall } from "@/lib/kampagnen/llm";
import type { Valid } from "@/lib/kampagnen/types";
import { reportError } from "@/lib/monitoring";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { addContactEmail, findContactIdByEmail, normalizeEmail } from "@/lib/vertrieb/contact-merge";
import { FREEMAIL, answersContacts, phoneE164, phoneKey, phoneKind, type PhoneKind } from "@/lib/vertrieb/dubletten";
import { formatPhone } from "@/lib/format";
import {
  EMPTY_OWN,
  KIND_LABEL,
  emailDomain,
  extractHistoryPhones,
  extractMailPhones,
  historyPhoneText,
  SHARED_MIN_CONTACTS,
  centralPhone,
  newPhonesFor,
  ownPhones,
  phoneKeysIn,
  sharedPhoneKeys,
  sharedPhoneReason,
  skipHistoryEntry,
  sourceLabel,
  usableEmail,
  type ContactDataSource,
  type FoundPhone,
  type OwnContext,
} from "@/lib/vertrieb/kontaktdaten";

// ─── Zusatzdaten am Kontakt (SalesContact.detectedData) ─────────────────

export type DetectedData = { emails?: Record<string, { source: string; at: string }>; removed?: string[] };

export function detectedDataOf(raw: unknown): DetectedData {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const r = raw as DetectedData;
  return { emails: r.emails && typeof r.emails === "object" ? r.emails : {}, removed: Array.isArray(r.removed) ? r.removed : [] };
}

const asJson = (d: DetectedData) => d as unknown as Prisma.InputJsonValue;

// ─── Eigene Adressen und Nummern ────────────────────────────────────────

let ownCache: { at: number; own: OwnContext } | null = null;

/** Ole, Mirko, performancegrowth: Admin-Logins, unsere Instantly-Postfächer, Konfiguration. 10 Min. zwischengespeichert. */
export async function loadOwnContext(fresh = false): Promise<OwnContext> {
  if (!fresh && ownCache && Date.now() - ownCache.at < 10 * 60_000) return ownCache.own;
  const addresses = new Set<string>();
  const domains = new Set<string>(["performancegrowth.de"]);
  const add = (raw: string | null | undefined) => {
    const m = String(raw ?? "").match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/);
    if (!m) return;
    const e = m[0].toLowerCase();
    addresses.add(e);
    const d = emailDomain(e);
    if (d && !FREEMAIL.has(d)) domains.add(d);
  };
  const [admins, accounts] = await Promise.all([
    prisma.user.findMany({ where: { role: "ADMIN" }, select: { email: true } }).catch(() => []),
    prisma.salesEmail.findMany({ where: { eaccount: { not: null } }, distinct: ["eaccount"], select: { eaccount: true }, take: 200 }).catch(() => []),
  ]);
  for (const a of admins) add(a.email);
  for (const a of accounts) add(a.eaccount);
  for (const v of [process.env.ADMIN_EMAIL, process.env.OFFER_EMAIL_FROM, process.env.LEAD_EMAIL_FROM]) add(v);
  for (const d of (process.env.OWN_EMAIL_DOMAINS ?? "").split(",")) if (d.trim()) domains.add(d.trim().toLowerCase().replace(/^@/, ""));
  const phoneKeys = new Set(ownPhones().map((p) => phoneKey(p)).filter((k): k is string => !!k));
  const own = { addresses, domains, phoneKeys };
  ownCache = { at: Date.now(), own };
  return own;
}

// ─── Einzelwerte übernehmen ─────────────────────────────────────────────

export type AddResult = "main" | "added" | "known" | "skipped";
type Opts = { source: ContactDataSource; at?: Date; own?: OwnContext };

/** Quellen, aus denen Nummern automatisch erkannt werden (nicht von Hand, nicht beim Zusammenführen). */
const AUTO_SOURCES = new Set<ContactDataSource>(["BUCHUNG", "CALENDLY", "MAIL", "FORMULAR", "INSTANTLY", "VERLAUF"]);

/**
 * Zentrale oder Sammelnummer? Bekannte Versicherer-Zentrale, oder eine Festnetznummer, die schon bei
 * SHARED_MIN_CONTACTS − 1 anderen Kontakten als weitere Nummer steht (mit diesem wären es SHARED_MIN_CONTACTS).
 */
export async function isSharedPhone(contactId: string, e164: string): Promise<boolean> {
  if (centralPhone(e164)) return true;
  if (phoneKind(e164) === "MOBIL") return false;
  const others = await prisma.salesContactPhone.findMany({
    where: { phone: e164, contactId: { not: contactId } },
    distinct: ["contactId"],
    select: { contactId: true },
    take: SHARED_MIN_CONTACTS - 1,
  });
  return others.length >= SHARED_MIN_CONTACTS - 1;
}

/**
 * Telefonnummer übernehmen: fehlt die Hauptnummer, wird sie Haupt; sonst weitere Nummer.
 * Gleiche Nummer in anderer Schreibweise, eigene oder von Hand entfernte Nummern: nichts.
 */
export async function addContactPhone(contactId: string, raw: string | null | undefined, opts: Opts & { kind?: PhoneKind; label?: string | null }): Promise<AddResult> {
  const e164 = phoneE164(raw);
  const key = phoneKey(e164);
  if (!e164 || !key) return "skipped";
  const own = opts.own ?? (await loadOwnContext());
  if (own.phoneKeys.has(key)) return "skipped";
  const c = await prisma.salesContact.findUnique({ where: { id: contactId }, select: { phone: true, detectedData: true, phones: { select: { phone: true } } } });
  if (!c) return "skipped";
  if (phoneKey(c.phone) === key || c.phones.some((p) => phoneKey(p.phone) === key)) return "known";
  // Entfernte Nummern nicht automatisch zurückholen; von Hand (MANUELL) wieder eintragen geht
  if (opts.source !== "MANUELL" && detectedDataOf(c.detectedData).removed?.some((r) => phoneKey(r) === key)) return "known";
  // Zentralen und Sammelnummern nie automatisch (Ole, 24.11.2026); von Hand eintragen geht
  if (AUTO_SOURCES.has(opts.source) && (await isSharedPhone(contactId, e164))) return "skipped";
  const kind = opts.kind ?? phoneKind(e164, opts.label);
  const at = opts.at ?? new Date();
  const what = `${KIND_LABEL[kind]}, ${sourceLabel("phone", opts.source, at)}`;
  if (!c.phone?.trim()) {
    const display = String(raw).replace(/–/g, "-").replace(/\s+/g, " ").trim();
    const n = await prisma.salesContact.updateMany({
      where: { id: contactId, OR: [{ phone: null }, { phone: "" }] },
      data: { phone: display, ...(opts.source === "MAIL" ? { phoneMailCheckedAt: new Date() } : {}) },
    });
    if (n.count) {
      await prisma.salesActivity.create({ data: { contactId, type: "NOTIZ", outcome: "Neue Telefonnummer erkannt", note: `${display} (${what}), als Hauptnummer übernommen` } });
      return "main";
    }
  }
  try {
    await prisma.salesContactPhone.create({ data: { contactId, phone: e164, kind, source: opts.source, detectedAt: at } });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") return "known";
    throw err;
  }
  await prisma.salesActivity.create({ data: { contactId, type: "NOTIZ", outcome: "Neue Telefonnummer erkannt", note: `${formatPhone(e164)} (${what})` } });
  return "added";
}

/**
 * E-Mail-Adresse übernehmen: Platzhalter-Hauptadresse (…@ohne-email.invalid) wird ersetzt, sonst weitere
 * Adresse über addContactEmail. Gehört die Adresse schon einem anderen Kontakt: nichts (Dubletten-Hinweis).
 */
export async function addDetectedEmail(contactId: string, raw: string | null | undefined, opts: Opts): Promise<AddResult> {
  const email = normalizeEmail(raw);
  if (!email) return "skipped";
  const own = opts.own ?? (await loadOwnContext());
  if (!usableEmail(email, own)) return "skipped";
  const c = await prisma.salesContact.findUnique({ where: { id: contactId }, select: { email: true, altEmails: true, detectedData: true } });
  if (!c) return "skipped";
  if (c.email.trim().toLowerCase() === email || c.altEmails.includes(email)) return "known";
  const data = detectedDataOf(c.detectedData);
  if (data.removed?.includes(email)) return "known";
  const other = await findContactIdByEmail(email);
  if (other && other !== contactId) return "skipped";
  const at = opts.at ?? new Date();
  const label = sourceLabel("email", opts.source, at);
  if (!c.email.trim() || c.email.endsWith(".invalid")) {
    try {
      const n = await prisma.salesContact.updateMany({ where: { id: contactId, email: c.email }, data: { email } });
      if (n.count) {
        await prisma.salesActivity.create({ data: { contactId, type: "NOTIZ", outcome: "Neue E-Mail-Adresse erkannt", note: `${email} (${label}), als Hauptadresse übernommen` } });
        return "main";
      }
    } catch (err) {
      if ((err as { code?: string }).code !== "P2002") throw err;
      return "skipped";
    }
  }
  const r = await addContactEmail(contactId, email);
  if (!r.ok) return "skipped";
  const fresh = detectedDataOf((await prisma.salesContact.findUnique({ where: { id: contactId }, select: { detectedData: true } }))?.detectedData);
  await prisma.salesContact.update({
    where: { id: contactId },
    data: { detectedData: asJson({ ...fresh, emails: { ...fresh.emails, [email]: { source: opts.source, at: at.toISOString() } } }) },
  });
  await prisma.salesActivity.create({ data: { contactId, type: "NOTIZ", outcome: "Neue E-Mail-Adresse erkannt", note: `${email} (${label})` } });
  return "added";
}

// ─── Quellen ────────────────────────────────────────────────────────────

export type CaptureCounts = { emails: number; phones: number };
const ZERO: CaptureCounts = { emails: 0, phones: 0 };
const plus = (a: CaptureCounts, b: CaptureCounts): CaptureCounts => ({ emails: a.emails + b.emails, phones: a.phones + b.phones });
const counted = (r: AddResult) => (r === "main" || r === "added" ? 1 : 0);

/** Terminbuchung (Calendly oder eigene Buchungsseite): E-Mail, Telefon und Angaben im Buchungsformular. */
export async function captureFromBooking(
  contactId: string,
  b: { email?: string | null; phone?: string | null; answers?: string | null; source: "BUCHUNG" | "CALENDLY"; at?: Date },
  own?: OwnContext,
): Promise<CaptureCounts> {
  const o = { source: b.source, at: b.at, own: own ?? (await loadOwnContext()) };
  const fromAnswers = answersContacts(b.answers);
  let n = ZERO;
  for (const e of [b.email, ...fromAnswers.emails]) n = plus(n, { emails: counted(await addDetectedEmail(contactId, e, o)), phones: 0 });
  for (const p of [b.phone, ...fromAnswers.phones]) n = plus(n, { emails: 0, phones: counted(await addContactPhone(contactId, p, o)) });
  return n;
}

/** Formular, Meta-Lead oder Instantly: abweichende E-Mail bzw. Nummer. */
export async function captureFromLead(
  contactId: string,
  l: { email?: string | null; phone?: string | null; source: "FORMULAR" | "INSTANTLY"; at?: Date },
  own?: OwnContext,
): Promise<CaptureCounts> {
  const o = { source: l.source, at: l.at, own: own ?? (await loadOwnContext()) };
  return {
    emails: counted(await addDetectedEmail(contactId, l.email, o)),
    phones: counted(await addContactPhone(contactId, l.phone, o)),
  };
}

const AI_SCHEMA = {
  type: "object",
  properties: {
    phones: {
      type: "array",
      items: { type: "object", properties: { number: { type: "string" }, kind: { type: "string", enum: ["MOBIL", "FESTNETZ"] } }, required: ["number", "kind"], additionalProperties: false },
    },
  },
  required: ["phones"],
  additionalProperties: false,
};

/** KI nur bei Unklarheit: welche Nummern in der Signatur gehören dem Absender? Nur Nummern, die wirklich dastehen. */
export async function aiSignaturePhones(llm: LlmCall, signature: string, exclude: Set<string>): Promise<FoundPhone[]> {
  const present = phoneKeysIn(signature);
  const validate = (x: unknown): Valid<FoundPhone[]> => {
    const list = (x as { phones?: { number?: unknown; kind?: unknown }[] })?.phones;
    if (!Array.isArray(list)) return { ok: false, errors: ["phones fehlt"] };
    const out: FoundPhone[] = [];
    for (const p of list) {
      const e164 = phoneE164(String(p?.number ?? ""));
      const key = phoneKey(e164);
      if (!e164 || !key || !present.has(key) || exclude.has(key)) continue; // nichts Erfundenes, nichts Eigenes
      out.push({ raw: String(p.number), e164, kind: p.kind === "MOBIL" ? "MOBIL" : phoneKind(e164), label: null });
    }
    return { ok: true, value: out };
  };
  const system =
    "Du liest die Signatur einer geschäftlichen E-Mail und nennst nur die Telefonnummern des Absenders selbst (Festnetz und Mobil). " +
    "Keine Faxnummern, keine Service- oder Hotline-Nummern (z. B. eines Versicherers), keine Nummern anderer Personen. " +
    'Antworte nur mit JSON: {"phones":[{"number":"...","kind":"MOBIL"|"FESTNETZ"}]}. Gibt es keine, {"phones":[]}.';
  const { value } = await runAgent(llm, { agent: "Kontaktdaten aus Signatur", system, user: signature.slice(0, 2000), schema: AI_SCHEMA, maxTokens: 2000 }, validate);
  return value;
}

const defaultLlm = (): LlmCall | null => (process.env.ANTHROPIC_API_KEY && process.env.VERTRIEB_KONTAKTDATEN_KI !== "0" ? claudeCall : null);

export type MailInput = { direction?: string | null; fromEmail?: string | null; text?: string | null; html?: string | null; isAutoReply?: boolean | null; sentAt?: Date | null };

/**
 * Mail am Kontakt: Absenderadresse und Telefonnummern aus der Signatur. Nur echte eingehende Mails
 * (keine Abwesenheitsnotiz: dort steht die Vertretung). Ausgehende Mails tragen unsere Signatur.
 * `llm`: null = ohne KI (Rückwirkend-Lauf), sonst KI nur, wenn die Regex eine Nummer nicht eindeutig zuordnen kann.
 */
export async function captureFromMail(contactId: string, m: MailInput, opts: { own?: OwnContext; llm?: LlmCall | null; phonesOnly?: boolean } = {}): Promise<CaptureCounts> {
  if ((m.direction ?? "IN") !== "IN" || m.isAutoReply) return ZERO;
  const own = opts.own ?? (await loadOwnContext());
  const o = { source: "MAIL" as const, at: m.sentAt ?? undefined, own };
  let n = ZERO;
  if (!opts.phonesOnly) n = plus(n, { emails: counted(await addDetectedEmail(contactId, m.fromEmail, o)), phones: 0 });
  const text = m.text || (m.html ? htmlToText(m.html) : null);
  const found = extractMailPhones(text, ownPhones());
  let phones = found.phones;
  const llm = opts.llm === undefined ? defaultLlm() : opts.llm;
  if (found.unclear && llm) {
    try {
      const ai = await aiSignaturePhones(llm, found.signature, own.phoneKeys);
      const keys = new Set(phones.map((p) => phoneKey(p.e164)));
      phones = [...phones, ...ai.filter((p) => !keys.has(phoneKey(p.e164)))];
    } catch (err) {
      reportError(err, "kontaktdaten-ki");
    }
  }
  for (const p of phones) n = plus(n, { emails: 0, phones: counted(await addContactPhone(contactId, p.raw, { ...o, kind: p.kind })) });
  return n;
}

// ─── Nummern aus dem Verlauf (Ole, 24.11.2026) ──────────────────────────

export type HistoryEntry = { type: string; outcome?: string | null; note?: string | null; occurredAt?: Date | null };

/**
 * Telefonnummern aus einem Verlaufseintrag als weitere Nummer übernehmen (Herkunft „aus Verlauf“, Verlaufseintrag
 * „Neue Telefonnummer erkannt“). Ohne Nummer im Text keine Datenbankabfrage. Fehler werden gemeldet, nie geworfen:
 * Aufruf direkt nach dem Anlegen eines Eintrags (Calendly, Buchung, Anrufnotiz, Instantly-Antwort, Formular, Import).
 */
export async function captureFromActivity(contactId: string, a: HistoryEntry, own?: OwnContext): Promise<number> {
  try {
    if (skipHistoryEntry(a)) return 0;
    const found = extractHistoryPhones(historyPhoneText(a), ownPhones());
    if (!found.length) return 0;
    const o = { source: "VERLAUF" as const, at: a.occurredAt ?? undefined, own: own ?? (await loadOwnContext()) };
    let n = 0;
    for (const p of found) n += counted(await addContactPhone(contactId, p.raw, { ...o, kind: p.kind }));
    return n;
  } catch (err) {
    reportError(err, "kontaktdaten-verlauf");
    return 0;
  }
}

export type HistoryBackfillResult = {
  contacts: number;
  entries: number;
  phones: number;
  /** Beispiele (höchstens 50): Kontakt, Nummer, Art */
  examples: { contactId: string; name: string; phone: string; kind: string }[];
};

/**
 * Einmalig rückwirkend: alle Verlaufseinträge mit einer möglichen Telefonnummer durchgehen. `dryRun`: nur zählen und
 * Beispiele nennen, nichts speichern. Idempotent (bekannte, entfernte und eigene Nummern werden übersprungen).
 * Ops-Aktion `vertrieb_nummern_aus_verlauf` (lib/ops-aktionen.ts).
 */
export async function backfillPhonesFromHistory(opts: { dryRun?: boolean; contactIds?: string[]; batch?: number } = {}): Promise<HistoryBackfillResult> {
  const own = await loadOwnContext(true);
  const out: HistoryBackfillResult = { contacts: 0, entries: 0, phones: 0, examples: [] };
  const shared = opts.dryRun ? sharedPhoneKeys(await prisma.salesContactPhone.findMany({ select: { contactId: true, phone: true } }), SHARED_MIN_CONTACTS - 1) : undefined;
  // Vorauswahl in der Datenbank: Einträge mit einer Ziffernfolge, die nach Rufnummer aussieht
  const rows = await prisma.$queryRaw<{ contactId: string }[]>`
    SELECT DISTINCT "contactId" FROM "SalesActivity"
    WHERE "type"::text NOT IN ('STATUS', 'EMAIL')
      AND (coalesce("note", '') || ' ' || coalesce("outcome", '')) ~ '([+]|00|0)[1-9][0-9 /()\\u2013-]{5,}[0-9]'
    ORDER BY "contactId"`;
  const filter = opts.contactIds ? new Set(opts.contactIds) : null;
  const ids = rows.map((r) => r.contactId).filter((id) => !filter || filter.has(id));
  const size = opts.batch ?? 100;
  for (let i = 0; i < ids.length; i += size) {
    const page = await prisma.salesContact.findMany({
      where: { id: { in: ids.slice(i, i + size) } },
      select: {
        id: true,
        name: true,
        phone: true,
        detectedData: true,
        phones: { select: { phone: true } },
        activities: { orderBy: { occurredAt: "asc" }, select: { type: true, outcome: true, note: true, occurredAt: true } },
      },
    });
    for (const c of page) {
      out.contacts++;
      const extras = c.phones.map((p) => p.phone);
      for (const a of c.activities) {
        if (skipHistoryEntry(a)) continue;
        const found = extractHistoryPhones(historyPhoneText(a), ownPhones());
        if (!found.length) continue;
        out.entries++;
        if (opts.dryRun) {
          const neu = newPhonesFor(found, { phone: c.phone, extras, removed: detectedDataOf(c.detectedData).removed, ownKeys: own.phoneKeys, shared });
          for (const p of neu) {
            extras.push(p.e164);
            out.phones++;
            if (out.examples.length < 50) out.examples.push({ contactId: c.id, name: c.name, phone: formatPhone(p.e164), kind: KIND_LABEL[p.kind] });
          }
        } else {
          for (const p of found) {
            const r = await addContactPhone(c.id, p.raw, { source: "VERLAUF", at: a.occurredAt, own, kind: p.kind }).catch((err) => {
              reportError(err, "kontaktdaten-verlauf-rueckwirkend");
              return "skipped" as const;
            });
            if (r === "main" || r === "added") {
              out.phones++;
              if (out.examples.length < 50) out.examples.push({ contactId: c.id, name: c.name, phone: formatPhone(p.e164), kind: KIND_LABEL[p.kind] });
            }
          }
        }
      }
    }
  }
  return out;
}

// ─── Am Kontakt: Haupt setzen, entfernen ────────────────────────────────

/** Weitere Nummer wird Hauptnummer, die bisherige Hauptnummer wird weitere Nummer. */
export async function makePrimaryPhone(contactId: string, phoneId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const p = await tx.salesContactPhone.findFirst({ where: { id: phoneId, contactId } });
    if (!p) return;
    const c = await tx.salesContact.findUniqueOrThrow({ where: { id: contactId }, select: { phone: true } });
    await tx.salesContactPhone.delete({ where: { id: p.id } });
    const old = phoneE164(c.phone);
    if (old && phoneKey(old) !== phoneKey(p.phone)) {
      await tx.salesContactPhone.upsert({
        where: { contactId_phone: { contactId, phone: old } },
        create: { contactId, phone: old, kind: phoneKind(old), source: "HAUPT" },
        update: {},
      });
    }
    await tx.salesContact.update({ where: { id: contactId }, data: { phone: formatPhone(p.phone) } });
  });
}

/** Weitere Nummer entfernen; sie wird danach nicht wieder automatisch übernommen. */
export async function removeContactPhone(contactId: string, phoneId: string): Promise<void> {
  const p = await prisma.salesContactPhone.findFirst({ where: { id: phoneId, contactId } });
  if (!p) return;
  await prisma.salesContactPhone.delete({ where: { id: p.id } });
  await rememberRemoved(contactId, p.phone);
}

/** Von Hand entfernte Werte merken (nicht erneut automatisch übernehmen). */
export async function rememberRemoved(contactId: string, value: string): Promise<void> {
  const c = await prisma.salesContact.findUnique({ where: { id: contactId }, select: { detectedData: true } });
  if (!c) return;
  const d = detectedDataOf(c.detectedData);
  const v = value.trim().toLowerCase();
  if (d.removed?.includes(v)) return;
  const emails = { ...d.emails };
  delete emails[v];
  await prisma.salesContact.update({ where: { id: contactId }, data: { detectedData: asJson({ emails, removed: [...(d.removed ?? []), v] }) } });
}

// ─── Zentrale Nummern aufräumen (Ole, 24.11.2026) ───────────────────────

export type SharedCleanupResult = {
  /** Nummern, die als Zentrale/Sammelnummer gelten (bekannte Zentralen, die vorkommen, und häufige Festnetznummern) */
  sharedNumbers: { phone: string; contacts: number; reason: string }[];
  /** Entfernte (bzw. im Probelauf zu entfernende) weitere Nummern */
  extrasRemoved: number;
  /** Hauptnummern, die durch eine andere echte Nummer des Kontakts ersetzt wurden */
  mainReplaced: number;
  /** Hauptnummern, die Zentrale sind, aber bleiben (von Hand, Herkunft unklar oder keine andere Nummer) */
  mainKept: number;
  contacts: number;
  examples: { contactId: string; name: string; phone: string; what: "weitere" | "Haupt"; reason: string; newMain?: string }[];
};

/** Quellen automatisch erkannter weiterer Nummern, die aufgeräumt werden dürfen (nie „von Hand“). */
const CLEANUP_SOURCES = ["MAIL", "VERLAUF"];
/** Herkunft einer automatisch gesetzten Hauptnummer im Verlaufseintrag („… (Festnetz, aus E-Mail-Signatur 12.11.), als Hauptnummer übernommen“). */
const AUTO_MAIN_NOTE = /\((Mobil|Festnetz), (aus E-Mail-Signatur|aus Verlauf)[^)]*\), als Hauptnummer übernommen/;

/**
 * Zentralen und Sammelnummern entfernen, die automatisch (aus E-Mail, aus Verlauf) als weitere Nummer übernommen
 * wurden. Hauptnummer nur, wenn sie selbst automatisch aus einer solchen Quelle gesetzt wurde und der Kontakt eine
 * andere echte Nummer hat (die wird Haupt). Entfernte Nummern kommen auf die Liste „entfernt“ (nicht wieder
 * übernehmen), je Kontakt ein Verlaufseintrag „Zentrale Nummer entfernt“. `dryRun`: nur zählen.
 * Ops-Aktion `vertrieb_zentrale_nummern` (lib/ops-aktionen.ts).
 */
export async function removeSharedPhones(opts: { dryRun?: boolean; contactIds?: string[] } = {}): Promise<SharedCleanupResult> {
  const out: SharedCleanupResult = { sharedNumbers: [], extrasRemoved: 0, mainReplaced: 0, mainKept: 0, contacts: 0, examples: [] };
  const all = await prisma.salesContactPhone.findMany({ select: { id: true, contactId: true, phone: true, source: true, kind: true } });
  const shared = sharedPhoneKeys(all);
  const counts = new Map<string, Set<string>>();
  for (const r of all) {
    const k = phoneKey(r.phone);
    if (k && (shared.has(k) || centralPhone(r.phone))) counts.set(k, (counts.get(k) ?? new Set()).add(r.contactId));
  }
  out.sharedNumbers = [...counts]
    .map(([k, s]) => {
      const phone = all.find((r) => phoneKey(r.phone) === k)!.phone;
      return { phone: formatPhone(phone), contacts: s.size, reason: sharedPhoneReason(phone, shared)! };
    })
    .sort((a, b) => b.contacts - a.contacts);

  const filter = opts.contactIds ? new Set(opts.contactIds) : null;
  const byContact = new Map<string, typeof all>();
  for (const r of all) {
    if (filter && !filter.has(r.contactId)) continue;
    const list = byContact.get(r.contactId) ?? [];
    list.push(r);
    byContact.set(r.contactId, list);
  }
  // Kontakte mit Zentrale als Hauptnummer (Hauptnummer steht in beliebiger Schreibweise im Feld phone)
  const mains = await prisma.salesContact.findMany({
    where: { phone: { not: null }, ...(filter ? { id: { in: [...filter] } } : {}) },
    select: { id: true, phone: true },
  });
  const mainShared = new Set(mains.filter((c) => sharedPhoneReason(c.phone, shared)).map((c) => c.id));
  const ids = [...new Set([...[...byContact].filter(([, l]) => l.some((r) => sharedPhoneReason(r.phone, shared))).map(([id]) => id), ...mainShared])];

  for (let i = 0; i < ids.length; i += 100) {
    const page = await prisma.salesContact.findMany({
      where: { id: { in: ids.slice(i, i + 100) } },
      select: {
        id: true,
        name: true,
        phone: true,
        activities: { where: { outcome: "Neue Telefonnummer erkannt", note: { contains: "als Hauptnummer übernommen" } }, select: { note: true } },
      },
    });
    for (const c of page) {
      const extras = byContact.get(c.id) ?? [];
      const drop = extras.filter((r) => CLEANUP_SOURCES.includes(r.source) && sharedPhoneReason(r.phone, shared));
      const notes: string[] = [];
      for (const r of drop) {
        const reason = sharedPhoneReason(r.phone, shared)!;
        notes.push(`${formatPhone(r.phone)} (${reason})`);
        out.extrasRemoved++;
        if (out.examples.length < 50) out.examples.push({ contactId: c.id, name: c.name, phone: formatPhone(r.phone), what: "weitere", reason });
      }
      // Hauptnummer: nur automatisch gesetzte, und nur wenn eine andere echte Nummer da ist
      let newMain: (typeof extras)[number] | undefined;
      const mainReason = sharedPhoneReason(c.phone, shared);
      if (mainReason) {
        const mainKey = phoneKey(c.phone);
        const auto = c.activities.some((a) => {
          const m = a.note?.match(AUTO_MAIN_NOTE);
          return !!m && phoneKey(a.note!.slice(0, a.note!.indexOf(" ("))) === mainKey;
        });
        const real = extras.filter((r) => !drop.includes(r) && !sharedPhoneReason(r.phone, shared) && phoneKey(r.phone) !== mainKey);
        newMain = auto ? (real.find((r) => r.kind === "MOBIL") ?? real[0]) : undefined;
        if (newMain) {
          out.mainReplaced++;
          notes.push(`${c.phone} (Hauptnummer, ${mainReason}); neue Hauptnummer ${formatPhone(newMain.phone)}`);
          if (out.examples.length < 50) out.examples.push({ contactId: c.id, name: c.name, phone: c.phone!, what: "Haupt", reason: mainReason, newMain: formatPhone(newMain.phone) });
        } else out.mainKept++;
      }
      if (!notes.length) continue;
      out.contacts++;
      if (opts.dryRun) continue;
      try {
        if (drop.length) await prisma.salesContactPhone.deleteMany({ where: { id: { in: drop.map((r) => r.id) }, contactId: c.id } });
        if (newMain) {
          await prisma.$transaction([
            prisma.salesContactPhone.deleteMany({ where: { id: newMain.id, contactId: c.id } }),
            prisma.salesContact.update({ where: { id: c.id }, data: { phone: formatPhone(newMain.phone) } }),
          ]);
        }
        for (const v of [...drop.map((r) => r.phone), ...(newMain && c.phone ? [phoneE164(c.phone) ?? c.phone] : [])]) await rememberRemoved(c.id, v);
        await prisma.salesActivity.create({ data: { contactId: c.id, type: "NOTIZ", outcome: "Zentrale Nummer entfernt", note: notes.join("\n") } });
      } catch (err) {
        reportError(err, "kontaktdaten-zentrale-nummern");
      }
    }
  }
  return out;
}

// ─── Einmalig rückwirkend ───────────────────────────────────────────────

export type BackfillResult = { contacts: number; emails: number; phones: number };

/**
 * Alle Kontakte über vorhandene Buchungen, Mails und Formulare laufen lassen (ohne KI).
 * Idempotent: ein zweiter Lauf ergänzt nichts mehr. Ältestes zuerst, damit bei fehlendem
 * Hauptwert der zuerst erkannte Haupt wird. Auslösbar unter Einstellungen → Anbindungen.
 */
export async function backfillContactData(opts: { batch?: number; contactIds?: string[] } = {}): Promise<BackfillResult> {
  const own = await loadOwnContext(true);
  const out: BackfillResult = { contacts: 0, emails: 0, phones: 0 };
  const where: Prisma.SalesContactWhereInput = {
    ...(opts.contactIds ? { id: { in: opts.contactIds } } : {}),
    OR: [{ meetings: { some: {} } }, { emails: { some: { direction: "IN", isAutoReply: false } } }, { inboundLeads: { some: {} } }],
  };
  let cursor: string | undefined;
  for (;;) {
    const page = await prisma.salesContact.findMany({
      where,
      orderBy: { id: "asc" },
      take: opts.batch ?? 100,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        meetings: { select: { createdAt: true, inviteeEmail: true, inviteePhone: true, answers: true, bookingTypeId: true, manageToken: true } },
        emails: { where: { direction: "IN", isAutoReply: false }, select: { fromEmail: true, text: true, html: true, sentAt: true, direction: true, isAutoReply: true } },
        inboundLeads: { select: { email: true, phone: true, source: true, createdAt: true } },
      },
    });
    if (!page.length) break;
    cursor = page[page.length - 1].id;
    for (const c of page) {
      out.contacts++;
      const steps: { at: Date; run: () => Promise<CaptureCounts> }[] = [
        ...c.meetings.map((m) => ({
          at: m.createdAt,
          run: () =>
            captureFromBooking(c.id, { email: m.inviteeEmail, phone: m.inviteePhone, answers: m.answers, source: m.bookingTypeId || m.manageToken ? "BUCHUNG" : "CALENDLY", at: m.createdAt }, own),
        })),
        ...c.emails.map((m) => ({ at: m.sentAt, run: () => captureFromMail(c.id, m, { own, llm: null }) })),
        ...c.inboundLeads
          .filter((l) => l.source !== "LINKEDIN")
          .map((l) => ({ at: l.createdAt, run: () => captureFromLead(c.id, { email: l.email, phone: l.phone, source: "FORMULAR", at: l.createdAt }, own) })),
      ].sort((a, b) => a.at.getTime() - b.at.getTime());
      for (const s of steps) {
        try {
          const r = await s.run();
          out.emails += r.emails;
          out.phones += r.phones;
        } catch (err) {
          reportError(err, "kontaktdaten-rueckwirkend");
        }
      }
    }
  }
  return out;
}

export { EMPTY_OWN };
