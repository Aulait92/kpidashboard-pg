import { describe, expect, it } from "vitest";
import { dedupeKeyOf, fatigueSignals, isoWeekKey, planMeasures, summarizeQuality, DEFAULT_THRESHOLDS, MEASURE_KINDS, type AdMetrics, type AdSetMetrics, type History, type PlanInput } from "@/lib/optimierung/regeln";
import { earlyWarningTitle, isStale, reportText } from "@/lib/optimierung/shared";
import { fetchActivities, moveBudget, pauseAd, readAccountSnapshot } from "@/lib/optimierung/meta";
import type { MetaApi } from "@/lib/kampagnen/builder";

// Entscheidungslogik der Optimierung je Werbekonto (rein, ohne Datenbank) und die Meta-Helfer
// mit gemockter Graph-API.

const NOW = new Date("2026-11-10T09:00:00Z");
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY).toISOString();

const emptyHistory = (): History => ({ majorChangeAt: {}, lastRefreshAt: {}, executedThisMonth: 1, open: [], lastSuggestionAt: {} });

function ad(id: string, over: Partial<AdMetrics> = {}): AdMetrics {
  return {
    adId: id,
    adName: `Anzeige ${id}`,
    adSetId: "set1",
    campaignId: "camp1",
    createdTime: daysAgo(20),
    spend: 100,
    impressions: 5000,
    clicks: 75,
    frequency: 1.8,
    leads: 4,
    prev: { spend: 100, impressions: 5000, clicks: 80, leads: 4 },
    ...over,
  };
}
const set = (id: string, over: Partial<AdSetMetrics> = {}): AdSetMetrics => ({ adSetId: id, adSetName: `Gruppe ${id}`, campaignId: "camp1", campaignName: "PG | Test | TKV | Lead", dailyBudget: null, ...over });

function input(over: Partial<PlanInput> = {}): PlanInput {
  return {
    now: NOW,
    dayOfMonth: 10,
    refCpl: 25,
    refCplLabel: "Ziel-Leadpreis",
    agreedDailyBudget: 30,
    currentDailyBudget: 30,
    adSets: [set("set1")],
    ads: [ad("a1"), ad("a2")],
    quality: null,
    history: emptyHistory(),
    refreshableAdSets: ["set1"],
    ...over,
  };
}

const kinds = (r: ReturnType<typeof planMeasures>) => r.measures.map((m) => m.kind);

describe("planMeasures: keine Scheinaktionen", () => {
  it("gesundes Konto mit frischen Motiven → keine Maßnahme", () => {
    expect(planMeasures(input()).measures).toEqual([]);
  });
  it("ohne laufende Anzeigen → keine Maßnahme", () => {
    expect(planMeasures(input({ ads: [], adSets: [] })).measures).toEqual([]);
  });
  it("Anzeigen ohne Ausgaben → keine Motiv-Erneuerung", () => {
    const r = planMeasures(input({ ads: [ad("a1", { spend: 0, createdTime: daysAgo(40), frequency: 5 }), ad("a2", { spend: 0, createdTime: daysAgo(40) })] }));
    expect(r.measures).toEqual([]);
  });
});

