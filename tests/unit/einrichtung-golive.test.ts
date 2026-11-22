// Go-live-Prüfung der Einrichtung (erster Kunde Allianz-Generalvertretung, 20./21.11.2026): Freemail-Erkennung für die
// Einladung von 360dialog, Videoraum-Pflicht ohne Google/Microsoft und Auswege für Makler.
import { describe, expect, it } from "vitest";
import { istFreemail } from "@/lib/freemail";
import { meetOderTeams, videoLinkNoetig } from "@/lib/video-raum";
import { einladungsTestNoetig, kalenderSchrittFertig } from "@/lib/onboarding";
import { einladungAbsender } from "@/lib/calendar/app-kalender";
import { schrittAuswege, zeigePostfachVersichererHinweis } from "@/lib/einrichtung-auswege";

describe("istFreemail", () => {
  it("private Anbieter erkannt, auch mit Großschreibung und Leerzeichen", () => {
    for (const m of ["max@gmail.com", "max@gmx.de", "max@web.de", "max@t-online.de", "max@outlook.com", "max@hotmail.de", "max@icloud.com", "max@yahoo.de", "max@freenet.de", " Max@GMX.NET "]) {
      expect(istFreemail(m), m).toBe(true);
    }
  });

  it("Firmen- und Konzernadressen sind keine Freemail", () => {
    for (const m of ["max.lohmann@allianz.de", "info@lohmann-versicherungen.de", "max@ergo.de", "", null, undefined, "kein-at-zeichen"]) {
      expect(istFreemail(m), String(m)).toBe(false);
    }
  });
});

describe("Videoraum-Pflicht", () => {
  it("nur Google oder Microsoft verbunden erzeugt Meet/Teams-Links", () => {
    expect(meetOderTeams({ status: "connected", provider: "google" })).toBe(true);
    expect(meetOderTeams({ status: "connected", provider: "microsoft" })).toBe(true);
    expect(meetOderTeams({ status: "connected", provider: "app" })).toBe(false);
    expect(meetOderTeams({ status: "error", provider: "google" })).toBe(false);
    expect(meetOderTeams(null)).toBe(false);
    expect(videoLinkNoetig(null)).toBe(true);
    expect(videoLinkNoetig({ status: "connected", provider: "app" })).toBe(true);
    expect(videoLinkNoetig({ status: "connected", provider: "google" })).toBe(false);
  });

  const agent = (o: Partial<{ availabilityIcsUrlEnc: string | null; allianzCalendarEnc: string | null; videoRoomUrl: string | null }> = {}) => ({
    availabilityIcsUrlEnc: null,
    allianzCalendarEnc: null,
    videoRoomUrl: null,
    ...o,
  });

  it("Kalender-Link (ICS) ohne Video-Link: nicht fertig", () => {
    expect(kalenderSchrittFertig({ calendarConnection: null, agentConfig: agent({ availabilityIcsUrlEnc: "x" }) })).toBe(false);
  });

  it("Ausweg „Mein Versicherer erlaubt das nicht“: ohne Video-Link nicht fertig, mit Link fertig", () => {
    expect(kalenderSchrittFertig({ calendarConnection: null, agentConfig: null }, true)).toBe(false);
    expect(kalenderSchrittFertig({ calendarConnection: null, agentConfig: agent({ videoRoomUrl: "https://x.webex.com/meet/a" }) }, true)).toBe(true);
    // Google/Microsoft doch verbunden: Meet/Teams reicht
    expect(kalenderSchrittFertig({ calendarConnection: { status: "connected", provider: "microsoft" }, agentConfig: null }, true)).toBe(true);
  });
});

describe("Test-Einladung beim App-Kalender", () => {
  const agent = { availabilityIcsUrlEnc: null, allianzCalendarEnc: "x", videoRoomUrl: "https://allianz.webex.com/meet/max.muster" };
  const app = { status: "connected", provider: "app" };

  it("nur beim App-Kalender nötig", () => {
    expect(einladungsTestNoetig(app)).toBe(true);
    expect(einladungsTestNoetig({ status: "connected", provider: "google" })).toBe(false);
    expect(einladungsTestNoetig({ status: "pending", provider: "app" })).toBe(false);
    expect(einladungsTestNoetig(null)).toBe(false);
  });

  it("App-Kalender: Schritt erst nach „Ist angekommen“ erledigt", () => {
    expect(kalenderSchrittFertig({ calendarConnection: app, agentConfig: agent }, false, false)).toBe(false);
    expect(kalenderSchrittFertig({ calendarConnection: app, agentConfig: agent }, false, true)).toBe(true);
    // Google: keine Test-Einladung nötig
    expect(kalenderSchrittFertig({ calendarConnection: { status: "connected", provider: "google" }, agentConfig: null }, false, false)).toBe(true);
  });

  it("Absender für die IT aus OFFER_EMAIL_FROM", () => {
    expect(einladungAbsender({ OFFER_EMAIL_FROM: "performancegrowth <termin@performancegrowth.de>" })).toBe("termin@performancegrowth.de");
    expect(einladungAbsender({ RESEND_FROM: "info@performancegrowth.de" })).toBe("info@performancegrowth.de");
    expect(einladungAbsender({})).toBe("termin@performancegrowth.de");
  });
});

describe("Auswege in der Einrichtung", () => {
  const labels = (a: { label: string }[]) => a.map((x) => x.label);

  it("Makler: kein „Mein Versicherer erlaubt das nicht“ in Kalender, Postfach und WhatsApp", () => {
    for (const s of ["calendar", "mailbox", "whatsapp"] as const) {
      expect(labels(schrittAuswege(s, { makler: true }))).not.toContain("Mein Versicherer erlaubt das nicht");
    }
    // Postfach bleibt abschaltbar, WhatsApp bleibt verzichtbar
    expect(schrittAuswege("mailbox", { makler: true })).toEqual([{ kind: "mailbox_off", label: "Ohne E-Mail-Postfach arbeiten" }]);
    expect(labels(schrittAuswege("whatsapp", { makler: true }))).toEqual(["Ohne WhatsApp arbeiten"]);
    expect(zeigePostfachVersichererHinweis("makler")).toBe(false);
  });

  it("Vertreter: Ausweg bleibt, außer Allianz im Kalender oder schon übersprungen", () => {
    expect(labels(schrittAuswege("calendar", { makler: false }))).toEqual(["Mein Versicherer erlaubt das nicht"]);
    expect(schrittAuswege("calendar", { makler: false, allianz: true })).toEqual([]);
    expect(schrittAuswege("calendar", { makler: false, uebersprungen: true })).toEqual([]);
    expect(labels(schrittAuswege("mailbox", { makler: false }))).toEqual(["Mein Versicherer erlaubt das nicht"]);
    expect(labels(schrittAuswege("whatsapp", { makler: false }))).toEqual(["Mein Versicherer erlaubt das nicht", "Ohne WhatsApp arbeiten"]);
    expect(zeigePostfachVersichererHinweis("vertreter")).toBe(true);
    expect(zeigePostfachVersichererHinweis(null)).toBe(true);
  });
});
