import { describe, expect, it } from "vitest";
import { detectMapping, isBlockedColumn, normalizeLine, parseDate } from "@/lib/bestand/import";
import { daysUntilBirthday } from "@/lib/bestand/campaigns";

describe("Bestandskunden-Import", () => {
  it("erkennt typische Spalten und lässt Gesundheitsangaben weg", () => {
    const m = detectMapping(["Kunden-Nr.", "Vorname", "Nachname", "Telefon privat", "Mobil", "E-Mail", "Geb.-Datum", "PLZ", "Ort", "Sparte", "Hauptfälligkeit", "Vorerkrankungen"]);
    expect(m).toMatchObject({ externalNo: "Kunden-Nr.", firstName: "Vorname", lastName: "Nachname", phone: "Mobil", email: "E-Mail", zip: "PLZ", city: "Ort", line: "Sparte", renewalDate: "Hauptfälligkeit" });
    expect(Object.values(m)).not.toContain("Vorerkrankungen");
    expect(isBlockedColumn("Gesundheitsfragen")).toBe(true);
  });

  it("„Name“ ohne Vorname = voller Name", () => {
    expect(detectMapping(["Name", "Handy"])).toMatchObject({ fullName: "Name", phone: "Handy" });
  });

  it("Sparten vereinheitlichen", () => {
    expect(normalizeLine("Kraftfahrt-Haftpflicht PKW")).toBe("KFZ");
    expect(normalizeLine("Privathaftpflicht")).toBe("Haftpflicht");
    expect(normalizeLine("Hausratversicherung")).toBe("Hausrat");
    expect(normalizeLine("Berufsunfähigkeitsversicherung")).toBe("BU");
    expect(normalizeLine("Zahnzusatz")).toBe("Kranken");
    expect(normalizeLine("Riester-Rente")).toBe("Vorsorge");
    expect(normalizeLine("Glas")).toBe("Sonstiges");
  });

  it("Datumsformate", () => {
    expect(parseDate("07.03.1980")?.toISOString().slice(0, 10)).toBe("1980-03-07");
    expect(parseDate("1980-03-07")?.toISOString().slice(0, 10)).toBe("1980-03-07");
    expect(parseDate("29221")?.toISOString().slice(0, 10)).toBe("1980-01-01");
    expect(daysUntilBirthday(new Date("1980-03-10T00:00:00Z"), new Date("2026-03-07T10:00:00Z"))).toBe(3);
  });
});

describe("Bestand-Import: Vertragsfelder, Gruppierung, Warnung (14.11.2026)", () => {
  it("Jahresbeitrag in deutschen und englischen Schreibweisen", async () => {
    const { parseMoney } = await import("@/lib/bestand/rows");
    expect(parseMoney("1.234,56 €")).toBe(1234.56);
    expect(parseMoney("1234,56")).toBe(1234.56);
    expect(parseMoney("1.234")).toBe(1234);
    expect(parseMoney("1,234.56")).toBe(1234.56);
    expect(parseMoney("EUR 980")).toBe(980);
    expect(parseMoney("89.9")).toBe(89.9);
    expect(parseMoney("12.345.678")).toBeNull(); // unplausibel (über 1 Mio.)
    expect(parseMoney("-50")).toBeNull();
    expect(parseMoney("monatlich")).toBeNull();
    expect(parseMoney("")).toBeNull();
  });

  it("Vertragsstatus grob vereinheitlicht, Anrede erkannt", async () => {
    const { normalizeStatus, normalizeSalutation, isActiveContract } = await import("@/lib/bestand/rows");
    expect(normalizeStatus("Aktiv")).toBe("aktiv");
    expect(normalizeStatus("in Kraft")).toBe("aktiv");
    expect(normalizeStatus("inaktiv")).toBe("storniert");
    expect(normalizeStatus("Storno")).toBe("storniert");
    expect(normalizeStatus("gekündigt zum 31.12.")).toBe("storniert");
    expect(normalizeStatus("beitragsfrei")).toBe("ruhend");
    expect(normalizeStatus("ruhend")).toBe("ruhend");
    expect(normalizeStatus("Antrag")).toBe("unbekannt");
    expect(normalizeStatus("")).toBeNull();
    expect(isActiveContract("unbekannt")).toBe(true);
    expect(isActiveContract(null)).toBe(true);
    expect(isActiveContract("storniert")).toBe(false);
    expect(normalizeSalutation("Hr.")).toBe("Herr");
    expect(normalizeSalutation("Frau")).toBe("Frau");
    expect(normalizeSalutation("Firma")).toBeNull();
  });

  it("erkennt die neuen Spalten, Monatsbeitrag ist kein Jahresbeitrag", () => {
    const m = detectMapping(["Kd.-Nr.", "Anrede", "Vorname", "Nachname", "Firma", "Mobil", "Sparte", "Versicherungsschein-Nr.", "Gesellschaft", "Monatsbeitrag", "Jahresbeitrag", "Status", "Vertragsbeginn"]);
    expect(m).toMatchObject({
      salutation: "Anrede",
      company: "Firma",
      line: "Sparte",
      contractNo: "Versicherungsschein-Nr.",
      insurer: "Gesellschaft",
      annualPremium: "Jahresbeitrag",
      contractStatus: "Status",
      startDate: "Vertragsbeginn",
    });
    expect(detectMapping(["Name", "Monatsbeitrag"]).annualPremium).toBeUndefined();
  });

  it("mehrere Verträge je Kunde, Live-Zahlen wie beim Speichern, stornierte zählen nicht ins Volumen", async () => {
    const { groupRows, importWarning } = await import("@/lib/bestand/rows");
    const rows = [
      { Nr: "1", Name: "Erika Muster", Mobil: "0151 1111111", Sparte: "KFZ", Beitrag: "480,00", Status: "aktiv" },
      { Nr: "1", Name: "Erika Muster", Mobil: "0151 1111111", Sparte: "Hausrat", Beitrag: "120,00", Status: "storniert" },
      { Nr: "2", Name: "Max Probe", Mobil: "0151 2222222", Sparte: "Haftpflicht, Unfall", Beitrag: "200", Status: "" },
      { Nr: "", Name: "", Mobil: "0151 3333333", Sparte: "KFZ", Beitrag: "1", Status: "" },
    ];
    const g = groupRows(rows, { externalNo: "Nr", fullName: "Name", phone: "Mobil", line: "Sparte", annualPremium: "Beitrag", contractStatus: "Status" });
    expect(g.groups.size).toBe(2);
    expect(g.contracts).toBe(4); // Erika 2, Max 2 (zwei Sparten in einer Zelle)
    expect(g.inactiveContracts).toBe(1);
    expect(g.premiumTotal).toBe(480); // Hausrat storniert, Max: Beitrag nicht aufteilbar
    expect(g.skipped).toBe(1);
    expect(g.skipReasons["ohne Namen"]).toBe(1);
    expect(importWarning(g)).toBeNull();
  });

  it("warnt deutlich, wenn kein Kunde übernommen würde (z. B. Vertriebsliste mit Firma, Segment, Opener)", async () => {
    const { groupRows, importWarning } = await import("@/lib/bestand/rows");
    const rows = Array.from({ length: 12 }, (_, i) => ({ Firma: `Agentur ${i}`, Segment: "A", Opener: "Hallo" }));
    const m = detectMapping(["Firma", "Segment", "Opener"]);
    expect(m.company).toBe("Firma");
    const w = importWarning(groupRows(rows, m));
    expect(w?.block).toBe(true);
    expect(w?.text).toContain("kein einziger Kunde");
  });
});
