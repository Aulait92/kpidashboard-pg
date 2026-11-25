// Usability-Check 25.11.2026 (Rest von W7): Leads sehen nie den internen Kundennamen („Allianz Max Berger“),
// sondern die Firma aus der Erstinformation; ohne Angaben wie bisher den Kundennamen, intern ohne Marke.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { anbieterAnzeigeName, erstinfoDaten, interneKundenbezeichnung } from "@/lib/erstinformation-shared";

describe("interner Kundenname", () => {
  it("erkennt „Marke + Person“", () => {
    expect(interneKundenbezeichnung("Allianz Max Berger")).toBe(true);
    expect(interneKundenbezeichnung("Signal Iduna Anna Meier")).toBe(true);
    expect(interneKundenbezeichnung("Versicherungsbüro Sonnberg")).toBe(false);
    expect(interneKundenbezeichnung("Kannapinn Versicherungen")).toBe(false);
    expect(interneKundenbezeichnung("Allianz Generalvertretung Meier GmbH")).toBe(false);
    expect(interneKundenbezeichnung(null)).toBe(false);
  });

  it("Name für Leads: Firma aus der Erstinformation, sonst Name, sonst Kundenname", () => {
    expect(anbieterAnzeigeName({ firma: "Berger Versicherungen", name: "Max Berger" }, "Allianz Max Berger")).toBe("Berger Versicherungen");
    expect(anbieterAnzeigeName({ firma: "", name: "Max Berger" }, "Allianz Max Berger")).toBe("Max Berger");
    // alter Vorschlag gespeichert: zählt nicht
    expect(anbieterAnzeigeName({ firma: "Allianz Max Berger", name: "Max Berger" }, "Allianz Max Berger")).toBe("Max Berger");
    // Rückfall wie bisher, beim internen Muster ohne Marke
    expect(anbieterAnzeigeName(null, "Versicherungsbüro Sonnberg")).toBe("Versicherungsbüro Sonnberg");
    expect(anbieterAnzeigeName(null, "Allianz Max Berger")).toBe("Max Berger");
  });

  it("Firmenvorschlag der Erstinformation ist nicht der interne Kundenname", () => {
    expect(erstinfoDaten(null, undefined, { name: "Allianz Max Berger", vermittlerTyp: "vertreter" }).firma).toBe("");
    expect(erstinfoDaten(null, { companyName: "Berger & Partner GmbH" } as never, { name: "Allianz Max Berger" }).firma).toBe("Berger & Partner GmbH");
    expect(erstinfoDaten(null, undefined, { name: "Versicherungsbüro Sonnberg" }).firma).toBe("Versicherungsbüro Sonnberg");
  });

  it("/book und der Konto-Untertitel nutzen den Namen aus der Erstinformation", () => {
    const book = readFileSync(path.resolve(__dirname, "../../src/app/book/[slug]/page.tsx"), "utf8");
    expect(book).toContain("const advisor = anbieterAnzeigeName(conn.customer.erstinformation, conn.customer.name)");
    const konto = readFileSync(path.resolve(__dirname, "../../src/app/buyer/konto/page.tsx"), "utf8");
    expect(konto).toContain("subtitle={anbieterAnzeigeName(customer.erstinformation, customer.name)}");
  });
});
