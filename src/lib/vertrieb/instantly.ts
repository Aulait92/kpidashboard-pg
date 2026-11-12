import Papa from "papaparse";
import { prisma } from "@/lib/prisma";
import { contactIdsByEmails, findContactIdByEmail } from "@/lib/vertrieb/contact-merge";
import { CAMPAIGN_STATUS } from "@/lib/vertrieb/crm";
import { classifyReply, isAutoReplyText, sentimentFromInstantly, type Sentiment } from "@/lib/vertrieb/sentiment";

const API = "https://api.instantly.ai/api/v2";

const INTEREST: Record<number, string> = {
  0: "Abwesend", 1: "Interessiert", 2: "Termin gebucht", 3: "Termin stattgefunden", 4: "Gewonnen",
  [-1]: "Kein Interesse", [-2]: "Falsche Person", [-3]: "Verloren", [-4]: "No-Show",
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const key = process.env.INSTANTLY_API_KEY;
  if (!key) throw new Error("INSTANTLY_API_KEY ist nicht gesetzt.");
  let res: Response;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(API + path, {
      ...init,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...init?.headers },
      cache: "no-store",
    });
    if (res.status !== 429 || attempt >= 5) break;
    await new Promise((r) => setTimeout(r, 4000));
  }
  if (!res.ok) throw new Error(`Instantly ${path}: ${res.status} ${await res.text().catch(() => "")}`.slice(0, 300));
  return res.json() as Promise<T>;
}

type ApiCampaign = { id: string; name: string };
type ApiLead = {
  id: string;
  email: string | null;
  status: number;
  email_open_count: number;
  email_reply_count: number;
  email_click_count: number;
  timestamp_last_contact: string | null;
  timestamp_last_open: string | null;
  timestamp_last_reply: string | null;
  lt_interest_status?: number;
  first_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;
  website?: string | null;
  phone?: string | null;
};

/**
 * Kontakt für eine Instantly-Adresse, die (noch) nicht im CRM ist – z. B. eine
 * Liste, die direkt in Instantly hochgeladen wurde (Signal Iduna o. ä.).
 * Vorher wurden solche Antworten verworfen.
 */
