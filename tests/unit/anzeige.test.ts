import { describe, expect, it } from "vitest";
import { adFromFlat, adFromMetaLead, adFromTracking, cleanAd, emptyAd, fillEmptyAd, mergeAd, normPlatform } from "@/lib/anzeige";
import { fromFlatPayload, fromMetaLead } from "@/lib/lead-intake";
import { kundenStart } from "@/lib/kunden-start";
import { kostenZeile, metaLeadsOf, type Zuordnung } from "@/lib/anzeige-kosten";
import { adFromUnassignedPayload, isMetaLeadId, kampagnenNachFormular } from "@/lib/anzeige-rueckfuellung";

const META_LEAD = {
  id: "1234567890123",
  created_time: "2026-11-10T09:00:00+0000",
  form_id: "555000111",
  platform: "ig",
  campaign_id: "120200000001",
  campaign_name: "PKV Wechsel | Leads",
  adset_id: "120200000002",
  adset_name: "Berlin 30-55",
  ad_id: "120200000003",
  ad_name: "Bild A",
  field_data: [{ name: "full_name", values: ["Julia Muster"] }],
};

describe("Anzeige aus Meta-Payload", () => {
  it("übernimmt Plattform, Formular, Kampagne, Anzeigengruppe und Anzeige", () => {
    expect(adFromMetaLead(META_LEAD)).toEqual({
      adPlatform: "ig",
      adFormId: "555000111",
      adCampaignId: "120200000001",
      adCampaignName: "PKV Wechsel | Leads",
      adSetId: "120200000002",
      adSetName: "Berlin 30-55",
      adId: "120200000003",
      adName: "Bild A",
    });
  });

  it("fromMetaLead reicht die Anzeige durch, ohne Personendaten in der Anzeige", () => {
    const inc = fromMetaLead(META_LEAD, "page-1");
    expect(inc.ad?.adId).toBe("120200000003");
    expect(inc.ad?.adSetId).toBe("120200000002");
    expect(JSON.stringify(inc.ad)).not.toContain("Julia");
    // Bisherige Felder bleiben
    expect(inc.campaignName).toBe("PKV Wechsel | Leads");
    expect(inc.fields.full_name).toBe("Julia Muster");
  });

  it("organischer Lead ohne Anzeige: nur Formular und Plattform", () => {
    const a = adFromMetaLead({ form_id: "9", platform: "fb" });
    expect(a).toEqual({ ...emptyAd(), adFormId: "9", adPlatform: "fb" });
  });

  it("Zapier (flach): ad_id, adset_id, campaign_id, form_id, platform; nicht in den Formularangaben", () => {
    const inc = fromFlatPayload({
      leadgen_id: "777",
      form_id: "f1",
      ad_id: "a1",
      ad_name: "Anzeige 1",
      adset_id: "s1",
      adset_name: "Gruppe 1",
      campaign_id: "c1",
      campaign_name: "Kampagne 1",
      platform: "Facebook",
      full_name: "Max Muster",
    });
    expect(inc.ad).toEqual({ adPlatform: "fb", adFormId: "f1", adCampaignId: "c1", adCampaignName: "Kampagne 1", adSetId: "s1", adSetName: "Gruppe 1", adId: "a1", adName: "Anzeige 1" });
    expect(Object.keys(inc.fields)).toEqual(["full_name"]);
  });

  it("Zapier mit anderer Schreibweise (Ad ID, Campaign Name)", () => {
    expect(adFromFlat({ "Ad ID": "a2", "Campaign Name": "K2", "Adset Id": "s2" })).toMatchObject({ adId: "a2", adCampaignName: "K2", adSetId: "s2" });
  });
});

describe("Anzeige aus Funnel (Perspective/UTM)", () => {
  it("UTM nach Meta-Vorschlag: campaign, term = Anzeigengruppe, content = Anzeige, source = Plattform", () => {
    const body = {
      id: "p1",
      profile: { firstName: { value: "Julia" }, email: { value: "j@example.com" } },
      values: { phone: "0171", utm_source: "facebook", utm_campaign: "PKV Herbst", utm_term: "Gruppe B", utm_content: "120200000009" },
    };
    const a = adFromTracking(body);
    expect(a).toEqual({ ...emptyAd(), adPlatform: "fb", adCampaignName: "PKV Herbst", adSetName: "Gruppe B", adId: "120200000009" });
    expect(JSON.stringify(a)).not.toMatch(/Julia|example|0171/);
  });

  it("ausdrückliche IDs in metadata.utm gehen vor; Platzhalter {{ad.id}} werden verworfen", () => {
    const a = adFromTracking({ metadata: { utm: { campaign_id: "c9", ad_id: "{{ad.id}}", utm_campaign: "Name" } } });
    expect(a.adCampaignId).toBe("c9");
    expect(a.adId).toBeNull();
    expect(a.adCampaignName).toBe("Name");
  });

  it("ohne Tracking: leer", () => {
    expect(adFromTracking({ id: "x", values: { phone: "1" } })).toEqual(emptyAd());
  });
});

