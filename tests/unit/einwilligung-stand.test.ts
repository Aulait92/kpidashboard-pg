// Einwilligung im Kontakt: Etikett bei vollständiger Einwilligung, sonst Hinweis mit Folge (lib/einwilligung-stand.ts).
import { describe, expect, it } from "vitest";
import { einwilligungStand, einwilligungTon } from "@/lib/einwilligung-stand";

const nachweis = { at: "2026-11-14T20:45:00.000Z", formId: "123", textVersion: "2026-11-16", text: "Ich willige ein …", responses: [] };
const am = new Date("2026-11-12T10:00:00.000Z");

describe("einwilligungStand", () => {
  it("Häkchen gesetzt, nichts widerrufen: vollständig mit allen Kanälen und Nachweis", () => {
    const s = einwilligungStand({ waConsent: "ja", consentData: nachweis, meta: true });
    expect(s.stufe).toBe("vollstaendig");
    expect(s.kanaele).toEqual(["WhatsApp", "E-Mail", "Telefon"]);
    expect(s.hinweise).toEqual([]);
    expect(s.nachweis).toEqual({ at: nachweis.at, formId: "123", textVersion: "2026-11-16", text: "Ich willige ein …" });
    expect(einwilligungTon(s.stufe)).toBeNull();
  });

  it("Häkchen fehlt: keine Einwilligung, Assistent schreibt nicht (rot)", () => {
    const s = einwilligungStand({ waConsent: "nein", consentData: nachweis, meta: true });
    expect(s.stufe).toBe("keine");
    expect(s.kanaele).toEqual([]);
    expect(s.hinweise[0]).toBe("Keine Einwilligung für WhatsApp: Der Assistent schreibt nicht, bitte per E-Mail oder Telefon melden.");
    expect(einwilligungTon(s.stufe)).toBe("rot");
  });

  it("Meta-Formular ohne Häkchen: keine Einwilligung gespeichert, WhatsApp läuft weiter (wie whatsappErlaubt)", () => {
    const s = einwilligungStand({ waConsent: null, meta: true });
    expect(s.stufe).toBe("keine");
    expect(s.hinweise[0]).toContain("Keine Einwilligung gespeichert");
    expect(s.hinweise[0]).toContain("schreibt trotzdem per WhatsApp");
  });

  it("Kein Meta-Lead, kein Nachweis, keine Abmeldung: nichts zeigen (wie bisher)", () => {
    const s = einwilligungStand({ waConsent: null, meta: false });
    expect(s).toEqual({ stufe: "ohne", hinweise: [], kanaele: [], nachweis: null });
    expect(einwilligungTon(s.stufe)).toBeNull();
  });

  it("STOPP: WhatsApp widerrufen (rot), E-Mail und Telefon bleiben", () => {
    const s = einwilligungStand({ waConsent: "ja", consentData: nachweis, meta: true, whatsappStoppAt: am });
    expect(s.stufe).toBe("widerrufen");
    expect(s.kanaele).toEqual(["E-Mail", "Telefon"]);
    expect(s.hinweise).toEqual(["WhatsApp widerrufen am 12.11.2026 („STOPP“): Der Assistent schreibt nicht mehr."]);
    expect(einwilligungTon(s.stufe)).toBe("rot");
  });

  it("Abmeldung nur E-Mail: eingeschränkt (gelb)", () => {
    const s = einwilligungStand({ waConsent: "ja", consentData: nachweis, meta: true, mailAbgemeldetAt: am });
    expect(s.stufe).toBe("eingeschraenkt");
    expect(s.kanaele).toEqual(["WhatsApp", "Telefon"]);
    expect(s.hinweise).toEqual(["Abgemeldet am 12.11.2026: keine Werbung per E-Mail."]);
    expect(einwilligungTon(s.stufe)).toBe("gelb");
  });

  it("Abmeldung von allen Kanälen: widerrufen, deckt STOPP und E-Mail mit ab (ein Hinweis)", () => {
    const s = einwilligungStand({ waConsent: "ja", meta: true, alleAbgemeldetAt: am, whatsappStoppAt: am, mailAbgemeldetAt: am });
    expect(s.stufe).toBe("widerrufen");
    expect(s.kanaele).toEqual(["Telefon"]);
    expect(s.hinweise).toEqual(["Abgemeldet am 12.11.2026: keine Werbung per WhatsApp oder E-Mail."]);
  });

  it("Häkchen fehlt und E-Mail abgemeldet: bleibt rot, beide Hinweise", () => {
    const s = einwilligungStand({ waConsent: "nein", meta: true, mailAbgemeldetAt: am });
    expect(s.stufe).toBe("keine");
    expect(s.hinweise).toHaveLength(2);
  });

  it("STOPP bei einem Lead ohne Formular-Angaben: trotzdem Hinweis (widerrufen)", () => {
    const s = einwilligungStand({ waConsent: null, meta: false, whatsappStoppAt: am });
    expect(s.stufe).toBe("widerrufen");
    expect(s.hinweise).toHaveLength(1);
  });

  it("E-Mail abgemeldet bei einem Lead ohne Formular-Angaben: eingeschränkt", () => {
    expect(einwilligungStand({ waConsent: null, meta: false, mailAbgemeldetAt: am }).stufe).toBe("eingeschraenkt");
  });

  it("Ungültiger Nachweis wird ignoriert", () => {
    expect(einwilligungStand({ waConsent: "ja", meta: true, consentData: "kaputt" }).nachweis).toBeNull();
    expect(einwilligungStand({ waConsent: "ja", meta: true, consentData: { formId: "1" } }).nachweis).toBeNull();
  });
});
