// Vertriebskontakte: weitere E-Mail-Adressen und Zusammenführen von Dubletten
// (z. B. Calendly-Buchung mit anderer E-Mail als im Angebot).

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { STAGE_RANK } from "@/lib/vertrieb/crm";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: string | null | undefined): string | null {
  const e = String(raw ?? "").trim().toLowerCase();
  return EMAIL_RE.test(e) ? e : null;
}

/** Kontakt zu einer E-Mail – Haupt- oder weitere Adresse. */
export async function findContactIdByEmail(raw: string | null | undefined): Promise<string | null> {
  const email = normalizeEmail(raw);
  if (!email) return null;
  const c = await prisma.salesContact.findFirst({
    // Groß-/Kleinschreibung egal (ältere Importe haben gemischte Schreibweise)
    where: { OR: [{ email: { equals: email, mode: "insensitive" } }, { altEmails: { has: email } }] },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return c?.id ?? null;
}

/** E-Mail → Kontakt-ID für viele Adressen (Haupt- und weitere Adressen). */
export async function contactIdsByEmails(raw: string[]): Promise<Map<string, string>> {
  const emails = [...new Set(raw.map((e) => normalizeEmail(e)).filter((e): e is string => !!e))];
  const out = new Map<string, string>();
  if (!emails.length) return out;
  const rows = await prisma.salesContact.findMany({
    where: { OR: [{ email: { in: emails, mode: "insensitive" } }, { altEmails: { hasSome: emails } }] },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, altEmails: true },
  });
  // Hauptadresse hat Vorrang vor weiterer Adresse
  for (const r of rows) for (const a of r.altEmails) if (emails.includes(a) && !out.has(a)) out.set(a, r.id);
  for (const r of rows) {
    const e = r.email.trim().toLowerCase();
    if (emails.includes(e)) out.set(e, r.id);
  }
  return out;
}

export type EmailResult = { ok: true } | { ok: false; error: string };

export async function addContactEmail(contactId: string, raw: string): Promise<EmailResult> {
  const email = normalizeEmail(raw);
  if (!email) return { ok: false, error: "Bitte eine gültige E-Mail-Adresse eingeben." };
  const other = await findContactIdByEmail(email);
  if (other && other !== contactId) return { ok: false, error: "Diese E-Mail gehört schon zu einem anderen Kontakt. Bitte die beiden Kontakte zusammenführen." };
  const c = await prisma.salesContact.findUniqueOrThrow({ where: { id: contactId }, select: { email: true, altEmails: true } });
  if (c.email === email || c.altEmails.includes(email)) return { ok: true };
  await prisma.salesContact.update({ where: { id: contactId }, data: { altEmails: [...c.altEmails, email] } });
  return { ok: true };
}

export async function removeContactEmail(contactId: string, raw: string): Promise<void> {
  const email = normalizeEmail(raw);
  const c = await prisma.salesContact.findUniqueOrThrow({ where: { id: contactId }, select: { altEmails: true } });
  await prisma.salesContact.update({ where: { id: contactId }, data: { altEmails: c.altEmails.filter((e) => e !== email) } });
}

/** Weitere Adresse wird Hauptadresse (die bisherige Hauptadresse wird weitere Adresse). */
export async function makePrimaryEmail(contactId: string, raw: string): Promise<void> {
  const email = normalizeEmail(raw);
  const c = await prisma.salesContact.findUniqueOrThrow({ where: { id: contactId }, select: { email: true, altEmails: true } });
  if (!email || !c.altEmails.includes(email)) return;
  await prisma.salesContact.update({ where: { id: contactId }, data: { email, altEmails: [c.email, ...c.altEmails.filter((e) => e !== email)] } });
}

// Felder, die beim Zusammenführen aus dem zweiten Kontakt übernommen werden, wenn sie beim ersten leer sind.
const FILL_FIELDS = [
  "phone", "fax", "street", "zip", "city", "ratingValue", "ratingCount", "openingHours", "url", "salutation", "firstName", "lastName",
  "leaderNames", "agencyType", "teamSize", "potentialScore", "facebookUrl", "instagramUrl", "xingUrl", "linkedinUrl", "linkedinStatus",
  "linkedinRequestAt", "linkedinConnectedAt", "linkedinMessageAt", "linkedinReplyAt", "linkedinList", "linkedinTags", "lossReason",
  "competitor", "legacyStatus", "customerStage", "products", "monthlyValue", "contractStart", "customerSince", "customerSource",
  "customerSourceNote", "addressEnrichedAt",
] as const;

export type MergeResult = { ok: true; keepId: string; moved: Record<string, number> } | { ok: false; error: string };

/**
 * Führt `dropId` in `keepId` zusammen: Aktivitäten, Aufgaben, Mails, Termine,
 * Angebote, Kampagnen, LinkedIn- und Inbound-Einträge wandern mit; leere Felder
 * werden ergänzt, die E-Mail(s) des zweiten Kontakts werden weitere Adressen.
 * Danach wird `dropId` gelöscht. Alles in einer Transaktion.
 */
export async function mergeContacts(keepId: string, dropId: string, actorLabel = "Admin"): Promise<MergeResult> {
  if (keepId === dropId) return { ok: false, error: "Bitte einen anderen Kontakt wählen." };
  return prisma.$transaction(async (tx) => {
    const [keep, drop] = await Promise.all([
      tx.salesContact.findUnique({ where: { id: keepId } }),
      tx.salesContact.findUnique({ where: { id: dropId } }),
    ]);
    if (!keep || !drop) return { ok: false as const, error: "Kontakt nicht gefunden." };
    if (keep.customerId && drop.customerId && keep.customerId !== drop.customerId) {
      return { ok: false as const, error: "Beide Kontakte sind mit unterschiedlichen Kundenkonten verknüpft. Bitte zuerst eine Verknüpfung lösen." };
    }

    const where = { contactId: dropId };
    const moved: Record<string, number> = {};
    moved.aktivitaeten = (await tx.salesActivity.updateMany({ where, data: { contactId: keepId } })).count;
    moved.aufgaben = (await tx.salesTask.updateMany({ where, data: { contactId: keepId } })).count;
    moved.mails = (await tx.salesEmail.updateMany({ where, data: { contactId: keepId } })).count;
    moved.termine = (await tx.salesMeeting.updateMany({ where, data: { contactId: keepId } })).count;
    moved.linkedin = (await tx.salesLinkedInEvent.updateMany({ where, data: { contactId: keepId } })).count;
    moved.inbound = (await tx.salesInboundLead.updateMany({ where, data: { contactId: keepId } })).count;
    moved.angebote = (await tx.offer.updateMany({ where: { salesContactId: dropId }, data: { salesContactId: keepId } })).count;
    // Kampagnen: eindeutig je (Kontakt, Kampagne) – doppelte Zuordnung des zweiten Kontakts entfällt
    const keepCampaigns = new Set((await tx.salesCampaignLead.findMany({ where: { contactId: keepId }, select: { campaignId: true } })).map((c) => c.campaignId));
    if (keepCampaigns.size) await tx.salesCampaignLead.deleteMany({ where: { contactId: dropId, campaignId: { in: [...keepCampaigns] } } });
    moved.kampagnen = (await tx.salesCampaignLead.updateMany({ where, data: { contactId: keepId } })).count;

    const data: Prisma.SalesContactUncheckedUpdateInput = {};
    const k = keep as unknown as Record<string, unknown>;
    const dr = drop as unknown as Record<string, unknown>;
    for (const f of FILL_FIELDS) if ((k[f] == null || k[f] === "") && dr[f] != null && dr[f] !== "") (data as Record<string, unknown>)[f] = dr[f];
    if ((STAGE_RANK[drop.stage] ?? 0) > (STAGE_RANK[keep.stage] ?? 0)) data.stage = drop.stage;
    data.callAttempts = keep.callAttempts + drop.callAttempts;
    if (drop.lastContactAt && (!keep.lastContactAt || drop.lastContactAt > keep.lastContactAt)) data.lastContactAt = drop.lastContactAt;
    if (drop.description && drop.description !== keep.description) data.description = keep.description ? `${keep.description}\n\n${drop.description}` : drop.description;
    data.altEmails = [...new Set([...keep.altEmails, drop.email, ...drop.altEmails])].filter((e) => e !== keep.email);
    const customerId = !keep.customerId && drop.customerId ? drop.customerId : null;

    // Erst den zweiten Kontakt löschen (E-Mail und Kundenkonto sind eindeutig), dann übernehmen
    await tx.salesContact.delete({ where: { id: dropId } });
    if (customerId) data.customerId = customerId;
    await tx.salesContact.update({ where: { id: keepId }, data });
    await tx.salesActivity.create({
      data: {
        contactId: keepId,
        type: "NOTIZ",
        note: `Zusammengeführt mit „${drop.name}“ (${drop.email}) durch ${actorLabel}. Übernommen: ${Object.entries(moved).filter(([, n]) => n > 0).map(([n, c]) => `${c} ${n}`).join(", ") || "keine Einträge"}.`,
      },
    });
    return { ok: true as const, keepId, moved };
  });
}

/** Kandidaten für „Zusammenführen mit …“: Suche nach Name, Firma oder E-Mail. */
export async function searchMergeCandidates(excludeId: string, q: string) {
  const term = q.trim();
  if (term.length < 2) return [];
  return prisma.salesContact.findMany({
    where: {
      id: { not: excludeId },
      OR: [
        { name: { contains: term, mode: "insensitive" } },
        { email: { contains: term.toLowerCase() } },
        { firstName: { contains: term, mode: "insensitive" } },
        { lastName: { contains: term, mode: "insensitive" } },
        { altEmails: { has: term.toLowerCase() } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 10,
    select: { id: true, name: true, email: true, city: true, stage: true, createdAt: true },
  });
}

/** Wahrscheinliche Dubletten: gleicher Vor- und Nachname oder gleicher Name. */
export async function likelyDuplicates(contactId: string) {
  const c = await prisma.salesContact.findUnique({ where: { id: contactId }, select: { name: true, firstName: true, lastName: true } });
  if (!c) return [];
  const or: Prisma.SalesContactWhereInput[] = [];
  if (c.firstName && c.lastName) {
    or.push({ firstName: { equals: c.firstName, mode: "insensitive" }, lastName: { equals: c.lastName, mode: "insensitive" } });
    or.push({ name: { contains: `${c.firstName} ${c.lastName}`, mode: "insensitive" } });
  }
  or.push({ name: { equals: c.name, mode: "insensitive" } });
  // „Jens Schmidt“ ↔ „Jens Schmidt Allianz“
  if (c.name.trim().length >= 8) or.push({ name: { contains: c.name.trim(), mode: "insensitive" } });
  return prisma.salesContact.findMany({
    where: { id: { not: contactId }, OR: or },
    take: 5,
    select: { id: true, name: true, email: true, city: true, stage: true, createdAt: true },
  });
}
