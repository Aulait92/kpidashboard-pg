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

/** Mitglied bereit für Leads (lib/team-bereit.ts): eigener Kalender verbunden und ein Gerät mit Mitteilungen. */
export async function leadBereit(user: { id: string; customerId: string | null }) {
  await prisma.advisorCalendar.upsert({ where: { userId: user.id }, create: { userId: user.id, customerId: user.customerId!, status: "connected" }, update: { status: "connected" } });
  await prisma.pushSubscription.create({ data: { endpoint: `https://push.test/${user.id}`, p256dh: "x", auth: "x", userId: user.id } });
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

/**
 * Splittest für diese Datei anhalten (Zeile in „Experiment“ mit aktiv = false), damit Tests mit zufälligen Lead-IDs
 * immer Fassung a sehen (z. B. termin_zusage bei Buchungen im Chat). Danach wird die Zeile wieder entfernt.
 */
export function ohneSplittest(key: string, ziel = "erschienen") {
  beforeAll(async () => {
    await prisma.experiment.upsert({ where: { key }, create: { key, ziel, aktiv: false }, update: { aktiv: false, winner: null } });
    const { experimenteCacheLeeren } = await import("@/lib/experimente");
    experimenteCacheLeeren();
  });
  afterAll(async () => {
    await prisma.experiment.deleteMany({ where: { key } });
    const { experimenteCacheLeeren } = await import("@/lib/experimente");
    experimenteCacheLeeren();
  });
}
