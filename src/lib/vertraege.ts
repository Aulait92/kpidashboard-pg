// Verträge je Lead (Cross-Selling, Ole 14.11.2026). Der erste Abschluss eines Leads ist der
// Vertrag mit primaryLeadId = leadId (aus closedAt/closeValue, gepflegt über syncPrimaryContract);
// weitere Abschlüsse trägt der Vermittler im Kontakt ein. Provision je Vertrag mit der Rate seiner
// Sparte (lib/provision.contractProvision). Abschlussquote und Funnel zählen weiter Leads.
//
// Ein Vertrag zählt nur, solange der Lead im Status „Abschluss“ ist und der Vertrag aktiv ist.
// Zeitraum: der erste Vertrag zählt wie bisher im Zeitraum, in dem der Lead eingegangen ist
// (passend zu den Lead-Kosten), weitere Verträge an ihrem Abschlussdatum.

import { prisma } from "@/lib/prisma";
import { CLOSED_STATUS } from "@/lib/products";
import { asSparte, contractProvision, sparteForSource, sparteInfo, SPARTEN, type ProvisionOverrides, type SparteKey } from "@/lib/provision";
import { leadOrigin, LEAD_ORIGIN_SELECT, type LeadOrigin } from "@/lib/lead-herkunft";
import { formatEUR } from "@/lib/format";
import { BESTAND_FROM_LEAD_NOTE, CROSS_SELL_TODO } from "@/lib/vertraege-shared";

export const CONTRACT_STATUSES = ["aktiv", "storniert"] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

const isClosed = (status: string | null | undefined) => (status ?? "").trim().toLowerCase() === CLOSED_STATUS.toLowerCase();

// ─── Eingabe prüfen (rein) ───────────────────────────────────────────────

export type ContractInput = {
  sparte: SparteKey;
  premium: number | null;
  signedAt: Date;
  insurer: string | null;
  contractNo: string | null;
  fileId: string | null;
};

const text = (v: unknown, max: number) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, max) : null;
};

