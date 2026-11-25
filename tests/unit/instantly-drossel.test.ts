// Instantly 429 (Sentry, 37 Ereignisse): Retry-After beachten, wachsender Abstand, Sentry höchstens einmal je Lauf.
import { beforeEach, describe, expect, it, vi } from "vitest";

const gemeldet = vi.hoisted(() => [] as string[]);
vi.mock("@/lib/monitoring", () => ({ reportError: (_e: unknown, where: string) => void gemeldet.push(where) }));

import { _resetInstantlyDrossel, instantlyFetch, InstantlyRateLimitError, meldeInstantlyFehler, MELDE_ABSTAND_MS, wartezeitNach429 } from "@/lib/vertrieb/instantly-drossel";

const antwort = (status: number, headers: Record<string, string> = {}) => new Response(status === 200 ? "{}" : "x", { status, headers });

describe("Instantly-Drossel", () => {
  beforeEach(() => {
    _resetInstantlyDrossel();
    gemeldet.length = 0;
  });

  it("Wartezeit: Retry-After in Sekunden oder als Datum, sonst 2, 4, 8 s, höchstens 30 s", () => {
    expect(wartezeitNach429("7", 0)).toBe(7000);
    expect(wartezeitNach429("Wed, 25 Nov 2026 10:00:05 GMT", 0, Date.parse("Wed, 25 Nov 2026 10:00:00 GMT"))).toBe(5000);
    expect(wartezeitNach429(null, 0)).toBe(2000);
    expect(wartezeitNach429(null, 2)).toBe(8000);
    expect(wartezeitNach429("600", 0)).toBe(30_000);
  });

  it("wartet nach 429 laut Retry-After und versucht es erneut", async () => {
    const schlaf: number[] = [];
    let t = 1_000_000;
    const f = vi.fn().mockResolvedValueOnce(antwort(429, { "retry-after": "3" })).mockResolvedValueOnce(antwort(200));
    const res = await instantlyFetch("/leads/list", undefined, { fetch: f as never, sleep: async (ms) => void schlaf.push(ms), now: () => (t += 1000) });
    expect(res.status).toBe(200);
    expect(f).toHaveBeenCalledTimes(2);
    expect(schlaf).toContain(3000);
  });

  it("nach zu vielen 429: InstantlyRateLimitError", async () => {
    const f = vi.fn().mockImplementation(async () => antwort(429));
    await expect(instantlyFetch("/emails?x=1", undefined, { versuche: 2, fetch: f as never, sleep: async () => {} })).rejects.toBeInstanceOf(InstantlyRateLimitError);
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("Mindestabstand zwischen Aufrufen", async () => {
    const schlaf: number[] = [];
    const f = vi.fn().mockImplementation(async () => antwort(200));
    await instantlyFetch("/a", undefined, { fetch: f as never, sleep: async (ms) => void schlaf.push(ms), now: () => 5000 });
    await instantlyFetch("/b", undefined, { fetch: f as never, sleep: async (ms) => void schlaf.push(ms), now: () => 5000 });
    expect(schlaf).toEqual([150]);
  });

  it("Sentry: 429 höchstens einmal je Lauf, andere Fehler immer", () => {
    const t0 = 10_000_000;
    meldeInstantlyFehler(new InstantlyRateLimitError("/emails"), "cron-instantly", undefined, t0);
    meldeInstantlyFehler(new Error("Instantly /emails: 429 too many"), "instantly-eigene-antwort", undefined, t0 + 1000);
    meldeInstantlyFehler(new InstantlyRateLimitError("/emails"), "cron-nie-kontaktieren", undefined, t0 + 2000);
    expect(gemeldet).toEqual(["cron-instantly"]);
    meldeInstantlyFehler(new Error("Instantly /emails: 500 kaputt"), "cron-instantly", undefined, t0 + 3000);
    expect(gemeldet).toEqual(["cron-instantly", "cron-instantly"]);
    meldeInstantlyFehler(new InstantlyRateLimitError("/emails"), "cron-instantly", undefined, t0 + MELDE_ABSTAND_MS + 1);
    expect(gemeldet.length).toBe(3);
  });
});
