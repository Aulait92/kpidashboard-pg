// Rückmeldung an Meta (Conversions API für CRM, Ole 15.11.2026): Stufen-Erkennung, Nutzlast ohne Kontaktdaten
// und Produkt, 7-Tage-Grenze, Jahresbeitrag, Empfehlung fürs Optimierungsziel, Tipp auf Zahlen.
import { describe, expect, it } from "vitest";
import {
  annualPremium,
  buildEventsData,
  detectStages,
  explainCapiError,
  isMetaLeadId,
  isTooOld,
  recommendStage,
  shortError,
  stageStats,
  type CapiStage,
  type StageInput,
} from "@/lib/capi/shared";
import { candidateTips, META_LERNT, type TipSignals } from "@/lib/zahlen-tipps";

const NOW = new Date("2026-11-15T12:00:00Z");
const H = 3_600_000;
const D = 24 * H;
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const base = (over: Partial<StageInput> = {}): StageInput => ({
  createdAt: ago(3 * D),
  reached: false,
  status: "Neuer Lead",
  statusChangedAt: ago(3 * D),
  closedAt: null,
  firstInboundAt: null,
  firstAppointmentAt: null,
  ...over,
});

describe("Meta-Lead-ID", () => {
  it("nur 15 bis 17 Ziffern", () => {
    expect(isMetaLeadId("123456789012345")).toBe(true);
    expect(isMetaLeadId("12345678901234567")).toBe(true);
    expect(isMetaLeadId("12345678901234")).toBe(false);
    expect(isMetaLeadId("123456789012345678")).toBe(false);
    expect(isMetaLeadId("airtable:recABC")).toBe(false);
    expect(isMetaLeadId("perspective:123456789012345")).toBe(false);
    expect(isMetaLeadId(null)).toBe(false);
  });
});

describe("Stufen erkennen", () => {
  it("neuer Lead: nur Stufe Lead mit Eingang", () => {
    const s = detectStages(base(), NOW);
    expect(Object.keys(s)).toEqual(["lead"]);
    expect(s.lead!.getTime()).toBe(ago(3 * D).getTime());
  });

  it("Erreicht: früheste von erster WhatsApp-Antwort, Status, Termin, Abschluss", () => {
    const s = detectStages(base({ firstInboundAt: ago(2 * D), status: "Angebot gesendet", statusChangedAt: ago(1 * D) }), NOW);
    expect(s.erreicht!.getTime()).toBe(ago(2 * D).getTime());
    const t = detectStages(base({ firstInboundAt: ago(1 * D), status: "In Beratung", statusChangedAt: ago(2 * D) }), NOW);
    expect(t.erreicht!.getTime()).toBe(ago(2 * D).getTime());
  });

  it("nur Lead.reached ohne passenden Status: Zeitpunkt der Erkennung", () => {
    const s = detectStages(base({ reached: true, status: "Nicht erreicht" }), NOW);
    expect(s.erreicht!.getTime()).toBe(NOW.getTime());
  });

  it("Termin vereinbart = erster Termin (angelegt), zählt auch als erreicht", () => {
    const s = detectStages(base({ firstAppointmentAt: ago(1 * D) }), NOW);
    expect(s.termin!.getTime()).toBe(ago(1 * D).getTime());
    expect(s.erreicht!.getTime()).toBe(ago(1 * D).getTime());
  });

  it("Abschluss nur mit Status Abschluss und closedAt", () => {
    expect(detectStages(base({ status: "Abschluss", closedAt: ago(H), statusChangedAt: ago(H) }), NOW).abschluss!.getTime()).toBe(ago(H).getTime());
    expect(detectStages(base({ status: "Storno", closedAt: ago(H) }), NOW).abschluss).toBeUndefined();
    expect(detectStages(base({ status: "Abschluss", closedAt: null }), NOW).abschluss).toBeUndefined();
  });

  it("Zeiten nie vor dem Eingang und nie in der Zukunft", () => {
    const s = detectStages(base({ firstAppointmentAt: ago(10 * D), firstInboundAt: new Date(NOW.getTime() + D) }), NOW);
    expect(s.termin!.getTime()).toBe(ago(3 * D).getTime());
    expect(s.erreicht!.getTime()).toBe(ago(3 * D).getTime());
  });
});

