// Rückfüllung der Anzeige am Lead (Ole, 17.11.2026, Datenbasis Baustein 2): einmalig und beliebig wiederholbar.
// Je Kunde NUR Leads (und erneute Einsendungen) ab seinem Startdatum (lib/kunden-start.ts); ältere bleiben unberührt.
// Setzt nur leere Anzeige-Felder, überschreibt nie etwas und fragt bei Meta keine Personendaten ab.
//
// Quellen, in dieser Reihenfolge (erster belegter Wert je Feld gewinnt):
//   1. Meta-Lead-Abruf per Lead-ID (externalId), nur Leads der letzten 90 Tage (so lange hält Meta sie)
//   2. Lead-Eingang (UnassignedLead.payload) desselben Leads: Kampagnen-/Anzeigenname, Formular
//   3. Einwilligungsnachweis consentData.formId bzw. LeadReentry.formId → Formular
//   4. Unsere selbst angelegten Kampagnen (CampaignRun.built): Formular → Kampagne, bei genau einer Anzeigengruppe
//      bzw. Anzeige auch diese
// Trockenlauf: zählt nur (ohne Meta-Abruf), schreibt nichts.

import { prisma } from "@/lib/prisma";
import { fetchMetaLeadAd, redactTokens, type MetaLeadAd } from "@/lib/meta-leads";
import { AD_FIELDS, adFromMetaLead, cleanAd, fillEmptyAd, mergeAd, type LeadAd } from "@/lib/anzeige";
import { ladeKundenStarts, type StartQuelle } from "@/lib/kunden-start";

const DAY = 86_400_000;
export const META_LEAD_TAGE = 90;

export type FetchLeadAd = (leadgenId: string) => Promise<MetaLeadAd>;

export type RueckfuellungKunde = {
  customerId: string;
  name: string;
  start: string | null;
  quelle: StartQuelle | null;
  leads: number;
  ohneAnzeige: number;
  aktualisiert: number;
};

export type RueckfuellungErgebnis = {
  dryRun: boolean;
  kunden: RueckfuellungKunde[];
  ohneStartdatum: number;
  leads: { geprueft: number; aktualisiert: number; felder: Record<string, number> };
  einsendungen: { geprueft: number; aktualisiert: number };
  /** abfragen: im Trockenlauf die Zahl der Leads, die bei Meta abgefragt würden */
  meta: { abfragen: number; ok: number; fehler: number; abgebrochen: boolean; aelterAls90Tage: number };
  quellen: { meta: number; eingang: number; formular: number; kampagne: number };
  fehler: string[];
};

type Zeile = LeadAd & { id: string; customerId: string; createdAt: Date; externalId: string | null; formId: string | null };

/** Meta-Lead-IDs sind Ziffern (Perspective: „perspective:…“, Airtable: keine). */
export const isMetaLeadId = (id: string | null | undefined): id is string => !!id && /^\d{6,}$/.test(id);

const needsMeta = (r: Partial<LeadAd>) => !r.adId || !r.adSetId || !r.adCampaignId || !r.adPlatform;

/** Formular → Kampagne (und eindeutige Anzeigengruppe/Anzeige) aus unseren angelegten Kampagnen, je Kunde. */
export function kampagnenNachFormular(runs: { customerId: string; built: unknown; refreshCampaignId?: string | null }[]): Map<string, Partial<LeadAd>> {
  const acc = new Map<string, { customerId: string; campaigns: Set<string>; sets: Set<string>; ads: Set<string> }>();
  for (const r of runs) {
    const b = (r.built ?? {}) as { campaignId?: string; formId?: string; adSetIds?: string[]; adIds?: string[] };
    if (!b.formId) continue;
    const key = `${r.customerId}|${b.formId}`;
    const e = acc.get(key) ?? { customerId: r.customerId, campaigns: new Set(), sets: new Set(), ads: new Set() };
    const camp = b.campaignId ?? r.refreshCampaignId ?? null;
    if (camp) e.campaigns.add(camp);
    for (const s of b.adSetIds ?? []) if (s) e.sets.add(s);
    for (const a of b.adIds ?? []) if (a) e.ads.add(a);
    acc.set(key, e);
  }
  const out = new Map<string, Partial<LeadAd>>();
  for (const [key, e] of acc) {
    const one = (s: Set<string>) => (s.size === 1 ? [...s][0] : null);
    out.set(key, cleanAd({ adFormId: key.split("|")[1], adCampaignId: one(e.campaigns), adSetId: one(e.sets), adId: one(e.ads) }));
  }
  return out;
}

