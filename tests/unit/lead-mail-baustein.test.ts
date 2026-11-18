// Lead-Mail-Baustein (Ole, 17.11.2026, Paket P0): Absender „Name | Agentur“ nur auf unserer Versanddomain, Signatur
// aus den Anbieterangaben mit Erstinfo-Link, Bestätigungs- und Erinnerungs-Mail mit „Herrn Kannapinn“.
import { describe, expect, it } from "vitest";
import { leadAnzeigename, leadFromKopf, leadMailAdresse, leadSignatur, postfachSignatur } from "@/lib/mail/lead-absender";
import { BROWSER_HINWEIS, content, erinnerungsBetreff, istMorgen, leadEmailBody, uhrzeitKurz } from "@/lib/calendar/lead-email";
import { vermittlerName } from "@/lib/whatsapp/gespraech";
import { hatGedankenstrich } from "@/lib/gedankenstriche";
import type { CustomerEvent } from "@/lib/calendar/add-to-calendar";

const ERSTINFO = "https://www.dein-beratungstermin.de/erstinformation/abc123";
const DATEN = { name: "Ole Kannapinn", agentur: "Kannapinn Versicherungen", anschrift: "Hauptstraße 1\n80331 München", telefon: "089 123456", erstinfoUrl: ERSTINFO };
const HERR = vermittlerName("sie", { name: "Ole Kannapinn", anrede: "Herr", fallback: "Kannapinn Versicherungen" });

function ev(start: Date, extra: Partial<CustomerEvent> = {}): CustomerEvent {
  return {
    uid: "x@termin",
    start,
    end: new Date(start.getTime() + 30 * 60_000),
    summary: "Beratung",
    description: "",
    location: "",
    manageUrl: "https://www.dein-beratungstermin.de/book/manage/tok1",
    token: "tok1",
    advisorName: "Ole Kannapinn",
    mode: "video",
    videoUrl: "https://meet.example/abc",
    ...extra,
  };
}

describe("Absender", () => {
  it("Anzeigename „Vorname Nachname | Agentur“, ohne Agentur nur der Name", () => {
    expect(leadAnzeigename("Ole Kannapinn", "Kannapinn Versicherungen")).toBe("Ole Kannapinn | Kannapinn Versicherungen");
    expect(leadAnzeigename("Ole Kannapinn", null)).toBe("Ole Kannapinn");
    expect(leadAnzeigename("Agentur Meier", "Agentur Meier")).toBe("Agentur Meier");
    expect(leadAnzeigename('Ole "O" <Kannapinn>', "A|B")).toBe("Ole O Kannapinn | AB");
    expect(leadFromKopf("Ole Kannapinn", "Kannapinn Versicherungen", "termine@dein-beratungstermin.de")).toBe(
      '"Ole Kannapinn | Kannapinn Versicherungen" <termine@dein-beratungstermin.de>',
    );
  });

  it("Adresse nur aus BOOKING_EMAIL_FROM bzw. LEAD_EMAIL_FROM, sonst null (kein Versand, keine fremde Domain)", () => {
    expect(leadMailAdresse({ BOOKING_EMAIL_FROM: "termine@dein-beratungstermin.de" })).toBe("termine@dein-beratungstermin.de");
    expect(leadMailAdresse({ BOOKING_EMAIL_FROM: "performancegrowth <termine@dein-beratungstermin.de>" })).toBe("termine@dein-beratungstermin.de");
    expect(leadMailAdresse({ LEAD_EMAIL_FROM: "leads@dein-beratungstermin.de" })).toBe("leads@dein-beratungstermin.de");
    expect(leadMailAdresse({ BOOKING_EMAIL_FROM: "termine@a.de", LEAD_EMAIL_FROM: "leads@b.de" })).toBe("termine@a.de");
    expect(leadMailAdresse({})).toBeNull();
    expect(leadMailAdresse({ BOOKING_EMAIL_FROM: "kaputt" })).toBeNull();
  });
});

