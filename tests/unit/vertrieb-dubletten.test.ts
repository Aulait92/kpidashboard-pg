import { describe, expect, it } from "vitest";
import { answersContacts, contactSignals, duplicateMatch, ownEmailDomain, phoneKey, rankDuplicates, siteKey, type DupInput } from "@/lib/vertrieb/dubletten";

// Dubletten im Vertrieb: starke Merkmale zuerst, Vorname allein reicht nicht (Fall „Christian“ / „Christian Patzwald“).
const sig = (c: Partial<DupInput>) => contactSignals({ name: "", email: `x${Math.random()}@ohne-email.invalid`, ...c });

describe("Vertrieb: Dubletten erkennen", () => {
  it("normalisiert Telefonnummern unabhängig von der Schreibweise", () => {
    expect(phoneKey("0171 1234567")).toBe("1711234567");
    expect(phoneKey("+49 171 1234567")).toBe("1711234567");
    expect(phoneKey("0049 (171) 123-45-67")).toBe("1711234567");
    expect(phoneKey("491711234567")).toBe("1711234567");
    expect(phoneKey("123")).toBeNull();
  });

  it("Vorname plus gleiche Telefonnummer in anderer Schreibweise wird erkannt", () => {
    const christian = sig({ name: "Christian", firstName: "Christian", email: "c.p@gmail.com", phone: "+491711234567" });
    const patzwald = sig({ name: "Allianz Versicherung Christian Patzwald Generalvertretung", firstName: "Christian", lastName: "Patzwald", email: "christian.patzwald@allianz.de", phone: "0171 1234567" });
    const m = duplicateMatch(christian, patzwald);
    expect(m?.reasons).toEqual(["gleiche Telefonnummer"]);
  });

  it("Telefonnummer aus der Calendly-Buchung zählt mit", () => {
    const { phones, emails } = answersContacts("Agentur: Patzwald\nTelefonnummer: 0171 / 123 45 67\nSonstiges: bitte an buero@patzwald-versicherungen.de");
    expect(phones).toEqual(["0171 / 123 45 67"]);
    expect(emails).toEqual(["buero@patzwald-versicherungen.de"]);
    const christian = sig({ name: "Christian", firstName: "Christian", extraPhones: phones });
    const patzwald = sig({ name: "Christian Patzwald", firstName: "Christian", lastName: "Patzwald", phone: "+49 171 1234567" });
    expect(duplicateMatch(christian, patzwald)?.reasons).toEqual(["gleiche Telefonnummer"]);
  });

  it("Vorname ohne weiteres Merkmal wird nicht vorgeschlagen", () => {
    const christian = sig({ name: "Christian", firstName: "Christian", email: "christian@gmail.com" });
    for (const other of [
      { name: "Allianz Versicherung Christian Aigner Generalvertretung", firstName: "Christian", lastName: "Aigner", email: "christian.aigner@allianz.de" },
      { name: "Allianz Versicherung Christian Andreas", email: "christian.andreas@allianz.de", url: "https://vertretung.allianz.de/christian.andreas/" },
      { name: "Christian", firstName: "Christian", email: "christian@web.de" },
    ]) {
      expect(duplicateMatch(christian, sig(other))).toBeNull();
    }
  });

  it("Freemailer- und Versicherer-Domain zählen nicht, eigene Domain schon", () => {
    expect(ownEmailDomain("a@gmail.com")).toBeNull();
    expect(ownEmailDomain("a@T-Online.de")).toBeNull();
    expect(ownEmailDomain("a@posteo.de")).toBeNull();
    expect(ownEmailDomain("a@allianz.de")).toBeNull();
    expect(ownEmailDomain("a@ohne-email.invalid")).toBeNull();
    expect(ownEmailDomain("info@patzwald-versicherungen.de")).toBe("patzwald-versicherungen.de");
    expect(duplicateMatch(sig({ name: "Christian", firstName: "Christian", email: "a@gmail.com" }), sig({ name: "Bach", email: "b@gmail.com" }))).toBeNull();
    expect(duplicateMatch(sig({ name: "A", email: "a@allianz.de" }), sig({ name: "B", email: "b@allianz.de" }))).toBeNull();
    const own = duplicateMatch(sig({ name: "Christian", email: "christian@patzwald-versicherungen.de" }), sig({ name: "Büro Patzwald", email: "info@patzwald-versicherungen.de" }));
    expect(own?.reasons).toEqual(["gleiche Domain"]);
    // gemeinsam genutzte Domain (viele Kontakte) wird ausgeblendet
    expect(duplicateMatch(sig({ name: "A", email: "a@verbund.de" }), sig({ name: "B", email: "b@verbund.de" }), new Set(["verbund.de"]))).toBeNull();
  });

  it("gleiche E-Mail auch über weitere Adressen, gleicher Name nur mit Vor- und Nachname", () => {
    const a = sig({ name: "Christian", firstName: "Christian", email: "cp@gmail.com" });
    expect(duplicateMatch(a, sig({ name: "Patzwald", email: "buero@patzwald.de", altEmails: ["cp@gmail.com"] }))?.reasons).toEqual(["gleiche E-Mail"]);
    const full = sig({ name: "Christian Patzwald", firstName: "Christian", lastName: "Patzwald" });
    expect(duplicateMatch(full, sig({ name: "Allianz Versicherung Christian Patzwald Generalvertretung" }))?.reasons).toEqual(["gleicher Name"]);
    expect(duplicateMatch(full, sig({ name: "Christian Aigner", firstName: "Christian", lastName: "Aigner" }))).toBeNull();
  });

  it("Webseite: eigene Domain oder Agentur-Unterseite, nicht die Konzernseite", () => {
    expect(siteKey("https://www.patzwald.de/impressum")).toBe("patzwald.de");
    expect(siteKey("vertretung.allianz.de/christian.patzwald/")).toBe("vertretung.allianz.de/christian.patzwald");
    expect(siteKey("https://www.allianz.de/")).toBeNull();
    expect(siteKey("https://www.linkedin.com/in/x")).toBeNull();
    expect(duplicateMatch(sig({ name: "A", url: "https://vertretung.allianz.de/a.b/" }), sig({ name: "B", url: "https://vertretung.allianz.de/c.d/" }))).toBeNull();
  });

  it("höchstens 3 Vorschläge, der beste zuerst, mit Grund", () => {
    const target = sig({ name: "Christian", firstName: "Christian", email: "cp@patzwald.de", phone: "0171 1234567" });
    const d = (n: number) => new Date(2026, 0, n);
    const rows = [
      { id: "domain", createdAt: d(1), signals: sig({ name: "Büro", email: "info@patzwald.de" }) },
      { id: "nur-vorname", createdAt: d(1), signals: sig({ name: "Christian Bach", firstName: "Christian", lastName: "Bach" }) },
      { id: "telefon", createdAt: d(2), signals: sig({ name: "Christian Patzwald", firstName: "Christian", lastName: "Patzwald", phone: "+49 171 1234567" }) },
      { id: "mail", createdAt: d(3), signals: sig({ name: "X", email: "y@z.de", altEmails: ["cp@patzwald.de"] }) },
      { id: "domain2", createdAt: d(4), signals: sig({ name: "Y", email: "y@patzwald.de" }) },
    ];
    const r = rankDuplicates(target, rows);
    expect(r.map((x) => x.id)).toEqual(["mail", "telefon", "domain"]);
    expect(r[1].reason).toBe("gleiche Telefonnummer");
    expect(r[0].reason).toBe("gleiche E-Mail");
  });
});