export async function ensureInstantlyContact(
  rawEmail: string,
  lead: { firstName?: unknown; lastName?: unknown; company?: unknown; website?: unknown; phone?: unknown },
  campaignName: string,
): Promise<{ id: string; created: boolean }> {
  const email = rawEmail.trim().toLowerCase();
  const existing = await findContactIdByEmail(email);
  if (existing) return { id: existing, created: false };
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const firstName = str(lead.firstName);
  const lastName = str(lead.lastName);
  const company = str(lead.company);
  const person = [firstName, lastName].filter(Boolean).join(" ");
  const website = str(lead.website);
  const data = {
    email,
    name: company ?? (person || email),
    firstName,
    lastName,
    phone: str(lead.phone),
    url: website ? (/^https?:\/\//i.test(website) ? website : `https://${website}`) : null,
    description: `Über Instantly angelegt (Kampagne „${campaignName}“)`,
  };
  let c: { id: string };
  try {
    c = await prisma.salesContact.create({ data, select: { id: true } });
  } catch (err) {
    // Gleichzeitig angelegt (Webhook und Abgleich) oder gleiche Adresse in anderer Schreibweise
    if ((err as { code?: string }).code !== "P2002") throw err;
    const again = await findContactIdByEmail(email);
    if (!again) throw err;
    return { id: again, created: false };
  }
  await prisma.salesActivity.create({ data: { contactId: c.id, type: "IMPORT", note: `Aus Instantly übernommen (Kampagne „${campaignName}“)` } });
  // Adresse, Öffnungszeiten, Google-Bewertung … im Hintergrund ergänzen
  await import("@/lib/vertrieb/address-enrich").then((m) => m.scheduleAddressEnrichment(c.id)).catch(() => {});
  return { id: c.id, created: true };
}

async function upsertCampaign(name: string, instantlyId?: string) {
  if (instantlyId) {
    const byId = await prisma.salesCampaign.findUnique({ where: { instantlyId } });
    if (byId) return byId.name === name ? byId : prisma.salesCampaign.update({ where: { id: byId.id }, data: { name } });
  }
  return prisma.salesCampaign.upsert({
    where: { name },
    create: { name, instantlyId, ignored: IGNORE_CAMPAIGN.test(name) },
    update: instantlyId ? { instantlyId } : {},
  });
}

/** Kampagnen mit anderem Thema: kommen nicht ins CRM (umschaltbar unter Vertrieb → Import). */
const IGNORE_CAMPAIGN = /pflege|bad[\s-]?umbau|kinderwunsch/i;
/** Ältere Instantly-Aktivität stammt aus früheren Pay-per-Lead-Kampagnen → keinen neuen Kontakt anlegen. */
const CREATE_MAX_AGE_MS = 28 * 86400000;
const recent = (d: string | Date | null | undefined) => !!d && Date.now() - new Date(d).getTime() <= CREATE_MAX_AGE_MS;
/** Instantly-Interessenstatus „Interessiert“/„Termin gebucht“ (1, 2): solche Leads immer anlegen, egal wie alt. */
const positiveStatus = (n: number | null | undefined) => n === 1 || n === 2;

async function contactMap(emails: string[]) {
  // Haupt- und weitere E-Mail-Adressen der Kontakte
  return contactIdsByEmails(emails);
}

export type SyncStats = { campaigns: number; leads: number; matched: number; unmatched: number; created: number; sent: number; replies: number; newReplies: number };

/** Holt alle Kampagnen + Leads aus Instantly (API v2) und gleicht per E-Mail ab. */
export async function syncInstantly(): Promise<SyncStats> {
  const stats: SyncStats = { campaigns: 0, leads: 0, matched: 0, unmatched: 0, created: 0, sent: 0, replies: 0, newReplies: 0 };
  const campaigns: ApiCampaign[] = [];
  let cursor: string | undefined;
  do {
    const q = new URLSearchParams({ limit: "100" });
    if (cursor) q.set("starting_after", cursor);
    const page = await api<{ items: ApiCampaign[]; next_starting_after?: string }>(`/campaigns?${q}`);
    campaigns.push(...page.items);
    cursor = page.items.length ? page.next_starting_after : undefined;
  } while (cursor);

  for (const c of campaigns) {
    stats.campaigns++;
    const campaign = await upsertCampaign(c.name, c.id);
    if (campaign.ignored) continue;
    let after: string | undefined;
    do {
      const page = await api<{ items: ApiLead[]; next_starting_after?: string }>("/leads/list", {
        method: "POST",
        body: JSON.stringify({ campaign: c.id, limit: 100, ...(after ? { starting_after: after } : {}) }),
      });
      after = page.items.length ? page.next_starting_after : undefined;
      const leads = page.items.filter((l) => l.email);
      stats.leads += leads.length;
      const ids = await contactMap(leads.map((l) => l.email!.toLowerCase()));
      for (const l of leads) {
        let contactId = ids.get(l.email!.toLowerCase());
        if (!contactId) {
          // Nicht im CRM (z. B. Liste direkt in Instantly): anlegen, sobald angeschrieben oder geantwortet
          // Ältere Leads nur, wenn Instantly sie als interessiert markiert (positive Zusage geht nie verloren)
          if (!recent(l.timestamp_last_contact) && !recent(l.timestamp_last_reply) && !positiveStatus(l.lt_interest_status)) {
            stats.unmatched++;
            continue;
          }
          const made = await ensureInstantlyContact(l.email!, { firstName: l.first_name, lastName: l.last_name, company: l.company_name, website: l.website, phone: l.phone }, c.name);
          contactId = made.id;
          if (made.created) stats.created++;
        }
        stats.matched++;
        const sentAt = l.timestamp_last_contact ? new Date(l.timestamp_last_contact) : null;
        if (sentAt) stats.sent++;
        if (l.email_reply_count > 0) stats.replies++;
        await saveLead(contactId, campaign.id, {
          status: sentAt || l.status !== 1 ? CAMPAIGN_STATUS[l.status] ?? String(l.status) : "Noch nicht kontaktiert",
          sentAt,
          openCount: l.email_open_count ?? 0,
          replyCount: l.email_reply_count ?? 0,
          clickCount: l.email_click_count ?? 0,
          lastOpenAt: l.timestamp_last_open ? new Date(l.timestamp_last_open) : null,
          lastReplyAt: l.timestamp_last_reply ? new Date(l.timestamp_last_reply) : null,
          bounced: l.status === -1,
          unsubscribed: l.status === -2,
          interest: l.lt_interest_status != null ? INTEREST[l.lt_interest_status] ?? null : null,
        }, campaign.name, false);
      }
    } while (after);
  }
  // Neu angelegte Kontakte oder Antworten ohne Text: alle Antworten holen (auch ältere als die zuletzt gespeicherte)
  const missingText = await prisma.salesCampaignLead.count({
    where: { replyCount: { gt: 0 }, campaign: { ignored: false }, contact: { emails: { none: { direction: "IN" } } } },
  });
  stats.newReplies = await syncReplies(stats.created > 0 || missingText > 0);
  // Interessenten-Aufgaben erst jetzt, wenn die Antworttexte da sind (Absage im Text hat Vorrang)
  await ensureInterestTasks();
  await fixDeclinedReplies().catch(() => 0);
  return stats;
}

type ApiEmail = {
  id: string;
  timestamp_email: string;
  timestamp_created: string;
  subject: string;
  from_address_email: string | null;
  body: { text?: string; html?: string } | null;
  content_preview: string | null;
  lead: string | null;
  campaign_id: string | null;
  thread_id: string | null;
  ue_type: number | null;
  is_auto_reply: number | null;
  i_status?: number | null;
};

/** Holt empfangene E-Mails (Antworten) aus der Instantly-Unibox und speichert sie am Kontakt. */
export async function syncReplies(full = false): Promise<number> {
  const last = full ? null : await prisma.salesEmail.findFirst({ where: { direction: "IN", instantlyId: { not: null } }, orderBy: { sentAt: "desc" } });
  const since = last ? new Date(last.sentAt.getTime() - 3 * 86400000) : null;
  const allCampaigns = await prisma.salesCampaign.findMany({ where: { instantlyId: { not: null } } });
  const campaignNames = new Map(allCampaigns.map((c) => [c.instantlyId!, c.name]));
  const ignoredIds = new Set(allCampaigns.filter((c) => c.ignored).map((c) => c.instantlyId!));
  let created = 0;
  let cursor: string | undefined;
  do {
    const q = new URLSearchParams({ email_type: "received", limit: "100", sort_order: "asc" });
    if (since) q.set("min_timestamp_created", since.toISOString());
    if (cursor) q.set("starting_after", cursor);
    const page = await api<{ items: ApiEmail[]; next_starting_after?: string }>(`/emails?${q}`);
    cursor = page.items.length ? page.next_starting_after : undefined;
    const ids = await contactMap(page.items.map((e) => (e.lead ?? e.from_address_email ?? "").toLowerCase()).filter(Boolean));
    for (const e of page.items) {
      if (e.ue_type != null && e.ue_type !== 2) continue;
      if (e.campaign_id && ignoredIds.has(e.campaign_id)) continue;
      const leadEmail = (e.lead ?? e.from_address_email ?? "").toLowerCase();
      let contactId = ids.get(leadEmail);
      if (!contactId) {
        // Antwort aus einer Kampagne, deren Liste nicht im CRM ist: Kontakt anlegen (nicht für Abwesenheitsnotizen)
        if (!e.campaign_id || e.is_auto_reply === 1 || !leadEmail || (!recent(e.timestamp_email || e.timestamp_created) && !positiveStatus(e.i_status))) continue;
        contactId = (await ensureInstantlyContact(leadEmail, {}, campaignNames.get(e.campaign_id) ?? "Instantly")).id;
        ids.set(leadEmail, contactId);
      }
      const isNew = await recordReply(contactId, {
        instantlyId: e.id,
        subject: e.subject,
        text: e.body?.text ?? e.content_preview ?? null,
        html: e.body?.html ?? null,
        fromEmail: e.from_address_email,
        threadId: e.thread_id,
        isAutoReply: e.is_auto_reply === 1,
        sentAt: new Date(e.timestamp_email || e.timestamp_created),
        campaign: e.campaign_id ? campaignNames.get(e.campaign_id) ?? null : null,
        interest: e.i_status ?? null,
      });
      if (isNew) created++;
    }
  } while (cursor);
  return created;
}

type Reply = {
  instantlyId?: string | null;
  subject?: string | null;
  text?: string | null;
  html?: string | null;
  fromEmail?: string | null;
  threadId?: string | null;
  isAutoReply: boolean;
  sentAt: Date;
  campaign?: string | null;
  interest?: number | null; // Instantly-Interessenstatus, falls bekannt
};

/**
 * Speichert eine Antwort am Kontakt. Doppelte (gleiche Instantly-ID oder
 * gleicher Betreff innerhalb von 15 Min., z.B. Webhook + Abgleich) werden
 * erkannt. Echte Antworten erzeugen Verlaufseintrag + Aufgabe.
 * Gibt true zurück, wenn die Antwort neu war.
 */
export async function recordReply(contactId: string, r: Reply): Promise<boolean> {
  if (r.instantlyId && (await prisma.salesEmail.findUnique({ where: { instantlyId: r.instantlyId } }))) return false;
  const dup = await prisma.salesEmail.findFirst({
    where: {
      contactId,
      direction: "IN",
      subject: r.subject ?? null,
      sentAt: { gte: new Date(r.sentAt.getTime() - 15 * 60000), lte: new Date(r.sentAt.getTime() + 15 * 60000) },
    },
  });
  if (dup) {
    await prisma.salesEmail.update({
      where: { id: dup.id },
      data: { instantlyId: dup.instantlyId ?? r.instantlyId ?? null, text: dup.text ?? r.text, html: dup.html ?? r.html },
    });
    return false;
  }
  // Eingangsbestätigungen/Abwesenheitsnotizen auch erkennen, wenn Instantly sie nicht markiert
  const instantlyPositive = sentimentFromInstantly(r.interest) === "POSITIV";
  r.isAutoReply = r.isAutoReply || (!instantlyPositive && isAutoReplyText(r.subject, stripQuoted(r.text ?? "")));
  // Klare Absage im Text hat Vorrang vor Instantlys Einstufung (deren KI markiert Absagen teils als „interessiert“).
  const textSentiment = classifyReply(stripQuoted(r.text ?? ""), r.subject?.replace(/^(re|aw|antw|fwd?|wg):\s*/i, ""));
  const sentiment: Sentiment = r.isAutoReply ? "NEUTRAL" : textSentiment === "NEGATIV" ? "NEGATIV" : (sentimentFromInstantly(r.interest) ?? textSentiment);
  await prisma.salesEmail.create({
    data: {
      sentiment,
      contactId,
      instantlyId: r.instantlyId ?? null,
      campaign: r.campaign ?? null,
      direction: "IN",
      subject: r.subject ?? null,
      text: r.text ?? null,
      html: r.html ?? null,
      fromEmail: r.fromEmail ?? null,
      threadId: r.threadId ?? null,
      isAutoReply: r.isAutoReply,
      sentAt: r.sentAt,
    },
  });

  const snippet = stripQuoted(r.text ?? "").slice(0, 600) || r.subject || "";
  const label = r.isAutoReply
    ? "Automatische Antwort"
    : `Antwort erhalten (${sentiment === "POSITIV" ? "positiv" : sentiment === "NEGATIV" ? "negativ" : "neutral"})`;
  // Platzhalter aus einem früheren Abgleich (nur Zähler, ohne Text) ergänzen statt doppelt anlegen
  const placeholder = await prisma.salesActivity.findFirst({
    where: {
      contactId,
      type: "COLD_MAIL",
      outcome: "Antwort erhalten",
      note: { startsWith: "Kampagne:" },
      occurredAt: { gte: new Date(r.sentAt.getTime() - 3 * 86400000), lte: new Date(r.sentAt.getTime() + 3 * 86400000) },
    },
  });
  if (placeholder) {
    await prisma.salesActivity.update({ where: { id: placeholder.id }, data: { outcome: label, note: snippet, occurredAt: r.sentAt } });
  } else {
    await prisma.salesActivity.create({
      data: { contactId, type: "COLD_MAIL", outcome: label, note: r.subject ? `${r.subject}\n\n${snippet}` : snippet, occurredAt: r.sentAt },
    });
  }
  // Aufgabe nur bei positiver Antwort; Absage räumt offene Antwort-Aufgaben weg
  if (sentiment === "POSITIV") await ensureReplyTask(contactId, snippet.slice(0, 300));
  if (sentiment === "NEGATIV") await onDecline(contactId);
  return true;
}

/** Absage per Mail: offene Antwort-Aufgaben entfernen, frühe Kontakte auf „Verloren – kein Interesse“. */
export async function onDecline(contactId: string, lossReason: "KEIN_INTERESSE" | "SONSTIGES" = "KEIN_INTERESSE", source = "Absage per Mail") {
  await prisma.salesTask.deleteMany({ where: { contactId, doneAt: null, title: { in: REPLY_TASKS } } });
  const c = await prisma.salesContact.findUnique({ where: { id: contactId }, select: { stage: true } });
  if (c && ["NEU", "NICHT_ERREICHT", "WIEDERVORLAGE", "SPAETER"].includes(c.stage)) {
    await prisma.salesContact.update({ where: { id: contactId }, data: { stage: "VERLOREN", lossReason } });
    await prisma.salesActivity.create({ data: { contactId, type: "NOTIZ", outcome: source, note: "Automatisch auf „Verloren“ gesetzt, offene Antwort-Aufgabe entfernt.", occurredAt: new Date() } });
  }
}

const DECLINED = ["Kein Interesse", "Falsche Person", "Verloren"];

/** Instantly-Status „abgelehnt“: letzte Antwort als negativ einstufen und wie eine Absage behandeln. */
export async function markDeclined(contactId: string, why: string) {
  const last = await prisma.salesEmail.findFirst({ where: { contactId, direction: "IN", isAutoReply: false }, orderBy: { sentAt: "desc" }, select: { id: true } });
  if (last) await prisma.salesEmail.update({ where: { id: last.id }, data: { sentiment: "NEGATIV" } });
  await onDecline(contactId, why === "Falsche Person" ? "SONSTIGES" : "KEIN_INTERESSE", `Instantly: ${why}`);
}

/** Letzte echte Antwort war eine Absage? Dann keine Aufgabe aus Instantly-Status. */
async function lastReplyDeclined(contactId: string): Promise<boolean> {
  const last = await prisma.salesEmail.findFirst({
    where: { contactId, direction: "IN", isAutoReply: false },
    orderBy: { sentAt: "desc" },
    select: { sentiment: true, text: true, subject: true },
  });
  if (!last) return false;
  return last.sentiment === "NEGATIV" || classifyReply(stripQuoted(last.text ?? ""), last.subject) === "NEGATIV";
}

/**
 * Offene Antwort-Aufgaben prüfen: Ist die letzte Antwort laut Text eine Absage
 * (z. B. von Instantly fälschlich als „interessiert“ markiert), Aufgabe weg.
 */
export async function fixDeclinedReplies(): Promise<number> {
  const tasks = await prisma.salesTask.findMany({ where: { doneAt: null, title: { in: REPLY_TASKS } }, select: { contactId: true } });
  let fixed = 0;
  for (const contactId of [...new Set(tasks.map((t) => t.contactId).filter((x): x is string => !!x))]) {
    const declinedInInstantly = await prisma.salesCampaignLead.findFirst({ where: { contactId, interest: { in: DECLINED } }, select: { interest: true } });
    if (declinedInInstantly) {
      await markDeclined(contactId, declinedInInstantly.interest!);
      fixed++;
      continue;
    }
    const last = await prisma.salesEmail.findFirst({
      where: { contactId, direction: "IN", isAutoReply: false },
      orderBy: { sentAt: "desc" },
      select: { id: true, text: true, subject: true },
    });
    if (!last || classifyReply(stripQuoted(last.text ?? ""), last.subject) !== "NEGATIV") continue;
    await prisma.salesEmail.update({ where: { id: last.id }, data: { sentiment: "NEGATIV" } });
    await onDecline(contactId);
    fixed++;
  }
  return fixed;
}

const REPLY_TASKS = ["Auf Cold-Mail-Antwort reagieren", "Interessent aus Cold Mail anrufen"];
const POSITIVE_INTEREST = ["Interessiert", "Termin gebucht"];

async function hasReply(contactId: string): Promise<boolean> {
  return !!(await prisma.salesEmail.findFirst({ where: { contactId, direction: "IN", isAutoReply: false }, select: { id: true } }));
}

/**
 * Von Instantly als interessiert markierte Leads: Aufgabe anlegen, sobald der
 * Antworttext da ist und keine Absage ist. Nur einmal je Kontakt (auch eine
 * erledigte Antwort-Aufgabe zählt), nie für verlorene Kontakte.
 */
export async function ensureInterestTasks(): Promise<number> {
  const leads = await prisma.salesCampaignLead.findMany({
    where: {
      interest: { in: POSITIVE_INTEREST },
      campaign: { ignored: false },
      contact: { stage: { notIn: ["VERLOREN", "UNGUELTIG", "GEWONNEN"] }, tasks: { none: { title: { in: REPLY_TASKS } } }, emails: { some: { direction: "IN", isAutoReply: false } } },
    },
    select: { contactId: true, interest: true, campaign: { select: { name: true } } },
  });
  let n = 0;
  for (const l of leads) {
    if (await lastReplyDeclined(l.contactId)) continue;
    await ensureReplyTask(l.contactId, `Instantly: ${l.interest} (Kampagne „${l.campaign.name}“)`, "Interessent aus Cold Mail anrufen");
    n++;
  }
  return n;
}

/** Legt die Antwort-Aufgabe an, außer es gibt schon eine offene. */
export async function ensureReplyTask(contactId: string, note?: string | null, title = REPLY_TASKS[0]) {
  const open = await prisma.salesTask.findFirst({ where: { contactId, doneAt: null, title: { in: REPLY_TASKS } } });
  if (open) return;
  await prisma.salesTask.create({ data: { contactId, title, type: "NACHFASSEN", dueAt: new Date(), note: note ?? null } });
}

/** Schneidet zitierten Verlauf ab ("Am … schrieb …", "On … wrote:", "-----Original", "Von:") */
export function stripQuoted(text: string): string {
  const m = text.search(/^\s*(>|Am .{3,80}schrieb|On .{3,80}wrote|-{3,}\s*Original|Von:\s|From:\s|Gesendet von meinem)/im);
  return (m > 0 ? text.slice(0, m) : text).trim();
}

type LeadData = {
  status: string | null;
  sentAt: Date | null;
  openCount: number;
  replyCount: number;
  clickCount: number;
  lastOpenAt: Date | null;
  lastReplyAt: Date | null;
  bounced: boolean;
  unsubscribed: boolean;
  interest: string | null;
};

/** Speichert den Kampagnen-Stand und legt bei neuer Antwort eine Aufgabe an. */
async function saveLead(contactId: string, campaignId: string, d: LeadData, campaignName: string, replyPlaceholder = true) {
  const prev = await prisma.salesCampaignLead.findUnique({ where: { contactId_campaignId: { contactId, campaignId } } });
  await prisma.salesCampaignLead.upsert({
    where: { contactId_campaignId: { contactId, campaignId } },
    create: { contactId, campaignId, ...d },
    update: d,
  });
  if (d.sentAt && !prev?.sentAt) {
    await prisma.salesActivity.create({
      data: { contactId, type: "COLD_MAIL", outcome: "Gesendet", note: `Kampagne: ${campaignName}`, occurredAt: d.sentAt },
    });
  }
  // Instantly hat den Lead als interessiert markiert → Aufgabe
  // Instantly hat den Lead als abgelehnt markiert → Antwort-Aufgabe weg, Kontakt verloren
  if (d.interest && d.interest !== prev?.interest && DECLINED.includes(d.interest)) {
    await markDeclined(contactId, d.interest);
  }
  // Nur wenn die Antwort schon gespeichert ist und keine Absage ist – sonst nach dem Abholen der Antworten (ensureInterestTasks)
  if (d.interest && d.interest !== prev?.interest && POSITIVE_INTEREST.includes(d.interest) && (await hasReply(contactId)) && !(await lastReplyDeclined(contactId))) {
    await ensureReplyTask(contactId, `Instantly: ${d.interest} (Kampagne „${campaignName}“)`, "Interessent aus Cold Mail anrufen");
  }
  if (replyPlaceholder && d.replyCount > 0 && (prev?.replyCount ?? 0) === 0) {
    await onReply(contactId, campaignName, d.lastReplyAt ?? new Date());
  }
}

async function onReply(contactId: string, campaignName: string, at: Date) {
  // Nur Zähler bekannt (CSV-Import), kein Text → keine Aufgabe, nur Verlaufseintrag
  await prisma.salesActivity.create({
    data: { contactId, type: "COLD_MAIL", outcome: "Antwort erhalten", note: `Kampagne: ${campaignName}`, occurredAt: at },
  });
}

/** CSV-Export einer Instantly-Kampagne importieren (Fallback ohne API). */
export async function importInstantlyCsv(text: string, campaignName: string) {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), { header: true, skipEmptyLines: true });
  const cols = parsed.meta.fields ?? [];
  const find = (...res: RegExp[]) => cols.find((c) => res.some((r) => r.test(c)));
  const emailCol = find(/^e-?mail$/i, /^email/i, /e-?mail/i);
  if (!emailCol) throw new Error("Keine E-Mail-Spalte gefunden");
  const statusCol = find(/^status$/i, /lead.?status/i, /status/i);
  const openCol = find(/open/i);
  const replyCol = find(/repl/i);
  const clickCol = find(/click/i);
  const contactCol = find(/last.?contact/i, /sent/i, /contacted/i);
  const campaignCol = find(/campaign/i);

  const rows = parsed.data;
  const ids = await contactMap(rows.map((r) => (r[emailCol] ?? "").trim().toLowerCase()).filter(Boolean));
  const stats = { rows: rows.length, matched: 0, unmatched: 0, sent: 0 };
  const campaigns = new Map<string, Awaited<ReturnType<typeof upsertCampaign>>>();
  const n = (v?: string) => (v ? parseInt(v, 10) || 0 : 0);
  const d = (v?: string) => {
    if (!v) return null;
    const x = new Date(v);
    return isNaN(x.getTime()) ? null : x;
  };

  for (const r of rows) {
    const contactId = ids.get((r[emailCol] ?? "").trim().toLowerCase());
    if (!contactId) {
      stats.unmatched++;
      continue;
    }
    stats.matched++;
    const name = (campaignCol && r[campaignCol]?.trim()) || campaignName || "Instantly Import";
    if (!campaigns.has(name)) campaigns.set(name, await upsertCampaign(name));
    const status = statusCol ? r[statusCol]?.trim() || null : null;
    const notSent = !!status && /not yet|noch nicht|^active$/i.test(status) && !(contactCol && r[contactCol]);
    const sentAt = notSent ? null : d(contactCol ? r[contactCol] : undefined) ?? new Date();
    if (sentAt) stats.sent++;
    await saveLead(contactId, campaigns.get(name)!.id, {
      status,
      sentAt,
      openCount: n(openCol && r[openCol]),
      replyCount: n(replyCol && r[replyCol]),
      clickCount: n(clickCol && r[clickCol]),
      lastOpenAt: null,
      lastReplyAt: null,
      bounced: !!status && /bounce/i.test(status),
      unsubscribed: !!status && /unsub|abgemeldet/i.test(status),
      interest: null,
    }, name);
  }
  return stats;
}

