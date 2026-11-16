import { describe, expect, it } from "vitest";
import { phoneE164, phoneKey, phoneKind } from "@/lib/vertrieb/dubletten";
import { extractMailPhones, ownPart, signatureBlock, sourceLabel, usableEmail, type OwnContext } from "@/lib/vertrieb/kontaktdaten";
import { aiSignaturePhones } from "@/lib/vertrieb/kontaktdaten-server";
import type { LlmCall } from "@/lib/kampagnen/llm";

// Kontaktdaten aus Mails und Buchungen (Ole, 16.11.2026)
const phones = (t: string, ex: string[] = []) => extractMailPhones(t, ex).phones.map((p) => `${p.e164} ${p.kind}`);

describe("Telefon normalisieren", () => {
  it("E.164 und Vergleichsschlüssel, Schreibweise egal", () => {
    expect(phoneE164("0171 / 234 56 78")).toBe("+491712345678");
    expect(phoneE164("+49 (0) 171 2345678")).toBe("+491712345678");
    expect(phoneE164("0049 171-2345678")).toBe("+491712345678");
    expect(phoneKey("+49 (0)171 2345678")).toBe(phoneKey("0171 2345678"));
  });

  it("Mobil oder Festnetz", () => {
    expect(phoneKind("+491712345678")).toBe("MOBIL");
    expect(phoneKind("+49421123456")).toBe("FESTNETZ");
    expect(phoneKind("+436641234567")).toBe("MOBIL");
    expect(phoneKind("+41791234567")).toBe("MOBIL");
    expect(phoneKind("+442079460958", "Mobile")).toBe("MOBIL");
    expect(phoneKind("+442079460958", "Tel")).toBe("FESTNETZ");
  });
});

describe("Telefonnummern aus der Signatur", () => {
  it("Signatur mit Mobilnummer ergibt eine Nummer vom Typ Mobil", () => {
    const t = "Hallo Herr Muster,\ngerne nächste Woche.\n\nViele Grüße\nMax Muster\nAllianz Generalvertretung Muster\nTel.: 0421 123456 | Mobil: 0171 2345678\nFax: 0421 123457";
    expect(phones(t)).toEqual(["+49421123456 FESTNETZ", "+491712345678 MOBIL"]);
  });

  it("international und mehrere Nummern in einer Zeile", () => {
    expect(phones("Best regards\nJohn\nT: +44 20 7946 0958 M: +43 664 1234567")).toEqual(["+442079460958 FESTNETZ", "+436641234567 MOBIL"]);
    expect(phones("Gruß\nMax\n+49 (0) 171 2345678")).toEqual(["+491712345678 MOBIL"]);
  });

  it("zitierter Verlauf und weitergeleitete Mails ergeben nichts", () => {
    expect(phones("Ja, passt.\n\nAm 12.11.2026 um 10:00 schrieb Ole <ole@performancegrowth.de>:\n> Grüße\n> Mobil: 0151 99999999")).toEqual([]);
    expect(phones("Siehe unten.\n\n---------- Forwarded message ---------\nFrom: Kollege\nMobil: 0172 1111111")).toEqual([]);
    expect(phones("Zur Info\n\n-----Ursprüngliche Nachricht-----\nVon: Dritter\nTel.: 0421 999999")).toEqual([]);
    expect(phones("Danke\n________________________________\nVon: Kunde\nHandy 0176 5555555")).toEqual([]);
  });

  it("Tool-Fußzeilen (Calendly, Instantly) ergeben nichts", () => {
    expect(phones("Neuer Termin gebucht.\n\nPowered by Calendly.com\nCalendly Support: +1 415 555 0100")).toEqual([]);
    expect(phones("Hallo\n\nSent with Instantly\nTel.: +1 212 555 0199")).toEqual([]);
    expect(ownPart("Hallo\nGrüße\nMax\nAbmelden: https://x.test/u\nTel 0421 123456")).toBe("Hallo\nGrüße\nMax\nTel 0421 123456");
  });

  it("keine Service-, Hotline- oder Sondernummern (Versicherer), kein Fax, keine eigene Nummer", () => {
    expect(phones("Grüße\nMax\nAllianz Kundenservice: 0221 12345678")).toEqual([]);
    expect(phones("Grüße\nMax\nSchadenhotline Tel. 0211 9876543")).toEqual([]);
    expect(phones("Grüße\nMax\nTel. 0800 1234567")).toEqual([]);
    expect(phones("Grüße\nFax: 040 1234567")).toEqual([]);
    expect(phones("Grüße\nTel: 0151 52418846", ["+49 151 52418846"])).toEqual([]);
    expect(phones("Grüße\nIBAN DE89 3704 0044 0532 0130 00")).toEqual([]);
  });

  it("nur die Signatur zählt, Fließtext davor nicht", () => {
    const t = "Mein Kollege ist unter 0421 555555 erreichbar.\n\nMit freundlichen Grüßen\nMax Muster\nMobil 0171 2345678";
    expect(signatureBlock(t).startsWith("Mit freundlichen Grüßen")).toBe(true);
    expect(phones(t)).toEqual(["+491712345678 MOBIL"]);
  });

  it("Unklarheit melden, wenn eine Nummer keiner Regel entspricht", () => {
    const r = extractMailPhones("Grüße\nMax Muster 0171 2345678 Bremen");
    expect(r.phones).toEqual([]);
    expect(r.unclear).toBe(true);
    expect(extractMailPhones("Grüße\nMax\nMobil: 0171 2345678").unclear).toBe(false);
  });

  it("KI nur mit Nummern, die wirklich in der Signatur stehen", async () => {
    const llm: LlmCall = async () => ({
      text: JSON.stringify({ phones: [{ number: "0171 2345678", kind: "MOBIL" }, { number: "0172 9999999", kind: "MOBIL" }] }),
      usage: { tokensIn: 0, tokensOut: 0, costCents: 0 },
    });
    const r = await aiSignaturePhones(llm, "Grüße\nMax Muster 0171 2345678 Bremen", new Set());
    expect(r.map((p) => p.e164)).toEqual(["+491712345678"]);
  });
});

