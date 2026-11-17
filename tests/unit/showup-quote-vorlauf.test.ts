// Show-up-Paket (Ole, 17.11.2026): Erscheinensquote, Vorlaufzeit der Terminvorschläge, Mail „jetzt 45 Minuten“.
import { describe, expect, it } from "vitest";
import { erschienen, erscheinensquote, vorlaufGruppe } from "@/lib/erscheinensquote";
import { MAX_VORLAUF_WERKTAGE, pickTwoSlots, werktageBis } from "@/lib/whatsapp/termin-vorschlaege";
import { content } from "@/lib/calendar/lead-email";
import type { CustomerEvent } from "@/lib/calendar/add-to-calendar";

const H = 60 * 60 * 1000;

describe("Erscheinensquote je Vorlaufzeit, Produkt und Wochentag", () => {
  // Mi 18.11.2026, 10:00 Berlin
  const start = new Date("2026-11-18T09:00:00.000Z");
  const t = (vorlaufH: number, status: string, attendance: string | null, source: string | null = "Privatschutz") => ({
    startsAt: start,
    createdAt: new Date(start.getTime() - vorlaufH * H),
    status,
    attendance,
    source,
  });
  it("erschienen aus Anwesenheit bzw. Ergebnis, offene Termine zählen nicht", () => {
    expect(erschienen({ status: "booked", attendance: "erschienen" })).toBe(true);
    expect(erschienen({ status: "completed", attendance: null })).toBe(true);
    expect(erschienen({ status: "no_show", attendance: null })).toBe(false);
    expect(erschienen({ status: "booked", attendance: "nicht_erschienen" })).toBe(false);
    expect(erschienen({ status: "booked", attendance: "fehlt" })).toBeNull();
    expect(erschienen({ status: "booked", attendance: null })).toBeNull();
    expect(vorlaufGruppe(t(30, "x", null))).toBe("24 bis 48 h");
    expect(vorlaufGruppe(t(100, "x", null))).toBe("über 72 h");
  });
  it("Quote gesamt und je Gruppe in Prozent", () => {
    const q = erscheinensquote([
      t(30, "completed", null),
      t(30, "no_show", "nicht_erschienen"),
      t(10, "booked", "erschienen", "Zahnzusatz"),
      t(100, "no_show", null),
      t(30, "booked", null),
    ]);
    expect(q.gesamt).toMatchObject({ erschienen: 2, nichtErschienen: 2, gesamt: 4, quote: 50 });
    expect(q.ohneAngabe).toBe(1);
    expect(q.nachVorlauf.map((z) => [z.gruppe, z.gesamt, z.quote])).toEqual([
      ["unter 24 h", 1, 100],
      ["24 bis 48 h", 2, 50],
      ["48 bis 72 h", 0, null],
      ["über 72 h", 1, 0],
    ]);
    expect(q.nachWochentag.find((z) => z.gruppe === "Mittwoch")?.gesamt).toBe(4);
    expect(q.nachProdukt[0].gesamt).toBe(3);
  });
});

describe("Vorlaufzeit der Terminvorschläge: höchstens 3 Werktage, Wahl bleibt früheste plus anderer Tag", () => {
  const s = (iso: string) => ({ start: iso });
  // Do 19.11.2026, 18:00 Berlin
  const now = new Date("2026-11-19T17:00:00.000Z");
  it("Werktage zählen ohne Wochenende", () => {
    expect(werktageBis("2026-11-19T17:30:00.000Z", now)).toBe(0);
    expect(werktageBis("2026-11-20T09:00:00.000Z", now)).toBe(1); // Fr
    expect(werktageBis("2026-11-23T09:00:00.000Z", now)).toBe(2); // Mo
    expect(werktageBis("2026-11-25T09:00:00.000Z", now)).toBe(4); // Mi
    expect(MAX_VORLAUF_WERKTAGE).toBe(3);
  });
  it("zweite Zeit an einem anderen Tag, aber nicht weiter als 3 Werktage; sonst wie bisher", () => {
    const frei = [s("2026-11-20T09:00:00.000Z"), s("2026-11-20T13:00:00.000Z"), s("2026-11-25T09:00:00.000Z")];
    // ohne Grenze: Fr 10 Uhr und Mi (anderer Tag)
    expect(pickTwoSlots(frei)?.map((x) => x.start)).toEqual(["2026-11-20T09:00:00.000Z", "2026-11-25T09:00:00.000Z"]);
    // mit Grenze: Mi wäre der 4. Werktag → zweite Zeit am selben Tag
    expect(pickTwoSlots(frei, { now })?.map((x) => x.start)).toEqual(["2026-11-20T09:00:00.000Z", "2026-11-20T13:00:00.000Z"]);
    // Nur Zeiten nach 3 Werktagen frei: trotzdem zwei Vorschläge
    expect(pickTwoSlots([s("2026-11-26T09:00:00.000Z"), s("2026-11-27T09:00:00.000Z")], { now })).not.toBeNull();
  });
});

describe("Komplettcheck: Mail „jetzt 45 Minuten“ mit Kalenderdatei", () => {
  const ev: CustomerEvent = {
    uid: "a@termin",
    start: new Date("2026-11-18T09:00:00.000Z"),
    end: new Date("2026-11-18T09:45:00.000Z"),
    summary: "Termin",
    description: "",
    location: "",
    manageUrl: "https://app.example.org/book/manage/x",
    token: "x",
    advisorName: "Ole Kannapinn",
    mode: "video",
    videoUrl: "https://meet.google.com/abc",
  };
  it("Sie und Du, ohne Gedankenstriche", () => {
    const sie = content("updated", ev, { fullName: "Anna Becker", salutation: "Frau" }, "sie", { person: { nom: "Herr Kannapinn", dat: "Herrn Kannapinn" } });
    expect(sie.subject).toBe("Ihr Termin mit Herrn Kannapinn: jetzt 45 Minuten");
    expect(sie.lines.join(" ")).toContain("damit Herr Kannapinn im Termin auch kurz Ihre bestehenden Verträge mit Ihnen anschauen kann, haben wir Ihren Termin auf 45 Minuten verlängert.");
    expect(sie.calendar).toBe(true);
    const du = content("updated", ev, { fullName: "Anna Becker" }, "du", { person: { nom: "Ole", dat: "Ole" } });
    expect(du.lines.join(" ")).toContain("haben wir deinen Termin auf 45 Minuten verlängert");
    for (const x of [sie, du]) expect([x.subject, ...x.lines].join(" ")).not.toMatch(/[–—]/);
  });
});