describe("planMeasures: Motiv-Erneuerung", () => {
  it("Ermüdung (Frequenz, CTR fällt) → neue Motive in derselben Anzeigengruppe, mit Datenpunkten", () => {
    const r = planMeasures(input({ ads: [ad("a1", { frequency: 3.6, clicks: 40 }), ad("a2")] }));
    expect(kinds(r)).toEqual(["motiv_erneuern"]);
    const m = r.measures[0];
    expect(m.targetType).toBe("adset");
    expect(m.targetId).toBe("set1");
    expect(m.major).toBe(true);
    expect(m.reason).toMatch(/Frequenz 3,6/);
    expect(m.reason).toMatch(/CTR 0,8 % statt 1,6 %/);
    expect(m.params.adSetIds).toEqual(["set1"]);
    expect((m.params.fatigued as { adId: string }[]).map((f) => f.adId)).toEqual(["a1"]);
  });
  it("spätestens alle 4 Wochen, auch ohne Ermüdung", () => {
    const r = planMeasures(input({ ads: [ad("a1", { createdTime: daysAgo(30) }), ad("a2", { createdTime: daysAgo(29) })] }));
    expect(kinds(r)).toEqual(["motiv_erneuern"]);
    expect(r.measures[0].reason).toMatch(/vor 29 Tagen/);
  });
  it("letzte Auffrischung jünger als 14 Tage → nichts (Motive erst wirken lassen)", () => {
    const h = { ...emptyHistory(), lastRefreshAt: { set1: daysAgo(5) } };
    expect(planMeasures(input({ history: h, ads: [ad("a1", { frequency: 4 }), ad("a2")] })).measures).toEqual([]);
  });
  it("größere Änderung in dieser Woche → keine weitere (Lernphase)", () => {
    const h = { ...emptyHistory(), majorChangeAt: { set1: daysAgo(3) } };
    expect(planMeasures(input({ history: h, ads: [ad("a1", { createdTime: daysAgo(40) }), ad("a2", { createdTime: daysAgo(40) })] })).measures).toEqual([]);
  });
  it("Kampagne nicht von den Agenten angelegt → nur Vorschlag an Ole", () => {
    const r = planMeasures(input({ refreshableAdSets: [], ads: [ad("a1", { createdTime: daysAgo(35) }), ad("a2", { createdTime: daysAgo(35) })] }));
    expect(kinds(r)).toEqual(["motiv_vorschlag"]);
    expect(r.measures[0].major).toBe(false);
  });
  it("offene Maßnahme gleicher Art → keine zweite", () => {
    const h = { ...emptyHistory(), open: ["motiv_erneuern|set1"] };
    expect(planMeasures(input({ history: h, ads: [ad("a1", { createdTime: daysAgo(35) }), ad("a2", { createdTime: daysAgo(35) })] })).measures).toEqual([]);
  });
});

describe("planMeasures: schwache Anzeigen pausieren", () => {
  it("Leadpreis deutlich über Ziel bei genug Ausgaben → pausieren, beste läuft weiter", () => {
    const r = planMeasures(input({ ads: [ad("a1", { prev: null, spend: 160, leads: 2 }), ad("a2", { prev: null, spend: 100, leads: 5 })] }));
    expect(kinds(r)).toEqual(["anzeige_pausieren"]);
    const m = r.measures[0];
    expect(m.targetId).toBe("a1");
    expect(m.major).toBe(false);
    expect(m.reason).toMatch(/Leadpreis 80 € bei 2 Leads/);
    expect(m.reason).toMatch(/Ziel-Leadpreis 25 €/);
    expect(m.reason).toMatch(/„Anzeige a2“ läuft weiter/);
  });
  it("zu wenig Ausgaben → nicht pausieren", () => {
    expect(planMeasures(input({ ads: [ad("a1", { prev: null, spend: 45, leads: 0 }), ad("a2")] })).measures).toEqual([]);
  });
  it("junge Anzeige (Lernphase) → nicht pausieren", () => {
    expect(planMeasures(input({ ads: [ad("a1", { prev: null, spend: 200, leads: 0, createdTime: daysAgo(4) }), ad("a2")] })).measures).toEqual([]);
  });
  it("einzige Anzeige der Gruppe wird nie pausiert", () => {
    expect(planMeasures(input({ ads: [ad("a1", { prev: null, spend: 300, leads: 0 })] })).measures).toEqual([]);
  });
  it("höchstens 2 je Gruppe, schlechteste zuerst, nie die beste", () => {
    const r = planMeasures(input({ ads: [ad("a1", { prev: null, spend: 200, leads: 0 }), ad("a2", { prev: null, spend: 150, leads: 1 }), ad("a3", { prev: null, spend: 120, leads: 1 }), ad("a4", { prev: null, spend: 100, leads: 1 })] }));
    const paused = r.measures.filter((m) => m.kind === "anzeige_pausieren").map((m) => m.targetId);
    expect(paused).toEqual(["a1", "a2"]);
  });
  it("ohne Ziel: Schnitt des Kontos als Vergleich", () => {
    const r = planMeasures(input({ refCpl: null, ads: [ad("a1", { prev: null, spend: 300, leads: 2 }), ad("a2", { prev: null, spend: 100, leads: 8 })] }));
    expect(kinds(r)).toEqual(["anzeige_pausieren"]);
    expect(r.measures[0].reason).toMatch(/Schnitt des Kontos 40 €/);
  });
});

