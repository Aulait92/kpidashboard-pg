// Statistik der Bestandskampagnen (Ole, 14.11.2026), alle Zahlen je Kanal getrennt (WhatsApp, E-Mail):
//   Trichter: angeschrieben → zugestellt (WhatsApp auch gelesen; E-Mail ohne Tracking-Pixel: nur Bounces) →
//   geantwortet → Lead → Termin → Abschluss (mit Sparte), dazu Abmeldungen infolge der Kampagne und
//   fehlgeschlagen bzw. übersprungen mit Gründen.
//   Ertrag: Abschluss- und Bestandsprovision der zugeordneten Abschlüsse mit der Rate der verkauften Sparte
//   (lib/provision.contractProvision, wie Cross-Selling und /buyer/zahlen). Kosten = WhatsApp-Gebühren der
//   Kampagne (im Modul enthalten, zur Einordnung). Ergebnis und € pro angeschriebenem Kunden.
//   Zuordnung: 60 Tage nach dem Anschreiben, letzte Kampagne zählt (lib/lead-herkunft).
// Nur Daten des eigenen Kunden. funnelOf und Ertrag sind rein (getestet).

import { prisma } from "@/lib/prisma";
import { contractLabel, contractProvision, type ProvisionOverrides } from "@/lib/provision";
import type { Channel } from "@/lib/bestand/einwilligung";
import type { CustomerContract } from "@/lib/vertraege";

export type FunnelRecipient = {
  channel: string;
  status: string;
  reason: string | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  readAt: Date | null;
  bouncedAt: Date | null;
  repliedAt: Date | null;
  leadId: string | null;
  optOutAt: Date | null;
  /** Lead hat nach dem Anschreiben einen (nicht abgesagten) Termin */
  appointment: boolean;
};

export type ChannelFunnel = {
  angeschrieben: number;
  zugestellt: number;
  /** nur WhatsApp (E-Mail ohne Tracking: null) */
  gelesen: number | null;
  unzustellbar: number;
  geantwortet: number;
  lead: number;
  termin: number;
  abschluss: number;
  abgemeldet: number;
  fehlgeschlagen: number;
  uebersprungen: number;
  wartend: number;
  /** Gründe für fehlgeschlagen bzw. übersprungen */
  gruende: Record<string, number>;
  /** Abschlüsse je Sparte (Label) */
  sparten: Record<string, number>;
  provision: number;
  bestandProJahr: number;
};

const empty = (channel: Channel | "gesamt"): ChannelFunnel => ({
  angeschrieben: 0,
  zugestellt: 0,
  gelesen: channel === "email" ? null : 0,
  unzustellbar: 0,
  geantwortet: 0,
  lead: 0,
  termin: 0,
  abschluss: 0,
  abgemeldet: 0,
  fehlgeschlagen: 0,
  uebersprungen: 0,
  wartend: 0,
  gruende: {},
  sparten: {},
  provision: 0,
  bestandProJahr: 0,
});

export type Funnel = { whatsapp: ChannelFunnel; email: ChannelFunnel; gesamt: ChannelFunnel };

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Trichter je Kanal aus Empfängern und zugeordneten Abschlüssen (rein). */
export function funnelOf(recipients: FunnelRecipient[], closings: Pick<CustomerContract, "sparte" | "premium" | "provisionValue" | "campaignChannel" | "productName" | "rateAbschluss" | "rateBestand">[], rates?: ProvisionOverrides): Funnel {
  const out: Funnel = { whatsapp: empty("whatsapp"), email: empty("email"), gesamt: empty("gesamt") };
  const add = (f: ChannelFunnel, r: FunnelRecipient) => {
    const sent = !!r.sentAt;
    if (sent) f.angeschrieben++;
    if (r.channel === "email") {
      if (sent && !r.bouncedAt) f.zugestellt++;
    } else if (r.deliveredAt || r.readAt) f.zugestellt++;
    if (r.readAt && f.gelesen != null) f.gelesen++;
    if (r.bouncedAt || r.reason === "nicht zugestellt") f.unzustellbar++;
    if (r.repliedAt) f.geantwortet++;
    if (r.leadId) f.lead++;
    if (r.leadId && r.appointment) f.termin++;
    if (r.optOutAt) f.abgemeldet++;
    if (r.status === "queued") f.wartend++;
    if (r.status === "failed") f.fehlgeschlagen++;
    if (r.status === "skipped") f.uebersprungen++;
    if ((r.status === "failed" || r.status === "skipped") && r.reason) f.gruende[r.reason] = (f.gruende[r.reason] ?? 0) + 1;
  };
  for (const r of recipients) {
    add(r.channel === "email" ? out.email : out.whatsapp, r);
    add(out.gesamt, r);
  }
  // E-Mail ohne Tracking: „gelesen“ gibt es gesamt nur, wenn nichts per E-Mail ging
  if (out.email.angeschrieben) out.gesamt.gelesen = null;
  for (const c of closings) {
    const p = contractProvision(c, rates);
    for (const f of [c.campaignChannel === "email" ? out.email : out.whatsapp, out.gesamt]) {
      f.abschluss++;
      const label = contractLabel(c);
      f.sparten[label] = (f.sparten[label] ?? 0) + 1;
      f.provision = r2(f.provision + p.firstYear);
      f.bestandProJahr = r2(f.bestandProJahr + p.trailPerYear);
    }
  }
  return out;
}

