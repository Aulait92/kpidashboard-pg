// Belege ↔ Kontoumsätze gegen eine echte Datenbank (Ole, 24.11.2026): der Abgleich schreibt nur den Unterschied in
// einer Transaktion mit Sperre. Von Hand Zugeordnetes bleibt, ein zweiter Lauf ändert nichts, gleichzeitige Läufe
// (mehrere Uploads auf einmal) ergeben denselben Stand statt Lücken.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { belegeAbgleichen } from "@/lib/belege/server";
import { belegVonHandZuordnen } from "@/lib/belege/zuordnen";
import { requireTestDb } from "./db";

const tag = Math.random().toString(36).slice(2, 8);
const acc = `csv:test-belege-${tag}`;
const firma = `Testfirma ${tag} GmbH`;
const betraege = [111.11, 222.22, 333.33];
const u: string[] = [];
const b: string[] = [];

const stand = async () =>
  Object.fromEntries((await prisma.beleg.findMany({ where: { id: { in: b } }, select: { id: true, bankTransactionId: true, zuordnung: true } })).map((x) => [x.id, `${x.bankTransactionId}:${x.zuordnung}`]));

describe("Belege-Abgleich in der Datenbank", () => {
  beforeAll(async () => {
    requireTestDb();
    for (const [i, betrag] of betraege.entries()) {
      const t = await prisma.bankTransaction.create({
        data: { accountKey: acc, externalId: `${tag}-${i}`, source: "csv", bookingDate: new Date("2026-03-10T00:00:00Z"), amount: -betrag, counterparty: firma, status: "zugeordnet" },
      });
      u.push(t.id);
      const beleg = await prisma.beleg.create({
        data: { quelle: "upload", typ: "INCOMING_INVOICE", firma, nummer: `R-${tag}-${i}`, datum: new Date("2026-03-05T00:00:00Z"), brutto: betrag, waehrung: "EUR", ocrFertig: true },
      });
      b.push(beleg.id);
    }
    // dritter Beleg von Hand
    const r = await belegVonHandZuordnen(b[2], [u[2]]);
    expect(r.ok).toBe(true);
  });
  afterAll(async () => {
    await prisma.beleg.deleteMany({ where: { id: { in: b } } });
    await prisma.bankTransaction.deleteMany({ where: { accountKey: acc } });
  });

  it("ordnet zu und lässt von Hand Zugeordnetes stehen", async () => {
    await belegeAbgleichen();
    const s = await stand();
    expect(s[b[0]]).toBe(`${u[0]}:auto`);
    expect(s[b[1]]).toBe(`${u[1]}:auto`);
    expect(s[b[2]]).toBe(`${u[2]}:hand`);
  });

  it("ein zweiter Lauf ändert nichts", async () => {
    const vorher = await stand();
    expect(await belegeAbgleichen()).toBe(0);
    expect(await stand()).toEqual(vorher);
  });

  it("gleichzeitige Läufe ergeben denselben Stand ohne Lücken", async () => {
    const vorher = await stand();
    await prisma.beleg.updateMany({ where: { id: { in: [b[0], b[1]] } }, data: { bankTransactionId: null, zuordnung: null } });
    await Promise.all([belegeAbgleichen(), belegeAbgleichen(), belegeAbgleichen(), belegeAbgleichen()]);
    expect(await stand()).toEqual(vorher);
  });
});