describe("E-Mail-Adressen", () => {
  const own: OwnContext = { domains: new Set(["agentur-pg.de"]), addresses: new Set(["mirko@gmail.com"]), phoneKeys: new Set() };
  it("keine eigenen, System- oder Sammeladressen", () => {
    expect(usableEmail("ole@performancegrowth.de", own)).toBe(false);
    expect(usableEmail("x@mail.performance-growth.com", own)).toBe(false);
    expect(usableEmail("info@agentur-pg.de", own)).toBe(false);
    expect(usableEmail("mirko@gmail.com", own)).toBe(false);
    expect(usableEmail("no-reply@agentur.de", own)).toBe(false);
    expect(usableEmail("notifications@calendly.com", own)).toBe(false);
    expect(usableEmail("info@gmx.de", own)).toBe(false);
    expect(usableEmail("service@allianz.de", own)).toBe(false);
    expect(usableEmail("lead-1@ohne-email.invalid", own)).toBe(false);
  });
  it("echte Adressen des Kontakts", () => {
    expect(usableEmail("max.muster@allianz.de", own)).toBe(true);
    expect(usableEmail("info@agentur-muster.de", own)).toBe(true);
    expect(usableEmail("max.muster@gmail.com", own)).toBe(true);
  });
});

describe("Herkunft", () => {
  it("„aus Buchung 14.11.“", () => {
    expect(sourceLabel("phone", "BUCHUNG", new Date("2026-11-14T10:00:00Z"))).toBe("aus Buchung 14.11.");
    expect(sourceLabel("phone", "MAIL", "2026-11-12T10:00:00Z")).toBe("aus E-Mail-Signatur 12.11.");
    expect(sourceLabel("email", "MAIL", "2026-11-12T10:00:00Z")).toBe("aus E-Mail 12.11.");
  });
});
