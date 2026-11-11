// LinkedIn-Outreach aus Waalaxy: Webhook ("CRM Sync"-Schritt / bei Antwort) und CSV-Export.
// Waalaxy dokumentiert die Feldnamen nicht verbindlich – daher werden Schlüssel
// tolerant erkannt (englisch/französisch/deutsch, verschachtelt oder flach).
import Papa from "papaparse";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export const LI_STATUSES = [
  { id: "ANFRAGE_GESENDET", label: "Anfrage gesendet", color: "bg-slate-100 text-slate-700" },
  { id: "VERNETZT", label: "Vernetzt", color: "bg-sky-100 text-sky-800" },
  { id: "NACHRICHT_GESENDET", label: "Nachricht gesendet", color: "bg-indigo-100 text-indigo-800" },
  { id: "GEANTWORTET", label: "Geantwortet", color: "bg-emerald-100 text-emerald-800" },
] as const;
export type LiStatus = (typeof LI_STATUSES)[number]["id"];
export const LI_LABEL = Object.fromEntries(LI_STATUSES.map((s) => [s.id, s.label])) as Record<string, string>;
export const LI_COLOR = Object.fromEntries(LI_STATUSES.map((s) => [s.id, s.color])) as Record<string, string>;
const RANK: Record<string, number> = { ANFRAGE_GESENDET: 1, VERNETZT: 2, NACHRICHT_GESENDET: 3, GEANTWORTET: 4 };

// ─── Feld-Erkennung ─────────────────────────────────────────────────────
export const norm = (k: string) => k.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

/** Verschachteltes Objekt flach machen: { prospect: { firstName } } → { firstname: … } (letztes Segment zählt) */
export function flatten(obj: unknown, out: Record<string, unknown> = {}, prefix = ""): Record<string, unknown> {
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, out, prefix + k + ".");
      else {
        out[norm(k)] ??= v;
        out[norm(prefix + k)] ??= v;
      }
    }
  }
  return out;
}

const KEYS = {
  url: ["linkedinurl", "linkedinprofileurl", "profileurl", "linkedinprofile", "urllinkedin", "linkedin", "publicprofileurl", "url"],
  firstName: ["firstname", "prenom", "vorname", "first"],
  lastName: ["lastname", "nom", "nachname", "last"],
  fullName: ["fullname", "name", "nomcomplet"],
  email: ["proemail", "professionalemail", "emailpro", "emailprofessionnel", "email", "linkedinemail", "mail"],
  company: ["companyname", "company", "entreprise", "societe", "firma", "currentcompany", "occupation", "headline", "jobtitle"],
  location: ["location", "localisation", "lieu", "ort"],
  connection: ["connectionstatus", "statutdeconnexion", "connexion", "isconnected", "connected", "connectionstate", "relation"],
  connectedAt: ["connectedat", "connectiondate", "firstconnectiondate", "datedeconnexion", "dateofconnection", "linkedinconnectiondate"],
  messageSent: ["messagesent", "ismessagesent", "linkedinmessagesent", "hasmessagesent", "messageenvoye", "messagesentbywaalaxy"],
  messageAt: ["firstmessagedate", "messagesentat", "datepremiermessage", "firstmessagesentat"],
  replied: ["messagereplied", "replied", "hasreplied", "isreplied", "linkedinmessagereplied", "messagerepondu", "areplied", "answered", "repondu"],
  repliedAt: ["replydate", "repliedat", "datereponse"],
  list: ["listname", "list", "liste", "prospectlist", "campaign", "campaignname", "campagne"],
  tags: ["tags", "tag", "labels"],
};

function pick(f: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = f[k];
    if (v == null || v === "") continue;
    if (Array.isArray(v)) return v.map(String).join(", ");
    return String(v).trim();
  }
  return null;
}
const truthy = (v: string | null) => !!v && /^(true|yes|oui|ja|1|x|wahr)$/i.test(v.trim());
const date = (v: string | null) => {
  if (!v) return null;
  const m = v.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  const d = m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], 9)) : new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

