// Kennzeichen „Kein WhatsApp“ in Pipeline und Kontaktliste (Ole, 16.11.2026)
import { describe, expect, it } from "vitest";
import { istFruehePhase, whatsAppNichtErreichbar, zeigtKeinWhatsApp, type KeinWhatsAppFakten } from "@/lib/kein-whatsapp-kennzeichen";

const lead = (f: Partial<KeinWhatsAppFakten> = {}): KeinWhatsAppFakten => ({
  status: "Neuer Lead",
  phone: "491701234567",
  outreachStatus: "failed: Meta 131026",
  waUnavailableAt: null,
  closedAt: null,
  erasedAt: null,
  replied: false,
  ...f,
});

describe("WhatsApp nicht erreichbar", () => {
  it("erkennt Fehler bei der ersten Nachricht, kein WhatsApp und Abmeldung", () => {
    expect(whatsAppNichtErreichbar({ outreachStatus: "failed: Meta 131026" })).toBe(true);
    expect(whatsAppNichtErreichbar({ outreachStatus: "failed: Meta ohne Code" })).toBe(true);
    expect(whatsAppNichtErreichbar({ outreachStatus: "no_whatsapp" })).toBe(true);
    expect(whatsAppNichtErreichbar({ outreachStatus: "skipped_optout" })).toBe(true);
    expect(whatsAppNichtErreichbar({ outreachStatus: "sent", waUnavailableAt: new Date() })).toBe(true);
  });
  it("normale Zustände zählen nicht", () => {
    for (const s of [null, "", "sent", "sent_booked", "no_template", "skipped_no_consent"]) {
      expect(whatsAppNichtErreichbar({ outreachStatus: s, waUnavailableAt: null })).toBe(false);
    }
  });
});

describe("frühe Phase", () => {
  it("Neuer Lead, ohne Status und Nicht erreicht", () => {
    expect(istFruehePhase(null)).toBe(true);
    expect(istFruehePhase("")).toBe(true);
    expect(istFruehePhase("Neuer Lead")).toBe(true);
    expect(istFruehePhase("Nicht erreicht")).toBe(true);
  });
  it("ab Gespräch, Termin, Angebot, Gewonnen oder Verloren nicht mehr", () => {
    for (const s of ["Im Gespräch", "In Beratung", "Termin vereinbart", "Angebot gesendet", "Abschluss", "Kein Interesse", "Disqualifiziert", "Storno"]) {
      expect(istFruehePhase(s)).toBe(false);
    }
  });
});

describe("Kennzeichen zeigen", () => {
  it("früher Lead mit Nummer und Zustellfehler", () => {
    expect(zeigtKeinWhatsApp(lead())).toBe(true);
    expect(zeigtKeinWhatsApp(lead({ status: "Nicht erreicht", outreachStatus: "skipped_optout" }))).toBe(true);
  });
  it("nicht ohne Nummer, nach Abschluss, gelöscht oder wenn der Lead selbst geschrieben hat", () => {
    expect(zeigtKeinWhatsApp(lead({ phone: null }))).toBe(false);
    expect(zeigtKeinWhatsApp(lead({ phone: " " }))).toBe(false);
    expect(zeigtKeinWhatsApp(lead({ closedAt: new Date() }))).toBe(false);
    expect(zeigtKeinWhatsApp(lead({ erasedAt: new Date() }))).toBe(false);
    expect(zeigtKeinWhatsApp(lead({ replied: true }))).toBe(false);
  });
  it("nicht in späteren Phasen und nicht ohne Fehler", () => {
    expect(zeigtKeinWhatsApp(lead({ status: "In Beratung" }))).toBe(false);
    expect(zeigtKeinWhatsApp(lead({ status: "Abschluss" }))).toBe(false);
    expect(zeigtKeinWhatsApp(lead({ outreachStatus: "sent" }))).toBe(false);
  });
});
