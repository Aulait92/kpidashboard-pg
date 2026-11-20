// Meta-Kosten je Anzeige und Tag (Ole, 17.11.2026, Datenbasis Baustein 2) in AdSpendDaily: Ausgaben, Impressionen,
// Klicks und Leads laut Meta je Anzeige (Insights level=ad, time_increment=1). Damit werden Kosten pro Lead, Termin
// und Abschluss je Kampagne/Anzeige rechenbar (Lead.adId ↔ AdSpendDaily.adId).
//
// Täglicher Abgleich (Cron, nach der Antwort): je Werbekonto die letzten 7 Tage (Meta korrigiert nachträglich), beim
// ersten Lauf eines Kontos bzw. `voll` bis 90 Tage zurück. Nie vor dem Startdatum des Kunden (lib/kunden-start.ts):
// Zeilen eines Kunden vor seinem Start werden nicht gespeichert, Kunden ohne Startdatum gar nicht.
// Konten: eigene Werbekonten der Kunden (Customer.metaAdAccountId, Kunde = Inhaber) und unsere Agentur-Konten
// (META_AD_ACCOUNT_IDS); dort Kunde über unsere angelegten Kampagnen (CampaignRun.built) oder die Leads der Anzeige,
// sonst leer (Pool-/Agentur-Kampagne). Idempotent: Upsert je Konto, Anzeige und Tag.

import { prisma } from "@/lib/prisma";
import { customerOwnedAdAccounts, dayAtNoonUtc, fetchAdInsightsDaily, type AdInsightRow } from "@/lib/meta";
import { redactTokens } from "@/lib/meta-leads";
import { ladeKundenStarts, type KundeMitStart } from "@/lib/kunden-start";

export type FetchAdInsights = (accountId: string, since: string, until: string) => Promise<AdInsightRow[]>;

const DAY = 86_400_000;
export const KOSTEN_FENSTER_TAGE = 90;
export const KOSTEN_NACHLAUF_TAGE = 7;

const LEAD_ACTIONS = ["onsite_conversion.lead_grouped", "lead", "leadgen_grouped"];

/** Leads laut Meta: höchster Wert der Lead-Aktionen (dieselben Leads stehen unter mehreren Aktionstypen). */
export function metaLeadsOf(r: Pick<AdInsightRow, "actions">): number {
  return Math.max(0, ...(r.actions ?? []).filter((a) => LEAD_ACTIONS.includes(a.action_type)).map((a) => Math.round(Number(a.value) || 0)));
}

/** YYYY-MM-DD in Berliner Zeit. */
export const berlinYmd = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(d);
const addDaysYmd = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);

export type KostenZeile = {
  customerId: string | null;
  adAccountId: string;
  campaignId: string | null;
  campaignName: string | null;
  adSetId: string | null;
  adSetName: string | null;
  adId: string;
  adName: string | null;
  date: Date;
  spend: number;
  impressions: number;
  clicks: number;
  metaLeads: number;
};

export type Zuordnung = {
  /** einziger Inhaber des Kontos (eigenes Werbekonto), sonst null */
  inhaber: string | null;
  /** Anzeige → Kunde (eindeutig), null = mehrdeutig */
  anzeige: Map<string, string | null>;
  /** Kampagne → Kunde (eindeutig), null = mehrdeutig */
  kampagne: Map<string, string | null>;
  /** Startdatum je Kunde (Tagesbeginn Berlin) */
  start: Map<string, Date | null>;
};

export type ZeilenErgebnis = { zeile: KostenZeile } | { skip: "unvollstaendig" | "vorStart" | "ohneStart" };

/** Eine Insights-Zeile in eine Tabellenzeile übersetzen; Kunde zuordnen und Startdatum prüfen. */
export function kostenZeile(accountId: string, r: AdInsightRow, z: Zuordnung): ZeilenErgebnis {
  if (!r.ad_id || !r.date_start || !/^\d{4}-\d{2}-\d{2}$/.test(r.date_start)) return { skip: "unvollstaendig" };
  const date = dayAtNoonUtc(r.date_start);
  const customerId = z.inhaber ?? z.anzeige.get(r.ad_id) ?? (r.campaign_id ? z.kampagne.get(r.campaign_id) : null) ?? null;
  if (customerId) {
    const start = z.start.get(customerId) ?? null;
    if (!start) return { skip: "ohneStart" };
    if (date.getTime() < start.getTime()) return { skip: "vorStart" };
  }
  const num = (v: string | undefined) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    zeile: {
      customerId,
      adAccountId: accountId,
      campaignId: r.campaign_id ?? null,
      campaignName: r.campaign_name?.slice(0, 300) ?? null,
      adSetId: r.adset_id ?? null,
      adSetName: r.adset_name?.slice(0, 300) ?? null,
      adId: r.ad_id,
      adName: r.ad_name?.slice(0, 300) ?? null,
      date,
      spend: Math.round(num(r.spend) * 100) / 100,
      impressions: Math.round(num(r.impressions)),
      clicks: Math.round(num(r.clicks)),
      metaLeads: metaLeadsOf(r),
    },
  };
}