/** Quote in Prozent (gerundet), null ohne Basis. */
export function quote(n: number, base: number): number | null {
  return base > 0 ? Math.round((n / base) * 1000) / 10 : null;
}

export type Ertrag = { provision: number; bestandProJahr: number; kosten: number; ergebnis: number; proAngeschrieben: number | null };

/** Ertrag einer Kampagne: Provision (1. Jahr) minus WhatsApp-Gebühren, je angeschriebenem Kunden (rein). */
export function ertragOf(f: ChannelFunnel, kosten: number): Ertrag {
  const ergebnis = r2(f.provision - kosten);
  return { provision: f.provision, bestandProJahr: f.bestandProJahr, kosten: r2(kosten), ergebnis, proAngeschrieben: f.angeschrieben ? r2(ergebnis / f.angeschrieben) : null };
}

// ─── Laden ──────────────────────────────────────────────────────────────

export type CampaignStats = {
  id: string;
  name: string;
  occasion: string;
  topic: string | null;
  status: string;
  pausedReason: string | null;
  channelMode: string;
  dailyLimit: number;
  startedAt: Date | null;
  createdAt: Date;
  funnel: Funnel;
  kosten: number;
  ertrag: Ertrag;
};

async function recipientsOf(where: { campaignId?: { in: string[] }; sentAt?: { gte: Date; lte: Date } }, customerId: string) {
  const rows = await prisma.campaignRecipient.findMany({
    where: { ...where, campaign: { customerId } },
    select: {
      campaignId: true,
      channel: true,
      status: true,
      reason: true,
      sentAt: true,
      deliveredAt: true,
      readAt: true,
      bouncedAt: true,
      repliedAt: true,
      leadId: true,
      optOutAt: true,
      waMessageId: true,
    },
  });
  const leadIds = [...new Set(rows.map((r) => r.leadId).filter((x): x is string => !!x))];
  const appts = leadIds.length
    ? await prisma.appointment.findMany({ where: { customerId, leadId: { in: leadIds }, status: { not: "cancelled" } }, select: { leadId: true, createdAt: true } })
    : [];
  const apptBy = new Map<string, Date[]>();
  for (const a of appts) apptBy.set(a.leadId!, [...(apptBy.get(a.leadId!) ?? []), a.createdAt]);
  return rows.map((r) => ({ ...r, appointment: !!r.leadId && (apptBy.get(r.leadId) ?? []).some((d) => !r.sentAt || d >= r.sentAt) }));
}

/** WhatsApp-Gebühren je Kampagne aus den gespeicherten Nachrichten (billable, Kategorie). */
async function feesByCampaign(rows: { campaignId: string; waMessageId: string | null }[]): Promise<Map<string, number>> {
  const ids = rows.map((r) => r.waMessageId).filter((x): x is string => !!x);
  const out = new Map<string, number>();
  if (!ids.length) return out;
  const { feeRates } = await import("@/lib/whatsapp/fees");
  const rates = feeRates();
  const msgs = await prisma.message.findMany({ where: { waMessageId: { in: ids }, billable: true }, select: { waMessageId: true, pricingCategory: true } });
  const priceOf = new Map(msgs.map((m) => [m.waMessageId!, rates[(m.pricingCategory ?? "marketing") as keyof typeof rates] ?? rates.marketing]));
  for (const r of rows) {
    const p = r.waMessageId ? priceOf.get(r.waMessageId) : undefined;
    if (p) out.set(r.campaignId, (out.get(r.campaignId) ?? 0) + p);
  }
  return out;
}

