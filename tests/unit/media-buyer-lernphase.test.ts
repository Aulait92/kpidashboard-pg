import { describe, expect, it, vi } from "vitest";

// Keine echten DB-/Meta-/Push-Aufrufe: media-buyer.ts wird nur für die reine
// Entscheidungsfunktion decideBudget importiert.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/push", () => ({ sendToAdmins: vi.fn() }));

import { decideBudget } from "@/lib/media-buyer";
import {
  DEFAULT_LEARNING_CONFIG,
  guardLearning,
  learningLabel,
  simulateGentleLeads,
  summarizeLearning,
  type GuardableDecision,
  type LearningStatus,
} from "@/lib/media-buyer-lernphase";

const cfg = DEFAULT_LEARNING_CONFIG;

function inc(target: number): GuardableDecision {
  return { action: "increase", reason: "x", targetBudget: target, setStatus: null };
}

const baseGuard = {
  currentBudget: 100,
  learning: "SUCCESS" as LearningStatus,
  hoursSinceLastChange: 100,
  pausedDays: null,
  leadsMtd: 100,
  goal: 300,
  projected: 300,
  daysLeft: 20,
  inBoostWindow: false,
  costPerLead: 20,
  cplMtd: 20,
  maxBudget: 1000,
  cfg,
};

describe("Lernstatus", () => {
  it("fasst Anzeigengruppen konservativ zusammen", () => {
    expect(
      summarizeLearning([
        { effective_status: "ACTIVE", learning_stage_info: { status: "SUCCESS" } },
        { effective_status: "ACTIVE", learning_stage_info: { status: "LEARNING", last_sig_edit_ts: 1_700_000_000 } },
      ]),
    ).toEqual({ status: "LEARNING", lastSigEditAt: new Date(1_700_000_000_000) });
    expect(summarizeLearning([{ effective_status: "ACTIVE" }]).status).toBe("UNKNOWN");
    expect(summarizeLearning([]).status).toBe("UNKNOWN");
    expect(
      summarizeLearning([
        { effective_status: "ACTIVE", learning_stage_info: { status: "FAIL" } },
        { effective_status: "PAUSED", learning_stage_info: null },
      ]).status,
    ).toBe("FAIL");
  });

  it("zeigt knappe Labels", () => {
    const now = new Date("2026-11-20T12:00:00Z");
    expect(learningLabel("SUCCESS", null, now)).toBe("abgeschlossen");
    expect(learningLabel("FAIL", null, now)).toBe("eingeschränkt");
    expect(learningLabel("LEARNING", new Date("2026-11-18T10:00:00Z"), now)).toBe("läuft (Tag 3/7)");
    expect(learningLabel(null, null, now)).toBeNull();
  });
});