/** Wert → Kunde nur, wenn genau ein Kunde dazu passt (sonst null = mehrdeutig). */
function eindeutig(pairs: { key: string | null | undefined; customerId: string }[]): Map<string, string | null> {
  const m = new Map<string, string | null>();
  for (const { key, customerId } of pairs) {
    if (!key) continue;
    if (!m.has(key)) m.set(key, customerId);
    else if (m.get(key) !== customerId) m.set(key, null);
  }
  return m;
}

/** Anzeige/Kampagne → Kunde aus unseren angelegten Kampagnen und den Leads (nur für Agentur- und geteilte Konten). */
async function ladeZuordnung(): Promise<Pick<Zuordnung, "anzeige" | "kampagne">> {
  const [runs, leadAds, leadCampaigns] = await Promise.all([
    prisma.campaignRun.findMany({ select: { customerId: true, built: true, refreshCampaignId: true } }),
    prisma.lead.groupBy({ by: ["adId", "customerId"], where: { adId: { not: null }, isTest: false } }),
    prisma.lead.groupBy({ by: ["adCampaignId", "customerId"], where: { adCampaignId: { not: null }, isTest: false } }),
  ]);
  const adPairs: { key: string; customerId: string }[] = [];
  const campPairs: { key: string; customerId: string }[] = [];
  for (const r of runs) {
    const b = (r.built ?? {}) as { campaignId?: string; adIds?: string[] };
    const camp = b.campaignId ?? r.refreshCampaignId;
    if (camp) campPairs.push({ key: camp, customerId: r.customerId });
    for (const id of b.adIds ?? []) if (id) adPairs.push({ key: id, customerId: r.customerId });
  }
  for (const l of leadAds) if (l.adId) adPairs.push({ key: l.adId, customerId: l.customerId });
  for (const l of leadCampaigns) if (l.adCampaignId) campPairs.push({ key: l.adCampaignId, customerId: l.customerId });
  return { anzeige: eindeutig(adPairs), kampagne: eindeutig(campPairs) };
}

export type KontoErgebnis = {
  konto: string;
  kunde: string | null;
  agentur: boolean;
  von: string | null;
  bis: string;
  zeilen: number;
  gespeichert: number;
  vorStart: number;
  ohneStart: number;
  ohneKunde: number;
  fehler?: string;
};

export type KostenErgebnis = {
  übersprungen?: string;
  konten: KontoErgebnis[];
  gespeichert: number;
  fehler: number;
};

/**
 * Kosten je Anzeige und Tag abgleichen. `voll`: alle Konten bis 90 Tage zurück (sonst nur beim ersten Lauf eines
 * Kontos). `fetch` ersetzbar für Tests.
 */
