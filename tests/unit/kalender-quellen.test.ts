import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Reine Logik der Verfügbarkeits-Quellen: Allianz-Online-Kalender (Slots →
// belegt), Lead-Zeiten, Blockierungen. Netz wird nachgebildet, keine DB.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  AllianzCalendarError,
  __resetAllianzCache,
  busyFromSlots,
  complementOf,
  fetchFreeSlots,
  moduleConfigFromScript,
  monthsBetween,
  parseVertretungInput,
  pickTemplate,
  vtnrFromPageHtml,
  type AllianzCalendar,
} from "@/lib/calendar/allianz-online";
import { berlinAt, blockRange, leadTimeWindows, leadTimesError, normalizeLeadTimes, normalizeTime, DEFAULT_LEAD_TIMES } from "@/lib/calendar/lead-times";
import { candidateTimes } from "@/lib/calendar";

const iso = (d: Date) => d.toISOString();
const span = (b: { start: Date; end: Date }) => [iso(b.start), iso(b.end)];

describe("Allianz-Online-Kalender: Eingabe", () => {
  it("erkennt Vertreter-Link in allen Schreibweisen und die VTNR", () => {
    expect(parseVertretungInput("vertretung.allianz.de/anid.schwarzkopf")).toEqual({ pageUrl: "https://vertretung.allianz.de/anid.schwarzkopf/" });
    expect(parseVertretungInput("https://vertretung.allianz.de/Anid.Schwarzkopf/termin?x=1")).toEqual({ pageUrl: "https://vertretung.allianz.de/anid.schwarzkopf/" });
    expect(parseVertretungInput(" 101 511 203 ")).toEqual({ vtnr: "101511203" });
    expect(parseVertretungInput("101511203-1")).toEqual({ vtnr: "101511203-1" });
  });

  it("lehnt fremde Seiten und Unsinn ab", () => {
    expect(parseVertretungInput("https://evil.example/vertretung.allianz.de/x")).toBeNull();
    expect(parseVertretungInput("vertretung.allianz.de.evil.example/x")).toBeNull();
    expect(parseVertretungInput("vertretung.allianz.de/")).toBeNull();
    expect(parseVertretungInput("12")).toBeNull();
  });

  it("liest die VTNR (agencyKey) aus dem Seiten-HTML", () => {
    const html = `<div data-agencydata="[{&#34;agencyKey&#34;:&#34;101511203&#34;,&#34;openingHoursText&#34;:&#34;&#34;}]"></div>`;
    expect(vtnrFromPageHtml(html)).toBe("101511203");
    expect(vtnrFromPageHtml("<html>nichts</html>")).toBeNull();
  });

  it("wählt Online-Beratung, sonst Telefon, sonst die erste Termin-Art", () => {
    const a = { name: "Beratung in Agentur" };
    const b = { name: "Termin für Rückruf vereinbaren" };
    const c = { name: "Online-Beratung" };
    expect(pickTemplate([a, b, c])).toBe(c);
    expect(pickTemplate([a, b])).toBe(b);
    expect(pickTemplate([a])).toBe(a);
    expect(pickTemplate([])).toBeNull();
  });

  it("liest Client-ID und Stamm-Organisation aus dem Skript der Buchungsseite", () => {
    const js = `i8={issuer:"x",clientId:"${"a".repeat(64)}",scope:"",domain:"https://auth.bookingtime.com"};class _1e{constructor(t){this.organizationId="${"b".repeat(32)}"}}`;
    expect(moduleConfigFromScript(js)).toEqual({ clientId: "a".repeat(64), rootOrgId: "b".repeat(32) });
    expect(moduleConfigFromScript("nichts")).toBeNull();
  });
});

