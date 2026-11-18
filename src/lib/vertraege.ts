// Verträge je Lead (Cross-Selling, Ole 14.11.2026). Der erste Abschluss eines Leads ist der
// Vertrag mit primaryLeadId = leadId (aus closedAt/closeValue, gepflegt über syncPrimaryContract);
// weitere Abschlüsse trägt der Vermittler im Kontakt ein. Provision je Vertrag mit der Rate seiner
// Sparte (lib/provision.contractProvision). Abschlussquote und Funnel zählen weiter Leads.
//
// Ein Vertrag zählt nur, solange der Lead im Status „Abschluss“ ist und der Vertrag aktiv ist.
// Zeitraum: der erste Vertrag zählt wie bisher im Zeitraum, in dem der Lead eingegangen ist
// (passend zu den Lead-Kosten), weitere Verträge an ihrem Abschlussdatum.

import { abschlussAusEingabe, artAusSparte, artInfo, asArt, asEigeneProdukte, decodeSparte, mitProdukt, normName, prozentAnteil } from "@/lib/eigene-produkte";
import { prisma } from "@/lib/prisma";
import { CLOSED_STATUS } from "@/lib/products";
import {
  asSparte,
  cancelReasonLabel,
  contractProvision,
  isCancelReason,
  premiumFactor,
  sparteForSource,
  sparteInfo,
  sparteKind,
  contractLabel,
  SPARTEN,
  type CancelReason,
  type ProvisionOverrides,
  type SparteKey,
} from "@/lib/provision";
import { attributeContract, leadOrigin, LEAD_ORIGIN_SELECT, type CampaignSend, type LeadOrigin } from "@/lib/lead-herkunft";
import { formatEUR } from "@/lib/format";
import { chancen, type SchutzEintrag, type SchutzStatus } from "@/lib/schutz-ueberblick";
import { cleanTarifauswahl } from "@/lib/tarifauswahl";
import { BESTAND_FROM_LEAD_NOTE, CROSS_SELL_TODO, POLICE_TODO } from "@/lib/vertraege-shared";
import { premiumYearFor } from "@/lib/abschluss";
import { beitragVorgabe } from "@/lib/abschluss-vorgabe";
import { beendeAufgaben, planeAufgabe } from "@/lib/lead-aufgaben";

export const CONTRACT_STATUSES = ["aktiv", "storniert"] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

const isClosed = (status: string | null | undefined) => (status ?? "").trim().toLowerCase() === CLOSED_STATUS.toLowerCase();

// ─── Eingabe prüfen (rein) ───────────────────────────────────────────────

export type ContractInput = {
  sparte: SparteKey;
  /** Gespeicherter Beitrag (Leben/BU: Jahresbeitrag = eingegebener Monatsbeitrag × 12). */
  premium: number | null;
  signedAt: Date;
  insurer: string | null;
  contractNo: string | null;
  fileId: string | null;
  /** Leben/BU/Kindersparplan: Laufzeit, Alter, Endalter, Beitragssumme (optional). */
  termYears?: number | null;
  customerAge?: number | null;
  endAge?: number | null;
  beitragssumme?: number | null;
  /** Sparte „Sonstiges“: eigenes Produkt (Pflicht) mit Sätzen als Anteil (Abschluss, Bestand pro Jahr ab dem 2. Jahr). */
  productName?: string | null;
  rateAbschluss?: number | null;
  rateBestand?: number | null;
};

const text = (v: unknown, max: number) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, max) : null;
};

const parseAmount = (v: unknown): number | null | "invalid" => {
  if (v == null || String(v).trim() === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 10_000_000) return "invalid";
  return n > 0 ? Math.round(n * 100) / 100 : null;
};

const parseInt0 = (v: unknown, min: number, max: number): number | null | "invalid" => {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(String(v).replace(",", "."));
  if (!Number.isFinite(n) || n < min || n > max) return "invalid";
  return Math.round(n);
};

/**
 * Formulardaten eines Vertrags prüfen. Beitrag in „1.234,50“ oder 1234.5; Datum JJJJ-MM-TT. Bei Leben/BU
 * wird der Monatsbeitrag eingegeben und als Jahresbeitrag (× 12) gespeichert.
 */