// Ereignisse, bei denen ein unbekannter Instantly-Kontakt im CRM angelegt wird
const CREATE_ON = new Set(["email_sent", "reply_received", "lead_interested", "lead_meeting_booked", "lead_not_interested", "lead_wrong_person"]);

/** Instantly-Webhook (email_sent, email_opened, reply_received, email_bounced, lead_unsubscribed …) */
export async function handleWebhook(p: Record<string, unknown>) {
  const email = String(p.lead_email ?? "").trim().toLowerCase();
  const type = String(p.event_type ?? "");
  if (!email || !type) return { ignored: "missing lead_email/event_type" };
  const name = String(p.campaign_name ?? "Instantly");
  const campaign = await upsertCampaign(name, p.campaign_id ? String(p.campaign_id) : undefined);
  if (campaign.ignored) return { ignored: "campaign ignored" };
  let contactId = await findContactIdByEmail(email);
  if (!contactId) {
    // Unbekannte Adresse (Liste direkt in Instantly): bei echter Interaktion anlegen
    if (!CREATE_ON.has(type)) return { ignored: "unknown contact" };
    contactId = (
      await ensureInstantlyContact(
        email,
        {
          firstName: p.firstName ?? p.first_name,
          lastName: p.lastName ?? p.last_name,
          company: p.companyName ?? p.company_name,
          website: p.website,
          phone: p.phone,
        },
        name,
      )
    ).id;
  }
  const contact = { id: contactId };
  const at = p.timestamp ? new Date(String(p.timestamp)) : new Date();
  const key = { contactId_campaignId: { contactId: contact.id, campaignId: campaign.id } };
  const prev = await prisma.salesCampaignLead.findUnique({ where: key });
  const base = { contactId: contact.id, campaignId: campaign.id };

  switch (type) {
    case "email_sent":
      await prisma.salesCampaignLead.upsert({ where: key, create: { ...base, sentAt: at, status: "Aktiv" }, update: { sentAt: at } });
      if (!prev?.sentAt) {
        await prisma.salesActivity.create({ data: { contactId: contact.id, type: "COLD_MAIL", outcome: "Gesendet", note: `Kampagne: ${name}${p.step ? ` (Schritt ${p.step})` : ""}`, occurredAt: at } });
      }
      break;
    case "email_opened":
      await prisma.salesCampaignLead.upsert({ where: key, create: { ...base, openCount: 1, lastOpenAt: at }, update: { openCount: { increment: 1 }, lastOpenAt: at } });
      break;
    case "link_clicked":
      await prisma.salesCampaignLead.upsert({ where: key, create: { ...base, clickCount: 1 }, update: { clickCount: { increment: 1 } } });
      break;
    case "reply_received":
    case "auto_reply_received": {
      const auto = type === "auto_reply_received";
      const str = (v: unknown) => (v == null || v === "" ? null : String(v));
      const isNew = await recordReply(contact.id, {
        subject: str(p.reply_subject),
        text: str(p.reply_text) ?? str(p.reply_text_snippet),
        html: str(p.reply_html),
        fromEmail: email,
        isAutoReply: auto,
        sentAt: at,
        campaign: name,
      });
      if (isNew && !auto) {
        await prisma.salesCampaignLead.upsert({ where: key, create: { ...base, replyCount: 1, lastReplyAt: at }, update: { replyCount: { increment: 1 }, lastReplyAt: at } });
        // Instantly hatte schon „interessiert“ gemeldet, bevor der Text da war: jetzt Aufgabe, außer der Text ist eine Absage
        if (prev?.interest && POSITIVE_INTEREST.includes(prev.interest) && !(await lastReplyDeclined(contact.id))) {
          await ensureReplyTask(contact.id, `Instantly: ${prev.interest} (Kampagne „${name}“)`, "Interessent aus Cold Mail anrufen");
        }
      }
      break;
    }
    case "email_bounced":
      await prisma.salesCampaignLead.upsert({ where: key, create: { ...base, bounced: true, status: "Bounced" }, update: { bounced: true, status: "Bounced" } });
      break;
    case "lead_unsubscribed":
      await prisma.salesCampaignLead.upsert({ where: key, create: { ...base, unsubscribed: true, status: "Abgemeldet" }, update: { unsubscribed: true, status: "Abgemeldet" } });
      break;
    case "lead_interested":
    case "lead_meeting_booked":
      await prisma.salesCampaignLead.upsert({ where: key, create: { ...base, interest: type === "lead_interested" ? "Interessiert" : "Termin gebucht" }, update: { interest: type === "lead_interested" ? "Interessiert" : "Termin gebucht" } });
      if (type === "lead_interested" && (await lastReplyDeclined(contact.id))) break; // Instantly irrt: Text ist eine Absage
      // Antwort noch nicht da: Aufgabe erst, wenn der Text kommt und keine Absage ist (recordReply)
      if (type === "lead_interested" && !(await hasReply(contact.id))) break;
      await prisma.salesEmail.updateMany({ where: { contactId: contact.id, direction: "IN", isAutoReply: false, sentiment: "NEUTRAL" }, data: { sentiment: "POSITIV" } });
      if (type === "lead_meeting_booked") {
        await prisma.salesTask.create({ data: { contactId: contact.id, title: "Termin aus Cold Mail vorbereiten", type: "TERMIN", dueAt: new Date() } });
      } else {
        await ensureReplyTask(contact.id, `Instantly: als interessiert markiert (Kampagne „${name}“)`, "Interessent aus Cold Mail anrufen");
      }
      break;
    case "lead_not_interested":
    case "lead_wrong_person":
    case "lead_closed":
    case "lead_lost": {
      const why = type === "lead_wrong_person" ? "Falsche Person" : type === "lead_not_interested" ? "Kein Interesse" : "Verloren";
      await prisma.salesCampaignLead.upsert({ where: key, create: { ...base, interest: why }, update: { interest: why } });
      await markDeclined(contact.id, why);
      break;
    }
    default:
      return { ignored: type };
  }
  return { ok: true };
}

