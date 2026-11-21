import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { fromMetaLead, ingestLead } from "@/lib/lead-intake";
import { ingestPoolLead } from "@/lib/ppl/engine";
import { adFromTracking } from "@/lib/anzeige";
import { fuelleAnzeigenNach } from "@/lib/anzeige-rueckfuellung";
import { berlinYmd, syncAnzeigeKosten, type FetchAdInsights } from "@/lib/anzeige-kosten";
import type { MetaLeadAd } from "@/lib/meta-leads";
import type { AdInsightRow } from "@/lib/meta";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const DAY = 86_400_000;
const rnd = () => String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
const metaId = () => `9${rnd()}${rnd()}`;

describe("Anzeige am Lead: Eingang", () => {
  let customerId = "";
  const formId = `form-${rnd()}`;
  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer()).id;
    await prisma.leadSource.create({ data: { formId, customerId, productKey: "Privatschutz" } });
  });
  afterAll(async () => {
    await prisma.lead.deleteMany({ where: { customerId } });
    await prisma.leadSource.deleteMany({ where: { customerId } });
    await cleanupCustomer(customerId);
  });

  it("Meta-Lead: Anzeige landet am Lead, erneute Einsendung an der Einsendung, Lead behält die erste Anzeige", async () => {
    const phone = `0171${rnd().slice(0, 7)}`;
    const meta = (id: string, ad: string) => ({
      id,
      created_time: new Date().toISOString(),
      form_id: formId,
      platform: "fb",
      campaign_id: "c-1",
      campaign_name: "Kampagne 1",
      adset_id: "s-1",
      adset_name: "Gruppe 1",
      ad_id: ad,
      ad_name: `Anzeige ${ad}`,
      field_data: [
        { name: "full_name", values: ["Erna Anzeige"] },
        { name: "phone_number", values: [phone] },
      ],
    });
    const first = await ingestLead(fromMetaLead(meta(metaId(), "a-1"), "p"), "meta");
    expect(first.status).toBe("created");
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: first.leadId! } });
    expect(lead).toMatchObject({ adPlatform: "fb", adFormId: formId, adCampaignId: "c-1", adCampaignName: "Kampagne 1", adSetId: "s-1", adSetName: "Gruppe 1", adId: "a-1", adName: "Anzeige a-1" });

    const again = await ingestLead(fromMetaLead(meta(metaId(), "a-2"), "p"), "meta");
    expect(again.status).toBe("reentry");
    const re = await prisma.leadReentry.findFirstOrThrow({ where: { leadId: lead.id } });
    expect(re).toMatchObject({ adId: "a-2", adCampaignId: "c-1", adFormId: formId });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).adId).toBe("a-1");
  });
});

describe("Anzeige am Lead: Perspective-Funnel (Pay-per-Lead)", () => {
  let customerId = "";
  const product = `PKV-Anzeige-${rnd().slice(0, 5)}`;
  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer()).id;
    await prisma.leadSubscription.create({ data: { customerId, productKey: product, price: 40, period: "month", goal: 5, delivery: "email", deliveryEmail: "x@test.local" } });
  });
  afterAll(async () => {
    await prisma.poolLead.deleteMany({ where: { productKey: product } });
    await cleanupCustomer(customerId);
  });

  it("UTM aus dem Funnel geht über den Pool-Lead an den gelieferten Lead", async () => {
    const body = { id: rnd(), values: { utm_source: "facebook", utm_campaign: "PKV Funnel", utm_content: "120200000777" } };
    const r = await ingestPoolLead({
      productKey: product,
      via: "perspective",
      fields: { vorname: "Pia", nachname: "Funnel", telefon: `01512${rnd().slice(0, 7)}`, email: `pia-${rnd()}@test.local`, postleitzahl: "80331" },
      ad: adFromTracking(body),
    });
    expect(r.status).toBe("delivered");
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: r.leadId! } });
    expect(lead).toMatchObject({ adPlatform: "fb", adCampaignName: "PKV Funnel", adId: "120200000777" });
    const pool = await prisma.poolLead.findUniqueOrThrow({ where: { id: r.poolLeadId } });
    expect(JSON.stringify(pool.adInfo)).not.toContain("Pia");
  });
});

