// Video-Link-Hinweis je Kalender-Weg und Gmail-Schalter (Ole, 26.11.2026)
import { describe, expect, it } from "vitest";
import { videoLinkHinweis, videoWeg } from "@/lib/video-raum";
import { googleMailFreigegeben, schalterAn } from "@/lib/mail/postfach";

describe("videoWeg", () => {
  it("Google/Microsoft verbunden, Weg ohne Online-Kalender, noch offen", () => {
    expect(videoWeg({ verbindung: { status: "connected", provider: "microsoft" } })).toBe("microsoft");
    expect(videoWeg({ verbindung: { status: "connected", provider: "google" }, hasIcs: true })).toBe("google");
    expect(videoWeg({ verbindung: { status: "connected", provider: "app" } })).toBe("ohne");
    expect(videoWeg({ verbindung: null, hasIcs: true })).toBe("ohne");
    expect(videoWeg({ verbindung: null, allianz: true })).toBe("ohne");
    expect(videoWeg({ verbindung: null, uebersprungen: true })).toBe("ohne");
    expect(videoWeg({ verbindung: { status: "error", provider: "google" } })).toBe("offen");
  });
});

describe("videoLinkHinweis", () => {
  it("Aufforderung erst nach einem Weg ohne Google/Microsoft", () => {
    expect(videoLinkHinweis("offen", false)).toEqual({ dringend: false, text: expect.stringMatching(/^Mit Google oder Microsoft erstellen wir den Videoraum automatisch/) });
    expect(videoLinkHinweis("ohne", false)).toEqual({ dringend: true, text: "Bitte eintragen: Ohne Link haben Videotermine keinen Raum." });
    expect(videoLinkHinweis("ohne", true).dringend).toBe(false);
  });
  it("Microsoft: Teams-Lizenz-Hinweis, nach fehlendem Teams-Link dringend", () => {
    expect(videoLinkHinweis("microsoft", false).text).toMatch(/Teams-Lizenz/);
    expect(videoLinkHinweis("microsoft", false, true)).toEqual({ dringend: true, text: expect.stringMatching(/kein Teams-Link/) });
    expect(videoLinkHinweis("microsoft", true, true).dringend).toBe(false);
  });
  it("keine Gedankenstriche", () => {
    for (const w of ["offen", "ohne", "google", "microsoft"] as const) for (const l of [true, false]) expect(videoLinkHinweis(w, l, true).text).not.toMatch(/[–—]/);
  });
});

describe("Gmail-Schalter", () => {
  const oauth = { GOOGLE_CLIENT_ID: "x", GOOGLE_CLIENT_SECRET: "y", GOOGLE_REDIRECT_URI: "https://z" };
  it("tolerant: 1, true, yes, mit Leerzeichen", () => {
    for (const v of ["1", " 1\n", "true", "TRUE", "yes", "ja", "on"]) expect(schalterAn(v)).toBe(true);
    for (const v of ["0", "", "false", undefined, "nein"]) expect(schalterAn(v)).toBe(false);
  });
  it("braucht OAuth-Variablen und den Schalter", () => {
    expect(googleMailFreigegeben({ ...oauth, GOOGLE_MAIL_VERIFIED: "true" })).toBe(true);
    expect(googleMailFreigegeben({ ...oauth })).toBe(false);
    expect(googleMailFreigegeben({ GOOGLE_MAIL_VERIFIED: "1" })).toBe(false);
  });
});