describe("guardLearning", () => {
  it("deckelt eine große Erhöhung auf +20 %, wenn kleine Schritte reichen", () => {
    const r = guardLearning({ ...baseGuard, decision: inc(145), leadsMtd: 140, goal: 300 });
    expect(r.reset).toBe(false);
    expect(r.decision.targetBudget).toBeCloseTo(120);
    expect(r.decision.reason).toContain("Lernphase schonen: +20 % statt +45 %");
  });

  it("hält das Budget, wenn die letzte Änderung keine 72 h her ist", () => {
    const r = guardLearning({ ...baseGuard, decision: inc(110), hoursSinceLastChange: 30, leadsMtd: 140 });
    expect(r.decision.targetBudget).toBeNull();
    expect(r.decision.action).toBe("none");
    expect(r.decision.reason).toContain("frühestens in 42 h");
  });

  it("lässt kleine Änderungen nach 72 h unverändert durch", () => {
    const r = guardLearning({ ...baseGuard, decision: inc(115) });
    expect(r.decision.targetBudget).toBe(115);
    expect(r.note).toBeNull();
  });

  it("Reset lohnt sich: Ziel unerreichbar, genug Tage, genug Ereignisse", () => {
    const r = guardLearning({ ...baseGuard, decision: inc(400), leadsMtd: 40, goal: 300, daysLeft: 20 });
    expect(r.reset).toBe(true);
    expect(r.decision.targetBudget).toBe(400);
    expect(r.decision.reason).toMatch(/^Reset lohnt sich/);
  });

  it("kein Reset bei zu wenigen Resttagen (außerhalb Endspurt)", () => {
    const r = guardLearning({ ...baseGuard, decision: inc(400), leadsMtd: 150, goal: 300, daysLeft: 7 });
    expect(r.reset).toBe(false);
    expect(r.decision.targetBudget).toBeCloseTo(120);
    expect(r.decision.reason).toContain("Reset lohnt sich nicht: nur 7 Tage");
  });

  it("kein Reset, wenn das neue Budget zu wenige Ereignisse bringt", () => {
    const r = guardLearning({
      ...baseGuard,
      decision: inc(300),
      costPerLead: 100,
      cplMtd: 100,
      leadsMtd: 10,
      goal: 60,
      daysLeft: 20,
    });
    expect(r.reset).toBe(false);
    expect(r.decision.reason).toContain("Ereignisse");
  });

  it("Endspurt: reichen kleine Schritte nicht, geht das Ziel vor", () => {
    const r = guardLearning({ ...baseGuard, decision: inc(500), leadsMtd: 200, goal: 300, daysLeft: 4, inBoostWindow: true });
    expect(r.reset).toBe(true);
    expect(r.decision.reason).toContain("Endspurt");
    const off = guardLearning({
      ...baseGuard,
      decision: inc(500),
      leadsMtd: 200,
      goal: 300,
      daysLeft: 4,
      inBoostWindow: true,
      cfg: { ...cfg, endspurtReset: false },
    });
    expect(off.reset).toBe(false);
  });

  it("Learning limited mit schwachem CPL: frei ändern", () => {
    const r = guardLearning({ ...baseGuard, decision: inc(250), learning: "FAIL", costPerLead: 30, cplMtd: 25, hoursSinceLastChange: 5 });
    expect(r.decision.targetBudget).toBe(250);
    expect(r.protectStep).toBeNull();
    expect(r.decision.reason).toContain("eingeschränkt");
  });

  it("Learning limited mit gutem CPL wird geschont", () => {
    const r = guardLearning({ ...baseGuard, decision: inc(250), learning: "FAIL", costPerLead: 18, cplMtd: 25, leadsMtd: 140 });
    expect(r.decision.targetBudget).toBeCloseTo(120);
  });

  it("Kürzen höchstens −20 %, nie per Reset", () => {
    const r = guardLearning({
      ...baseGuard,
      decision: { action: "decrease", reason: "x", targetBudget: 40, setStatus: null },
    });
    expect(r.decision.targetBudget).toBeCloseTo(80);
    expect(r.reset).toBe(false);
  });

  it("Reaktivierung nach langer Pause ist frei, nach kurzer geschont", () => {
    const act: GuardableDecision = { action: "activate", reason: "x", targetBudget: 200, setStatus: "ACTIVE" };
    expect(guardLearning({ ...baseGuard, decision: act, pausedDays: 9 }).decision.targetBudget).toBe(200);
    const short = guardLearning({ ...baseGuard, decision: act, pausedDays: 2, hoursSinceLastChange: 10, leadsMtd: 140 });
    expect(short.decision.targetBudget).toBeNull();
    expect(short.decision.setStatus).toBe("ACTIVE");
    expect(short.decision.action).toBe("activate");
  });

  it("Pause bleibt Pause", () => {
    const r = guardLearning({
      ...baseGuard,
      decision: { action: "pause", reason: "Ziel", targetBudget: null, setStatus: "PAUSED" },
    });
    expect(r.decision.setStatus).toBe("PAUSED");
  });

  it("Simulation schonender Schritte", () => {
    const leads = simulateGentleLeads({
      leadsMtd: 0, goal: 300, daysLeft: 30, currentBudget: 100, costPerLead: 10,
      maxBudget: 1000, maxStep: 0.2, minHoursBetween: 72, hoursUntilNextChange: 0,
    });
    expect(leads).toBeGreaterThan(290);
    expect(leads).toBeLessThan(320);
  });
});

// ─── Monats-Simulation: decideBudget + Schonregel, ein Lauf pro Tag ───

type Sim = {
  goal: number;
  cpl: number;
  startBudget: number;
  startDay?: number; // ab welchem Tag gesteuert wird
  leadsBefore?: number; // Leads vor startDay
  learning?: LearningStatus;
  cplMtd?: number;
  daysTotal?: number;
};