export function parseContractInput(raw: Record<string, unknown>, now = new Date()): { ok: true; value: ContractInput } | { ok: false; error: string } {
  if (!SPARTEN.some((s) => s.key === raw.sparte)) return { ok: false, error: "Bitte eine Sparte wählen." };
  // Eigenes Produkt („sonstiges“ im Formular) mit Art Leben bzw. Kranken: Vertrag in deren Sparte (Ole, 17.11.2026)
  const eigen = raw.sparte === "sonstiges";
  const art = eigen ? asArt(raw.art) : "sach";
  const sparte = (eigen ? artInfo(art).sparte : raw.sparte) as SparteKey;
  const entered = parseAmount(raw.premium);
  if (entered === "invalid" || (entered != null && entered > 1_000_000)) return { ok: false, error: "Bitte einen gültigen Beitrag eintragen." };
  const premium = entered == null ? null : Math.round(entered * premiumFactor(sparte) * 100) / 100;
  const leben = premiumFactor(sparte) === 12;
  const termYears = leben ? parseInt0(raw.termYears, 1, 80) : null;
  const customerAge = leben ? parseInt0(raw.customerAge, 1, 100) : null;
  const endAge = leben ? parseInt0(raw.endAge, 1, 120) : null;
  const beitragssumme = leben ? parseAmount(raw.beitragssumme) : null;
  if (termYears === "invalid") return { ok: false, error: "Bitte eine Laufzeit zwischen 1 und 80 Jahren eintragen." };
  if (customerAge === "invalid" || endAge === "invalid") return { ok: false, error: "Bitte ein gültiges Alter eintragen." };
  if (customerAge != null && endAge != null && endAge <= customerAge) return { ok: false, error: "Das Endalter muss über dem Alter liegen." };
  if (beitragssumme === "invalid") return { ok: false, error: "Bitte eine gültige Beitragssumme eintragen." };
  // Eigenes Produkt bei „Sonstiges“ (Ole, 14.11.2026): Name Pflicht, Sätze in Prozent
  let productName: string | null = null;
  let rateAbschluss: number | null = null;
  let rateBestand: number | null = null;
  if (eigen) {
    productName = normName(String(raw.productName ?? ""));
    if (productName.length < 2) return { ok: false, error: "Bitte das Produkt angeben, zum Beispiel Hausrat, Kfz oder Rechtsschutz Gewerbe." };
    const a = abschlussAusEingabe(art, raw.rateAbschluss);
    const b = prozentAnteil(raw.rateBestand, 100);
    if (a === "invalid" || b === "invalid")
      return { ok: false, error: art === "sach" ? "Bitte gültige Provisionssätze in Prozent eintragen." : `Bitte gültige Sätze eintragen (Abschluss in ${artInfo(art).einheit}, Bestand in Prozent).` };
    rateAbschluss = a;
    rateBestand = b;
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
    value: {
      sparte,
      premium,
      signedAt,
      insurer: text(raw.insurer, 120),
      contractNo: text(raw.contractNo, 80),
      fileId: text(raw.fileId, 40),
      termYears,
      customerAge,
      endAge,
      beitragssumme,
      productName,
      rateAbschluss,
      rateBestand,
    },
  };
}

/** Felder der Rechengrundlage für Prisma (nur Leben/BU, sonst leer). */
function basisData(input: ContractInput) {
  return {
    termYears: input.termYears ?? null,
    customerAge: input.customerAge ?? null,
    endAge: input.endAge ?? null,
    beitragssumme: input.beitragssumme ?? null,
    // Eigenes Produkt (Sach, Leben oder Kranken): Name und Sätze am Vertrag
    productName: input.productName ?? null,
    rateAbschluss: input.productName ? (input.rateAbschluss ?? null) : null,
    rateBestand: input.productName ? (input.rateBestand ?? null) : null,
  };
}

/** Eigenes Produkt beim Kunden merken (Vorschlag und Vorbelegung beim nächsten Abschluss). */
export async function rememberEigenesProdukt(customerId: string, input: Pick<ContractInput, "sparte" | "productName" | "rateAbschluss" | "rateBestand">): Promise<void> {
  if (!input.productName) return;
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { customProducts: true } });
  const list = mitProdukt(asEigeneProdukte(c?.customProducts), { name: input.productName, art: artAusSparte(input.sparte), rateAbschluss: input.rateAbschluss ?? 0, rateBestand: input.rateBestand ?? 0 });
  await prisma.customer.update({ where: { id: customerId }, data: { customProducts: list } });
}

type SummaryInput = {
  sparte: string;
  productName?: string | null;
  rateAbschluss?: unknown;
  rateBestand?: unknown;
  premium: unknown;
  provisionValue?: unknown;
  termYears?: unknown;
  customerAge?: unknown;
  endAge?: unknown;
  beitragssumme?: unknown;
  /** Herkunft des Beitrags (lib/abschluss.ts): „standard“ = geschätzt, mit „≈“ */
  premiumSource?: string | null;
};

/**
 * Text im Verlauf: „Hausrat · Beitrag 300 € · Provision ≈ 165 €“, Leben/BU „BU · Beitrag 80 €/Monat ·
 * 30 Jahre (28.800 € Beitragssumme) · Provision ≈ 720 € · Bestand ≈ 14 €/Jahr“, Tarifoptimierung
 * „… · Ersparnis 120 €/Monat · Honorar (vom Kunden) ≈ 720 €“.
 */
