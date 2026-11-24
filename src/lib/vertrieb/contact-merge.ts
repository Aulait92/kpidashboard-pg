// Vertriebskontakte: weitere E-Mail-Adressen und Zusammenführen von Dubletten
// (z. B. Calendly-Buchung mit anderer E-Mail als im Angebot).

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { STAGE_RANK } from "@/lib/vertrieb/crm";
import { answersContacts, contactSignals, phoneE164, phoneKey, phoneKind, rankDuplicates } from "@/lib/vertrieb/dubletten";
import { usableEmail } from "@/lib/vertrieb/kontaktdaten";

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
  // Nicht erneut automatisch aus Mails oder Buchungen übernehmen (lib/vertrieb/kontaktdaten-server.ts)
  if (email) await import("@/lib/vertrieb/kontaktdaten-server").then((m) => m.rememberRemoved(contactId, email));
}

/** Weitere Adresse wird Hauptadresse (die bisherige Hauptadresse wird weitere Adresse). */
export async function makePrimaryEmail(contactId: string, raw: string): Promise<void> {
  const email = normalizeEmail(raw);
  const c = await prisma.salesContact.findUniqueOrThrow({ where: { id: contactId }, select: { email: true, altEmails: true, detectedData: true } });
  if (!email || !c.altEmails.includes(email)) return;
  // Herkunft für die Anzeige: die bisherige Hauptadresse ist jetzt „frühere Hauptadresse“
  const d = (c.detectedData && typeof c.detectedData === "object" && !Array.isArray(c.detectedData) ? c.detectedData : {}) as { emails?: Record<string, unknown> };
  const old = c.email.trim().toLowerCase();
  const emails = { ...(d.emails ?? {}), [old]: { source: "HAUPT", at: new Date().toISOString() } };
  delete (emails as Record<string, unknown>)[email];
  await prisma.salesContact.update({
    where: { id: contactId },
    data: { email, altEmails: [c.email, ...c.altEmails.filter((e) => e !== email)], detectedData: { ...d, emails } as Prisma.InputJsonValue },
  });
}

/**
 * Haupt-E-Mail korrigieren (z. B. Tippfehler): ersetzt die Adresse, die alte wird nicht behalten.
 * Offene Angebote des Kontakts (Entwurf/verschickt, nicht angenommen) mit der alten Adresse bekommen die neue.
 */
export async function updatePrimaryEmail(contactId: string, raw: string): Promise<EmailResult & { offers?: number }> {
  const email = normalizeEmail(raw);
  if (!email) return { ok: false, error: "Bitte eine gültige E-Mail-Adresse eingeben." };
  const other = await findContactIdByEmail(email);
  if (other && other !== contactId) return { ok: false, error: "Diese E-Mail gehört schon zu einem anderen Kontakt. Bitte die beiden Kontakte zusammenführen." };
  const c = await prisma.salesContact.findUniqueOrThrow({ where: { id: contactId }, select: { email: true, altEmails: true } });
  if (c.email === email) return { ok: true, offers: 0 };
  const old = c.email;
  const offers = await prisma.$transaction(async (tx) => {
    await tx.salesContact.update({ where: { id: contactId }, data: { email, altEmails: c.altEmails.filter((e) => e !== email) } });
    const r = await tx.offer.updateMany({
      where: { salesContactId: contactId, email: { equals: old, mode: "insensitive" }, status: { in: ["draft", "sent"] }, acceptedAt: null },
      data: { email },
    });
    await tx.salesActivity.create({ data: { contactId, type: "NOTIZ", outcome: "E-Mail geändert", note: `${old} → ${email}${r.count ? ` (auch in ${r.count} offenen Angebot${r.count === 1 ? "" : "en"})` : ""}` } });
    return r.count;
  });
  return { ok: true, offers };
}