describe("Rückfüllung", () => {
  const now = new Date();
  const start = new Date(now.getTime() - 30 * DAY);
  let withStart = "";
  let noStart = "";
  const ids: Record<string, string> = {};
  const ext: Record<string, string> = {};
  const formId = `f-${rnd()}`;
  const calls: string[] = [];
  const fakeMeta = async (id: string): Promise<MetaLeadAd> => {
    calls.push(id);
    return { id, created_time: now.toISOString(), form_id: formId, platform: "ig", campaign_id: "mc", campaign_name: "Meta-Kampagne", adset_id: "ms", adset_name: "Meta-Gruppe", ad_id: `ad-${id}`, ad_name: "Meta-Anzeige" };
  };

  beforeAll(async () => {
    requireTestDb();
    withStart = (await makeCustomer({ retainerStart: start })).id;
    noStart = (await makeCustomer()).id;
    const mk = async (key: string, customerId: string, createdAt: Date, extra: Record<string, unknown> = {}) => {
      ext[key] = metaId();
      ids[key] = (await prisma.lead.create({ data: { customerId, createdAt, externalId: ext[key], name: "Person", consentData: { formId }, ...extra } })).id;
    };
    await mk("vorStart", withStart, new Date(start.getTime() - 2 * DAY));
    await mk("neu", withStart, new Date(now.getTime() - 5 * DAY));
    await mk("teilweise", withStart, new Date(now.getTime() - 4 * DAY), { adName: "Von Hand", adCampaignName: "Bestehend" });
    await mk("ohneStart", noStart, new Date(now.getTime() - 5 * DAY));
    // Unsere angelegte Kampagne zum Formular (für Leads ohne Meta-Treffer)
    await prisma.campaignRun.create({ data: { customerId: withStart, product: "PKV", steps: [], built: { campaignId: "eigene-c", formId, adSetIds: ["eigene-s"], adIds: ["x1", "x2"], imageHashes: [], creativeIds: [] } } });
    await prisma.leadReentry.create({ data: { leadId: ids.neu, customerId: withStart, externalId: metaId(), formId, createdAt: new Date(now.getTime() - DAY) } });
  });
  afterAll(async () => {
    await prisma.lead.deleteMany({ where: { customerId: { in: [withStart, noStart] } } });
    await prisma.campaignRun.deleteMany({ where: { customerId: withStart } });
    await cleanupCustomer(withStart);
    await cleanupCustomer(noStart);
  });

  it("Trockenlauf: zählt, ruft Meta nicht ab, schreibt nichts", async () => {
    const r = await fuelleAnzeigenNach({ dryRun: true, now, fetch: fakeMeta, customerIds: [withStart, noStart] });
    expect(calls).toHaveLength(0);
    expect(r.ohneStartdatum).toBe(1);
    expect(r.kunden.map((k) => k.customerId)).toEqual([withStart]);
    expect(r.leads.geprueft).toBe(2);
    expect(r.meta.abfragen).toBe(3); // 2 Leads + 1 Einsendung
    expect(await prisma.lead.count({ where: { id: { in: Object.values(ids) }, NOT: { adFormId: null } } })).toBe(0);
  });

  it("füllt nur Leads ab Startdatum, nur leere Felder, Meta vor eigener Kampagne", async () => {
    const r = await fuelleAnzeigenNach({ dryRun: false, now, fetch: fakeMeta, customerIds: [withStart, noStart] });
    expect(r.leads.aktualisiert).toBe(2);
    expect(r.einsendungen.aktualisiert).toBe(1);
    expect(calls).toHaveLength(3);
    expect(calls).toEqual(expect.arrayContaining([ext.neu, ext.teilweise]));
    expect(calls).not.toContain(ext.vorStart);
    expect(calls).not.toContain(ext.ohneStart);

    const neu = await prisma.lead.findUniqueOrThrow({ where: { id: ids.neu } });
    expect(neu).toMatchObject({ adPlatform: "ig", adFormId: formId, adCampaignId: "mc", adCampaignName: "Meta-Kampagne", adSetId: "ms", adId: `ad-${ext.neu}` });
    const teil = await prisma.lead.findUniqueOrThrow({ where: { id: ids.teilweise } });
    expect(teil.adName).toBe("Von Hand");
    expect(teil.adCampaignName).toBe("Bestehend");
    expect(teil.adId).toBe(`ad-${ext.teilweise}`);
    expect(teil.name).toBe("Person");

    for (const key of ["vorStart", "ohneStart"]) {
      const l = await prisma.lead.findUniqueOrThrow({ where: { id: ids[key] } });
      expect([l.adFormId, l.adCampaignId, l.adId, l.adPlatform]).toEqual([null, null, null, null]);
    }
    const re = await prisma.leadReentry.findFirstOrThrow({ where: { leadId: ids.neu } });
    expect(re.adCampaignId).toBe("mc");
  });

  it("Meta liefert nichts: Formular und eigene Kampagne; Wiederholung überschreibt nichts", async () => {
    const old = await prisma.lead.create({ data: { customerId: withStart, createdAt: new Date(now.getTime() - 20 * DAY), externalId: metaId(), consentData: { formId } } });
    calls.length = 0;
    const failing = async (): Promise<MetaLeadAd> => {
      throw new Error("Meta: Lead nicht mehr verfügbar");
    };
    const r = await fuelleAnzeigenNach({ dryRun: false, now, fetch: failing, customerIds: [withStart] });
    expect(r.meta.fehler).toBe(1);
    const l = await prisma.lead.findUniqueOrThrow({ where: { id: old.id } });
    expect(l).toMatchObject({ adFormId: formId, adCampaignId: "eigene-c", adSetId: "eigene-s", adId: null });

    const before = await prisma.lead.findMany({ where: { customerId: withStart }, orderBy: { id: "asc" } });
    const again = await fuelleAnzeigenNach({ dryRun: false, now, fetch: fakeMeta, customerIds: [withStart] });
    const after = await prisma.lead.findMany({ where: { customerId: withStart }, orderBy: { id: "asc" } });
    // Nur der Lead ohne Anzeige wird erneut bei Meta abgefragt und bekommt fehlende Felder; nichts wird überschrieben
    for (const b of before) {
      const a = after.find((x) => x.id === b.id)!;
      for (const k of ["adPlatform", "adFormId", "adCampaignId", "adCampaignName", "adSetId", "adSetName", "adId", "adName"] as const) {
        if (b[k]) expect(a[k]).toBe(b[k]);
      }
    }
    expect(again.leads.aktualisiert).toBeLessThanOrEqual(1);
  });

  it("Diagnose q=anzeige-abdeckung: Abdeckung je Kunde ab Startdatum, ohne Personendaten, schreibt nichts", async () => {
    const { anzeigeAbdeckung } = await import("@/lib/ops/anzeige-abdeckung");
    const before = await prisma.lead.findMany({ where: { customerId: withStart }, orderBy: { id: "asc" } });
    const out = (await anzeigeAbdeckung(new URLSearchParams("rueckfuellung=1"))) as {
      kunden: { kundeId: string; leads: number; mitAnzeigeId: { n: number }; kosten: { vorhanden: boolean } }[];
      gesamt: { ohneStartdatum: { kundeId: string }[] };
    };
    const k = out.kunden.find((x) => x.kundeId === withStart)!;
    expect(k.leads).toBe(3); // ohne den Lead vor dem Startdatum
    expect(k.mitAnzeigeId.n).toBe(3);
    expect(k.kosten.vorhanden).toBe(false);
    expect(out.gesamt.ohneStartdatum.map((x) => x.kundeId)).toContain(noStart);
    expect(JSON.stringify(out)).not.toMatch(/Person|Erna|Pia/);
    expect(await prisma.lead.findMany({ where: { customerId: withStart }, orderBy: { id: "asc" } })).toEqual(before);
  });
});