describe("Allianz-Online-Kalender: freie Slots → belegt", () => {
  // Online-Beratung: 60 Min., 10 Min. Vorlauf, 30-Min.-Raster (Slots :10/:40).
  const base = { durationMin: 60, leadTimeMin: 10, followupMin: 0 };
  const min = new Date("2026-11-16T07:00:00Z"); // Mo 08:00 Berlin
  const max = new Date("2026-11-16T19:00:00Z"); // Mo 20:00 Berlin
  const knownFrom = new Date("2026-11-12T23:00:00Z");

  it("frei = Start − Vorlauf bis Start + Dauer + Nachlauf, überlappende Slots verschmelzen", () => {
    const busy = busyFromSlots({ ...base, slots: ["2026-11-16T10:10:00+01:00", "2026-11-16T10:40:00+01:00"], min, max, knownFrom, fallbackFree: [] });
    expect(busy.map(span)).toEqual([
      ["2026-11-16T07:00:00.000Z", "2026-11-16T09:00:00.000Z"], // bis 10:00 Berlin belegt
      ["2026-11-16T10:40:00.000Z", "2026-11-16T19:00:00.000Z"], // ab 11:40 Berlin belegt
    ]);
  });

  it("Nachlaufzeit (Hausbesuch: 30 vor, 30 nach) verlängert das freie Fenster", () => {
    const busy = busyFromSlots({ durationMin: 60, leadTimeMin: 30, followupMin: 30, slots: ["2026-11-16T14:30:00+01:00"], min, max, knownFrom, fallbackFree: [] });
    expect(busy.map(span)).toEqual([
      ["2026-11-16T07:00:00.000Z", "2026-11-16T13:00:00.000Z"],
      ["2026-11-16T15:00:00.000Z", "2026-11-16T19:00:00.000Z"],
    ]);
  });

  it("ohne Slots ist alles belegt, nie still frei", () => {
    expect(busyFromSlots({ ...base, slots: [], min, max, knownFrom, fallbackFree: [] }).map(span)).toEqual([[iso(min), iso(max)]]);
  });

  it("Sommer-/Winterzeit: Zeitstempel mit Offset werden exakt umgerechnet", () => {
    // 25.10.2026: Ende der Sommerzeit. 28.03.2027: Beginn.
    const a = busyFromSlots({ ...base, slots: ["2026-10-25T10:10:00+01:00"], min: new Date("2026-10-25T00:00:00Z"), max: new Date("2026-10-25T20:00:00Z"), knownFrom: new Date(0), fallbackFree: [] });
    expect(a[0].end.toISOString()).toBe("2026-10-25T09:00:00.000Z");
    const b = busyFromSlots({ ...base, slots: ["2027-03-28T10:10:00+02:00"], min: new Date("2027-03-28T00:00:00Z"), max: new Date("2027-03-28T20:00:00Z"), knownFrom: new Date(0), fallbackFree: [] });
    expect(b[0].end.toISOString()).toBe("2027-03-28T08:00:00.000Z");
    expect(berlinAt("2026-10-25", "10:00").toISOString()).toBe("2026-10-25T09:00:00.000Z");
    expect(berlinAt("2027-03-28", "10:00").toISOString()).toBe("2027-03-28T08:00:00.000Z");
    expect(berlinAt("2026-07-01", "16:30").toISOString()).toBe("2026-07-01T14:30:00.000Z");
  });

  it("Tage vor dem frühesten Buchungstag: Lead-Zeiten gelten als frei", () => {
    // Heute Mi 11.11., frühester Buchungstag Fr 13.11.
    const from = new Date("2026-11-11T23:00:00Z"); // Do 00:00 Berlin
    const kf = new Date("2026-11-12T23:00:00Z"); // Fr 00:00 Berlin
    const to = new Date("2026-11-13T23:00:00Z");
    const fallback = leadTimeWindows(DEFAULT_LEAD_TIMES, from, kf, 60);
    expect(fallback.map(span)).toEqual([
      ["2026-11-12T09:00:00.000Z", "2026-11-12T10:00:00.000Z"],
      ["2026-11-12T13:00:00.000Z", "2026-11-12T14:00:00.000Z"],
      ["2026-11-12T15:00:00.000Z", "2026-11-12T16:00:00.000Z"],
    ]);
    const busy = busyFromSlots({ ...base, slots: ["2026-11-13T14:10:00+01:00"], min: from, max: to, knownFrom: kf, fallbackFree: fallback });
    const isFree = (s: string, e: string) => !busy.some((b) => b.start < new Date(e) && b.end > new Date(s));
    expect(isFree("2026-11-12T09:00:00Z", "2026-11-12T09:30:00Z")).toBe(true); // Do 10:00 (Lead-Zeit)
    expect(isFree("2026-11-12T10:00:00Z", "2026-11-12T10:30:00Z")).toBe(false); // Do 11:00
    expect(isFree("2026-11-13T13:00:00Z", "2026-11-13T13:30:00Z")).toBe(true); // Fr 14:00 (Slot 14:10)
    expect(isFree("2026-11-13T09:00:00Z", "2026-11-13T09:30:00Z")).toBe(false); // Fr 10:00: kein Slot → belegt
  });

  it("Monate über den Jahreswechsel und Ergänzung", () => {
    expect(monthsBetween(new Date("2026-12-20T10:00:00Z"), new Date("2027-02-01T10:00:00Z"))).toEqual([
      { y: 2026, m: 12 },
      { y: 2027, m: 1 },
      { y: 2027, m: 2 },
    ]);
    const a = new Date("2026-01-01T00:00:00Z");
    const b = new Date("2026-01-01T10:00:00Z");
    expect(complementOf([{ start: new Date("2026-01-01T02:00:00Z"), end: new Date("2026-01-01T03:00:00Z") }], a, b).map(span)).toEqual([
      ["2026-01-01T00:00:00.000Z", "2026-01-01T02:00:00.000Z"],
      ["2026-01-01T03:00:00.000Z", "2026-01-01T10:00:00.000Z"],
    ]);
  });
});