describe("Hilfen", () => {
  it("normPlatform", () => {
    expect(normPlatform("Instagram")).toBe("ig");
    expect(normPlatform("FB")).toBe("fb");
    expect(normPlatform("")).toBeNull();
    expect(normPlatform("google")).toBe("google");
  });

  it("fillEmptyAd setzt nur leere Felder, mergeAd nimmt den ersten Wert", () => {
    const current = { ...emptyAd(), adId: "alt", adName: "Alt" };
    const patch = fillEmptyAd(current, { ...emptyAd(), adId: "neu", adName: "Neu", adSetId: "s" });
    expect(patch).toEqual({ adSetId: "s" });
    expect(mergeAd({ adId: "a" }, { adId: "b", adName: "n" })).toMatchObject({ adId: "a", adName: "n" });
  });

  it("cleanAd kürzt und verwirft leere Werte", () => {
    const a = cleanAd({ adId: " 123 ", adName: "x".repeat(400), adSetId: "" });
    expect(a.adId).toBe("123");
    expect(a.adName).toHaveLength(300);
    expect(a.adSetId).toBeNull();
  });

  it("Lead-Eingang (alt und neu) → Anzeige", () => {
    expect(adFromUnassignedPayload({ formId: "f", campaignName: "K", adName: "A" })).toMatchObject({ adFormId: "f", adCampaignName: "K", adName: "A" });
    expect(adFromUnassignedPayload({ formId: "f", ad: { adId: "1", adCampaignName: "Neu" }, campaignName: "Alt" })).toMatchObject({ adId: "1", adCampaignName: "Neu" });
  });

  it("isMetaLeadId", () => {
    expect(isMetaLeadId("1234567890")).toBe(true);
    expect(isMetaLeadId("perspective:abc")).toBe(false);
    expect(isMetaLeadId(null)).toBe(false);
  });

  it("eigene Kampagnen: Formular → Kampagne, Anzeigengruppe/Anzeige nur wenn eindeutig", () => {
    const m = kampagnenNachFormular([
      { customerId: "k1", built: { campaignId: "c1", formId: "f1", adSetIds: ["s1"], adIds: ["a1", "a2"] } },
      { customerId: "k2", built: { formId: "f2" }, refreshCampaignId: "c2" },
      { customerId: "k3", built: null },
    ]);
    expect(m.get("k1|f1")).toMatchObject({ adFormId: "f1", adCampaignId: "c1", adSetId: "s1", adId: null });
    expect(m.get("k2|f2")).toMatchObject({ adCampaignId: "c2" });
    expect(m.size).toBe(2);
  });
});

describe("Startdatum je Kunde", () => {
  it("frühester gesetzter Startpunkt, Tagesbeginn Berlin", () => {
    const s = kundenStart({
      liveAt: new Date("2026-10-20T10:00:00Z"),
      retainerStart: new Date("2026-10-05T12:00:00Z"),
      productStarts: [new Date("2026-10-10T12:00:00Z"), null],
    });
    expect(s?.quelle).toBe("retainer");
    expect(s?.start.toISOString()).toBe("2026-10-04T22:00:00.000Z");
  });

  it("ohne Startpunkt: null", () => {
    expect(kundenStart({ productStarts: [null] })).toBeNull();
  });
});

describe("Kosten je Anzeige: Zeile", () => {
  const z: Zuordnung = {
    inhaber: null,
    anzeige: new Map([["a1", "k1"], ["a2", null]]),
    kampagne: new Map([["c3", "k3"]]),
    start: new Map<string, Date | null>([["k1", new Date("2026-11-01T23:00:00Z")], ["k3", null]]),
  };
  const row = { ad_id: "a1", ad_name: "A", adset_id: "s", campaign_id: "c", spend: "12.345", impressions: "1000", clicks: "17", actions: [{ action_type: "lead", value: "3" }, { action_type: "onsite_conversion.lead_grouped", value: "3" }] };

  it("ordnet über die Anzeige zu und rechnet Zahlen", () => {
    const r = kostenZeile("999", { ...row, date_start: "2026-11-05" }, z);
    expect("zeile" in r && r.zeile).toMatchObject({ customerId: "k1", adAccountId: "999", spend: 12.35, impressions: 1000, clicks: 17, metaLeads: 3 });
  });

  it("vor dem Startdatum des Kunden: übersprungen (Start 02.11. Berlin)", () => {
    expect(kostenZeile("999", { ...row, date_start: "2026-11-01" }, z)).toEqual({ skip: "vorStart" });
    expect("zeile" in kostenZeile("999", { ...row, date_start: "2026-11-02" }, z)).toBe(true);
  });

  it("Kunde ohne Startdatum: übersprungen; mehrdeutig: ohne Kunde gespeichert", () => {
    expect(kostenZeile("999", { ...row, ad_id: "x", campaign_id: "c3", date_start: "2026-11-05" }, z)).toEqual({ skip: "ohneStart" });
    const r = kostenZeile("999", { ...row, ad_id: "a2", date_start: "2026-11-05" }, z);
    expect("zeile" in r && r.zeile.customerId).toBeNull();
  });

  it("Inhaber des Kontos geht vor", () => {
    const r = kostenZeile("999", { ...row, ad_id: "a2", date_start: "2026-11-05" }, { ...z, inhaber: "k1" });
    expect("zeile" in r && r.zeile.customerId).toBe("k1");
  });

  it("metaLeadsOf ohne Aktionen = 0", () => {
    expect(metaLeadsOf({})).toBe(0);
  });
});