describe("planMeasures: Budget umschichten", () => {
  const sets = [set("s1", { dailyBudget: 20 }), set("s2", { dailyBudget: 20 })];
  const ads = [ad("a1", { adSetId: "s1", spend: 120, leads: 8 }), ad("a2", { adSetId: "s2", spend: 120, leads: 3 })];
  it("bessere Gruppe bekommt Budget, Summe bleibt gleich, höchstens 20 %", () => {
    const r = planMeasures(input({ adSets: sets, ads, refreshableAdSets: [], currentDailyBudget: 40, agreedDailyBudget: 40 }));
    const m = r.measures.find((x) => x.kind === "budget_umschichten")!;
    expect(m).toBeTruthy();
    const p = m.params as unknown as { from: { adSetId: string; before: number; after: number }; to: { adSetId: string; before: number; after: number }; adSetIds: string[] };
    expect(p.from).toMatchObject({ adSetId: "s2", before: 20, after: 16 });
    expect(p.to).toMatchObject({ adSetId: "s1", before: 20, after: 24 });
    expect(p.from.after + p.to.after).toBe(p.from.before + p.to.before);
    expect(p.adSetIds.sort()).toEqual(["s1", "s2"]);
    expect(m.major).toBe(true);
  });
  it("Budget bei Meta über der Vereinbarung → kein Umschichten, Hinweis an Ole", () => {
    const r = planMeasures(input({ adSets: sets, ads, refreshableAdSets: [], currentDailyBudget: 50, agreedDailyBudget: 40 }));
    expect(r.measures.find((x) => x.kind === "budget_umschichten")).toBeUndefined();
    expect(r.warnings[0]).toMatch(/über dem vereinbarten Budget/);
  });
  it("Unterschied zu klein → nichts", () => {
    const close = [ad("a1", { adSetId: "s1", spend: 120, leads: 5 }), ad("a2", { adSetId: "s2", spend: 120, leads: 4 })];
    expect(planMeasures(input({ adSets: sets, ads: close, refreshableAdSets: [] })).measures.filter((m) => m.kind === "budget_umschichten")).toEqual([]);
  });
  it("größere Änderung an einer der Gruppen in dieser Woche → nichts", () => {
    const h = { ...emptyHistory(), majorChangeAt: { s2: daysAgo(2) } };
    expect(planMeasures(input({ adSets: sets, ads, history: h, refreshableAdSets: [] })).measures.filter((m) => m.kind === "budget_umschichten")).toEqual([]);
  });
  it("Kampagnenbudget (CBO) → kein Umschichten zwischen Gruppen", () => {
    const cbo = [set("s1"), set("s2")];
    expect(planMeasures(input({ adSets: cbo, ads, refreshableAdSets: [] })).measures.filter((m) => m.kind === "budget_umschichten")).toEqual([]);
  });
});

describe("planMeasures: Leadqualität → Vorschlag an Ole", () => {
  const q = { leads: 20, disqualified: 8, reasons: { falsche_nummer: 5, fake: 3 }, mature: 15, notReached: 3, closed: 1 };
  it("viele disqualifizierte Leads → Formular-Vorschlag mit Gründen", () => {
    const r = planMeasures(input({ quality: q }));
    expect(kinds(r)).toEqual(["formular_vorschlag"]);
    expect(r.measures[0].reason).toMatch(/8 von 20 Leads/);
    expect(r.measures[0].reason).toMatch(/Falsche Nummer/);
  });
  it("meist außerhalb der Region → Zielgruppen-Vorschlag", () => {
    const r = planMeasures(input({ quality: { ...q, reasons: { region: 6, fake: 2 } } }));
    expect(kinds(r)).toEqual(["zielgruppe_vorschlag"]);
  });
  it("Vorschlag höchstens alle 28 Tage", () => {
    const h = { ...emptyHistory(), lastSuggestionAt: { formular_vorschlag: daysAgo(10) } };
    expect(planMeasures(input({ quality: q, history: h })).measures).toEqual([]);
  });
  it("gute Qualität → nichts", () => {
    expect(planMeasures(input({ quality: { ...q, disqualified: 1, reasons: {} } })).measures).toEqual([]);
  });
});

describe("planMeasures: Monatsziel", () => {
  it("noch keine Maßnahme und Monatsmitte → neue Motive schon nach 21 Tagen", () => {
    const ads = [ad("a1", { createdTime: daysAgo(22) }), ad("a2", { createdTime: daysAgo(22) })];
    expect(planMeasures(input({ ads })).measures).toEqual([]);
    const r = planMeasures(input({ ads, dayOfMonth: 16, history: { ...emptyHistory(), executedThisMonth: 0 } }));
    expect(kinds(r)).toEqual(["motiv_erneuern"]);
    expect(r.measures[0].reason).toMatch(/noch keine Maßnahme/);
  });
});

