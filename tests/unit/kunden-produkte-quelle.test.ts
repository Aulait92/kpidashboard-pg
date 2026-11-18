// „So arbeitet Ihr Assistent“: Produkte nur vom Kunden, nie der ganze Katalog (Ole, 18.11.2026)
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Vorschau-Produkte", () => {
  it("ladeSoArbeitet nutzt kundenProdukte statt testLeadProducts (Katalog nur für Testleads)", () => {
    const src = readFileSync("src/lib/so-arbeitet-server.ts", "utf8");
    expect(src).toContain("kundenProdukte(customerId)");
    expect(src).not.toContain("testLeadProducts(");
  });
});
