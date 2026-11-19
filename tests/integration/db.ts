// Hilfen für Integrationstests: echte Postgres-Datenbank (nur Wegwerf-DB!).
import { afterAll, beforeAll } from "vitest";
import { prisma } from "@/lib/prisma";

export function requireTestDb() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url || !/test|ci|localhost|127\.0\.0\.1|host=\/tmp/i.test(url)) {
    throw new Error("Integrationstests nur gegen eine Test-Datenbank (DATABASE_URL mit test/ci/localhost).");
  }
}

const uid = () => Math.random().toString(36).slice(2, 10);

export async function makeCustomer(extra: Record<string, unknown> = {}) {
  return prisma.customer.create({ data: { name: `Test ${uid()}`, ...extra } });
}

export async function makeBuyer(customerId: string, teamRole: "owner" | "advisor", receivesLeads = true) {
  return prisma.user.create({
    data: { email: `${uid()}@test.local`, passwordHash: "x", role: "BUYER", customerId, teamRole, receivesLeads },
  });
}

export async function cleanupCustomer(id: string) {
  await prisma.customer.delete({ where: { id } }).catch(() => {});
}

/**
 * Tests, die Fassung B der Beratungspräsentation prüfen: Splittest „praesentation“ (B gegen C, je Lead) für diese Datei
 * per Notschalter aus, sonst sähe etwa die Hälfte der zufälligen Lead-IDs Fassung C.
 */
export function nurFassungB() {
  let vorher: string | undefined;
  beforeAll(() => {
    vorher = process.env.EXPERIMENTE_AUS;
    process.env.EXPERIMENTE_AUS = "1";
  });
  afterAll(() => {
    if (vorher === undefined) delete process.env.EXPERIMENTE_AUS;
    else process.env.EXPERIMENTE_AUS = vorher;
  });
}