describe("Hilfen", () => {
  it("fatigueSignals: Leadpreis steigt gegenüber den 14 Tagen davor", () => {
    const s = fatigueSignals(ad("a1", { spend: 120, leads: 2, prev: { spend: 100, impressions: 5000, clicks: 80, leads: 5 } }), DEFAULT_THRESHOLDS);
    expect(s.join(" ")).toMatch(/Leadpreis 60 € statt 20 €/);
  });
  it("isoWeekKey und dedupeKeyOf", () => {
    expect(isoWeekKey(new Date("2026-11-10T09:00:00Z"))).toBe("2026-W46");
    expect(isoWeekKey(new Date("2027-01-01T09:00:00Z"))).toBe("2026-W53");
    expect(dedupeKeyOf("acc", NOW, { kind: "anzeige_pausieren", targetId: "a1" })).toBe("acc|2026-W46|anzeige_pausieren|a1");
  });
  it("summarizeQuality: zählt Disqualifizierte, Storno und ungültige Pool-Leads; ohne gepflegte Ergebnisse null", () => {
    const recent = [
      { status: "Disqualifiziert", disqualifyReason: "region", stornoState: null },
      { status: "Neu", disqualifyReason: null, stornoState: "approved" },
      { status: "Termin vereinbart", disqualifyReason: null, stornoState: null },
    ];
    const mature = Array.from({ length: 10 }, (_, i) => ({ status: i < 4 ? "Abschluss" : "Nicht erreicht", reached: i < 4 }));
    const q = summarizeQuality(recent, mature, [{ reason: "Telefonnummer ungültig" }])!;
    expect(q).toMatchObject({ leads: 4, disqualified: 3, mature: 10, notReached: 6, closed: 4 });
    expect(q.reasons).toMatchObject({ region: 1, storno: 1, "Telefonnummer ungültig": 1 });
    const unworked = Array.from({ length: 10 }, () => ({ status: "Neu", reached: false }));
    expect(summarizeQuality(recent, unworked)).toBeNull();
  });
  it("reportText: Sie-Form, keine Gedankenstriche, kein „Garantie“", () => {
    for (const k of MEASURE_KINDS) {
      const t = reportText({ kind: k, title: "Zielgruppe auf 25 km verkleinert" });
      expect(t).not.toMatch(/[–—]/);
      expect(t).not.toMatch(/garant/i);
    }
  });
  it("isStale: rot nach mehr als 14 Tagen oder nie", () => {
    expect(isStale(null, NOW)).toBe(true);
    expect(isStale(new Date(NOW.getTime() - 14 * DAY), NOW)).toBe(false);
    expect(isStale(new Date(NOW.getTime() - 15 * DAY), NOW)).toBe(true);
    expect(earlyWarningTitle("Kunde Muster")).toBe("Kunde Muster: diesen Monat noch nichts optimiert");
  });
});

// ─── Meta-Helfer mit gemockter Graph-API ───────────────────────────────

type Call = { method: "get" | "post"; path: string; params?: Record<string, string>; body?: Record<string, unknown> };
function fakeMeta(gets: (path: string, params?: Record<string, string>) => unknown): MetaApi & { calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    async get<T>(path: string, params?: Record<string, string>) {
      calls.push({ method: "get", path, params });
      return (gets(path, params) ?? { data: [] }) as T;
    },
    async post<T>(path: string, body: Record<string, unknown>) {
      calls.push({ method: "post", path, body });
      return { success: true } as T;
    },
    async del() {},
  };
}