export function contractSummary(c: SummaryInput, rates?: ProvisionOverrides): string {
  const p = contractProvision({ ...c, status: "aktiv" }, rates);
  const premium = c.premium != null && Number(c.premium) > 0 ? Number(c.premium) : null;
  const parts = [contractLabel(c)];
  // Typischer Beitrag (Abschluss mit einem Tipp, nicht bestätigt): geschätzt mit „≈“
  const ca = c.premiumSource === "standard" ? "≈ " : "";
  if (p.basis === "honorar") {
    if (premium != null) parts.push(`Ersparnis ${ca}${formatEUR(premium)}/Monat`);
  } else if (p.basis === "beitragssumme") {
    if (premium != null) parts.push(`Beitrag ${ca}${formatEUR(premium / 12)}/Monat`);
    if (p.termYears && p.beitragssumme) parts.push(`${p.termYears} Jahre (${formatEUR(p.beitragssumme)} Beitragssumme)`);
  } else if (premium != null) {
    parts.push(`Beitrag ${ca}${formatEUR(premium)}${sparteKind(c.sparte) === "monthly" ? "/Monat" : ""}`);
  }
  if (p.abschluss > 0) parts.push(`${p.honorar ? "Honorar (vom Kunden)" : "Provision"} ≈ ${formatEUR(p.abschluss)}`);
  if (p.trailPerYear > 0) parts.push(`Bestand ≈ ${formatEUR(p.trailPerYear)}/Jahr${p.trailFromYear2 ? " ab dem 2. Jahr" : ""}`);
  return parts.join(" · ");
}

/** Text im Verlauf bei Kündigung: „Vertrag gekündigt bzw. storniert · Hausrat · zum 12.11.2026 · Widerruf · Rückbelastung 165 €“. */
export function cancelSummary(c: { sparte: string; productName?: string | null; cancelledAt: Date; cancelReason: string | null; chargeback: number | null }): string {
  const day = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(c.cancelledAt);
  const parts = ["Vertrag gekündigt bzw. storniert", contractLabel(c), `zum ${day}`, cancelReasonLabel(c.cancelReason)];
  if (c.chargeback != null && c.chargeback > 0) parts.push(`Rückbelastung ${formatEUR(c.chargeback)}`);
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
 * Den Beitrag eines vorhandenen Vertrags übernimmt nur ein Abschluss mit Eingabe (takeValue bzw. reopen);
 * Ansicht und Abgleich ändern ihn nicht (sonst überschriebe ein alter closeValue z. B. den festen Wert
 * migrierter Verträge).
 */
export async function syncPrimaryContract(
  leadId: string,
  opts: { sparte?: string | null; reopen?: boolean; takeValue?: boolean; userId?: string | null } = {},
): Promise<void> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, customerId: true, status: true, closedAt: true, closeValue: true, ...LEAD_ORIGIN_SELECT },
  });
  if (!lead || !isClosed(lead.status)) return;
  const entered = lead.closeValue != null && Number(lead.closeValue) > 0 ? Number(lead.closeValue) : null;
  const existing = await prisma.leadContract.findUnique({ where: { primaryLeadId: lead.id }, select: { id: true, sparte: true, provisionValue: true } });
  // „Sonstiges“ mit eigenem Produkt kommt als ein Wert aus dem Abschluss-Dialog (lib/eigene-produkte.encodeSparte)
  const decoded = decodeSparte(opts.sparte);
  const chosen = decoded.sparte && SPARTEN.some((s) => s.key === decoded.sparte) ? asSparte(decoded.sparte) : null;
  const productData = chosen
    ? decoded.product
      ? { productName: decoded.product.name, rateAbschluss: decoded.product.rateAbschluss, rateBestand: decoded.product.rateBestand }
      : { productName: null, rateAbschluss: null, rateBestand: null }
    : {};
  // Abschluss mit einem Tipp (P4, Ole 17.11.2026): ohne Eingabe Beitrag aus dem Angebot, sonst der typische der Sparte
  // (premiumSource angebot | standard, lib/abschluss-vorgabe.ts); eingegeben = vermittler. Fester Altwert bleibt.
  const beitrag = async (sparte: string, keepFixed: boolean) => {
    if (entered != null) return { premium: entered, premiumSource: "vermittler", premiumYear: premiumYearFor(sparte, entered) };
    if (keepFixed) return { premium: null, premiumSource: null, premiumYear: null };
    const { loadCustomerProvision } = await import("@/lib/provision-server");
    const v = await beitragVorgabe(lead.id, sparte, (await loadCustomerProvision(lead.customerId)).rates).catch(() => ({ premium: null, source: null }));
    return { premium: v.premium, premiumSource: v.source, premiumYear: premiumYearFor(sparte, v.premium) };
  };
  if (existing) {
    const takeValue = !!(opts.takeValue || opts.reopen);
    const b = takeValue ? await beitrag(chosen ?? existing.sparte, existing.provisionValue != null) : null;
    await prisma.leadContract.update({
      where: { id: existing.id },
      data: {
        ...(b ? { ...b, ...(b.premium != null ? { provisionValue: null } : {}) } : {}),
        ...(chosen ? { sparte: chosen, ...productData } : {}),
        ...(opts.reopen ? { status: "aktiv", cancelledAt: null, cancelReason: null, chargeback: null, signedAt: lead.closedAt ?? new Date() } : {}),
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
        ...(await beitrag(sparte, false)),
        ...productData,
        signedAt: lead.closedAt ?? new Date(),
        createdById: opts.userId ?? null,
      },
      update: {},
    });
  }
  if (decoded.product) {
    await rememberEigenesProdukt(lead.customerId, { sparte: artInfo(decoded.product.art).sparte, productName: decoded.product.name, rateAbschluss: decoded.product.rateAbschluss, rateBestand: decoded.product.rateBestand }).catch((err) =>
      console.error("[vertraege] eigenes produkt", err),
    );
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
  /** Leben/BU: Rechengrundlage (optional, wie ContractLike). */
  termYears?: number | null;
  customerAge?: number | null;
  endAge?: number | null;
  beitragssumme?: number | null;
  /** Eigenes Produkt (Sparte „Sonstiges“) mit Sätzen. */
  productName?: string | null;
  rateAbschluss?: number | null;
  rateBestand?: number | null;
  /**
   * aktiv bzw. storniert (gekündigt mit Grund). Gekündigte Verträge zählen mit ihrer Abschlussprovision im
   * Zeitraum des Abschlusses, die Rückbelastung im Monat der Kündigung, Bestand nur bis zum Kündigungsdatum.
   * Altfälle ohne Grund (vor dem 14.11.2026) laden wir nicht (zählten schon bisher gar nicht).
   */
  status?: "aktiv" | "storniert";
  cancelledAt?: Date | null;
  cancelReason?: string | null;
  chargeback?: number | null;
  signedAt: Date;
  /** Datum für die Zuordnung zum Zeitraum (erster Vertrag: Lead-Eingang, weitere: Abschlussdatum). */
  periodAt: Date;
  /** Herkunft des Vertrags (Lead-Herkunft, bzw. „bestand“, wenn einer Bestandskampagne zugeordnet). */
  origin: LeadOrigin;
  /** Bestandskampagne, der der Abschluss zugeordnet ist (60 Tage, letzte Kampagne zählt), sonst null. */
  campaignId: string | null;
  /** Kanal des zugeordneten Anschreibens (whatsapp | email) */
  campaignChannel?: string | null;
  assignedUserId: string | null;
  leadCreatedAt: Date;
};

