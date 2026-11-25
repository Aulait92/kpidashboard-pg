// Warnung „Buchungsseite ohne freie Zeiten“ (Ole, 25.11.2026): Cron merkt sich „leer seit“, Heute zeigt ab 3 Std.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { ladeBuchungsseitenLeer, pruefeBuchungsseiten } from "@/lib/buchungsseite-leer-server";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const H = 3_600_000;
const uid = () => Math.random().toString(36).slice(2, 10);

describe("Buchungsseite ohne freie Zeiten", () => {
  const ids: string[] = [];
  let leer = "";
  let voll = "";
  let test = "";
  const mk = async (extra: Record<string, unknown> = {}) => {
    const c = await makeCustomer({ name: `Allianz Agentur ${uid()}`, plan: "ppl_software", ...extra });
    ids.push(c.id);
    await prisma.calendarConnection.create({ data: { customerId: c.id, status: "connected", bookingSlug: `bs-${uid()}` } });
    return c.id;
  };

  beforeAll(async () => {
    requireTestDb();
    leer = await mk();
    voll = await mk();
    test = await mk({ isTest: true });
  });
  afterAll(async () => {
    for (const id of ids) await cleanupCustomer(id);
  });

  it("merkt sich den Beginn, behält ihn, warnt nach 3 Std. tagsüber und leert bei freien Zeiten", async () => {
    const t0 = new Date("2026-11-25T08:00:00Z"); // 9 Uhr Berlin
    const pruefen = vi.fn(async (id: string): Promise<number> => (id === leer ? 0 : 4));
    const grund = vi.fn(async () => "Allianz-Termin-Art „Beratung“ hat in den nächsten 14 Tagen keine freien Zeiten");
    const nurUnsere = (id: string) => [leer, voll, test].includes(id);
    // Kunden anderer Tests ignorieren: nur unsere prüfen
    const p = (id: string) => (nurUnsere(id) ? pruefen(id) : Promise.resolve(1));
    await pruefeBuchungsseiten(t0, { pruefen: p, grund, limit: 500 });
    let c = await prisma.calendarConnection.findUnique({ where: { customerId: leer } });
    expect(c?.keineZeitenSeit?.toISOString()).toBe(t0.toISOString());
    expect(c?.keineZeitenGrund).toContain("Allianz-Termin-Art");
    expect((await prisma.calendarConnection.findUnique({ where: { customerId: voll } }))?.keineZeitenSeit).toBeNull();
    // Testkunde wird nicht geprüft
    expect(pruefen).not.toHaveBeenCalledWith(test);

    // 20 Min. später: noch nicht wieder geprüft (höchstens alle 30 Min.)
    pruefen.mockClear();
    await pruefeBuchungsseiten(new Date(t0.getTime() + 20 * 60_000), { pruefen: p, grund, limit: 500 });
    expect(pruefen).not.toHaveBeenCalledWith(leer);

    // 2 Std. später: Beginn bleibt, noch kein Punkt in Heute
    await pruefeBuchungsseiten(new Date(t0.getTime() + 2 * H), { pruefen: p, grund, limit: 500 });
    c = await prisma.calendarConnection.findUnique({ where: { customerId: leer } });
    expect(c?.keineZeitenSeit?.toISOString()).toBe(t0.toISOString());
    expect((await ladeBuchungsseitenLeer(new Date(t0.getTime() + 2 * H))).some((i) => i.key === `buchungsseite:${leer}`)).toBe(false);

    // 3 Std. 10 Min. später: Punkt in Heute, Bereich Kunden, Link auf die Kundenakte
    const items = await ladeBuchungsseitenLeer(new Date(t0.getTime() + 3 * H + 10 * 60_000));
    const it1 = items.find((i) => i.key === `buchungsseite:${leer}`);
    expect(it1).toMatchObject({ area: "Kunden", tone: "bad", action: { href: `/admin/neu/kunden/${leer}` } });
    expect(it1?.title).toMatch(/^Buchungsseite von Agentur .* zeigt keine freien Zeiten$/);
    expect(it1?.detail).toContain("Allianz-Termin-Art");
    expect(items.some((i) => i.key === `buchungsseite:${voll}`)).toBe(false);

    // Wieder Zeiten: Feld geleert
    pruefen.mockImplementation(async () => 2);
    await pruefeBuchungsseiten(new Date(t0.getTime() + 4 * H), { pruefen: p, grund, limit: 500 });
    c = await prisma.calendarConnection.findUnique({ where: { customerId: leer } });
    expect(c?.keineZeitenSeit).toBeNull();
    expect(c?.keineZeitenGrund).toBeNull();
  });

  it("nachts wird nicht geprüft; Fehler zählt als leer", async () => {
    const pruefen = vi.fn(async () => 0);
    expect((await pruefeBuchungsseiten(new Date("2026-11-25T22:00:00Z"), { pruefen })).geprueft).toBe(0);
    expect(pruefen).not.toHaveBeenCalled();
    const fehler = async (id: string) => {
      if (id === voll) throw new Error("invalid_grant");
      return 1;
    };
    await pruefeBuchungsseiten(new Date("2026-11-26T10:00:00Z"), { pruefen: fehler, limit: 500 });
    const c = await prisma.calendarConnection.findUnique({ where: { customerId: voll } });
    expect(c?.keineZeitenSeit).not.toBeNull();
    expect(c?.keineZeitenGrund).toBe("Kalender nicht abrufbar: invalid_grant");
  });
});