/** Zahlen aller Kampagnen eines Kunden (neueste zuerst), optional nur bestimmte. */
export async function loadCampaignStats(customerId: string, opts: { ids?: string[]; contracts?: CustomerContract[]; rates?: ProvisionOverrides } = {}): Promise<CampaignStats[]> {
  const campaigns = await prisma.customerCampaign.findMany({
    where: { customerId, ...(opts.ids ? { id: { in: opts.ids } } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  if (!campaigns.length) return [];
  const [rows, base] = await Promise.all([recipientsOf({ campaignId: { in: campaigns.map((c) => c.id) } }, customerId), opts.contracts && opts.rates ? null : loadBase(customerId)]);
  const contracts = opts.contracts ?? base!.contracts;
  const rates = opts.rates ?? base!.rates;
  const fees = await feesByCampaign(rows);
  return campaigns.map((c) => {
    const funnel = funnelOf(
      rows.filter((r) => r.campaignId === c.id),
      contracts.filter((x) => x.campaignId === c.id),
      rates,
    );
    const kosten = r2(fees.get(c.id) ?? 0);
    return {
      id: c.id,
      name: c.name,
      occasion: c.occasion,
      topic: c.topic,
      status: c.status,
      pausedReason: c.pausedReason,
      channelMode: c.channelMode,
      dailyLimit: c.dailyLimit,
      startedAt: c.startedAt,
      createdAt: c.createdAt,
      funnel,
      kosten,
      ertrag: ertragOf(funnel.gesamt, kosten),
    };
  });
}

async function loadBase(customerId: string) {
  const [{ loadCustomerContracts }, { loadCustomerProvision }] = await Promise.all([import("@/lib/vertraege"), import("@/lib/provision-server")]);
  const [contracts, prov] = await Promise.all([loadCustomerContracts(customerId).catch(() => [] as CustomerContract[]), loadCustomerProvision(customerId)]);
  return { contracts, rates: prov.rates };
}

export type PeriodTiles = { funnel: Funnel; kosten: number; ertrag: Ertrag };

/** Kacheln für einen Zeitraum: Anschreiben im Zeitraum, Abschlüsse im Zeitraum (zugeordnet). */
export async function loadPeriodTiles(customerId: string, range: { from: Date; to: Date }): Promise<PeriodTiles> {
  const [rows, base] = await Promise.all([recipientsOf({ sentAt: { gte: range.from, lte: range.to } }, customerId), loadBase(customerId)]);
  const closings = base.contracts.filter((c) => c.campaignId && c.signedAt >= range.from && c.signedAt <= range.to);
  const funnel = funnelOf(rows, closings, base.rates);
  const kosten = r2([...(await feesByCampaign(rows)).values()].reduce((s, n) => s + n, 0));
  return { funnel, kosten, ertrag: ertragOf(funnel.gesamt, kosten) };
}

export type GroupRow = { key: string; label: string; campaigns: number; angeschrieben: number; geantwortet: number; termin: number; abschluss: number; provision: number };

/** Vergleich nach Anlass bzw. Thema/Sparte (rein). */
export function groupStats(stats: CampaignStats[], by: "occasion" | "topic", label: (key: string) => string): GroupRow[] {
  const m = new Map<string, GroupRow>();
  for (const s of stats) {
    const key = by === "occasion" ? s.occasion : (s.topic ?? "ohne Thema");
    const g = m.get(key) ?? { key, label: label(key), campaigns: 0, angeschrieben: 0, geantwortet: 0, termin: 0, abschluss: 0, provision: 0 };
    const f = s.funnel.gesamt;
    g.campaigns++;
    g.angeschrieben += f.angeschrieben;
    g.geantwortet += f.geantwortet;
    g.termin += f.termin;
    g.abschluss += f.abschluss;
    g.provision = r2(g.provision + f.provision);
    m.set(key, g);
  }
  return [...m.values()].sort((a, b) => b.angeschrieben - a.angeschrieben);
}