/** Anzeige aus einem gespeicherten Lead-Eingang (IncomingLead, alt oder neu). */
export function adFromUnassignedPayload(payload: unknown): Partial<LeadAd> {
  const p = (payload ?? {}) as { ad?: Partial<LeadAd> | null; formId?: string | null; campaignName?: string | null; adName?: string | null };
  return mergeAd(cleanAd(p.ad ?? null), cleanAd({ adFormId: p.formId, adCampaignName: p.campaignName, adName: p.adName }));
}

/** Nur Felder setzen, die (noch) leer sind: Bedingung „Feld IS NULL“ je gesetztem Feld (auch gegen Gleichzeitiges). */
const emptyWhere = (patch: Partial<LeadAd>) => Object.fromEntries(Object.keys(patch).map((k) => [k, null]));

export async function fuelleAnzeigenNach(opts: { dryRun?: boolean; now?: Date; fetch?: FetchLeadAd; maxMeta?: number; customerIds?: string[] } = {}): Promise<RueckfuellungErgebnis> {
  const dryRun = opts.dryRun ?? true;
  const now = opts.now ?? new Date();
  const metaAb = new Date(now.getTime() - META_LEAD_TAGE * DAY);
  const fetchAd = opts.fetch ?? (process.env.META_ACCESS_TOKEN ? fetchMetaLeadAd : null);
  const maxMeta = opts.maxMeta ?? 5000;
  const res: RueckfuellungErgebnis = {
    dryRun,
    kunden: [],
    ohneStartdatum: 0,
    leads: { geprueft: 0, aktualisiert: 0, felder: Object.fromEntries(AD_FIELDS.map((k) => [k, 0])) },
    einsendungen: { geprueft: 0, aktualisiert: 0 },
    meta: { abfragen: 0, ok: 0, fehler: 0, abgebrochen: !fetchAd && !dryRun, aelterAls90Tage: 0 },
    quellen: { meta: 0, eingang: 0, formular: 0, kampagne: 0 },
    fehler: [],
  };

  const kunden = await ladeKundenStarts(opts.customerIds ? { ids: opts.customerIds } : {});
  const runs = await prisma.campaignRun.findMany({ select: { customerId: true, built: true, refreshCampaignId: true } });
  const kampagne = kampagnenNachFormular(runs);

  // Meta-Abruf mit Abbruch, wenn die ersten Abrufe alle scheitern (Token/Berechtigung)
  let metaFehlerInFolge = 0;
  const metaAd = async (externalId: string): Promise<Partial<LeadAd> | null> => {
    if (dryRun) {
      // Trockenlauf: nur zählen, was abgefragt würde
      res.meta.abfragen++;
      return null;
    }
    if (!fetchAd || res.meta.abgebrochen || res.meta.abfragen >= maxMeta) return null;
    res.meta.abfragen++;
    try {
      const l = await fetchAd(externalId);
      res.meta.ok++;
      metaFehlerInFolge = 0;
      return adFromMetaLead(l);
    } catch (err) {
      res.meta.fehler++;
      metaFehlerInFolge++;
      if (res.fehler.length < 10) res.fehler.push(redactTokens(err instanceof Error ? err.message : String(err)).slice(0, 200));
      if (metaFehlerInFolge >= 10 && res.meta.ok === 0) res.meta.abgebrochen = true;
      return null;
    }
  };

  /** Anzeige für eine Zeile aus allen Quellen zusammenstellen (zählt Quellen mit). */
  const sammle = async (z: Zeile, payload: unknown): Promise<LeadAd> => {
    const teile: { quelle: keyof RueckfuellungErgebnis["quellen"]; ad: Partial<LeadAd> | null }[] = [];
    if (isMetaLeadId(z.externalId) && needsMeta(z)) {
      if (z.createdAt.getTime() >= metaAb.getTime()) teile.push({ quelle: "meta", ad: await metaAd(z.externalId) });
      else res.meta.aelterAls90Tage++;
    }
    if (payload) teile.push({ quelle: "eingang", ad: adFromUnassignedPayload(payload) });
    if (z.formId) teile.push({ quelle: "formular", ad: cleanAd({ adFormId: z.formId }) });
    const formId = z.adFormId ?? z.formId ?? teile.find((t) => t.ad?.adFormId)?.ad?.adFormId ?? null;
    if (formId) teile.push({ quelle: "kampagne", ad: kampagne.get(`${z.customerId}|${formId}`) ?? null });
    let current: Partial<LeadAd> = { ...z };
    for (const t of teile) {
      if (!t.ad) continue;
      const patch = fillEmptyAd(current, t.ad);
      if (Object.keys(patch).length) {
        res.quellen[t.quelle]++;
        current = { ...current, ...patch };
      }
    }
    return mergeAd(current);
  };

  const AD_SELECT = Object.fromEntries(AD_FIELDS.map((k) => [k, true])) as Record<(typeof AD_FIELDS)[number], true>;
  for (const k of kunden) {
    if (!k.start) {
      res.ohneStartdatum++;
      continue;
    }
    const start = k.start.start;
    const row: RueckfuellungKunde = { customerId: k.id, name: k.name, start: start.toISOString(), quelle: k.start.quelle, leads: 0, ohneAnzeige: 0, aktualisiert: 0 };
    res.kunden.push(row);
    const leads = await prisma.lead.findMany({
      where: { customerId: k.id, isTest: false, createdAt: { gte: start } },
      select: { id: true, customerId: true, createdAt: true, externalId: true, consentData: true, ...AD_SELECT },
      orderBy: { createdAt: "asc" },
    });
    row.leads = leads.length;
    const offen = leads.filter((l) => !l.adId);
    row.ohneAnzeige = offen.length;
    const zuFuellen = leads.filter((l) => AD_FIELDS.some((f) => !l[f]));
    const extIds = zuFuellen.map((l) => l.externalId).filter((x): x is string => !!x);
    const eingang = extIds.length
      ? new Map((await prisma.unassignedLead.findMany({ where: { externalId: { in: extIds } }, select: { externalId: true, payload: true } })).map((u) => [u.externalId!, u.payload]))
      : new Map<string, unknown>();
    for (const l of zuFuellen) {
      res.leads.geprueft++;
      const consentFormId = ((l.consentData ?? {}) as { formId?: unknown }).formId;
      const z: Zeile = { ...l, formId: typeof consentFormId === "string" ? consentFormId : null };
      const info = await sammle(z, l.externalId ? eingang.get(l.externalId) : null);
      const patch = fillEmptyAd(l, info);
      if (!Object.keys(patch).length) continue;
      for (const f of Object.keys(patch)) res.leads.felder[f]++;
      res.leads.aktualisiert++;
      row.aktualisiert++;
      if (!dryRun) {
        await prisma.lead.updateMany({ where: { id: l.id, ...emptyWhere(patch) }, data: patch }).catch((err) => {
          if (res.fehler.length < 10) res.fehler.push(`Lead ${l.id}: ${err instanceof Error ? err.message.slice(0, 120) : "Fehler"}`);
        });
      }
    }

    // Erneute Einsendungen desselben Kunden ab Startdatum
    const reentries = await prisma.leadReentry.findMany({
      where: { customerId: k.id, createdAt: { gte: start }, lead: { isTest: false } },
      select: { id: true, customerId: true, createdAt: true, externalId: true, formId: true, ...AD_SELECT },
    });
    for (const r of reentries.filter((x) => AD_FIELDS.some((f) => !x[f]))) {
      res.einsendungen.geprueft++;
      const info = await sammle(r, null);
      const patch = fillEmptyAd(r, info);
      if (!Object.keys(patch).length) continue;
      res.einsendungen.aktualisiert++;
      if (!dryRun) {
        await prisma.leadReentry.updateMany({ where: { id: r.id, ...emptyWhere(patch) }, data: patch }).catch((err) => {
          if (res.fehler.length < 10) res.fehler.push(`Einsendung ${r.id}: ${err instanceof Error ? err.message.slice(0, 120) : "Fehler"}`);
        });
      }
    }
  }
  return res;
}
