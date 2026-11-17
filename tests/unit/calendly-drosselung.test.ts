// Calendly 429 im stündlichen Abgleich (Sentry KPIDASHBOARD-PG-E): warten und erneut versuchen,
// nach zwei Wiederholungen eigener Fehlertyp (Cron meldet ihn nicht an Sentry); Abgleich-Fenster einstellbar.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/vertrieb/linkedin", () => ({ Matcher: { load: async () => ({}) } }));

import { CalendlyRateLimitError, calendlyRetryMs, syncCalendly } from "@/lib/vertrieb/calendly";

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const limited = () => new Response("", { status: 429, headers: { "retry-after": "0" } });
const ME = { resource: { uri: "https://api.calendly.com/users/u1", current_organization: "o1", name: "Ole", email: "o@example.test" } };
const EMPTY = { collection: [], pagination: { next_page: null } };

describe("Calendly-Drosselung", () => {
  const calls: string[] = [];
  beforeEach(() => {
    calls.length = 0;
    process.env.CALENDLY_TOKEN = "tok";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.CALENDLY_TOKEN;
  });

  it("Wartezeit aus Retry-After bzw. X-RateLimit-Reset, gedeckelt auf 30 s, sonst 10 s", () => {
    expect(calendlyRetryMs(new Headers({ "retry-after": "3" }))).toBe(3000);
    expect(calendlyRetryMs(new Headers({ "x-ratelimit-reset": "12" }))).toBe(12000);
    expect(calendlyRetryMs(new Headers({ "retry-after": "600" }))).toBe(30000);
    expect(calendlyRetryMs(new Headers())).toBe(10000);
  });

  it("429 einmal: erneuter Versuch, Abgleich läuft durch; Fenster aus sinceDays", async () => {
    const answers = [limited(), json(ME), json(EMPTY), json(EMPTY)];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (calls.push(url), answers.shift()!)));
    const before = Date.now();
    const stats = await syncCalendly({ sinceDays: 3 });
    expect(stats).toEqual({ events: 0, invitees: 0, new: 0, canceled: 0 });
    expect(calls).toHaveLength(4);
    const min = new URL(calls[2]).searchParams.get("min_start_time")!;
    const days = (before - new Date(min).getTime()) / 86400000;
    expect(days).toBeGreaterThan(2.99);
    expect(days).toBeLessThan(3.01);
  });

  it("dauerhaft 429: nach drei Versuchen CalendlyRateLimitError (kein gewöhnlicher Fehler)", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (calls.push(url), limited())));
    await expect(syncCalendly()).rejects.toBeInstanceOf(CalendlyRateLimitError);
    expect(calls).toHaveLength(3);
  });

  it("andere Fehler bleiben normale Fehler (werden weiter gemeldet)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("kaputt", { status: 500 })));
    const err = await syncCalendly().catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(CalendlyRateLimitError);
    expect(String(err)).toContain("Calendly 500: kaputt");
  });
});