describe("Signatur aus den Anbieterangaben", () => {
  it("Name, Agentur, Anschrift einzeilig, Telefon und Erstinfo-Link (Text und HTML)", () => {
    const s = leadSignatur(DATEN);
    expect(s.text).toBe(
      ["Viele Grüße", "Ole Kannapinn", "Kannapinn Versicherungen", "Hauptstraße 1, 80331 München", "Telefon: 089 123456", `Erstinformation: ${ERSTINFO}`].join("\n"),
    );
    expect(s.html).toContain(`href="${ERSTINFO}"`);
    expect(s.html).toContain("Kannapinn Versicherungen");
    expect(hatGedankenstrich(s.text)).toBe(false);
  });

  it("fehlende Angaben entfallen; Agentur gleich Name nur einmal", () => {
    const s = leadSignatur({ name: "Agentur Meier", agentur: "Agentur Meier", anschrift: null, telefon: null, erstinfoUrl: ERSTINFO });
    expect(s.text).toBe(`Viele Grüße\nAgentur Meier\nErstinformation: ${ERSTINFO}`);
  });

  it("eigene Signatur des Postfachs, leer → null", () => {
    expect(postfachSignatur("Beste Grüße\nOle Kannapinn")).toEqual({ text: "Beste Grüße\nOle Kannapinn", html: expect.stringContaining("Beste Grüße<br>Ole Kannapinn") });
    expect(postfachSignatur("  ")).toBeNull();
    expect(postfachSignatur(null)).toBeNull();
  });
});

describe("Erinnerung am Vortag", () => {
  // Dienstag, 17.11.2026, 18:00 Uhr Berlin
  const NOW = new Date("2026-11-17T17:00:00Z");

  it("Betreff „Morgen um 10 Uhr: Ihr Videotermin mit Herrn Kannapinn“", () => {
    const start = new Date("2026-11-18T09:00:00Z"); // 10:00 Berlin
    expect(erinnerungsBetreff({ start, now: NOW, mode: "video", an: "sie", person: HERR })).toBe("Morgen um 10 Uhr: Ihr Videotermin mit Herrn Kannapinn");
    expect(content("reminder", ev(start), { fullName: "Julia Schneider", salutation: "Frau" }, "sie", { person: HERR, now: NOW }).subject).toBe(
      "Morgen um 10 Uhr: Ihr Videotermin mit Herrn Kannapinn",
    );
  });

  it("Minuten, Telefon, Du und anderer Tag: Datum statt „Morgen“", () => {
    const halb = new Date("2026-11-18T09:30:00Z");
    expect(uhrzeitKurz(halb)).toBe("10:30 Uhr");
    expect(erinnerungsBetreff({ start: halb, now: NOW, mode: "phone", an: "sie", person: HERR })).toBe("Morgen um 10:30 Uhr: Ihr Telefontermin mit Herrn Kannapinn");
    const du = vermittlerName("du", { name: "Ole Kannapinn", anrede: "Herr", fallback: "x" });
    expect(erinnerungsBetreff({ start: halb, now: NOW, mode: "video", an: "du", person: du })).toBe("Morgen um 10:30 Uhr: Dein Videotermin mit Ole");
    const spaeter = new Date("2026-11-20T08:00:00Z"); // Freitag 9 Uhr
    expect(erinnerungsBetreff({ start: spaeter, now: NOW, mode: "video", an: "sie", person: HERR })).toBe("Freitag, 20. November um 9 Uhr: Ihr Videotermin mit Herrn Kannapinn");
    // kurz vor Mitternacht bzw. über Mitternacht in Berlin
    expect(istMorgen(new Date("2026-11-18T22:30:00Z"), new Date("2026-11-17T22:30:00Z"))).toBe(true);
    expect(istMorgen(new Date("2026-11-17T23:30:00Z"), new Date("2026-11-17T21:00:00Z"))).toBe(true);
    expect(istMorgen(new Date("2026-11-17T22:30:00Z"), new Date("2026-11-17T21:00:00Z"))).toBe(false);
  });

  it("Text mit Videolink, Browser-Hinweis, Verschieben-Link und Signatur", () => {
    const start = new Date("2026-11-18T09:00:00Z");
    const c = content("reminder", ev(start), { fullName: "Julia Schneider", salutation: "Frau" }, "sie", { person: HERR, now: NOW });
    const b = leadEmailBody(c, ev(start), leadSignatur(DATEN));
    expect(b.text).toContain("Ihre Videoberatung mit Herrn Kannapinn");
    expect(b.text).toContain("https://meet.example/abc");
    expect(b.text).toContain(BROWSER_HINWEIS);
    expect(b.text).toContain("Verschieben oder absagen: https://www.dein-beratungstermin.de/book/manage/tok1");
    expect(b.text.trimEnd().endsWith(`Erstinformation: ${ERSTINFO}`)).toBe(true);
    expect(b.html).toContain(`<a href="https://meet.example/abc"`);
    expect(hatGedankenstrich(c.subject + b.text)).toBe(false);
  });
});