/**
 * Bereits gespeicherte Antworten nachträglich prüfen: als Auto-Reply erkannte
 * werden umgestellt und die dazu fälschlich angelegte offene Aufgabe entfernt.
 */
export async function cleanupAutoReplies() {
  const emails = await prisma.salesEmail.findMany({ where: { direction: "IN", isAutoReply: false } });
  let fixed = 0;
  for (const e of emails) {
    if (!isAutoReplyText(e.subject, stripQuoted(e.text ?? ""))) continue;
    await prisma.salesEmail.update({ where: { id: e.id }, data: { isAutoReply: true, sentiment: "NEUTRAL" } });
    await removeReplyTaskIfNoPositive(e.contactId);
    await prisma.salesActivity.updateMany({
      where: { contactId: e.contactId, type: "COLD_MAIL", outcome: { startsWith: "Antwort erhalten" }, occurredAt: e.sentAt },
      data: { outcome: "Automatische Antwort" },
    });
    fixed++;
  }
  return fixed;
}

/** Entfernt die offene Antwort-Aufgabe, wenn der Kontakt keine positive Antwort mehr hat. */
export async function removeReplyTaskIfNoPositive(contactId: string) {
  const positive = await prisma.salesEmail.count({ where: { contactId, direction: "IN", sentiment: "POSITIV", isAutoReply: false } });
  if (positive) return;
  await prisma.salesTask.deleteMany({ where: { contactId, doneAt: null, title: "Auf Cold-Mail-Antwort reagieren" } });
}