/**
 * Versand von Bestandskampagnen je Lead: Antworten (CampaignRecipient.leadId) und derselbe Bestandskunde
 * (ExistingCustomer.leadId, Kunde aus einem Abschluss in der App). Grundlage für attributeContract.
 */
export async function campaignSendsByLead(customerId: string): Promise<Map<string, CampaignSend[]>> {
  const rows = await prisma.campaignRecipient.findMany({
    where: { campaign: { customerId }, sentAt: { not: null } },
    select: { campaignId: true, sentAt: true, channel: true, existingCustomerId: true, leadId: true, existingCustomer: { select: { leadId: true } } },
  });
  const sendsByEc = new Map<string, CampaignSend[]>();
  const ecsByLead = new Map<string, Set<string>>();
  const link = (leadId: string | null, ecId: string) => {
    if (!leadId) return;
    const set = ecsByLead.get(leadId) ?? new Set<string>();
    set.add(ecId);
    ecsByLead.set(leadId, set);
  };
  for (const r of rows) {
    const list = sendsByEc.get(r.existingCustomerId) ?? [];
    list.push({ campaignId: r.campaignId, sentAt: r.sentAt!, channel: r.channel });
    sendsByEc.set(r.existingCustomerId, list);
    link(r.leadId, r.existingCustomerId);
    link(r.existingCustomer.leadId, r.existingCustomerId);
  }
  const out = new Map<string, CampaignSend[]>();
  for (const [leadId, ecs] of ecsByLead) out.set(leadId, [...ecs].flatMap((id) => sendsByEc.get(id) ?? []));
  return out;
}

const num = (v: unknown) => (v == null ? null : Number(v));

/**
 * Alle Verträge der Leads mit Abschluss eines Kunden (seit Start): aktive und gekündigte (mit Grund,
 * status „storniert“). Leads mit Abschluss ohne gespeicherten ersten Vertrag (z. B. aus dem
 * Airtable-Abgleich) bekommen einen abgeleiteten. leadWhere grenzt die Leads ein (z. B. Berater).
 * Wer nur aktive braucht: activeContracts().
 */