describe("Allianz-Online-Kalender: Abruf", () => {
  const cal: AllianzCalendar = {
    vtnr: "101511203",
    pageUrl: null,
    orgId: "o".repeat(32),
    orgName: "Agentur Test",
    templateId: "t".repeat(32),
    templateName: "Online-Beratung",
    durationMin: 60,
    leadTimeMin: 10,
    followupMin: 0,
    bookingDayEarliest: 2,
    templates: [],
    resources: [],
    resourceId: null,
  };
  const JS = `x={clientId:"${"c".repeat(64)}",domain:"https://auth.bookingtime.com"};y=class{constructor(){this.organizationId="${"r".repeat(32)}"}}`;
  let failMonth = false;
  let monthCalls = 0;
  beforeEach(() => {
    __resetAllianzCache();
    failMonth = false;
    monthCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.startsWith("https://booking.allianz-abv.eps.bookingtime.com/assets/")) return new Response(JS);
        if (url.startsWith("https://booking.allianz-abv.eps.bookingtime.com/")) return new Response('<script type="module" src="/assets/index-abc.js"></script>');
        if (url.startsWith("https://auth.bookingtime.com/")) return Response.json({ refresh_token: "r", access_token: "a", expires_in: 300 });
        if (url.includes("/listMonth")) {
          monthCalls++;
          if (failMonth) return new Response("kaputt", { status: 500 });
          return Response.json({ content: { timeZone: "Europe/Berlin", list: [{ timestamp: "2026-12-01T10:10:00+01:00", bookingResourceIdList: ["x"] }] } });
        }
        return new Response("?", { status: 404 });
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("liefert Slots und ruft je Monat höchstens einmal in 10 Minuten ab", async () => {
    const min = new Date("2026-12-01T00:00:00Z");
    const max = new Date("2026-12-02T00:00:00Z");
    const [a, b] = await Promise.all([fetchFreeSlots(cal, min, max), fetchFreeSlots(cal, min, max)]);
    expect(a).toEqual(["2026-12-01T10:10:00+01:00"]);
    expect(b).toEqual(a);
    await fetchFreeSlots(cal, min, max);
    expect(monthCalls).toBe(1);
  });

  it("Abruf fehlgeschlagen → Fehler, nichts zwischengespeichert", async () => {
    failMonth = true;
    const min = new Date("2026-12-01T00:00:00Z");
    const max = new Date("2026-12-02T00:00:00Z");
    await expect(fetchFreeSlots(cal, min, max)).rejects.toBeInstanceOf(AllianzCalendarError);
    failMonth = false;
    await expect(fetchFreeSlots(cal, min, max)).resolves.toHaveLength(1);
    expect(monthCalls).toBe(2);
  });

  it("nur Slots der gewählten Person", async () => {
    const min = new Date("2026-12-01T00:00:00Z");
    const max = new Date("2026-12-02T00:00:00Z");
    expect(await fetchFreeSlots({ ...cal, resourceId: "y" }, min, max)).toEqual([]);
    expect(await fetchFreeSlots({ ...cal, resourceId: "x" }, min, max)).toHaveLength(1);
  });
});

describe("Lead-Zeiten und Blockierungen", () => {
  it("normalisiert Eingaben", () => {
    expect(normalizeTime("9")).toBe("09:00");
    expect(normalizeTime("17:30")).toBe("17:30");
    expect(normalizeTime("17:31")).toBeNull();
    expect(normalizeTime("25:00")).toBeNull();
    expect(normalizeLeadTimes({ weekdays: ["5", 1, 1, 9], times: ["16:00", "10:00", "x", "10:00"] })).toEqual({ weekdays: [1, 5], times: ["10:00", "16:00"] });
    expect(leadTimesError({ weekdays: [], times: ["10:00"] })).toMatch(/Wochentag/);
    expect(leadTimesError({ weekdays: [1], times: [] })).toMatch(/Uhrzeit/);
    expect(leadTimesError(DEFAULT_LEAD_TIMES)).toBeNull();
  });

  it("Standard bleibt Mo–Fr 10/14/16 Uhr", () => {
    expect(DEFAULT_LEAD_TIMES).toEqual({ weekdays: [1, 2, 3, 4, 5], times: ["10:00", "14:00", "16:00"], durationMin: 30 });
    expect(candidateTimes("lead", DEFAULT_LEAD_TIMES, 6)).toEqual([]);
    expect(candidateTimes("lead", DEFAULT_LEAD_TIMES, 2)).toEqual(["10:00", "14:00", "16:00"]);
    expect(candidateTimes({ lead: true, prefer: ["09:00"] }, DEFAULT_LEAD_TIMES, 2)).toEqual(["09:00", "10:00", "14:00", "16:00"]);
    // Feste Stunden (Buchungsseite, Hilfetermin): wie bisher nur Mo–Fr.
    expect(candidateTimes([9, 17], DEFAULT_LEAD_TIMES, 0)).toEqual([]);
    expect(candidateTimes([9, 17], { weekdays: [], times: [] }, 3)).toEqual(["09:00", "17:00"]);
    // Eigene Einstellung inkl. Samstag
    expect(candidateTimes("lead", { weekdays: [6], times: ["11:00"] }, 6)).toEqual(["11:00"]);
  });

  it("Zeit blockieren: Datum + von–bis in Berliner Zeit", () => {
    expect(blockRange("2026-11-20", "09:00", "12:30")).toEqual({ startsAt: new Date("2026-11-20T08:00:00Z"), endsAt: new Date("2026-11-20T11:30:00Z") });
    expect(blockRange("2026-11-20", "12:00", "09:00")).toEqual({ error: expect.stringMatching(/Ende/) });
    expect(blockRange("", "09:00", "10:00")).toEqual({ error: expect.stringMatching(/Datum/) });
  });
});

describe("Lead-Zeiten je Wochentag (wie Calendly)", () => {
  it("Montag nur vormittags, sonst ganztags", async () => {
    const { parseSchedule, leadTimesFromSchedule, timesForDay } = await import("@/lib/calendar/lead-times");
    const p = parseSchedule({ step: 60, days: { 1: [["08:00", "13:00"]], 2: [["08:00", "19:00"]], 3: [["08:00", "12:00"], ["14:00", "18:00"]] } });
    if (!p || "error" in p) throw new Error("ungültig");
    const lt = leadTimesFromSchedule(p.schedule, 30);
    expect(timesForDay(lt, 1)).toEqual(["08:00", "09:00", "10:00", "11:00", "12:00"]);
    expect(timesForDay(lt, 2)).toHaveLength(11);
    expect(timesForDay(lt, 3)).toEqual(["08:00", "09:00", "10:00", "11:00", "14:00", "15:00", "16:00", "17:00"]);
    expect(timesForDay(lt, 0)).toEqual([]);
    expect(lt.weekdays).toEqual([1, 2, 3]);
    // Vorschläge nutzen die Zeiten des Tages
    expect(candidateTimes("lead", lt, 1)).not.toContain("14:00");
    expect(candidateTimes("lead", lt, 2)).toContain("14:00");
  });

  it("Termin muss in den Zeitraum passen; Fehler bei bis vor von", async () => {
    const { parseSchedule, leadTimesFromSchedule, timesForDay, leadTimesError } = await import("@/lib/calendar/lead-times");
    const p = parseSchedule({ step: 30, days: { 1: [["09:00", "10:00"]] } });
    if (!p || "error" in p) throw new Error("ungültig");
    expect(timesForDay(leadTimesFromSchedule(p.schedule, 60), 1)).toEqual(["09:00"]);
    expect(leadTimesError(leadTimesFromSchedule(p.schedule, 60))).toBeNull();
    const short = parseSchedule({ step: 30, days: { 1: [["09:00", "09:30"]] } });
    if (!short || "error" in short) throw new Error("ungültig");
    expect(leadTimesError(leadTimesFromSchedule(short.schedule, 60))).toMatch(/mindestens einen Tag/);
    expect(parseSchedule({ step: 30, days: { 1: [["13:00", "09:00"]] } })).toEqual({ error: "Mo: „bis“ muss nach „von“ liegen." });
  });

  it("alte einheitliche Zeiten werden zu Zeiträumen", async () => {
    const { scheduleFromTimes, leadTimesFromSchedule, timesForDay } = await import("@/lib/calendar/lead-times");
    const old = { weekdays: [1, 2, 3, 4, 5], times: ["10:00", "14:00", "16:00"], durationMin: 30 };
    const s = scheduleFromTimes(old);
    expect(s.days[1]).toEqual([["10:00", "10:30"], ["14:00", "14:30"], ["16:00", "16:30"]]);
    expect(timesForDay(leadTimesFromSchedule(s, 30), 3)).toEqual(old.times);
    const grid = { weekdays: [1], times: ["09:00", "09:30", "10:00"], durationMin: 30 };
    const g = scheduleFromTimes(grid);
    expect(g).toEqual({ step: 30, days: { 1: [["09:00", "10:30"]] } });
  });
});