describe("Bestätigungs-Mail", () => {
  const start = new Date("2026-11-18T09:00:00Z");

  it("Sie: „Herrn Kannapinn“, Browser-Hinweis, PDF-Satz und Erstinfo-Link", () => {
    const c = content("booked", ev(start), { fullName: "Julia Schneider", salutation: "Frau" }, "sie", { person: HERR, erstinfoUrl: ERSTINFO, erstinfoPdf: true });
    expect(c.subject).toBe("Ihr Termin mit Herrn Kannapinn: Mittwoch, 18. November um 10:00 Uhr");
    expect(c.lines).toContain(BROWSER_HINWEIS);
    expect([...c.lines, ...c.nach].join("\n")).toContain("Im Anhang finden Sie die Erstinformation zu Herrn Kannapinn");
    expect([...c.lines, ...c.nach].join("\n")).toContain(`Die Erstinformation finden Sie auch online: ${ERSTINFO}`);
    expect(c.lines[1]).toBe("vielen Dank! Ihre Videoberatung mit Herrn Kannapinn ist gebucht: Mittwoch, 18. November um 10:00 Uhr.");
    expect(c.calendar).toBe(true);
  });

  it("ohne PDF nur der Link; ohne bekannte Anrede der volle Name; Telefon „Herr Kannapinn ruft Sie an“", () => {
    const voll = vermittlerName("sie", { name: "Ole Kannapinn", anrede: null, fallback: "x" });
    const c = content("booked", ev(start, { mode: "phone", videoUrl: null }), "Julia Schneider", "sie", { person: voll, erstinfoUrl: ERSTINFO });
    expect(c.subject).toContain("Ihr Termin mit Ole Kannapinn");
    expect([...c.lines, ...c.nach].join("\n")).toContain(`Die Erstinformation zu Ole Kannapinn als Versicherungsvermittler finden Sie hier: ${ERSTINFO}`);
    expect([...c.lines, ...c.nach].join("\n")).not.toContain("Im Anhang");
    const tel = content("booked", ev(start, { mode: "phone", videoUrl: null }), "Julia Schneider", "sie", { person: HERR });
    expect(tel.lines).toContain("Herr Kannapinn ruft Sie zur vereinbarten Zeit an.");
    expect(tel.lines).not.toContain(BROWSER_HINWEIS);
  });

  it("Du: Vorname, du-Form, ohne Gedankenstriche", () => {
    const du = vermittlerName("du", { name: "Ole Kannapinn", anrede: "Herr", fallback: "x" });
    const c = content("booked", ev(start), { firstName: "Julia", lastName: "Schneider" }, "du", { person: du, erstinfoUrl: ERSTINFO, erstinfoPdf: true });
    expect(c.subject).toBe("Dein Termin mit Ole: Mittwoch, 18. November um 10:00 Uhr");
    const t = [...c.lines, ...c.nach].join("\n");
    expect(t).toContain("Hallo Julia,");
    expect(t).toContain("Im Anhang findest du die Erstinformation zu Ole");
    expect(t).toContain(`Die Erstinformation findest du auch online: ${ERSTINFO}`);
    expect(t).not.toMatch(/\b(Sie|Ihre|Ihnen)\b/);
    expect(hatGedankenstrich(c.subject + t)).toBe(false);
    expect(t).not.toMatch(/Garantie/i);
  });

  it("Team: anderer Berater ohne Anrede mit Vor- und Nachnamen", () => {
    const berater = vermittlerName("sie", { name: "Max Berater", anrede: null, fallback: "Agentur Meier" });
    const c = content("booked", ev(start), "Julia Schneider", "sie", { person: berater });
    expect(c.subject).toContain("Ihr Termin mit Max Berater");
  });
});