/** Formulardaten eines Vertrags prüfen. Beitrag in „1.234,50“ oder 1234.5; Datum JJJJ-MM-TT. */
export function parseContractInput(raw: Record<string, unknown>, now = new Date()): { ok: true; value: ContractInput } | { ok: false; error: string } {
  if (!SPARTEN.some((s) => s.key === raw.sparte)) return { ok: false, error: "Bitte eine Sparte wählen." };
  let premium: number | null = null;
  const p = raw.premium;
  if (p != null && String(p).trim() !== "") {
    const n = typeof p === "number" ? p : Number(String(p).replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return { ok: false, error: "Bitte einen gültigen Beitrag eintragen." };
    premium = n > 0 ? Math.round(n * 100) / 100 : null;
  }
  let signedAt = now;
  if (raw.signedAt != null && String(raw.signedAt).trim() !== "") {
    const s = String(raw.signedAt).trim();
    const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00.000Z`) : new Date(s);
    if (Number.isNaN(d.getTime())) return { ok: false, error: "Bitte ein gültiges Datum wählen." };
    if (d.getTime() > now.getTime() + 2 * 86_400_000) return { ok: false, error: "Das Datum liegt in der Zukunft." };
    if (d.getFullYear() < 2000) return { ok: false, error: "Bitte ein gültiges Datum wählen." };
    signedAt = d;
  }
  return {
    ok: true,
    value: { sparte: raw.sparte as SparteKey, premium, signedAt, insurer: text(raw.insurer, 120), contractNo: text(raw.contractNo, 80), fileId: text(raw.fileId, 40) },
  };
}

/** Text im Verlauf: „Hausrat · Beitrag 300 € · Provision ≈ 165 €“. */
export function contractSummary(c: { sparte: string; premium: unknown; provisionValue?: unknown }, rates?: ProvisionOverrides): string {
  const p = contractProvision({ sparte: c.sparte, premium: c.premium, provisionValue: c.provisionValue }, rates);
  const premium = c.premium != null && Number(c.premium) > 0 ? Number(c.premium) : null;
  const monthly = sparteInfo(c.sparte).rateKey === "pkv";
  const parts = [sparteInfo(c.sparte).label];
  if (premium != null) parts.push(`Beitrag ${formatEUR(premium)}${monthly ? "/Monat" : ""}`);
  if (p.abschluss > 0 || p.trailPerYear > 0) {
    if (p.abschluss > 0) parts.push(`Provision ≈ ${formatEUR(p.abschluss)}`);
    if (p.trailPerYear > 0) parts.push(`Bestand ≈ ${formatEUR(p.trailPerYear)}/Jahr${p.trailFromYear2 ? " ab dem 2. Jahr" : ""}`);
  }
  return parts.join(" · ");
}

// ─── Erster Vertrag aus dem Abschluss am Lead ─────────────────────────────

/** Sparte eines Leads ohne Angabe: aus dem Produkt; Empfehlung → Produkt des Empfehlers; Bestand → Kampagnenthema; sonst „sonstiges“. */
export async function derivedSparte(lead: { id: string; source: string | null; adChannel: string | null; referralLinkId: string | null }): Promise<SparteKey> {
  const origin = leadOrigin(lead);
  if (origin === "empfehlung") {
    const link = lead.referralLinkId
      ? await prisma.referralLink.findUnique({ where: { id: lead.referralLinkId }, select: { lead: { select: { source: true } }, existingCustomer: { select: { lines: true } } } })
      : null;
    const fromLead = sparteForSource(link?.lead?.source);
    if (fromLead) return fromLead;
    return "sonstiges";
  }
  if (origin === "bestand") {
    const rec = await prisma.campaignRecipient.findFirst({ where: { leadId: lead.id }, orderBy: { sentAt: "desc" }, select: { campaign: { select: { topic: true } } } });
    return sparteForSource(rec?.campaign.topic) ?? "sonstiges";
  }
  return sparteForSource(lead.source) ?? "sonstiges";
}

/** Braucht der Abschluss eines Leads die Frage nach der Sparte? (Empfehlung, Bestandskunde, unbekanntes Produkt) */
export function asksSparte(source: string | null | undefined, adChannel?: string | null): boolean {
  if (leadOrigin({ source, adChannel }) !== "paid") return true;
  return sparteForSource(source) == null;
}

/**
 * Ersten Vertrag mit dem Abschluss am Lead abgleichen (nach jedem Statuswechsel auf „Abschluss“).
 * Legt ihn an oder übernimmt Beitrag (closeValue) und Datum. reopen: neuer Abschluss → wieder aktiv.
 */
export async function syncPrimaryContract(leadId: string, opts: { sparte?: string | null; reopen?: boolean; userId?: string | null } = {}): Promise<void> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, customerId: true, status: true, closedAt: true, closeValue: true, ...LEAD_ORIGIN_SELECT },
  });
  if (!lead || !isClosed(lead.status)) return;
  const premium = lead.closeValue != null && Number(lead.closeValue) > 0 ? lead.closeValue : null;
  const existing = await prisma.leadContract.findUnique({ where: { primaryLeadId: lead.id }, select: { id: true, sparte: true } });
  const chosen = opts.sparte && SPARTEN.some((s) => s.key === opts.sparte) ? asSparte(opts.sparte) : null;
  if (existing) {
    await prisma.leadContract.update({
      where: { id: existing.id },
      data: {
        premium,
        ...(premium != null ? { provisionValue: null } : {}),
        ...(chosen ? { sparte: chosen } : {}),
        ...(opts.reopen ? { status: "aktiv", cancelledAt: null, signedAt: lead.closedAt ?? new Date() } : {}),
      },
    });
  } else {
    const sparte = chosen ?? (await derivedSparte(lead));
    await prisma.leadContract.upsert({
      where: { primaryLeadId: lead.id },
      create: {
        leadId: lead.id,
        customerId: lead.customerId,
        primaryLeadId: lead.id,
        sparte,
        premium,
        signedAt: lead.closedAt ?? new Date(),
        createdById: opts.userId ?? null,
      },
      update: {},
    });
  }
  await syncLeadToBestand(lead.id).catch((err) => console.error("[vertraege] bestand", err));
}

// ─── Verträge laden (für Zahlen) ─────────────────────────────────────────

export type CustomerContract = {
  id: string;
  leadId: string;
  primary: boolean;
  sparte: SparteKey;
  premium: number | null;
  provisionValue: number | null;
  signedAt: Date;
  /** Datum für die Zuordnung zum Zeitraum (erster Vertrag: Lead-Eingang, weitere: Abschlussdatum). */
  periodAt: Date;
  origin: LeadOrigin;
  assignedUserId: string | null;
  leadCreatedAt: Date;
};

const num = (v: unknown) => (v == null ? null : Number(v));

/**
 * Alle aktiven Verträge der Leads mit Abschluss eines Kunden (seit Start). Leads mit Abschluss ohne
 * gespeicherten ersten Vertrag (z. B. aus dem Airtable-Abgleich) bekommen einen abgeleiteten.
 * leadWhere grenzt die Leads ein (z. B. Berater).
 */
export async function loadCustomerContracts(customerId: string, opts: { leadWhere?: Record<string, unknown> } = {}): Promise<CustomerContract[]> {
  const leads = await prisma.lead.findMany({
    where: { customerId, status: CLOSED_STATUS, ...(opts.leadWhere ?? {}) },
    select: {
      id: true,
      createdAt: true,
      closedAt: true,
      statusChangedAt: true,
      closeValue: true,
      assignedUserId: true,
      ...LEAD_ORIGIN_SELECT,
      contracts: { select: { id: true, primaryLeadId: true, sparte: true, premium: true, provisionValue: true, signedAt: true, status: true } },
    },
  });
  const out: CustomerContract[] = [];
  for (const l of leads) {
    const origin = leadOrigin(l);
    const base = { leadId: l.id, origin, assignedUserId: l.assignedUserId, leadCreatedAt: l.createdAt };
    // Erster Vertrag nicht gespeichert (z. B. Abschluss aus dem Airtable-Abgleich): aus dem Lead ableiten
    if (!l.contracts.some((c) => c.primaryLeadId)) {
      const sparte = origin === "paid" ? (sparteForSource(l.source) ?? "sonstiges") : await derivedSparte(l);
      const signedAt = l.closedAt ?? l.statusChangedAt;
      out.push({ ...base, id: `virtual:${l.id}`, primary: true, sparte, premium: num(l.closeValue), provisionValue: null, signedAt, periodAt: l.createdAt });
    }
    for (const c of l.contracts) {
      if (c.status === "storniert") continue;
      const primary = !!c.primaryLeadId;
      out.push({
        ...base,
        id: c.id,
        primary,
        sparte: asSparte(c.sparte),
        premium: num(c.premium),
        provisionValue: num(c.provisionValue),
        signedAt: c.signedAt,
        periodAt: primary ? l.createdAt : c.signedAt,
      });
    }
  }
  return out;
}

// ─── Verträge im Kontakt (Bedienung) ─────────────────────────────────────

export type LeadContractView = {
  id: string;
  primary: boolean;
  sparte: SparteKey;
  sparteLabel: string;
  premium: number | null;
  provisionValue: number | null;
  signedAt: string;
  insurer: string | null;
  contractNo: string | null;
  fileId: string | null;
  fileName: string | null;
  status: ContractStatus;
  summary: string;
};

export async function listLeadContracts(leadId: string, rates?: ProvisionOverrides): Promise<LeadContractView[]> {
  const rows = await prisma.leadContract.findMany({
    where: { leadId },
    orderBy: [{ primaryLeadId: { sort: "asc", nulls: "last" } }, { signedAt: "asc" }],
    select: { id: true, primaryLeadId: true, sparte: true, premium: true, provisionValue: true, signedAt: true, insurer: true, contractNo: true, fileId: true, status: true, file: { select: { fileName: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    primary: !!r.primaryLeadId,
    sparte: asSparte(r.sparte),
    sparteLabel: sparteInfo(r.sparte).label,
    premium: num(r.premium),
    provisionValue: num(r.provisionValue),
    signedAt: r.signedAt.toISOString(),
    insurer: r.insurer,
    contractNo: r.contractNo,
    fileId: r.fileId,
    fileName: r.file?.fileName ?? null,
    status: r.status === "storniert" ? "storniert" : "aktiv",
    summary: contractSummary(r, rates),
  }));
}

/** Weiteren Abschluss eintragen (nur bei Leads mit Abschluss). */
export async function addLeadContract(leadId: string, customerId: string, input: ContractInput, userId: string | null): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, customerId }, select: { id: true, status: true, erasedAt: true } });
  if (!lead || lead.erasedAt) return { ok: false, error: "Kontakt nicht gefunden." };
  if (!isClosed(lead.status)) return { ok: false, error: "Weitere Abschlüsse gibt es bei Kontakten mit Abschluss." };
  // Erster Vertrag muss existieren, damit dieser nicht als erster zählt
  await syncPrimaryContract(lead.id);
  const fileId = await ownFileId(lead.id, input.fileId);
  const c = await prisma.leadContract.create({
    data: {
      leadId: lead.id,
      customerId,
      sparte: input.sparte,
      premium: input.premium,
      signedAt: input.signedAt,
      insurer: input.insurer,
      contractNo: input.contractNo,
      fileId,
      createdById: userId,
    },
    select: { id: true },
  });
  // Erinnerung „Weiteres Produkt anbieten?“ ist damit erledigt (und kommt nicht mehr)
  await prisma.lead.updateMany({ where: { id: lead.id, followUpNote: { startsWith: CROSS_SELL_TODO } }, data: { followUpAt: null, followUpNote: null } });
  await prisma.lead.updateMany({ where: { id: lead.id, crossSellRemindedAt: null }, data: { crossSellRemindedAt: new Date() } });
  await syncLeadToBestand(lead.id).catch((err) => console.error("[vertraege] bestand", err));
  return { ok: true, id: c.id };
}

async function ownFileId(leadId: string, fileId: string | null): Promise<string | null> {
  if (!fileId) return null;
  const f = await prisma.leadFile.findFirst({ where: { id: fileId, leadId }, select: { id: true } });
  return f?.id ?? null;
}

/** Vertrag bearbeiten. Beim ersten Vertrag wird der Beitrag auch am Lead (closeValue) gespiegelt. */
export async function updateLeadContract(contractId: string, customerId: string, input: ContractInput): Promise<{ ok: true; leadId: string } | { ok: false; error: string }> {
  const c = await prisma.leadContract.findFirst({ where: { id: contractId, customerId }, select: { id: true, leadId: true, primaryLeadId: true } });
  if (!c) return { ok: false, error: "Vertrag nicht gefunden." };
  const fileId = await ownFileId(c.leadId, input.fileId);
  await prisma.leadContract.update({
    where: { id: c.id },
    data: {
      sparte: input.sparte,
      premium: input.premium,
      ...(input.premium != null ? { provisionValue: null } : {}),
      signedAt: input.signedAt,
      insurer: input.insurer,
      contractNo: input.contractNo,
      fileId,
    },
  });
  if (c.primaryLeadId) await prisma.lead.update({ where: { id: c.leadId }, data: { closeValue: input.premium } });
  await syncLeadToBestand(c.leadId).catch((err) => console.error("[vertraege] bestand", err));
  return { ok: true, leadId: c.leadId };
}

/** Storno bzw. wieder aktiv. Ein weiterer (nicht erster) Vertrag kann auch gelöscht werden. */
export async function setLeadContractStatus(contractId: string, customerId: string, status: ContractStatus | "geloescht", now = new Date()): Promise<{ ok: true; leadId: string; sparte: string } | { ok: false; error: string }> {
  const c = await prisma.leadContract.findFirst({ where: { id: contractId, customerId }, select: { id: true, leadId: true, primaryLeadId: true, sparte: true } });
  if (!c) return { ok: false, error: "Vertrag nicht gefunden." };
  if (status === "geloescht") {
    if (c.primaryLeadId) return { ok: false, error: "Den ersten Abschluss bitte stornieren oder den Status des Kontakts ändern." };
    await prisma.leadContract.delete({ where: { id: c.id } });
  } else {
    await prisma.leadContract.update({ where: { id: c.id }, data: { status, cancelledAt: status === "storniert" ? now : null } });
  }
  await syncLeadToBestand(c.leadId).catch((err) => console.error("[vertraege] bestand", err));
  return { ok: true, leadId: c.leadId, sparte: c.sparte };
}

// ─── Bestand (ExistingCustomer/ExistingContract) ─────────────────────────

/**
 * Kunde mit Abschluss inklusive aller Verträge in den Bestand übernehmen bzw. abgleichen, damit
 * Bestandskampagnen wissen, was er schon hat. Ohne Doppelung: vorhandener Eintrag zum Lead, sonst
 * gleicher Kunde aus dem Import (Telefon oder E-Mail). Verträge aus dem Import mit gleicher
 * Vertragsnummer gehen vor (kein zweiter Spiegel).
 */
export async function syncLeadToBestand(leadId: string, now = new Date()): Promise<{ existingCustomerId: string } | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, customerId: true, name: true, phone: true, email: true, status: true, erasedAt: true, closedAt: true, contracts: { select: { id: true, sparte: true, premium: true, signedAt: true, insurer: true, contractNo: true, status: true } } },
  });
  if (!lead || lead.erasedAt || !isClosed(lead.status) || !lead.contracts.length) return null;
  let ec = await prisma.existingCustomer.findUnique({ where: { leadId: lead.id }, select: { id: true } });
  if (!ec && (lead.phone || lead.email)) {
    ec = await prisma.existingCustomer.findFirst({
      where: { customerId: lead.customerId, leadId: null, OR: [...(lead.phone ? [{ phone: lead.phone }] : []), ...(lead.email ? [{ email: lead.email }] : [])] },
      select: { id: true },
    });
    if (ec) await prisma.existingCustomer.update({ where: { id: ec.id }, data: { leadId: lead.id } });
  }
  if (!ec) {
    const parts = (lead.name ?? "").trim().split(/\s+/).filter(Boolean);
    const firstName = parts.length > 1 ? parts.slice(0, -1).join(" ") : (parts[0] ?? null);
    const lastName = parts.length > 1 ? parts[parts.length - 1] : null;
    ec = await prisma.existingCustomer.create({
      data: {
        customerId: lead.customerId,
        leadId: lead.id,
        firstName,
        lastName,
        phone: lead.phone,
        email: lead.email,
        consentAt: lead.closedAt ?? now,
        consentNote: BESTAND_FROM_LEAD_NOTE,
      },
      select: { id: true },
    });
  }
  const imported = await prisma.existingContract.findMany({ where: { existingCustomerId: ec.id, leadContractId: null }, select: { contractNo: true } });
  const importedNos = new Set(imported.map((i) => i.contractNo).filter((x): x is string => !!x));
  for (const c of lead.contracts) {
    const data = {
      line: sparteInfo(c.sparte).bestandLine,
      product: sparteInfo(c.sparte).label,
      startDate: c.signedAt,
      annualPremium: c.premium != null && sparteInfo(c.sparte).rateKey === "pkv" ? Number(c.premium) * 12 : c.premium,
      contractNo: c.contractNo,
      insurer: c.insurer,
      status: c.status === "storniert" ? "storniert" : "aktiv",
    };
    if (c.contractNo && importedNos.has(c.contractNo)) {
      await prisma.existingContract.deleteMany({ where: { leadContractId: c.id } });
      continue;
    }
    await prisma.existingContract.upsert({ where: { leadContractId: c.id }, create: { ...data, existingCustomerId: ec.id, leadContractId: c.id }, update: data });
  }
  await refreshBestandSummary(ec.id);
  return { existingCustomerId: ec.id };
}

/** Sparten und Beitragsvolumen am Bestandskunden aus allen aktiven Verträgen (Import und App). */
export async function refreshBestandSummary(existingCustomerId: string): Promise<void> {
  const contracts = await prisma.existingContract.findMany({ where: { existingCustomerId }, select: { line: true, annualPremium: true, status: true } });
  const active = contracts.filter((c) => c.status !== "storniert" && c.status !== "ruhend");
  const lines = [...new Set(active.map((c) => c.line))].sort();
  const premiums = active.map((c) => (c.annualPremium == null ? null : Number(c.annualPremium))).filter((p): p is number => p != null);
  const premiumTotal = premiums.length ? Math.round(premiums.reduce((s, p) => s + p, 0) * 100) / 100 : null;
  await prisma.existingCustomer.update({ where: { id: existingCustomerId }, data: { lines, premiumTotal } });
}

/** Cron: Abschlüsse ohne Spiegel im Bestand nachziehen (auch aus dem Airtable-Abgleich), in kleinen Portionen. */
export async function syncPendingBestand(limit = 100): Promise<number> {
  const leads = await prisma.lead.findMany({
    where: { status: CLOSED_STATUS, erasedAt: null, OR: [{ contracts: { none: {} } }, { contracts: { some: { existingContract: null } } }] },
    select: { id: true },
    take: limit,
  });
  let n = 0;
  for (const l of leads) {
    await syncPrimaryContract(l.id).catch(() => null);
    if (await syncLeadToBestand(l.id).catch(() => null)) n++;
  }
  return n;
}

// ─── Erinnerung „Weiteres Produkt anbieten?“ ─────────────────────────────

export { CROSS_SELL_TODO };
export const CROSS_SELL_AFTER_DAYS = 21;
/** Nur Abschlüsse der letzten Woche nach Ablauf der 3 Wochen (kein Schwall alter Aufgaben beim Start). */
export const CROSS_SELL_WINDOW_DAYS = 7;

/** Text der Aufgabe mit naheliegenden Sparten, z. B. „Weiteres Produkt anbieten? Naheliegend: Privatschutz/Haftpflicht, Unfall“. */
export function crossSellNote(sparten: string[]): string {
  const have = new Set(sparten);
  const first = sparten[0] ?? "sonstiges";
  const ideas = sparteInfo(first).related.filter((s) => !have.has(s)).map((s) => sparteInfo(s).label);
  return ideas.length ? `${CROSS_SELL_TODO} Naheliegend: ${ideas.join(", ")}` : CROSS_SELL_TODO;
}

/**
 * Cron: 3 Wochen nach dem ersten Abschluss die Wiedervorlage „Weiteres Produkt anbieten?“ auf „Heute“.
 * Einmal je Lead (crossSellRemindedAt), nicht bei weiterem Abschluss, nicht wenn der Lead nicht mehr im
 * Abschluss ist, nicht über eine offene Wiedervorlage (z. B. Police) hinweg, nur wenn beim Kunden an.
 */
export async function runCrossSellReminders(now = new Date()): Promise<number> {
  const until = new Date(now.getTime() - CROSS_SELL_AFTER_DAYS * 86_400_000);
  const from = new Date(until.getTime() - CROSS_SELL_WINDOW_DAYS * 86_400_000);
  const leads = await prisma.lead.findMany({
    where: {
      status: CLOSED_STATUS,
      erasedAt: null,
      closedAt: { gte: from, lte: until },
      crossSellRemindedAt: null,
      followUpAt: null,
      customer: { crossSellReminder: true, archived: false },
      contracts: { none: { primaryLeadId: null, status: "aktiv" } },
    },
    select: { id: true, customerId: true, source: true, contracts: { select: { sparte: true } } },
    take: 500,
  });
  let n = 0;
  for (const l of leads) {
    const sparten = l.contracts.map((c) => c.sparte);
    if (!sparten.length) sparten.push(sparteForSource(l.source) ?? "sonstiges");
    // Bedingte Aktualisierung: nie doppelt (paralleler Lauf, inzwischen gesetzte Wiedervorlage)
    const r = await prisma.lead.updateMany({
      where: { id: l.id, crossSellRemindedAt: null, followUpAt: null, status: CLOSED_STATUS },
      data: { crossSellRemindedAt: now, followUpAt: now, followUpNote: crossSellNote(sparten) },
    });
    n += r.count;
  }
  return n;
}
