import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { recordLeadProgress } from "@/lib/lead-progress";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

// Status-Widerspruch im Admin-Chat (Ole, 14.11.2026): Lead stand auf „Kein Interesse“,
// obwohl er danach im Chat qualifiziert wurde und einen Termin gebucht hat.
describe("recordLeadProgress: neue Buchung", () => {
  let customerId = "";
  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer()).id;
  });
  afterAll(() => cleanupCustomer(customerId));

  const lead = (status: string) => prisma.lead.create({ data: { customerId, name: "Eva Test", status } });
  const statusOf = async (id: string) => (await prisma.lead.findUniqueOrThrow({ where: { id } })).status;

  it("holt „Kein Interesse“ bei einer neuen Buchung auf „In Beratung“ zurück", async () => {
    const l = await lead("Kein Interesse");
    await recordLeadProgress(l.id, "booked");
    expect(await statusOf(l.id)).toBe("In Beratung");
  });

  it("eine bloße Antwort im Chat ändert „Kein Interesse“ nicht", async () => {
    const l = await lead("Kein Interesse");
    await recordLeadProgress(l.id, "replied");
    expect(await statusOf(l.id)).toBe("Kein Interesse");
  });

  it("Angebot, Abschluss und Disqualifiziert bleiben bei einer Buchung unangetastet", async () => {
    for (const s of ["Angebot gesendet", "Abschluss", "Disqualifiziert"]) {
      const l = await lead(s);
      await recordLeadProgress(l.id, "booked");
      expect(await statusOf(l.id)).toBe(s);
    }
  });
});
