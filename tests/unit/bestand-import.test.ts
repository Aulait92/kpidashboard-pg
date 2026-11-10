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