export async function loadCustomerContracts(customerId: string, opts: { leadWhere?: Record<string, unknown> } = {}): Promise<CustomerContract[]> {
  const leads = await prisma.lead.findMany({
    // Testleads zählen nicht in Provision und Gewinn (lib/testlead.ts)
    where: { customerId, status: CLOSED_STATUS, isTest: false, ...(opts.leadWhere ?? {}) },
    select: {
      id: true,
      createdAt: true,
      closedAt: true,
      statusChangedAt: true,
      closeValue: true,
      assignedUserId: true,
      ...LEAD_ORIGIN_SELECT,
      contracts: {
        select: {
          id: true,
          primaryLeadId: true,
          sparte: true,
          premium: true,
          provisionValue: true,
          signedAt: true,
          status: true,
          cancelledAt: true,
          cancelReason: true,
          chargeback: true,
          termYears: true,
          customerAge: true,
          endAge: true,
          beitragssumme: true,
          productName: true,
          rateAbschluss: true,
          rateBestand: true,
        },
      },
    },
  });
  const out: CustomerContract[] = [];
  // Bestandskampagnen: Zuordnung je Vertrag (60 Tage, letzte Kampagne zählt; lib/lead-herkunft)
  const sendsByLead = leads.length ? await campaignSendsByLead(customerId).catch(() => new Map<string, CampaignSend[]>()) : new Map<string, CampaignSend[]>();
  for (const l of leads) {
    const origin = leadOrigin(l);
    const sends = sendsByLead.get(l.id) ?? [];
    const base = { leadId: l.id, assignedUserId: l.assignedUserId, leadCreatedAt: l.createdAt };
    // Erster Vertrag nicht gespeichert (z. B. Abschluss aus dem Airtable-Abgleich): aus dem Lead ableiten
    if (!l.contracts.some((c) => c.primaryLeadId)) {
      const sparte = origin === "paid" ? (sparteForSource(l.source) ?? "sonstiges") : await derivedSparte(l);
      const signedAt = l.closedAt ?? l.statusChangedAt;
      out.push({ ...base, ...attributeContract(origin, { primary: true, signedAt }, sends), id: `virtual:${l.id}`, primary: true, sparte, premium: num(l.closeValue), provisionValue: null, signedAt, periodAt: l.createdAt });
    }
    for (const c of l.contracts) {
      const cancelled = c.status === "storniert";
      // Altfall: storniert ohne Grund zählt wie bisher gar nicht
      if (cancelled && !c.cancelReason) continue;
      const primary = !!c.primaryLeadId;
      out.push({
        ...base,
        ...attributeContract(origin, { primary, signedAt: c.signedAt }, sends),
        id: c.id,
        primary,
        sparte: asSparte(c.sparte),
        premium: num(c.premium),
        provisionValue: num(c.provisionValue),
        termYears: c.termYears,
        customerAge: c.customerAge,
        endAge: c.endAge,
        beitragssumme: num(c.beitragssumme),
        productName: c.productName,
        rateAbschluss: num(c.rateAbschluss),
        rateBestand: num(c.rateBestand),
        status: cancelled ? "storniert" : "aktiv",
        cancelledAt: cancelled ? (c.cancelledAt ?? c.signedAt) : null,
        cancelReason: cancelled ? c.cancelReason : null,
        chargeback: cancelled ? num(c.chargeback) : null,
        signedAt: c.signedAt,
        periodAt: primary ? l.createdAt : c.signedAt,
      });
    }
  }
  return out;
}

/** Gekündigt bzw. storniert bis `at`? (Kündigungsdatum erreicht) */
export const isCancelledAt = (c: Pick<CustomerContract, "status" | "cancelledAt">, at: Date) => c.status === "storniert" && !!c.cancelledAt && c.cancelledAt <= at;

/** Nur Verträge, die zum Zeitpunkt `at` laufen (nicht gekündigt). */
export function activeContracts<T extends Pick<CustomerContract, "status" | "cancelledAt">>(contracts: T[], at = new Date()): T[] {
  return contracts.filter((c) => !isCancelledAt(c, at));
}

// ─── Verträge im Kontakt (Bedienung) ─────────────────────────────────────

