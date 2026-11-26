// „Weiter auf WhatsApp“ nach der Buchung (Ole, 26.11.2026): vorbefüllte Nachricht erkennen, wa.me-Link, Nachfrage nach
// etwa 3 Stunden nur Mo bis Sa 8 bis 20 Uhr (lib/whatsapp/vorab.ts, termin-strecke.ts nachfassAb).
import { describe, expect, it } from "vitest";
import { istVorabNachricht, VORAB_TEXT, waNummer, waVorabLink } from "@/lib/whatsapp/vorab";
import { nachfassAb } from "@/lib/whatsapp/termin-strecke";

describe("vorbefüllte Nachricht", () => {
  it("erkennt den Text und leichte Änderungen", () => {
    expect(istVorabNachricht(VORAB_TEXT)).toBe(true);
    expect(istVorabNachricht("ja gerne beantworte ich die fragen vorab")).toBe(true);
    expect(istVorabNachricht("Ja, gern beantworte ich die Fragen vorab. 🙂")).toBe(true);
    expect(istVorabNachricht("Ich beantworte die Fragen gern vorab")).toBe(true);
  });
  it("nicht bei Fragen, Verneinung, langen Texten oder einfachem Ja", () => {
    expect(istVorabNachricht("Muss ich die Fragen vorab beantworten?")).toBe(false);
    expect(istVorabNachricht("Ich beantworte die Fragen nicht vorab")).toBe(false);
    expect(istVorabNachricht("Ja")).toBe(false);
    expect(istVorabNachricht(`${VORAB_TEXT} ${"x".repeat(120)}`)).toBe(false);
    expect(istVorabNachricht(null)).toBe(false);
  });
  it("kein Gedankenstrich im Text", () => {
    expect(VORAB_TEXT).not.toMatch(/[–—]/);
  });
});

describe("wa.me-Link", () => {
  it("Nummer international ohne +", () => {
    expect(waNummer("+49 151 2345678")).toBe("491512345678");
    expect(waNummer("0151 2345678")).toBe("491512345678");
    expect(waNummer("0049 151 2345678")).toBe("491512345678");
    expect(waNummer("123")).toBeNull();
    expect(waNummer(null)).toBeNull();
  });
  it("Link mit vorbefülltem Text", () => {
    expect(waVorabLink("+49 151 2345678")).toBe("https://wa.me/491512345678?text=Ja%2C%20gern%20beantworte%20ich%20die%20Fragen%20vorab.");
    expect(waVorabLink("")).toBeNull();
  });
});

describe("Nachfrage zur Vorbereitung: frühester Zeitpunkt", () => {
  const berlin = (iso: string) => new Date(iso);
  it("3 Std. später innerhalb der Geschäftszeit", () => {
    // Donnerstag 26.11.2026 10:00 Berlin (09:00Z) → 13:00
    expect(nachfassAb(berlin("2026-11-26T09:00:00.000Z"))).toEqual(berlin("2026-11-26T12:00:00.000Z"));
    // 16:59 Berlin → 19:59
    expect(nachfassAb(berlin("2026-11-26T15:59:00.000Z"))).toEqual(berlin("2026-11-26T18:59:00.000Z"));
  });
  it("abends: am nächsten Morgen um 8, samstags abends erst Montag", () => {
    // Donnerstag 18:00 Berlin → Freitag 08:00
    expect(nachfassAb(berlin("2026-11-26T17:00:00.000Z"))).toEqual(berlin("2026-11-27T07:00:00.000Z"));
    // Samstag 28.11. 18:00 Berlin → Montag 30.11. 08:00
    expect(nachfassAb(berlin("2026-11-28T17:00:00.000Z"))).toEqual(berlin("2026-11-30T07:00:00.000Z"));
    // Nachts 02:00 Berlin (Freitag) → 08:00
    expect(nachfassAb(berlin("2026-11-27T01:00:00.000Z"))).toEqual(berlin("2026-11-27T07:00:00.000Z"));
  });
});
