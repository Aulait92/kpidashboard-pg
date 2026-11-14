// Bestandskunden (Ole, 14.11.2026): Import ohne Namen, Prüfung der Zuordnung, Kontingent mit Zusatzpaketen.
import { describe, expect, it } from "vitest";
import { displayName, groupRows, looksLikePhone, mappingBlocker, mappingIssues, type Row } from "@/lib/bestand/rows";
import { consume, isLow, nextFunding, type BestandQuota } from "@/lib/bestand/quota";
import { packExpiry, packFor } from "@/lib/bestand/packs";
import { bestandPacksText, PRICE_LIST } from "@/lib/offer-pricing";
import { campaignText, NAMELESS_PARAM } from "@/lib/bestand/campaigns";

// Oles Liste: nur Firma, Ort und Email
const OLE: Row[] = [
  { Firma: "Muster GmbH", Ort: "Köln", Email: "info@muster.de" },
  { Firma: "Beispiel AG", Ort: "Bonn", Email: "kontakt@beispiel.de" },
  { Firma: "Probe KG", Ort: "Essen", Email: "probe@probe-kg.de" },
];

describe("Import ohne Namen", () => {
  it("Firma, Ort und E-Mail reichen; Anzeigename fällt auf Firma bzw. E-Mail zurück", () => {
    const g = groupRows(OLE, { company: "Firma", city: "Ort", email: "Email" });
    expect(g.groups.size).toBe(3);
    expect(g.skipped).toBe(0);
    expect(g.withoutName).toBe(3);
    expect(g.withPhone).toBe(0);
    const first = [...g.groups.values()][0];
    expect(displayName(first)).toBe("Muster GmbH");
    expect(displayName({ email: "a@b.de" })).toBe("a@b.de");
    expect(displayName({ firstName: "Erika", lastName: "Muster", company: "X" })).toBe("Erika Muster");
  });

  it("ohne Kundennummer, Telefon und E-Mail wird die Zeile übersprungen", () => {
    const g = groupRows([{ Firma: "A" }, { Firma: "B" }], { company: "Firma" });
    expect(g.groups.size).toBe(0);
    expect(g.skipReasons["ohne Kundennummer, Telefon und E-Mail"]).toBe(2);
  });

  it("Nachrichten ohne Namen beginnen neutral", () => {
    expect(campaignText("review", "", null).startsWith("Guten Tag,")).toBe(true);
    expect(campaignText("review", "Erika", null).startsWith("Hallo Erika,")).toBe(true);
    expect(`Hallo ${NAMELESS_PARAM},`).toBe("Hallo und guten Tag,");
  });
});

describe("Zuordnung prüfen", () => {
  it("Oles Fall: E-Mail-Spalte auf Vorname, Telefon und E-Mail → Warnung am Feld und Sperre", () => {
    const issues = mappingIssues(OLE, { firstName: "Email", phone: "Email", email: "Email", company: "Firma" });
    const dup = issues.filter((i) => i.kind === "duplicate");
    expect(dup.map((i) => i.field).sort()).toEqual(["email", "firstName", "phone"]);
    expect(dup.every((i) => !i.block)).toBe(true);
    expect(dup.find((i) => i.field === "phone")?.text).toContain("Vorname");
    const blocking = issues.filter((i) => i.block).map((i) => i.field).sort();
    expect(blocking).toEqual(["firstName", "phone"]); // E-Mail passt zur Spalte
    expect(issues.find((i) => i.field === "phone" && i.kind === "content")?.text).toMatch(/3 von 3 .*Telefonnummern/);
    expect(mappingBlocker(OLE, { phone: "Email", email: "Email" })).toMatch(/^Mobil\/Telefon:/);
  });

  it("richtige Zuordnung → keine Hinweise", () => {
    expect(mappingIssues(OLE, { company: "Firma", city: "Ort", email: "Email" })).toEqual([]);
  });

  it("Datum muss ein Datum sein, erst über 50 % unpassend sperrt", () => {
    const rows = [{ G: "01.02.1980" }, { G: "1975-03-04" }, { G: "kein Datum" }, { G: "" }];
    expect(mappingIssues(rows, { birthday: "G" })).toEqual([]); // 1 von 3 unpassend
    const bad = [{ G: "ja" }, { G: "nein" }, { G: "01.01.1990" }];
    expect(mappingIssues(bad, { birthday: "G" })[0]).toMatchObject({ field: "birthday", block: true });
    // E-Mail-Spalte mit Telefonnummern
    expect(mappingIssues([{ M: "0151 1234567" }, { M: "0171-7654321" }], { email: "M" })[0]).toMatchObject({ field: "email", block: true });
  });

  it("Telefonnummern erkennen", () => {
    for (const ok of ["0151 1234567", "+49 (0)171-1234567", "0049 30 1234567", "Tel. 030/123456", "4915112345678"]) expect(looksLikePhone(ok)).toBe(true);
    for (const bad of ["info@muster.de", "Köln", "12", "ab 0151 123"]) expect(looksLikePhone(bad)).toBe(false);
  });
});

describe("Kontingent mit Zusatzpaketen", () => {
  const quota = (included: number, packs: number[]): BestandQuota => {
    const p = packs.map((r, i) => ({ id: `p${i}`, messages: 500, used: 500 - r, remaining: r, amount: 99, source: "kauf", purchasedAt: new Date(2026, 9, i + 1), expiresAt: new Date(2027, 0, i + 1) }));
    const remaining = included + packs.reduce((s, r) => s + r, 0);
    return { limit: 500, used: 500 - included, includedRemaining: included, packs: p, packRemaining: remaining - included, remaining, sentThisMonth: 500 - included, low: isLow(remaining, 500 - included) };
  };

  it("erst Monatskontingent, dann ältestes Paket", () => {
    const q = quota(1, [0, 2, 500]);
    expect(nextFunding(q)).toBeNull();
    consume(q, null);
    expect(nextFunding(q)).toBe("p1"); // p0 ist aufgebraucht
    consume(q, "p1");
    consume(q, "p1");
    expect(nextFunding(q)).toBe("p2");
    expect(q.remaining).toBe(500);
    expect(nextFunding(quota(0, [0]))).toBeUndefined();
  });

  it("Hinweis unter 10 % Rest", () => {
    expect(isLow(500, 0)).toBe(false);
    expect(isLow(50, 450)).toBe(false);
    expect(isLow(49, 451)).toBe(true);
    expect(isLow(0, 0)).toBe(true);
  });

  it("Pakete laut Preisliste, gültig 3 Monate", () => {
    expect(packFor(500)).toEqual({ messages: 500, price: 99 });
    expect(packFor(2000)).toEqual({ messages: 2000, price: 349 });
    expect(packFor(1000)).toBeNull();
    expect(PRICE_LIST.bestandPackIndividualFrom).toBe(5000);
    expect(packExpiry(new Date("2026-11-14T10:00:00Z")).toISOString()).toBe("2027-02-14T10:00:00.000Z");
    expect(packExpiry(new Date("2026-11-30T10:00:00Z")).toISOString().slice(0, 10)).toBe("2027-02-28");
    expect(bestandPacksText().replace(/\u00a0/g, " ")).toBe("+500 Nachrichten für 99 €, +2.000 für 349 € (netto, einmalig, gültig 3 Monate)");
    expect(bestandPacksText()).not.toMatch(/[–—]/);
  });
});