export type LeadContractView = {
  id: string;
  primary: boolean;
  sparte: SparteKey;
  sparteLabel: string;
  /** Gespeicherter Beitrag (Leben/BU: Jahresbeitrag); Eingabe = premium / premiumFactor. */
  premium: number | null;
  provisionValue: number | null;
  termYears: number | null;
  customerAge: number | null;
  endAge: number | null;
  beitragssumme: number | null;
  productName: string | null;
  rateAbschluss: number | null;
  rateBestand: number | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  chargeback: number | null;
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
    select: {
      id: true,
      primaryLeadId: true,
      sparte: true,
      premium: true,
      premiumSource: true,
      provisionValue: true,
      signedAt: true,
      insurer: true,
      contractNo: true,
      fileId: true,
      status: true,
      cancelledAt: true,
      cancelReason: true,
      chargeback: true,
      termYears: true,
      customerAge: true,
      endAge: true,
      beitragssumme: true,
      productName: true,
      rateAbschluss: true,
      rateBestand: true,
      file: { select: { fileName: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    primary: !!r.primaryLeadId,
    sparte: asSparte(r.sparte),
    sparteLabel: contractLabel(r),
    premium: num(r.premium),
    provisionValue: num(r.provisionValue),
    termYears: r.termYears,
    customerAge: r.customerAge,
    endAge: r.endAge,
    beitragssumme: num(r.beitragssumme),
    productName: r.productName,
    rateAbschluss: num(r.rateAbschluss),
    rateBestand: num(r.rateBestand),
    cancelledAt: r.status === "storniert" && r.cancelledAt ? r.cancelledAt.toISOString() : null,
    cancelReason: r.status === "storniert" ? r.cancelReason : null,
    chargeback: r.status === "storniert" ? num(r.chargeback) : null,
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
      premiumSource: input.premium != null ? "vermittler" : null,
      premiumYear: premiumYearFor(input.sparte, input.premium),
      signedAt: input.signedAt,
      insurer: input.insurer,
      contractNo: input.contractNo,
      fileId,
      ...basisData(input),
      createdById: userId,
    },
    select: { id: true },
  });
  await rememberEigenesProdukt(customerId, input).catch((err) => console.error("[vertraege] eigenes produkt", err));
  // Erinnerung „Weiteres Produkt anbieten?“ ist damit erledigt (und kommt nicht mehr, auch nicht aus der Warteschlange)
  await prisma.lead.updateMany({ where: { id: lead.id, followUpNote: { startsWith: CROSS_SELL_TODO } }, data: { followUpAt: null, followUpNote: null } });
  await beendeAufgaben(lead.id, ["cross_sell"], "Weiterer Vertrag eingetragen");
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
  const c = await prisma.leadContract.findFirst({ where: { id: contractId, customerId }, select: { id: true, leadId: true, primaryLeadId: true, premium: true, premiumSource: true } });
  if (!c) return { ok: false, error: "Vertrag nicht gefunden." };
  const fileId = await ownFileId(c.leadId, input.fileId);
  // Unveränderter Beitrag behält seine Herkunft (Angebot, typisch); geänderter gilt als vom Vermittler eingetragen
  const sameBeitrag = input.premium != null && c.premium != null && Number(c.premium) === input.premium;
  await prisma.leadContract.update({
    where: { id: c.id },
    data: {
      sparte: input.sparte,
      premium: input.premium,
      premiumSource: input.premium == null ? null : sameBeitrag ? c.premiumSource : "vermittler",
      premiumYear: premiumYearFor(input.sparte, input.premium),
      ...(input.premium != null ? { provisionValue: null } : {}),
      signedAt: input.signedAt,
      insurer: input.insurer,
      contractNo: input.contractNo,
      fileId,
      ...basisData(input),
    },
  });
  if (c.primaryLeadId) await prisma.lead.update({ where: { id: c.leadId }, data: { closeValue: input.premium } });
  await rememberEigenesProdukt(customerId, input).catch((err) => console.error("[vertraege] eigenes produkt", err));
  await syncLeadToBestand(c.leadId).catch((err) => console.error("[vertraege] bestand", err));
  return { ok: true, leadId: c.leadId };
}

/**
 * Wieder aktiv bzw. löschen (nur weitere, nicht der erste Vertrag). „storniert“ ohne Grund ist der alte
 * Weg (zählt gar nicht mehr); in der Oberfläche läuft die Kündigung über cancelLeadContract.
 */
export async function setLeadContractStatus(contractId: string, customerId: string, status: ContractStatus | "geloescht", now = new Date()): Promise<{ ok: true; leadId: string; sparte: string; productName?: string | null } | { ok: false; error: string }> {
  const c = await prisma.leadContract.findFirst({ where: { id: contractId, customerId }, select: { id: true, leadId: true, primaryLeadId: true, sparte: true, productName: true } });
  if (!c) return { ok: false, error: "Vertrag nicht gefunden." };
  if (status === "geloescht") {
    if (c.primaryLeadId) return { ok: false, error: "Den ersten Abschluss bitte stornieren oder den Status des Kontakts ändern." };
    await prisma.leadContract.delete({ where: { id: c.id } });
  } else {
    await prisma.leadContract.update({
      where: { id: c.id },
      data: status === "storniert" ? { status, cancelledAt: now } : { status, cancelledAt: null, cancelReason: null, chargeback: null },
    });
  }
  await syncLeadToBestand(c.leadId).catch((err) => console.error("[vertraege] bestand", err));
  return { ok: true, leadId: c.leadId, sparte: c.sparte };
}