export async function syncAnzeigeKosten(opts: { now?: Date; voll?: boolean; fetch?: FetchAdInsights } = {}): Promise<KostenErgebnis> {
  const now = opts.now ?? new Date();
  const fetchRows = opts.fetch ?? fetchAdInsightsDaily;
  if (!opts.fetch && !process.env.META_ACCESS_TOKEN) return { übersprungen: "META_ACCESS_TOKEN fehlt", konten: [], gespeichert: 0, fehler: 0 };

  const kunden = await ladeKundenStarts();
  const startById = new Map<string, Date | null>(kunden.map((k) => [k.id, k.start?.start ?? null]));
  // Eigene Werbekonten: Konto → aktive Inhaber (ruhende Konten verarbeiten wir nicht, lib/ruhend.ts)
  const owners = new Map<string, KundeMitStart[]>();
  for (const k of kunden) {
    const acc = (k.metaAdAccountId ?? "").replace(/^act_/, "").trim();
    if (!/^\d+$/.test(acc) || k.dormant) continue;
    owners.set(acc, [...(owners.get(acc) ?? []), k]);
  }
  // Agentur-Konten: aus META_AD_ACCOUNT_IDS, ohne Konten, die einem Kunden gehören (auch Test-/ruhende Kunden)
  const allOwned = new Set([...(await customerOwnedAdAccounts())].map((a) => a.trim().replace(/^act_/, "")));
  const agentur = (process.env.META_AD_ACCOUNT_IDS ?? "")
    .split(",")
    .map((s) => s.trim().replace(/^act_/, ""))
    .filter((s) => /^\d+$/.test(s) && !allOwned.has(s) && !owners.has(s));

  const today = berlinYmd(now);
  const fensterStart = addDaysYmd(today, -(KOSTEN_FENSTER_TAGE - 1));
  const nachlaufStart = addDaysYmd(today, -(KOSTEN_NACHLAUF_TAGE - 1));
  const maps = await ladeZuordnung();
  const out: KostenErgebnis = { konten: [], gespeichert: 0, fehler: 0 };

  const konten: { id: string; inhaber: KundeMitStart[]; agentur: boolean }[] = [
    ...[...owners.entries()].map(([id, inhaber]) => ({ id, inhaber, agentur: false })),
    ...[...new Set(agentur)].map((id) => ({ id, inhaber: [] as KundeMitStart[], agentur: true })),
  ];
  for (const konto of konten) {
    const einziger = konto.inhaber.length === 1 ? konto.inhaber[0] : null;
    const res: KontoErgebnis = { konto: `act_${konto.id}`, kunde: einziger?.name ?? null, agentur: konto.agentur, von: null, bis: today, zeilen: 0, gespeichert: 0, vorStart: 0, ohneStart: 0, ohneKunde: 0 };
    out.konten.push(res);
    // Eigenes Konto: frühestens ab dem frühesten Startdatum der Inhaber; ohne Startdatum gar nicht
    let von = fensterStart;
    if (!konto.agentur) {
      const starts = konto.inhaber.map((k) => k.start?.start).filter((d): d is Date => !!d);
      if (!starts.length) {
        res.fehler = "kein Startdatum";
        continue;
      }
      const frueh = berlinYmd(new Date(Math.min(...starts.map((d) => d.getTime()))));
      if (frueh > today) {
        res.fehler = "Start in der Zukunft";
        continue;
      }
      if (frueh > von) von = frueh;
    }
    const schonDa = await prisma.adSpendDaily.findFirst({ where: { adAccountId: konto.id }, select: { id: true } });
    if (schonDa && !opts.voll && nachlaufStart > von) von = nachlaufStart;
    res.von = von;
    let rows: AdInsightRow[];
    try {
      rows = await fetchRows(konto.id, von, today);
    } catch (err) {
      res.fehler = redactTokens(err instanceof Error ? err.message : String(err)).slice(0, 300);
      out.fehler++;
      continue;
    }
    res.zeilen = rows.length;
    const z: Zuordnung = { inhaber: einziger?.id ?? null, anzeige: maps.anzeige, kampagne: maps.kampagne, start: startById };
    const data: KostenZeile[] = [];
    for (const r of rows) {
      const e = kostenZeile(konto.id, r, z);
      if ("skip" in e) {
        if (e.skip === "vorStart") res.vorStart++;
        if (e.skip === "ohneStart") res.ohneStart++;
        continue;
      }
      if (!e.zeile.customerId) res.ohneKunde++;
      data.push(e.zeile);
    }
    for (let i = 0; i < data.length; i += 100) {
      const chunk = data.slice(i, i + 100);
      await prisma.$transaction(
        chunk.map((d) =>
          prisma.adSpendDaily.upsert({
            where: { adAccountId_adId_date: { adAccountId: d.adAccountId, adId: d.adId, date: d.date } },
            create: d,
            update: {
              customerId: d.customerId,
              campaignId: d.campaignId,
              campaignName: d.campaignName,
              adSetId: d.adSetId,
              adSetName: d.adSetName,
              adName: d.adName,
              spend: d.spend,
              impressions: d.impressions,
              clicks: d.clicks,
              metaLeads: d.metaLeads,
            },
          }),
        ),
      );
      res.gespeichert += chunk.length;
    }
    out.gespeichert += res.gespeichert;
  }
  return out;
}
