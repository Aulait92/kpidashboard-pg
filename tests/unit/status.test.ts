import { describe, expect, it } from "vitest";
import { dayLevel, deriveStatus, failedParts, formatUptime, overall, uptimePercent } from "@/lib/status";

// Öffentliche Statusseite: Ableitung der Zustände aus den Lebenszeichen.
const now = new Date("2026-11-11T10:00:00Z");
const minAgo = (m: number) => new Date(now.getTime() - m * 60000);
const beat = (key: string, ageMin: number, ok = true, note: string | null = null) => ({ key, at: minAgo(ageMin), ok, note });

describe("Statusseite: Zustände", () => {
  it("alles betriebsbereit bei frischen Lebenszeichen (und ohne je gelaufene Jobs)", () => {
    const s = deriveStatus({ dbOk: true, beats: [beat("cron", 3), beat("sync", 30)], now });
    expect(Object.values(s).every((v) => v === "ok")).toBe(true);
    expect(overall(s)).toBe("ok");
    expect(overall(deriveStatus({ dbOk: true, beats: [], now }))).toBe("ok");
  });

  it("Datenbank weg → Störung, Zahlungen (Stripe) nur eingeschränkt", () => {
    const s = deriveStatus({ dbOk: false, beats: [], now });
    expect(s.app).toBe("down");
    expect(s.leads).toBe("down");
    expect(s.payments).toBe("degraded");
    expect(overall(s)).toBe("down");
  });

  it("Cron länger still → Hintergrund-Jobs Störung, WhatsApp erst nach 60 Min. Störung", () => {
    const s = deriveStatus({ dbOk: true, beats: [beat("cron", 25)], now });
    expect(s).toMatchObject({ jobs: "down", whatsapp: "degraded", calendar: "degraded", app: "ok" });
    expect(deriveStatus({ dbOk: true, beats: [beat("cron", 90)], now }).whatsapp).toBe("down");
  });

  it("Cron mit Fehlern → betroffene Komponente eingeschränkt", () => {
    const s = deriveStatus({ dbOk: true, beats: [beat("cron", 2, false, "Fehler in: outreach, responses")], now });
    expect(s).toMatchObject({ jobs: "degraded", whatsapp: "degraded", calendar: "degraded", leads: "ok" });
    const s2 = deriveStatus({ dbOk: true, beats: [beat("cron", 2, false, "Fehler in: onboarding")], now });
    expect(s2).toMatchObject({ jobs: "degraded", whatsapp: "ok", calendar: "ok" });
    expect(failedParts("Fehler in: outreach, sequences")).toEqual(["outreach", "sequences"]);
    expect(failedParts(null)).toEqual([]);
  });

  it("Abgleich der Leads hängt → Lead-Eingang eingeschränkt", () => {
    expect(deriveStatus({ dbOk: true, beats: [beat("sync", 300)], now }).leads).toBe("degraded");
    expect(deriveStatus({ dbOk: true, beats: [beat("sync", 300, false)], now }).leads).toBe("degraded");
    expect(deriveStatus({ dbOk: true, beats: [beat("sync", 30, false)], now }).leads).toBe("ok");
  });

  it("manuelle Meldungen heben den Zustand an, Hinweise und unbekannte Komponenten nicht", () => {
    const s = deriveStatus({
      dbOk: true,
      beats: [],
      incidents: [
        { component: "payments", level: "down" },
        { component: "calendar", level: "info" },
        { component: null, level: "down" },
        { component: "gibtsnicht", level: "down" },
      ],
      now,
    });
    expect(s).toMatchObject({ payments: "down", calendar: "ok", app: "ok" });
  });
});

describe("Statusseite: Verfügbarkeit", () => {
  it("ohne Messpunkte keine Zahl", () => {
    expect(uptimePercent({ samples: 0, notDown: 0, firstAt: null, now })).toBeNull();
  });

  it("Anteil ohne Störung; bei Hintergrund-Jobs zählen Lücken als Störung", () => {
    expect(uptimePercent({ samples: 100, notDown: 99, firstAt: minAgo(500), now })).toBe(99);
    // 1 Tag = 289 erwartete Messpunkte, nur 144 vorhanden
    const p = uptimePercent({ samples: 144, notDown: 144, firstAt: minAgo(24 * 60), now, countGaps: true })!;
    expect(p).toBeCloseTo((144 / 289) * 100, 5);
    expect(uptimePercent({ samples: 144, notDown: 144, firstAt: minAgo(24 * 60), now })).toBe(100);
  });

  it("formatiert abgerundet mit Komma", () => {
    expect(formatUptime(100)).toBe("100 %");
    expect(formatUptime(99.999)).toBe("99,99 %");
    expect(formatUptime(98.5)).toBe("98,50 %");
  });

  it("ein einzelner Ausreißer färbt den Tag nicht rot", () => {
    expect(dayLevel({ samples: 0, down: 0, degraded: 0 })).toBeNull();
    expect(dayLevel({ samples: 288, down: 0, degraded: 1 })).toBe("ok");
    expect(dayLevel({ samples: 288, down: 1, degraded: 0 })).toBe("degraded");
    expect(dayLevel({ samples: 288, down: 0, degraded: 2 })).toBe("degraded");
    expect(dayLevel({ samples: 288, down: 3, degraded: 0 })).toBe("down");
  });
});
