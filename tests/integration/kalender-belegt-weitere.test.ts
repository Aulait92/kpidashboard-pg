// Weitere Kalender für „belegt“ (Ole, 18.11.2026): Ein nicht lesbarer Zusatzkalender (Live: „Kalender hallo@….cpm nicht
// abrufbar (notFound)“) ließ die Buchungsseite ohne Zeiten. Jetzt: überspringen, Hauptkalender zählt, Hinweis gespeichert,
// einmal protokolliert. Dazu: Adresse des Google-Kontos beim Verbinden bzw. nachträglich füllen.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/encryption";
import { googleExchangeCode, googleGetBusy } from "@/lib/calendar/google";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

let customerId = "";
let freeBusy: Record<string, unknown> = {};
let summary: string | null = "ole@beispiel.de";
const calls: string[] = [];

beforeAll(async () => {
  requireTestDb();
  process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
  Object.assign(process.env, { GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret", GOOGLE_REDIRECT_URI: "https://app.example/api/google/callback" });
  customerId = (await makeCustomer()).id;
});
afterAll(() => cleanupCustomer(customerId));
beforeEach(async () => {
  calls.length = 0;
  summary = "ole@beispiel.de";
  await prisma.calendarConnection.deleteMany({ where: { customerId } });
  await prisma.calendarConnection.create({
    data: { customerId, provider: "google", status: "connected", accessTokenEnc: encryptSecret("tok"), tokenExpiresAt: new Date(Date.now() + 3600_000), busyCalendarIds: ["hallo@beispiel.cpm"] },
  });
  freeBusy = {
    calendars: {
      primary: { busy: [{ start: "2026-11-20T09:00:00Z", end: "2026-11-20T10:00:00Z" }] },
      "hallo@beispiel.cpm": { errors: [{ domain: "global", reason: "notFound" }] },
    },
  };
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url);
      if (url.endsWith("/freeBusy")) return Response.json(freeBusy);
      if (url.includes("/calendars/primary/events")) return Response.json(summary ? { summary } : {});
      if (url.startsWith("https://oauth2.googleapis.com/token")) return Response.json({ access_token: "neu", refresh_token: "r", expires_in: 3600 });
      return new Response("?", { status: 404 });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Weitere Kalender für „belegt“", () => {
  it("unlesbarer Zusatzkalender: übersprungen, Hauptkalender zählt, Hinweis gespeichert, einmal protokolliert", async () => {
    const min = new Date("2026-11-20T00:00:00Z");
    const max = new Date("2026-11-21T00:00:00Z");
    const busy = await googleGetBusy(customerId, min, max);
    expect(busy.map((b) => b.start.toISOString())).toEqual(["2026-11-20T09:00:00.000Z"]);
    const row = await prisma.calendarConnection.findUniqueOrThrow({ where: { customerId } });
    expect(row.busyCalendarErrors).toEqual(["hallo@beispiel.cpm"]);
    await googleGetBusy(customerId, min, max);
    const warns = vi.mocked(console.warn).mock.calls.filter((c) => String(c[0]).includes("übersprungen"));
    expect(warns).toHaveLength(1);
    expect(JSON.stringify(warns[0])).toContain("hallo@beispiel.cpm (notFound)");
  });

  it("wieder lesbar (Adresse korrigiert) → Hinweis verschwindet", async () => {
    await prisma.calendarConnection.update({ where: { customerId }, data: { busyCalendarIds: ["hallo@beispiel.com"], busyCalendarErrors: ["hallo@beispiel.cpm"] } });
    freeBusy = { calendars: { primary: { busy: [] }, "hallo@beispiel.com": { busy: [{ start: "2026-11-20T12:00:00Z", end: "2026-11-20T13:00:00Z" }] } } };
    const busy = await googleGetBusy(customerId, new Date("2026-11-20T00:00:00Z"), new Date("2026-11-21T00:00:00Z"));
    expect(busy).toHaveLength(1);
    expect((await prisma.calendarConnection.findUniqueOrThrow({ where: { customerId } })).busyCalendarErrors).toEqual([]);
  });

  it("Hauptkalender nicht abrufbar → Fehler wie bisher", async () => {
    freeBusy = { calendars: { primary: { errors: [{ reason: "notFound" }] } } };
    await expect(googleGetBusy(customerId, new Date(), new Date(Date.now() + 3600_000))).rejects.toThrow(/neu verbinden/);
  });
});

describe("Adresse des Google-Kontos", () => {
  it("wird beim Verbinden gespeichert", async () => {
    await googleExchangeCode("code", customerId);
    const row = await prisma.calendarConnection.findUniqueOrThrow({ where: { customerId } });
    expect(row.accountEmail).toBe("ole@beispiel.de");
    expect(row.status).toBe("connected");
  });

  it("fehlt sie (ältere Verbindung), wird sie beim nächsten Abruf nachgetragen; ohne Adresse bleibt sie leer", async () => {
    await googleGetBusy(customerId, new Date("2026-11-20T00:00:00Z"), new Date("2026-11-21T00:00:00Z"));
    expect((await prisma.calendarConnection.findUniqueOrThrow({ where: { customerId } })).accountEmail).toBe("ole@beispiel.de");
    // Schon gesetzt: kein weiterer Abruf der Adresse
    calls.length = 0;
    await googleGetBusy(customerId, new Date("2026-11-20T00:00:00Z"), new Date("2026-11-21T00:00:00Z"));
    expect(calls.some((u) => u.includes("/events"))).toBe(false);
    summary = "Mein Kalender";
    await googleExchangeCode("code", customerId);
    expect((await prisma.calendarConnection.findUniqueOrThrow({ where: { customerId } })).accountEmail).toBeNull();
  });
});
