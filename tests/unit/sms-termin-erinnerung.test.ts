// SMS-Ersatz für WhatsApp-Terminerinnerungen (Ole, 25.11.2026): Zwecke, auslösende Fehler, Text in beiden Ansprachen.
import { describe, expect, it } from "vitest";
import { istTerminErinnerung, smsBeiZustellfehler, smsWann, terminErinnerungSmsText, terminSmsFuerVerlauf } from "@/lib/sms/termin-erinnerung";
import { smsSegmente } from "@/lib/mail-strecke/nur-sms";

const start = new Date("2026-11-27T13:30:00Z"); // Fr., 27.11., 14:30 Uhr Berlin
const link = "https://www.dein-beratungstermin.de/book/manage/abc123def456ghi789";

describe("SMS-Terminerinnerung", () => {
  it("nur Erinnerungen vor dem Termin", () => {
    for (const p of ["reminder", "reminder_soon", "reminder_start"]) expect(istTerminErinnerung(p)).toBe(true);
    for (const p of ["booking_confirmation", "outreach", "vertrieb_erinnerung", null]) expect(istTerminErinnerung(p)).toBe(false);
  });

  it("SMS nur bei „nicht zustellbar“, nie bei Abmeldung oder Fehlern auf unserer Seite", () => {
    expect(smsBeiZustellfehler({ code: 131026, title: "Message undeliverable" })).toBe(true);
    expect(smsBeiZustellfehler({ code: 131049, title: "This message was not delivered to maintain healthy ecosystem engagement." })).toBe(true);
    expect(smsBeiZustellfehler({ code: 1013, title: null })).toBe(true);
    expect(smsBeiZustellfehler({ code: 999999, title: "Message Undeliverable." })).toBe(true);
    expect(smsBeiZustellfehler({ code: 131050, title: "undeliverable" })).toBe(false);
    expect(smsBeiZustellfehler({ code: 132001, title: "Template does not exist" })).toBe(false);
    expect(smsBeiZustellfehler({ code: 131042, title: "Business eligibility payment issue" })).toBe(false);
    expect(smsBeiZustellfehler({ code: null, title: null })).toBe(false);
  });

  it("Datum mit Wochentag und Uhrzeit (Berlin)", () => {
    expect(smsWann(start)).toBe("Freitag, 27.11., um 14:30 Uhr");
    expect(smsWann(start, true)).toBe("Fr., 27.11., 14:30 Uhr");
  });

  it("Sie-Fassung: Datum, Uhrzeit, Art, Link, kein KI-Hinweis, keine Gedankenstriche", () => {
    const t = terminErinnerungSmsText({ an: "sie", hi: "Guten Tag Frau Becker,", hiKurz: "Guten Tag,", personDat: "Herrn Kannapinn", startsAt: start, mode: "video", link });
    expect(t).toBe(`Guten Tag Frau Becker, kurze Erinnerung an Ihren Termin mit Herrn Kannapinn am Freitag, 27.11., um 14:30 Uhr per Video. Verschieben oder absagen können Sie hier: ${link}`);
    expect(t).not.toMatch(/[–—]/);
    expect(t).not.toMatch(/KI|Assistent/);
    expect(smsSegmente(t).segmente).toBeLessThanOrEqual(2);
  });

  it("Du-Fassung", () => {
    const t = terminErinnerungSmsText({ an: "du", hi: "Hallo Anna,", hiKurz: "Hallo,", personDat: "Ole", startsAt: start, mode: "phone", link });
    expect(t).toBe(`Hallo Anna, kurze Erinnerung an deinen Termin mit Ole am Freitag, 27.11., um 14:30 Uhr per Telefon. Verschieben oder absagen kannst du hier: ${link}`);
  });

  it("vor Ort mit Adresse, zu lang: Adresse fällt weg; Video ohne Verwalten-Link: Videoraum", () => {
    const kurz = terminErinnerungSmsText({ an: "sie", hi: "Guten Tag Herr Test,", hiKurz: "Guten Tag,", personDat: "Frau Lohmann", startsAt: start, mode: "onsite", ort: "Hauptstr. 1, 12345 Berlin", link });
    expect(kurz).toContain("vor Ort (Hauptstr. 1, 12345 Berlin).");
    const lang = terminErinnerungSmsText({ an: "sie", hi: "Guten Tag Herr Test,", hiKurz: "Guten Tag,", personDat: "Frau Lohmann", startsAt: start, mode: "onsite", ort: "x".repeat(200), link });
    expect(lang).not.toContain("xxxx");
    expect(smsSegmente(lang).segmente).toBeLessThanOrEqual(2);
    const video = terminErinnerungSmsText({ an: "du", hi: "Hallo Anna,", hiKurz: "Hallo,", personDat: "Ole", startsAt: start, mode: "video", link: "https://meet.google.com/abc-defg-hij", linkIstVideo: true });
    expect(video).toContain("Dein Link zum Videoraum: https://meet.google.com/abc-defg-hij");
    expect(terminSmsFuerVerlauf(video)).not.toContain("https://");
  });
});
