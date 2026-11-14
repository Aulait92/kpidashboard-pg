// Gewinn auf /buyer/zahlen standardmäßig „Inkl. Bestand“ (Ole, 14.11.2026)
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { loadGewinnMitBestand } from "@/lib/gewinn-modus";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

let customerId = "";

describe("Gewinn-Schalter", () => {
  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer()).id;
  });
  afterAll(() => cleanupCustomer(customerId));

  it("neuer Login: „Inkl. Bestand“, bewusste Wahl „Nur jetzt“ bleibt", async () => {
    const u = await makeBuyer(customerId, "owner");
    expect(u.gewinnMitBestand).toBe(true);
    expect(await loadGewinnMitBestand({ userId: u.id })).toBe(true);
    await prisma.user.update({ where: { id: u.id }, data: { gewinnMitBestand: false } });
    expect(await loadGewinnMitBestand({ userId: u.id })).toBe(false);
    // unbekannter Login (z. B. gelöscht): Standard
    expect(await loadGewinnMitBestand({ userId: "gibt-es-nicht" })).toBe(true);
  });
});