function simulateMonth(s: Sim) {
  const daysTotal = s.daysTotal ?? 30;
  const startDay = s.startDay ?? 1;
  let leads = s.leadsBefore ?? 0;
  let budget = s.startBudget;
  let paused = false;
  let lastChangeDay: number | null = null;
  const changes: { day: number; from: number; to: number; reset: boolean }[] = [];
  const reasons: string[] = [];
  for (let day = startDay; day <= daysTotal; day++) {
    const daysElapsed = day;
    const decision = decideBudget({
      leadsMtd: Math.floor(leads),
      goal: s.goal,
      daysElapsed,
      daysTotal,
      currentBudget: budget,
      costPerLead: s.cpl,
      minBudget: 5,
      maxBudget: 2000,
      // Mit Meta gilt nur EINE Schrittgrenze: die der Lernphasen-Regel.
      maxStep: 10,
      boostDays: 5,
      anyPaused: paused,
      precisionDays: 3,
      precisionMinBudget: 1,
      lookAheadHours: 24,
    });
    const daysLeft = daysTotal - daysElapsed + 1;
    const g = guardLearning({
      decision,
      currentBudget: budget,
      learning: s.learning ?? "SUCCESS",
      hoursSinceLastChange: lastChangeDay == null ? null : (day - lastChangeDay) * 24,
      pausedDays: null,
      leadsMtd: Math.floor(leads),
      goal: s.goal,
      projected: Math.round((leads / Math.max(1, daysElapsed - 1 || 1)) * daysTotal),
      daysLeft,
      inBoostWindow: daysLeft <= 5,
      costPerLead: s.cpl,
      cplMtd: s.cplMtd ?? s.cpl,
      maxBudget: 2000,
      cfg,
    });
    reasons.push(`T${day}: ${g.decision.action} ${g.decision.reason}`);
    // Vorausschauende Pause im Endspurt: in echt läuft der Cron dann stündlich
    // und pausiert genau beim Ziel; der Tagessimulator liefert die Restmenge.
    if (g.decision.setStatus === "PAUSED" && leads < s.goal && !paused) {
      leads = Math.min(s.goal, leads + budget / s.cpl);
    }
    if (g.decision.setStatus === "PAUSED") paused = true;
    if (g.decision.setStatus === "ACTIVE") paused = false;
    const t = g.decision.targetBudget;
    if (t != null && Math.abs(t - budget) > 0.01) {
      changes.push({ day, from: budget, to: t, reset: g.reset });
      budget = t;
      lastChangeDay = day;
    }
    if (!paused) leads += budget / s.cpl;
  }
  return { leads, quote: leads / s.goal, changes, reasons };
}

function gentleChanges(changes: { day: number; from: number; to: number; reset: boolean }[]) {
  return changes.filter((c) => !c.reset);
}

describe("Monats-Simulation mit Schonregel", () => {
  it("zu langsam: kleine Schritte früh, Ziel ~100 %", () => {
    const r = simulateMonth({ goal: 300, cpl: 30, startBudget: 220 });
    expect(r.quote).toBeGreaterThanOrEqual(0.97);
    expect(r.quote).toBeLessThanOrEqual(1.05);
    for (const c of gentleChanges(r.changes)) {
      expect(Math.abs(c.to / c.from - 1)).toBeLessThanOrEqual(0.2 + 1e-9);
    }
    // höchstens eine Änderung je 72 h
    for (let i = 1; i < r.changes.length; i++) {
      if (!r.changes[i].reset) expect(r.changes[i].day - r.changes[i - 1].day).toBeGreaterThanOrEqual(3);
    }
    expect(r.changes.some((c) => c.reset)).toBe(false);
  });

  it("viel zu langsam am Monatsanfang: ein Reset lohnt sich, Ziel ~100 %", () => {
    const r = simulateMonth({ goal: 300, cpl: 30, startBudget: 60 });
    expect(r.changes[0].reset).toBe(true);
    expect(r.changes.filter((c) => c.reset).length).toBe(1);
    expect(r.quote).toBeGreaterThanOrEqual(0.97);
    expect(r.quote).toBeLessThanOrEqual(1.05);
  });

  it("zu schnell: sanft kürzen und bei Ziel pausieren, kaum Überlieferung", () => {
    const r = simulateMonth({ goal: 300, cpl: 30, startBudget: 600 });
    expect(r.quote).toBeGreaterThanOrEqual(1);
    expect(r.quote).toBeLessThanOrEqual(1.08);
    expect(r.changes.some((c) => c.reset)).toBe(false);
    expect(r.reasons.some((x) => x.includes("pause"))).toBe(true);
  });

  it("Monatsende hinterher: Endspurt geht vor", () => {
    const r = simulateMonth({ goal: 300, cpl: 30, startBudget: 300, startDay: 26, leadsBefore: 200 });
    expect(r.changes.some((c) => c.reset)).toBe(true);
    expect(r.reasons.join("\n")).toContain("Endspurt");
    expect(r.quote).toBeGreaterThanOrEqual(0.97);
  });

  it("Monatsende knapp hinterher: kleine Schritte reichen, kein Reset", () => {
    const r = simulateMonth({ goal: 300, cpl: 30, startBudget: 300, startDay: 24, leadsBefore: 225 });
    expect(r.changes.some((c) => c.reset)).toBe(false);
    expect(r.quote).toBeGreaterThanOrEqual(0.97);
  });

  it("Learning limited mit schwachem CPL: steuert frei aufs Ziel", () => {
    const r = simulateMonth({ goal: 300, cpl: 30, cplMtd: 25, startBudget: 100, learning: "FAIL" });
    expect(r.quote).toBeGreaterThanOrEqual(0.97);
    expect(r.quote).toBeLessThanOrEqual(1.05);
    expect(r.changes.some((c) => c.to / c.from - 1 > 0.2)).toBe(true);
  });
});
