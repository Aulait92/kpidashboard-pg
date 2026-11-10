import { describe, expect, it, vi } from "vitest";

// Nur die reine Logik von „Heute“ (Admin-A); die Datenbank wird nicht gebraucht.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { agoText, daysSince, greeting, heartbeatProblem, rankItems, sinceText, summary, type HeuteItem } from "@/lib/admin-heute";

const item = (key: string, tone: HeuteItem["tone"], since?: Date): HeuteItem => ({
  key,
  area: "Vertrieb",
  tone,
  icon: "task",
  title: key,
  detail: "",
  action: { label: "Öffnen", href: "/" },
  since,
});

const now = new Date("2026-11-10T09:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

describe("Admin-Heute", () => {
  it("sortiert Dringendes zuerst, bei gleicher Dringlichkeit das Älteste", () => {
    const out = rankItems([item("info", "info", daysAgo(9)), item("warn-neu", "warn", daysAgo(1)), item("bad", "bad"), item("warn-alt", "warn", daysAgo(5))]);
    expect(out.map((i) => i.key)).toEqual(["bad", "warn-alt", "warn-neu", "info"]);
  });

  it("verändert die Eingabe nicht", () => {
    const input = [item("b", "info"), item("a", "bad")];
    rankItems(input);
    expect(input.map((i) => i.key)).toEqual(["b", "a"]);
  });

  it("rechnet Tage und Texte", () => {
    expect(daysSince(daysAgo(34), now)).toBe(34);
    expect(daysSince(new Date(now.getTime() + 1000), now)).toBe(0);
    expect(sinceText(daysAgo(0), now)).toBe("seit heute");
    expect(sinceText(daysAgo(1), now)).toBe("seit 1 Tag");
    expect(sinceText(daysAgo(34), now)).toBe("seit 34 Tagen");
    expect(agoText(daysAgo(1), now)).toBe("gestern");
    expect(agoText(daysAgo(6), now)).toBe("vor 6 Tagen");
  });

  it("begrüßt passend zur Uhrzeit", () => {
    expect(greeting(7)).toBe("Guten Morgen");
    expect(greeting(14)).toBe("Guten Tag");
    expect(greeting(20)).toBe("Guten Abend");
  });

  it("fasst zusammen, wie viel Geld oder Leads aufhält", () => {
    expect(summary([])).toMatch(/Alles erledigt/);
    expect(summary([item("a", "info")])).toBe("1 Punkt braucht Sie");
    expect(summary([item("a", "bad"), item("b", "warn"), item("c", "bad")])).toBe("3 Punkte brauchen Sie · 2 davon halten Leads oder Geld auf");
    expect(summary([item("a", "bad"), item("b", "warn")])).toBe("2 Punkte brauchen Sie · 1 davon hält Leads oder Geld auf");
  });

  it("meldet hängende oder fehlerhafte Hintergrund-Jobs", () => {
    expect(heartbeatProblem("cron", undefined, now)).toBeNull();
    expect(heartbeatProblem("cron", { at: new Date(now.getTime() - 5 * 60000), ok: true, note: null }, now)).toBeNull();
    expect(heartbeatProblem("cron", { at: new Date(now.getTime() - 3 * 3600000), ok: true, note: null }, now)).toBe("letzter Lauf vor 3 Std.");
    expect(heartbeatProblem("sync", { at: new Date(now.getTime() - 60 * 60000), ok: true, note: null }, now)).toBeNull();
    expect(heartbeatProblem("cron", { at: now, ok: false, note: "Meta-Token abgelaufen" }, now)).toBe("Fehler: Meta-Token abgelaufen");
  });
});
