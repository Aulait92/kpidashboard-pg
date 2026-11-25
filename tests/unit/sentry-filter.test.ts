// Sentry „router state header“ auf /f/[funnel] (10 Ereignisse): kaputter Next-Router-State-Tree-Kopf von Bots bzw.
// veralteten Tabs ist erwartbar und wird gefiltert; echte Fehler gehen weiter nach Sentry.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { istErwartbaresEreignis, istKaputterRouterState } from "@/lib/sentry-filter";

describe("Sentry-Filter", () => {
  it("erkennt genau die Meldungen von Next.js", () => {
    expect(istKaputterRouterState(new Error("The router state header was sent but could not be parsed."))).toBe(true);
    expect(istKaputterRouterState(new Error("The router state header was too large."))).toBe(true);
    expect(istKaputterRouterState(new Error("Multiple router state headers were sent. This is not allowed."))).toBe(true);
    expect(istKaputterRouterState(new Error("Cannot read properties of undefined (reading 'router state')"))).toBe(false);
    expect(istKaputterRouterState(new Error("Prisma: connection refused"))).toBe(false);
    expect(istKaputterRouterState(null)).toBe(false);
  });
  it("beforeSend verwirft nur diese Ereignisse", () => {
    expect(istErwartbaresEreignis({ exception: { values: [{ value: "The router state header was sent but could not be parsed." }] } })).toBe(true);
    expect(istErwartbaresEreignis({ exception: { values: [{ value: "TypeError: x is undefined" }] } })).toBe(false);
    expect(istErwartbaresEreignis({})).toBe(false);
  });
  it("die Meldungen stehen so in Next.js (fällt auf, wenn Next sie ändert)", () => {
    const quelle = readFileSync(path.resolve(__dirname, "../../node_modules/next/dist/server/app-render/parse-and-validate-flight-router-state.js"), "utf8");
    for (const m of ["The router state header was sent but could not be parsed.", "The router state header was too large.", "Multiple router state headers were sent. This is not allowed."]) {
      expect(quelle).toContain(m);
      expect(istKaputterRouterState(new Error(m))).toBe(true);
    }
  });
});