export function normalizeLinkedInUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  const m = u.toLowerCase().match(/linkedin\.com\/(in|sales\/lead|sales\/people)\/([^/?#]+)/);
  if (!m || m[1] !== "in") return null;
  return decodeURIComponent(m[2]).replace(/\/$/, "");
}

export type Prospect = {
  url: string | null;
  slug: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  company: string | null;
  location: string | null;
  status: LiStatus | null;
  connectedAt: Date | null;
  messageAt: Date | null;
  repliedAt: Date | null;
  list: string | null;
  tags: string | null;
};

export function parseProspect(raw: unknown): Prospect {
  const f = flatten(raw);
  let url = pick(f, KEYS.url);
  if (url && !/linkedin\.com/i.test(url)) url = null;
  let firstName = pick(f, KEYS.firstName);
  let lastName = pick(f, KEYS.lastName);
  if (!firstName && !lastName) {
    const full = pick(f, KEYS.fullName);
    if (full) [firstName, lastName] = [full.split(" ")[0], full.split(" ").slice(1).join(" ") || null];
  }
  const conn = pick(f, KEYS.connection);
  const connectedAt = date(pick(f, KEYS.connectedAt));
  const messageSent = truthy(pick(f, KEYS.messageSent));
  const messageAt = date(pick(f, KEYS.messageAt));
  const replied = truthy(pick(f, KEYS.replied));
  const repliedAt = date(pick(f, KEYS.repliedAt));

  let status: LiStatus | null = null;
  if (replied || repliedAt) status = "GEANTWORTET";
  else if (messageSent || messageAt) status = "NACHRICHT_GESENDET";
  else if (connectedAt || (conn && /^(connected|connecte|verbunden|vernetzt|true|yes|1|first|1st)/i.test(conn))) status = "VERNETZT";
  else if (conn && /(pending|waiting|attente|invit|sent|ausstehend|gesendet)/i.test(conn)) status = "ANFRAGE_GESENDET";

  const email = pick(f, KEYS.email);
  return {
    url,
    slug: normalizeLinkedInUrl(url),
    firstName,
    lastName,
    email: email && email.includes("@") ? email.toLowerCase() : null,
    company: pick(f, KEYS.company),
    location: pick(f, KEYS.location),
    status,
    connectedAt,
    messageAt,
    repliedAt,
    list: pick(f, KEYS.list),
    tags: pick(f, KEYS.tags),
  };
}

// ─── Zuordnung zu Kontakten ─────────────────────────────────────────────
const nameKey = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");

type Lite = { id: string; email: string; altEmails?: string[]; name: string; city: string | null; firstName: string | null; lastName: string | null; leaderNames: string | null; linkedinUrl: string | null };

export class Matcher {
  private bySlug = new Map<string, string>();
  private byEmail = new Map<string, string>();
  private byName = new Map<string, Lite[]>();
  private constructor(contacts: Lite[]) {
    for (const c of contacts) {
      const slug = normalizeLinkedInUrl(c.linkedinUrl);
      if (slug) this.bySlug.set(slug, c.id);
      this.byEmail.set(c.email.toLowerCase(), c.id);
      for (const a of c.altEmails ?? []) if (!this.byEmail.has(a)) this.byEmail.set(a, c.id);
      const names = new Set<string>();
      if (c.firstName || c.lastName) names.add(nameKey(`${c.firstName ?? ""}${c.lastName ?? ""}`));
      for (const n of (c.leaderNames ?? "").split(",")) if (n.trim()) names.add(nameKey(n));
      // Name aus "Allianz Versicherung Vorname Nachname GENERALVERTRETUNG"
      const short = c.name.replace(/^Allianz Versicherung\s+/i, "").replace(/\s+(GENERAL|HAUPT)VERTRETUNG$/i, "");
      if (/^[A-ZÄÖÜ][\p{L}-]+(\s[A-ZÄÖÜ][\p{L}-]+){1,2}$/u.test(short)) names.add(nameKey(short));
      for (const n of names) if (n) this.byName.set(n, [...(this.byName.get(n) ?? []), c]);
    }
  }
  static async load() {
    const contacts = await prisma.salesContact.findMany({
      select: { id: true, email: true, altEmails: true, name: true, city: true, firstName: true, lastName: true, leaderNames: true, linkedinUrl: true },
    });
    return new Matcher(contacts);
  }
  /** Gibt die Kontakt-ID zurück und wie zugeordnet wurde */
  match(p: Prospect): { id: string; via: string } | null {
    if (p.slug && this.bySlug.has(p.slug)) return { id: this.bySlug.get(p.slug)!, via: "LinkedIn-URL" };
    if (p.email && this.byEmail.has(p.email)) return { id: this.byEmail.get(p.email)!, via: "E-Mail" };
    const key = nameKey(`${p.firstName ?? ""}${p.lastName ?? ""}`);
    if (key.length < 5) return null;
    const cands = this.byName.get(key) ?? [];
    if (cands.length === 1) return { id: cands[0].id, via: "Name" };
    if (cands.length > 1 && p.location) {
      const loc = nameKey(p.location);
      const byCity = cands.filter((c) => c.city && loc.includes(nameKey(c.city)));
      if (byCity.length === 1) return { id: byCity[0].id, via: "Name + Ort" };
    }
    return null;
  }
}

// ─── Speichern ──────────────────────────────────────────────────────────
const STATUS_ACTIVITY: Record<LiStatus, string> = {
  ANFRAGE_GESENDET: "LinkedIn: Vernetzungsanfrage gesendet",
  VERNETZT: "LinkedIn: Vernetzt",
  NACHRICHT_GESENDET: "LinkedIn: Nachricht gesendet",
  GEANTWORTET: "LinkedIn: Antwort erhalten",
};

/** Wendet einen Prospect auf den Kontakt an. Status geht nur vorwärts. Gibt true zurück, wenn sich etwas geändert hat. */
export async function applyProspect(contactId: string, p: Prospect): Promise<boolean> {
  const c = await prisma.salesContact.findUniqueOrThrow({
    where: { id: contactId },
    select: { linkedinStatus: true, linkedinUrl: true, firstName: true, lastName: true },
  });
  const prevRank = RANK[c.linkedinStatus ?? ""] ?? 0;
  const newRank = p.status ? RANK[p.status] : 0;
  const data: Prisma.SalesContactUpdateInput = {};
  if (p.url && !normalizeLinkedInUrl(c.linkedinUrl)) data.linkedinUrl = p.url;
  if (!c.firstName && p.firstName) data.firstName = p.firstName;
  if (!c.lastName && p.lastName) data.lastName = p.lastName;
  if (p.list) data.linkedinList = p.list;
  if (p.tags) data.linkedinTags = p.tags;
  if (p.connectedAt) data.linkedinConnectedAt = p.connectedAt;
  if (p.messageAt) data.linkedinMessageAt = p.messageAt;
  if (p.repliedAt) data.linkedinReplyAt = p.repliedAt;
  const advanced = newRank > prevRank;
  if (advanced) {
    data.linkedinStatus = p.status;
    const now = new Date();
    if (p.status === "ANFRAGE_GESENDET") data.linkedinRequestAt = now;
    if (p.status === "VERNETZT" && !p.connectedAt) data.linkedinConnectedAt = now;
    if (p.status === "NACHRICHT_GESENDET" && !p.messageAt) data.linkedinMessageAt = now;
    if (p.status === "GEANTWORTET" && !p.repliedAt) data.linkedinReplyAt = now;
  }
  if (Object.keys(data).length) await prisma.salesContact.update({ where: { id: contactId }, data });
  if (advanced && p.status) {
    const at = p.status === "GEANTWORTET" ? p.repliedAt : p.status === "NACHRICHT_GESENDET" ? p.messageAt : p.status === "VERNETZT" ? p.connectedAt : null;
    await prisma.salesActivity.create({
      data: {
        contactId,
        type: "LINKEDIN",
        outcome: STATUS_ACTIVITY[p.status],
        note: [p.list && `Waalaxy-Liste: ${p.list}`, p.tags && `Tags: ${p.tags}`].filter(Boolean).join(" · ") || null,
        occurredAt: at ?? new Date(),
      },
    });
    if (p.status === "GEANTWORTET") {
      const open = await prisma.salesTask.findFirst({ where: { contactId, doneAt: null, title: "Auf LinkedIn-Antwort reagieren" } });
      if (!open) {
        await prisma.salesTask.create({
          data: { contactId, title: "Auf LinkedIn-Antwort reagieren", type: "NACHFASSEN", dueAt: new Date(), note: "Antwort in LinkedIn bzw. der Waalaxy-Inbox lesen" },
        });
      }
    }
  }
  return Object.keys(data).length > 0;
}

/** Webhook-Payload (ein Prospect oder Liste) verarbeiten */
export async function handleWaalaxyWebhook(body: unknown) {
  const items = Array.isArray(body) ? body : body && typeof body === "object" && Array.isArray((body as { prospects?: unknown }).prospects) ? (body as { prospects: unknown[] }).prospects : [body];
  const matcher = await Matcher.load();
  const results = [];
  for (const raw of items) {
    const p = parseProspect(raw);
    const m = matcher.match(p);
    await prisma.salesLinkedInEvent.create({
      data: {
        contactId: m?.id ?? null,
        source: "webhook",
        name: [p.firstName, p.lastName].filter(Boolean).join(" ") || null,
        company: p.company,
        url: p.url,
        status: p.status,
        payload: (raw ?? {}) as Prisma.InputJsonValue,
      },
    });
    if (m) await applyProspect(m.id, p);
    results.push({ matched: !!m, via: m?.via ?? null, status: p.status });
  }
  return results;
}

/** CSV-Export einer Waalaxy-Prospect-Liste importieren */
export async function importWaalaxyCsv(text: string) {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), { header: true, skipEmptyLines: true });
  const matcher = await Matcher.load();
  const stats = { rows: parsed.data.length, matched: 0, unmatched: 0, updated: 0, byVia: {} as Record<string, number>, unmatchedNames: [] as string[] };
  for (const row of parsed.data) {
    const p = parseProspect(row);
    const m = matcher.match(p);
    if (!m) {
      stats.unmatched++;
      if (stats.unmatchedNames.length < 15) stats.unmatchedNames.push([p.firstName, p.lastName].filter(Boolean).join(" ") + (p.company ? ` (${p.company})` : ""));
      continue;
    }
    stats.matched++;
    stats.byVia[m.via] = (stats.byVia[m.via] ?? 0) + 1;
    if (await applyProspect(m.id, p)) stats.updated++;
  }
  return stats;
}