describe("Meta-Helfer", () => {
  it("readAccountSnapshot: nur aktive Anzeigen, Kennzahlen beider Zeiträume, Budgets", async () => {
    const meta = fakeMeta((path, params) => {
      if (path === "act_123/campaigns") return { data: [{ id: "c1", name: "PG | Kunde | TKV | Lead", effective_status: "ACTIVE" }, { id: "c2", name: "Fremd", effective_status: "ACTIVE" }] };
      if (path === "c1/adsets") return { data: [{ id: "s1", name: "Gruppe 1", daily_budget: "2000", effective_status: "ACTIVE" }] };
      if (path === "c1/ads") return { data: [{ id: "a1", name: "A1", adset_id: "s1", created_time: daysAgo(30), effective_status: "ACTIVE" }, { id: "a2", name: "A2", adset_id: "s1", effective_status: "PAUSED" }] };
      if (path === "c1/insights") {
        // Die 14 Tage davor werden ohne Frequenz abgefragt
        const prev = !params!.fields.includes("frequency");
        return { data: [{ ad_id: "a1", spend: prev ? "50" : "80.5", impressions: "4000", clicks: "40", frequency: "2.1", actions: [{ action_type: "lead", value: prev ? "3" : "4" }] }] };
      }
      return { data: [] };
    });
    const s = await readAccountSnapshot(meta, { adAccountIds: ["123"], campaignFilter: (c) => c.name.startsWith("PG |"), now: NOW });
    expect(s.campaigns.map((c) => c.id)).toEqual(["c1"]);
    expect(s.adSets).toEqual([expect.objectContaining({ adSetId: "s1", dailyBudget: 20 })]);
    expect(s.ads).toHaveLength(1);
    expect(s.ads[0]).toMatchObject({ adId: "a1", spend: 80.5, leads: 4, frequency: 2.1, prev: { spend: 50, leads: 3 } });
    expect(s.totalDailyBudget).toBe(20);
    expect(meta.calls.every((c) => c.method === "get")).toBe(true);
  });

  it("pauseAd: nur PAUSED, nie die letzte aktive Anzeige", async () => {
    const meta = fakeMeta((path) => {
      if (path === "a1") return { effective_status: "ACTIVE", name: "A1" };
      if (path === "s1/ads") return { data: [{ id: "a1", effective_status: "ACTIVE" }, { id: "a2", effective_status: "ACTIVE" }] };
    });
    await pauseAd(meta, "a1", "s1");
    expect(meta.calls.filter((c) => c.method === "post")).toEqual([{ method: "post", path: "a1", body: { status: "PAUSED" } }]);
    const lonely = fakeMeta((path) => (path === "a1" ? { effective_status: "ACTIVE" } : { data: [{ id: "a1", effective_status: "ACTIVE" }] }));
    await expect(pauseAd(lonely, "a1", "s1")).rejects.toThrow(/keine Anzeige/);
    expect(lonely.calls.some((c) => c.method === "post")).toBe(false);
  });

  it("moveBudget: erst senken, dann erhöhen; geänderte Budgets und Erhöhung der Summe → Stopp", async () => {
    const meta = fakeMeta(() => ({ daily_budget: "2000", effective_status: "ACTIVE" }));
    await moveBudget(meta, { adSetId: "s2", before: 20, after: 16 }, { adSetId: "s1", before: 20, after: 24 }, 40);
    expect(meta.calls.filter((c) => c.method === "post")).toEqual([
      { method: "post", path: "s2", body: { daily_budget: 1600 } },
      { method: "post", path: "s1", body: { daily_budget: 2400 } },
    ]);
    await expect(moveBudget(meta, { adSetId: "s2", before: 20, after: 16 }, { adSetId: "s1", before: 20, after: 25 }, null)).rejects.toThrow(/Summe/);
    const changed = fakeMeta(() => ({ daily_budget: "3000" }));
    await expect(moveBudget(changed, { adSetId: "s2", before: 20, after: 16 }, { adSetId: "s1", before: 20, after: 24 }, null)).rejects.toThrow(/geändert/);
    expect(changed.calls.some((c) => c.method === "post")).toBe(false);
  });

  it("fetchActivities: /act_…/activities mit since/until und Blättern", async () => {
    let page = 0;
    const meta = fakeMeta((path, params) => {
      expect(path).toBe("act_123/activities");
      expect(params!.fields).toContain("event_type");
      page++;
      return page === 1
        ? { data: [{ event_time: "2026-11-01T10:00:00+0000", event_type: "update_ad_run_status" }], paging: { cursors: { after: "X" }, next: "https://next" } }
        : { data: [{ event_time: "2026-11-02T10:00:00+0000", event_type: "create_ad" }] };
    });
    const rows = await fetchActivities(meta, "123", new Date(NOW.getTime() - 7 * DAY), NOW);
    expect(rows.map((r) => r.event_type)).toEqual(["update_ad_run_status", "create_ad"]);
    expect(meta.calls[1].params!.after).toBe("X");
    expect(Number(meta.calls[0].params!.since)).toBe(Math.floor((NOW.getTime() - 7 * DAY) / 1000));
  });
});