describe("7-Tage-Grenze", () => {
  it("älter als 7 Tage (mit 1 Stunde Puffer) wird nicht gesendet", () => {
    expect(isTooOld(ago(6 * D), NOW)).toBe(false);
    expect(isTooOld(ago(7 * D - 2 * H), NOW)).toBe(false);
    expect(isTooOld(ago(7 * D - 30 * 60_000), NOW)).toBe(true);
    expect(isTooOld(ago(8 * D), NOW)).toBe(true);
  });
});

describe("Nutzlast für Meta", () => {
  const lid = "12345678901234567"; // über Number.MAX_SAFE_INTEGER
  it("nur lead_id, Stufe, Zeit, beim Abschluss Wert in EUR", () => {
    const json = buildEventsData([
      { metaLeadId: lid, stage: "lead", eventTime: ago(D), value: null },
      { metaLeadId: lid, stage: "abschluss", eventTime: ago(H), value: 480.5 },
      { metaLeadId: lid, stage: "erreicht", eventTime: ago(2 * H), value: 999 },
    ]);
    // Ziffern unverändert als Zahl (nicht gerundet, nicht als Text)
    expect(json).toContain(`"lead_id":${lid}`);
    expect(json).not.toContain(`"lead_id":"`);
    const rows = JSON.parse(json.replace(/"lead_id":(\d+)/g, '"lead_id":"$1"')) as Record<string, unknown>[];
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(Object.keys(r).sort()).toEqual(["action_source", "custom_data", "event_name", "event_time", "user_data"]);
      expect(r.action_source).toBe("system_generated");
      expect(Object.keys(r.user_data as object)).toEqual(["lead_id"]);
      expect((r.user_data as { lead_id: string }).lead_id).toBe(lid);
      const cd = r.custom_data as Record<string, unknown>;
      expect(cd.event_source).toBe("crm");
      expect(cd.lead_event_source).toBe("performancegrowth");
    }
    expect(rows[0].event_name).toBe("Lead");
    expect(rows[0].event_time).toBe(Math.floor(ago(D).getTime() / 1000));
    expect(rows[1].event_name).toBe("Abschluss");
    expect(rows[1].custom_data).toEqual({ event_source: "crm", lead_event_source: "performancegrowth", value: 480.5, currency: "EUR" });
    // Wert nur beim Abschluss
    expect(rows[2].custom_data).toEqual({ event_source: "crm", lead_event_source: "performancegrowth" });
    // keine Kontaktdaten, kein Produkt, kein erweiterter Abgleich
    for (const k of ["em", "ph", "fn", "ln", "email", "phone", "name", "sparte", "product", "content_name", "content_category"]) expect(json).not.toContain(`"${k}"`);
  });

  it("Abschluss ohne Beitrag ohne value; fremde IDs werfen", () => {
    const json = buildEventsData([{ metaLeadId: lid, stage: "abschluss", eventTime: ago(H), value: null }]);
    expect(json).not.toContain("value");
    expect(json).not.toContain("currency");
    expect(() => buildEventsData([{ metaLeadId: "airtable:rec1", stage: "lead", eventTime: ago(H), value: null }])).toThrow();
  });
});

describe("Jahresbeitrag", () => {
  it("Summe ohne Stornierte, PKV-Monatsbeitrag × 12, Tarifoptimierung zählt nicht", () => {
    expect(annualPremium([])).toBeNull();
    expect(annualPremium([{ premium: null, status: "aktiv", kind: "percent" }])).toBeNull();
    expect(
      annualPremium([
        { premium: 400, status: "aktiv", kind: "percent" },
        { premium: 300, status: "aktiv", kind: "monthly" },
        { premium: 1200, status: "aktiv", kind: "beitragssumme" },
        { premium: 50, status: "aktiv", kind: "honorar" },
        { premium: 999, status: "storniert", kind: "percent" },
      ]),
    ).toBe(400 + 3600 + 1200);
  });
});