// Felder, die beim Zusammenführen aus dem zweiten Kontakt übernommen werden, wenn sie beim ersten leer sind.
const FILL_FIELDS = [
  "phone", "street", "zip", "city", "ratingValue", "ratingCount", "openingHours", "url", "salutation", "firstName", "lastName",
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
    // Weitere Telefonnummern: übernehmen, was der erste Kontakt noch nicht hat; abweichende Hauptnummer wird weitere Nummer
    const keepKeys = new Set(
      [keep.phone, ...(await tx.salesContactPhone.findMany({ where: { contactId: keepId }, select: { phone: true } })).map((p) => p.phone)].map(phoneKey).filter(Boolean),
    );
    moved.telefonnummern = 0;
    for (const p of await tx.salesContactPhone.findMany({ where: { contactId: dropId } })) {
      const k = phoneKey(p.phone);
      if (!k || keepKeys.has(k)) continue;
      keepKeys.add(k);
      await tx.salesContactPhone.update({ where: { id: p.id }, data: { contactId: keepId } });
      moved.telefonnummern++;
    }
    const dropMain = phoneE164(drop.phone);
    if (keep.phone?.trim() && dropMain && !keepKeys.has(phoneKey(dropMain))) {
      await tx.salesContactPhone.create({ data: { contactId: keepId, phone: dropMain, kind: phoneKind(dropMain), source: "ZUSAMMENGEFUEHRT" } });
      moved.telefonnummern++;
    }

    const data: Prisma.SalesContactUncheckedUpdateInput = {};
    const k = keep as unknown as Record<string, unknown>;
    const dr = drop as unknown as Record<string, unknown>;
    for (const f of FILL_FIELDS) if ((k[f] == null || k[f] === "") && dr[f] != null && dr[f] !== "") (data as Record<string, unknown>)[f] = dr[f];
    if ((STAGE_RANK[drop.stage] ?? 0) > (STAGE_RANK[keep.stage] ?? 0)) data.stage = drop.stage;
    data.callAttempts = keep.callAttempts + drop.callAttempts;
    if (drop.lastContactAt && (!keep.lastContactAt || drop.lastContactAt > keep.lastContactAt)) data.lastContactAt = drop.lastContactAt;
    if (drop.description && drop.description !== keep.description) data.description = keep.description ? `${keep.description}\n\n${drop.description}` : drop.description;
    data.altEmails = [...new Set([...keep.altEmails, drop.email, ...drop.altEmails])].filter((e) => e !== keep.email);
    // Herkunft weiterer Adressen und entfernte Werte beider Kontakte zusammenlegen
    const dd = (x: unknown) => (x && typeof x === "object" && !Array.isArray(x) ? (x as { emails?: Record<string, unknown>; removed?: string[] }) : {});
    const kd = dd(keep.detectedData);
    const rd = dd(drop.detectedData);
    if (rd.emails || rd.removed) {
      data.detectedData = { emails: { ...rd.emails, ...kd.emails }, removed: [...new Set([...(kd.removed ?? []), ...(rd.removed ?? [])])] } as Prisma.InputJsonValue;
    }
    const customerId = !keep.customerId && drop.customerId ? drop.customerId : null;
    // Sperre bleibt (Ole, 19.11.2026): „nie kontaktieren“ und Sperrvermerke (Hashes) des zweiten Kontakts übernehmen,
    // Instantly erneut sperren (jetzt auch für die Adressen des ersten Kontakts)
    if (drop.nieKontaktierenAt && !keep.nieKontaktierenAt) {
      Object.assign(data, { nieKontaktierenAt: drop.nieKontaktierenAt, nieKontaktierenGrund: drop.nieKontaktierenGrund, instantlyGesperrtAt: null, instantlySperreVersuche: 0, instantlySperreFehler: null });
    } else if (keep.nieKontaktierenAt && drop.nieKontaktierenAt) Object.assign(data, { instantlyGesperrtAt: null, instantlySperreVersuche: 0 });
    if (drop.sperrHashes.length) data.sperrHashes = { set: [...new Set([...keep.sperrHashes, ...drop.sperrHashes])] };

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

const CANDIDATE_SELECT = { id: true, name: true, email: true, city: true, stage: true, createdAt: true } as const;

/** Kontakt-IDs, deren Telefonnummer (normalisiert) zu einer der Nummern passt. */
async function contactIdsByPhoneKeys(keys: string[], excludeId = ""): Promise<string[]> {
  const ks = [...new Set(keys)].filter((k) => k.length >= 7);
  if (!ks.length) return [];
  // Vorfilter in der DB über die letzten 7 Ziffern, genauer Vergleich danach
  const patterns = ks.map((k) => `%${k.slice(-7)}`);
  const rows = await prisma.$queryRaw<{ id: string; phone: string; createdAt: Date }[]>`
    SELECT id, phone, "createdAt" FROM "SalesContact"
    WHERE phone IS NOT NULL AND id <> ${excludeId} AND regexp_replace(phone, '[^0-9]', '', 'g') LIKE ANY(${patterns}::text[])
    ORDER BY "createdAt" ASC LIMIT 50`;
  const main = rows.filter((r) => ks.includes(phoneKey(r.phone) ?? "")).map((r) => r.id);
  // Weitere Telefonnummern (E.164): +49… bzw. + Ländervorwahl
  const extra = await prisma.salesContactPhone.findMany({
    where: { phone: { in: ks.flatMap((k) => [`+49${k}`, `+${k}`]) }, contactId: { not: excludeId } },
    orderBy: { createdAt: "asc" },
    select: { contactId: true },
    take: 50,
  });
  return [...new Set([...main, ...extra.map((p) => p.contactId)])];
}

/** Kontakt zu einer Telefonnummer (beliebige Schreibweise: 0171 …, +49 171 …). Ältester zuerst. */
export async function findContactIdByPhone(raw: string | null | undefined): Promise<string | null> {
  const k = phoneKey(raw);
  return k ? ((await contactIdsByPhoneKeys([k]))[0] ?? null) : null;
}

/** Kandidaten für „Zusammenführen mit …“: Suche nach Name (auch Vor- + Nachname), Firma, E-Mail (auch weitere) oder Telefon. */
export async function searchMergeCandidates(excludeId: string, q: string) {
  const term = q.trim();
  if (term.length < 2) return [];
  const lower = term.toLowerCase();
  const words = term.split(/\s+/).filter(Boolean);
  const digits = term.replace(/\D/g, "");
  const extraIds: string[] = [];
  // Telefon: ab 5 Ziffern, Schreibweise egal (0171 … findet +49 171 …)
  if (digits.length >= 5 && /^[\d\s+()/.-]+$/.test(term)) {
    const tail = (phoneKey(term) ?? digits.replace(/^0+/, "")).slice(-9);
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "SalesContact" WHERE phone IS NOT NULL AND id <> ${excludeId}
      AND regexp_replace(phone, '[^0-9]', '', 'g') LIKE ${`%${tail}%`} LIMIT 20`;
    extraIds.push(...rows.map((r) => r.id));
  }
  // Weitere E-Mail-Adressen: Teilstring
  if (lower.includes("@") || lower.includes(".")) {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "SalesContact" WHERE id <> ${excludeId}
      AND EXISTS (SELECT 1 FROM unnest("altEmails") a WHERE a ILIKE ${`%${lower.replace(/[%_\\]/g, "\\$&")}%`}) LIMIT 20`;
    extraIds.push(...rows.map((r) => r.id));
  }
  const nameField = (w: string): Prisma.SalesContactWhereInput => ({
    OR: [
      { name: { contains: w, mode: "insensitive" } },
      { firstName: { contains: w, mode: "insensitive" } },
      { lastName: { contains: w, mode: "insensitive" } },
      { leaderNames: { contains: w, mode: "insensitive" } },
    ],
  });
  return prisma.salesContact.findMany({
    where: {
      id: { not: excludeId },
      OR: [
        // „Christian Patzwald“: jedes Wort in Name, Vor-, Nachname oder Inhaber
        words.length > 1 ? { AND: words.map(nameField) } : nameField(term),
        { email: { contains: lower, mode: "insensitive" } },
        ...(extraIds.length ? [{ id: { in: extraIds } }] : []),
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 10,
    select: CANDIDATE_SELECT,
  });
}

const DUP_SIGNAL_SELECT = {
  ...CANDIDATE_SELECT,
  altEmails: true,
  phone: true,
  url: true,
  firstName: true,
  lastName: true,
  leaderNames: true,
  meetings: { select: { inviteeEmail: true, inviteePhone: true, answers: true }, orderBy: { createdAt: "desc" }, take: 5 },
  /** weitere Telefonnummern (aus Buchungen, Signaturen, Formularen) */
  phones: { select: { phone: true } },
  /** Absender eingehender Mails (z. B. von einer Adresse, die schon an einem anderen Kontakt hängt) */
  emails: { where: { direction: "IN", isAutoReply: false, fromEmail: { not: null } }, select: { fromEmail: true }, orderBy: { sentAt: "desc" }, take: 10 },
} as const;

type DupRow = Prisma.SalesContactGetPayload<{ select: typeof DUP_SIGNAL_SELECT }>;

/** Merkmale eines Kontakts inkl. E-Mail und Telefon aus Calendly-Buchungen. */
function signalsOf(c: DupRow) {
  const fromMeetings = c.meetings.map((m) => answersContacts(m.answers));
  const mailFrom = c.emails.map((m) => (m.fromEmail ?? "").trim().toLowerCase()).filter((e) => e && usableEmail(e));
  return contactSignals({
    ...c,
    extraEmails: [...c.meetings.map((m) => m.inviteeEmail ?? ""), ...fromMeetings.flatMap((m) => m.emails), ...mailFrom],
    extraPhones: [...fromMeetings.flatMap((m) => m.phones), ...c.meetings.map((m) => m.inviteePhone ?? ""), ...c.phones.map((p) => p.phone)],
  });
}

/** Ab so vielen Kontakten gilt eine E-Mail-Domain als gemeinsam genutzt und zählt nicht. */
const SHARED_DOMAIN_MIN = 6;

/**
 * Wahrscheinliche Dubletten: zuerst gleiche E-Mail (auch weitere und aus Buchungen),
 * gleiche Telefonnummer (normalisiert), gleiche Webseite oder Firma, gleiche eigene
 * E-Mail-Domain; Namen nur mit Vor- und Nachname. Höchstens 3, der beste zuerst, mit Grund.
 */
export async function likelyDuplicates(contactId: string, limit = 3): Promise<(MergeCandidateRow & { reason: string })[]> {
  const c = await prisma.salesContact.findUnique({ where: { id: contactId }, select: DUP_SIGNAL_SELECT });
  if (!c) return [];
  const t = signalsOf(c);
  const emails = [...t.emails];
  // Gelöschte Hüllen (Art. 17, „Gelöscht auf Verlangen“) sind keine Dubletten (Ole, 24.11.2026)
  const notSelf = { id: { not: contactId }, art17GeloeschtAt: null };
  const or: Prisma.SalesContactWhereInput[] = [];
  if (emails.length) {
    or.push({ email: { in: emails, mode: "insensitive" } }, { altEmails: { hasSome: emails } });
    or.push({ meetings: { some: { inviteeEmail: { in: emails, mode: "insensitive" } } } });
  }
  for (const site of t.sites) or.push({ url: { contains: site.split("/")[0], mode: "insensitive" } });
  if (t.company) or.push({ name: { equals: c.name.trim(), mode: "insensitive" } });
  if (c.firstName?.trim() && c.lastName?.trim()) {
    or.push({ firstName: { equals: c.firstName.trim(), mode: "insensitive" }, lastName: { equals: c.lastName.trim(), mode: "insensitive" } });
    or.push({ name: { contains: `${c.firstName.trim()} ${c.lastName.trim()}`, mode: "insensitive" } });
  }
  // Eigene E-Mail-Domain: nur, wenn sie nicht viele Kontakte teilen
  const ignoreDomains = new Set<string>();
  for (const d of t.domains) {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "SalesContact" WHERE id <> ${contactId} AND "art17GeloeschtAt" IS NULL
      AND (lower(email) LIKE ${`%@${d}`} OR EXISTS (SELECT 1 FROM unnest("altEmails") a WHERE lower(a) LIKE ${`%@${d}`}))
      LIMIT ${SHARED_DOMAIN_MIN}`;
    if (rows.length >= SHARED_DOMAIN_MIN) ignoreDomains.add(d);
    else if (rows.length) or.push({ id: { in: rows.map((r) => r.id) } });
  }
  const phoneIds = await contactIdsByPhoneKeys([...t.phones], contactId);
  if (phoneIds.length) or.push({ id: { in: phoneIds } });
  if (!or.length) return [];
  const rows = await prisma.salesContact.findMany({ where: { ...notSelf, OR: or }, select: DUP_SIGNAL_SELECT, take: 50 });
  return rankDuplicates(t, rows.map((r) => ({ ...r, signals: signalsOf(r) })), limit, ignoreDomains).map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    city: r.city,
    stage: r.stage,
    createdAt: r.createdAt,
    reason: r.reason,
  }));
}

export type MergeCandidateRow = Prisma.SalesContactGetPayload<{ select: typeof CANDIDATE_SELECT }>;