describe("Kosten je Anzeige und Tag", () => {
  const now = new Date();
  const today = berlinYmd(now);
  const ymd = (daysAgo: number) => berlinYmd(new Date(now.getTime() - daysAgo * DAY));
  const account = `7${rnd()}`;
  const agency = `8${rnd()}`;
  let customerId = "";
  let poolCustomer = "";
  const prevEnv = process.env.META_AD_ACCOUNT_IDS;
  const requests: { acc: string; since: string; until: string }[] = [];
  let spend = "10.00";
  const fake: FetchAdInsights = async (acc, since, until) => {
    requests.push({ acc, since, until });
    const days = [40, 20, 3, 1];
    if (acc === account) {
      return days.flatMap((d): AdInsightRow[] => [
        { ad_id: "kad-1", ad_name: "Bild 1", adset_id: "ks", adset_name: "Gruppe", campaign_id: "kc", campaign_name: "Kampagne", spend, impressions: "500", clicks: "9", actions: [{ action_type: "lead", value: "2" }], date_start: ymd(d) },
        // Alte Kampagne im selben Konto, nicht mit der App verbunden (Ole, 21.11.2026): zählt nicht
        { ad_id: "alt-ad", campaign_id: "alt-c", campaign_name: "Alte Kampagne", spend: "99", date_start: ymd(d) },
      ]).filter((r) => r.date_start! >= since && r.date_start! <= until);
    }
    if (acc === agency) {
      return [
        { ad_id: "pool-ad", campaign_id: "pool-c", spend: "5", date_start: ymd(2) },
        { ad_id: "kunden-ad", campaign_id: "x", spend: "7", date_start: ymd(2) },
      ];
    }
    return [];
  };

  beforeAll(async () => {
    requireTestDb();
    // Start vor 30 Tagen: die Zeile von vor 40 Tagen darf nicht gespeichert werden
    customerId = (await makeCustomer({ metaAdAccountId: account, retainerStart: new Date(now.getTime() - 30 * DAY) })).id;
    poolCustomer = (await makeCustomer({ retainerStart: new Date(now.getTime() - 10 * DAY) })).id;
    await prisma.lead.create({ data: { customerId: poolCustomer, adId: "kunden-ad" } });
    // Kampagne „kc“ liefert Leads in die App, ist also verbunden
    await prisma.lead.create({ data: { customerId, adCampaignId: "kc" } });
    process.env.META_AD_ACCOUNT_IDS = `act_${agency}`;
  });
  afterAll(async () => {
    process.env.META_AD_ACCOUNT_IDS = prevEnv;
    await prisma.adSpendDaily.deleteMany({ where: { adAccountId: { in: [account, agency] } } });
    await prisma.lead.deleteMany({ where: { customerId: { in: [poolCustomer, customerId] } } });
    await cleanupCustomer(customerId);
    await cleanupCustomer(poolCustomer);
  });

  it("erster Lauf: bis 90 Tage zurück, nicht vor dem Startdatum; Agentur-Konto über die Leads zugeordnet", async () => {
    const r = await syncAnzeigeKosten({ now, fetch: fake });
    const own = requests.find((q) => q.acc === account)!;
    expect(own.until).toBe(today);
    expect(own.since).toBe(ymd(30)); // Startdatum statt 90 Tage
    const rows = await prisma.adSpendDaily.findMany({ where: { adAccountId: account }, orderBy: { date: "asc" } });
    expect(rows.map((x) => berlinYmd(x.date))).toEqual([ymd(20), ymd(3), ymd(1)]);
    expect(rows.every((x) => x.customerId === customerId && Number(x.spend) === 10 && x.metaLeads === 2 && x.clicks === 9)).toBe(true);
    const ag = await prisma.adSpendDaily.findMany({ where: { adAccountId: agency } });
    expect(ag.find((x) => x.adId === "kunden-ad")?.customerId).toBe(poolCustomer);
    expect(ag.find((x) => x.adId === "pool-ad")?.customerId).toBeNull();
    expect(r.konten.find((k) => k.konto === `act_${account}`)?.gespeichert).toBe(3);
    expect(r.konten.find((k) => k.konto === `act_${account}`)?.nichtVerbunden).toBe(3);
    expect(rows.some((x) => x.campaignId === "alt-c")).toBe(false);
  });

  it("zweiter Lauf: nur die letzten 7 Tage, idempotent, korrigierte Werte werden übernommen", async () => {
    requests.length = 0;
    spend = "11.50";
    await syncAnzeigeKosten({ now, fetch: fake });
    expect(requests.find((q) => q.acc === account)!.since).toBe(ymd(6));
    const rows = await prisma.adSpendDaily.findMany({ where: { adAccountId: account }, orderBy: { date: "asc" } });
    expect(rows).toHaveLength(3);
    expect(rows.map((x) => Number(x.spend))).toEqual([10, 11.5, 11.5]);
    // voll: wieder ab Startdatum, weiterhin keine doppelten Zeilen
    requests.length = 0;
    await syncAnzeigeKosten({ now, fetch: fake, voll: true });
    expect(requests.find((q) => q.acc === account)!.since).toBe(ymd(30));
    expect(await prisma.adSpendDaily.count({ where: { adAccountId: account } })).toBe(3);
  });
});
