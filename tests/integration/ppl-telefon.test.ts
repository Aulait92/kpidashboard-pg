import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { ingestPoolLead } from "@/lib/ppl/engine";

// Formatprüfung der Telefonnummer im Pay-per-Lead-Eingang (lib/ppl/telefon-pruefung.ts):
// falsche Nummern werden als „invalid“ gespeichert und nicht ausgeliefert.
const run = String(Math.floor(Math.random() * 1e5)).padStart(5, "0");
const product = `TEL-Test-${run}`;

describe("Pay-per-Lead: falsche Telefonnummern werden nicht ausgeliefert", () => {
  afterAll(async () => {
    await prisma.poolLead.deleteMany({ where: { productKey: product } });
  });
  it("zu lange, ausländische und Fantasienummern landen als ungültig, eine echte Nummer wird verteilt", async () => {
    const zuLang = await ingestPoolLead({ productKey: product, via: "webhook", fields: { vorname: "A", nachname: "B", telefon: "+49 491 5257616788", email: `a${run}@test.local` } });
    expect(zuLang).toMatchObject({ status: "invalid" });
    expect(zuLang.reason).toContain("Telefonnummer");

    const ausland = await ingestPoolLead({ productKey: product, via: "webhook", fields: { vorname: "C", nachname: "D", telefon: "+43 664 7382910", email: `c${run}@test.local` } });
    expect(ausland).toMatchObject({ status: "invalid", reason: "Telefonnummer: keine deutsche Telefonnummer" });

    const fantasie = await ingestPoolLead({ productKey: product, via: "webhook", fields: { vorname: "E", nachname: "F", telefon: "0151 11111111" } });
    expect(fantasie).toMatchObject({ status: "invalid" });

    const ok = await ingestPoolLead({ productKey: product, via: "webhook", fields: { vorname: "G", nachname: "H", telefon: `01517${run}38` } });
    // kein Bezug für das Testprodukt → geparkt, aber eben nicht wegen der Nummer verworfen
    expect(ok.status).toBe("parked");

    const pool = await prisma.poolLead.findMany({ where: { productKey: product }, select: { status: true } });
    expect(pool.filter((p) => p.status === "invalid")).toHaveLength(3);
  });
});