describe("Empfehlung Optimierungsziel", () => {
  const leads = (n: number, share: Partial<Record<CapiStage, number>>, delayDays = 3) =>
    Array.from({ length: n }, (_, i) => {
      const createdAt = ago(40 * D);
      const times: Partial<Record<CapiStage, Date>> = { lead: createdAt };
      for (const [s, f] of Object.entries(share) as [CapiStage, number][]) if (i < n * f) times[s] = new Date(createdAt.getTime() + delayDays * D);
      return { createdAt, times };
    });

  it("zu wenige Leads: Stufe passt, aber nicht bereit", () => {
    const st = stageStats(leads(100, { erreicht: 0.3, termin: 0.1, abschluss: 0.03 }), 30);
    expect(st.leadsPerMonth).toBe(100);
    const r = recommendStage(st, 0.9);
    expect(r.stage).toBe("erreicht");
    expect(r.ready).toBe(false);
    expect(r.checks.volume.ok).toBe(false);
  });

  it("Erreicht über 40 %: Termin vereinbart", () => {
    const r = recommendStage(stageStats(leads(240, { erreicht: 0.7, termin: 0.2, abschluss: 0.05 }), 30), 0.8);
    expect(r.stage).toBe("termin");
    expect(r.ready).toBe(true);
    expect(r.notes.join(" ")).toContain("Erreicht ist zu häufig");
  });

  it("Abdeckung unter 60 % oder keine Rückmeldung: nicht bereit", () => {
    const st = stageStats(leads(240, { erreicht: 0.3 }), 30);
    expect(recommendStage(st, 0.5).ready).toBe(false);
    expect(recommendStage(st, null).ready).toBe(false);
    expect(recommendStage(st, 0.6).ready).toBe(true);
  });

  it("Stufe nach mehr als 28 Tagen oder unter 1 %: keine Empfehlung", () => {
    expect(recommendStage(stageStats(leads(240, { erreicht: 0.3 }, 35), 30), 0.9).stage).toBeNull();
    expect(recommendStage(stageStats(leads(240, { erreicht: 0.005 }), 30), 0.9).stage).toBeNull();
  });
});

describe("Texte", () => {
  it("Fehler verständlich, Lead-IDs gekürzt", () => {
    expect(explainCapiError("zu alt")).toContain("7 Tage");
    expect(explainCapiError("Meta 400: Unsupported post request. Object with ID '123' does not exist, cannot be loaded due to missing permissions")).toContain("zugreifen");
    expect(shortError("lead 12345678901234567 failed")).toBe("lead … failed");
  });

  it("Tipp „Ergebnisse eintragen“ nur mit aktiver Rückmeldung und vielen offenen Meta-Leads", () => {
    const s: TipSignals = {
      avgProvision: 300,
      paidLeadsPerMonth: 50,
      closedCustomers: 5,
      empfehlungEnabled: true,
      notAskedForReferral: 0,
      kollegenPraemie: null,
      kollegenEnabled: false,
      bestandImported: true,
      bestandCampaigns: 1,
      withoutCrossSell: 0,
      missingPremium: 0,
      rates: { reach: { own: null, avg: null }, termin: { own: null, avg: null }, close: { own: null, avg: null } },
    };
    expect(candidateTips(s).map((t) => t.key)).not.toContain("meta_lernen");
    expect(candidateTips({ ...s, capiActive: false, staleMetaLeads: 20 }).map((t) => t.key)).not.toContain("meta_lernen");
    const tip = candidateTips({ ...s, capiActive: true, staleMetaLeads: 12 }).find((t) => t.key === "meta_lernen");
    expect(tip?.text).toContain(META_LERNT);
    expect(candidateTips({ ...s, capiActive: true, missingPremium: 2 }).find((t) => t.key === "beitrag")?.text).toContain("Meta");
  });
});