export type CancelInput = { cancelledAt: Date; reason: CancelReason; chargeback: number | null };

/** Formulardaten „Vertrag gekündigt bzw. storniert“ prüfen: Datum, Grund, optional Rückbelastung (€). */
export function parseCancelInput(raw: Record<string, unknown>, signedAt: Date | null, now = new Date()): { ok: true; value: CancelInput } | { ok: false; error: string } {
  const s = String(raw.cancelledAt ?? "").trim();
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00.000Z`) : s ? new Date(s) : null;
  if (!d || Number.isNaN(d.getTime()) || d.getUTCFullYear() < 2000) return { ok: false, error: "Bitte ein gültiges Datum wählen." };
  if (d.getTime() > now.getTime() + 366 * 86_400_000) return { ok: false, error: "Das Datum liegt zu weit in der Zukunft." };
  if (signedAt && d.getTime() < new Date(signedAt.toISOString().slice(0, 10) + "T00:00:00.000Z").getTime()) {
    return { ok: false, error: "Das Datum liegt vor dem Abschluss." };
  }
  if (!isCancelReason(raw.reason)) return { ok: false, error: "Bitte einen Grund wählen." };
  const cb = parseAmount(raw.chargeback);
  if (cb === "invalid" || (cb != null && cb > 1_000_000)) return { ok: false, error: "Bitte eine gültige Rückbelastung eintragen." };
  return { ok: true, value: { cancelledAt: d, reason: raw.reason, chargeback: cb } };
}

/**
 * „Vertrag gekündigt bzw. storniert“: ab dem Datum kein Bestand mehr, eine Rückbelastung mindert
 * Provision und Gewinn im Monat des Datums. Rückgängig mit setLeadContractStatus(…, "aktiv").
 */
export async function cancelLeadContract(contractId: string, customerId: string, input: CancelInput): Promise<{ ok: true; leadId: string; sparte: string; productName?: string | null } | { ok: false; error: string }> {
  const c = await prisma.leadContract.findFirst({ where: { id: contractId, customerId }, select: { id: true, leadId: true, sparte: true, productName: true } });
  if (!c) return { ok: false, error: "Vertrag nicht gefunden." };
  await prisma.leadContract.update({
    where: { id: c.id },
    data: { status: "storniert", cancelledAt: input.cancelledAt, cancelReason: input.reason, chargeback: input.chargeback },
  });
  await syncLeadToBestand(c.leadId).catch((err) => console.error("[vertraege] bestand", err));
  return { ok: true, leadId: c.leadId, sparte: c.sparte, productName: c.productName };
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
    select: { id: true, customerId: true, name: true, phone: true, email: true, status: true, erasedAt: true, closedAt: true, contracts: { select: { id: true, sparte: true, productName: true, premium: true, signedAt: true, insurer: true, contractNo: true, status: true } } },
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
      product: contractLabel(c),
      startDate: c.signedAt,
      // Jahresbeitrag: PKV-Monatsbeitrag × 12; Tarifoptimierung hat keinen (premium = Ersparnis)
      annualPremium:
        sparteInfo(c.sparte).rateKey === "pkv_tarif" ? null : c.premium != null && sparteInfo(c.sparte).rateKey === "pkv" ? Number(c.premium) * 12 : c.premium,
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

const LUECKE_TEXT: Record<SchutzStatus, string> = { luecke: "Lücke", pruefen: "prüfen", woanders: "woanders versichert", "bei-uns": "bei uns" };

/** Erkannte Lücken aus der letzten Terminvorbereitung (Tarifauswahl.schutz), ohne Sparten, die schon im Angebot waren. */
function lueckenAusTermin(tarifauswahl: unknown): SchutzEintrag[] {
  const a = cleanTarifauswahl(tarifauswahl);
  return a?.schutz?.length ? chancen(a.schutz, a.sparten.filter((s) => !s.zusatz).map((s) => s.key)) : [];
}

export { CROSS_SELL_TODO };
export const CROSS_SELL_AFTER_DAYS = 42; // 6 Wochen (Ole, 17.11.2026; vorher 21 Tage)
/** Nur Abschlüsse der letzten Woche nach Ablauf der 6 Wochen (kein Schwall alter Aufgaben beim Start). */
export const CROSS_SELL_WINDOW_DAYS = 7;

/**
 * Text der Aufgabe mit naheliegenden Sparten, z. B. „Weiteres Produkt anbieten? Naheliegend: Privatschutz/Haftpflicht, Unfall“.
 * Mit erkannten Lücken aus der Terminvorbereitung (Cross-Selling Teil A6, „Chance im Termin“) stehen diese drin:
 * „Weiteres Produkt anbieten? Aus dem Termin: Rechtsschutz (Lücke), Unfall (prüfen)“.
 */
export function crossSellNote(sparten: string[], luecken: Pick<SchutzEintrag, "label" | "status">[] = []): string {
  if (luecken.length) return `${CROSS_SELL_TODO} Aus dem Termin: ${luecken.map((l) => `${l.label} (${LUECKE_TEXT[l.status]})`).join(", ")}`;
  const have = new Set(sparten);
  const first = sparten[0] ?? "sonstiges";
  const ideas = sparteInfo(first).related.filter((s) => !have.has(s)).map((s) => sparteInfo(s).label);
  return ideas.length ? `${CROSS_SELL_TODO} Naheliegend: ${ideas.join(", ")}` : CROSS_SELL_TODO;
}

/**
 * Cron: 6 Wochen nach dem ersten Abschluss die Aufgabe „Weiteres Produkt anbieten?“ auf „Heute“.
 * Einmal je Lead (crossSellRemindedAt), nicht bei weiterem Abschluss, nicht wenn der Lead nicht mehr im
 * Abschluss ist, nur wenn beim Kunden an. Ist gerade eine andere Wiedervorlage offen (z. B. „Police da?“),
 * wartet die Aufgabe und rückt danach nach (P7, lib/lead-aufgaben.ts), statt zu entfallen.
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
      customer: { crossSellReminder: true, archived: false },
      contracts: { none: { primaryLeadId: null, status: "aktiv" } },
    },
    select: {
      id: true,
      customerId: true,
      source: true,
      contracts: { select: { sparte: true } },
      appointments: { orderBy: { startsAt: "desc" }, take: 1, select: { tarifauswahl: true } },
    },
    take: 500,
  });
  let n = 0;
  for (const l of leads) {
    const sparten = l.contracts.map((c) => c.sparte);
    const luecken = lueckenAusTermin(l.appointments[0]?.tarifauswahl);
    if (!sparten.length) sparten.push(sparteForSource(l.source) ?? "sonstiges");
    // Bedingte Aktualisierung: nie doppelt (paralleler Lauf)
    const r = await prisma.lead.updateMany({ where: { id: l.id, crossSellRemindedAt: null, status: CLOSED_STATUS }, data: { crossSellRemindedAt: now } });
    if (!r.count) continue;
    await planeAufgabe({ leadId: l.id, customerId: l.customerId, kind: "cross_sell", note: crossSellNote(sparten, luecken), dueAt: now, requiresStatus: CLOSED_STATUS }, now);
    n++;
  }
  return n;
}

// ─── Aufgabe „Police da und erste Zahlung erfolgt?“ ──────────────────────

export { POLICE_TODO };
export const POLICE_AFTER_DAYS = 14;
/** Nur Abschlüsse der letzten Woche nach Ablauf der 2 Wochen (kein Schwall alter Aufgaben beim Start). */
export const POLICE_WINDOW_DAYS = 7;

/**
 * Cron: 2 Wochen nach dem ersten Abschluss die Aufgabe „Police da und erste Zahlung erfolgt?“ auf „Heute“.
 * Einmal je Lead (policeRemindedAt), nicht wenn die Police schon am Vertrag hängt, nicht bei gekündigtem
 * ersten Vertrag, nur wenn beim Kunden an. Ist eine andere Wiedervorlage offen (z. B. „Police fertig machen“),
 * wartet sie und rückt danach nach (P7, lib/lead-aufgaben.ts).
 */
export async function runPoliceReminders(now = new Date()): Promise<number> {
  const until = new Date(now.getTime() - POLICE_AFTER_DAYS * 86_400_000);
  const from = new Date(until.getTime() - POLICE_WINDOW_DAYS * 86_400_000);
  const leads = await prisma.lead.findMany({
    where: {
      status: CLOSED_STATUS,
      erasedAt: null,
      closedAt: { gte: from, lte: until },
      policeRemindedAt: null,
      customer: { policeReminder: true, archived: false },
      contracts: { none: { primaryLeadId: { not: null }, OR: [{ fileId: { not: null } }, { status: "storniert" }] } },
    },
    select: { id: true, customerId: true },
    take: 500,
  });
  let n = 0;
  for (const l of leads) {
    // Bedingte Aktualisierung: nie doppelt (paralleler Lauf)
    const r = await prisma.lead.updateMany({ where: { id: l.id, policeRemindedAt: null, status: CLOSED_STATUS }, data: { policeRemindedAt: now } });
    if (!r.count) continue;
    await planeAufgabe({ leadId: l.id, customerId: l.customerId, kind: "police", note: POLICE_TODO, dueAt: now, requiresStatus: CLOSED_STATUS }, now);
    n++;
  }
  return n;
}
