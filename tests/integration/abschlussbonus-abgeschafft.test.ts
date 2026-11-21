// Abschlussbonus abgeschafft (Ole, 21.11.2026; „Bei den offenen drin lassen. Habe ich schon versprochen.“):
// neue Angebote bekommen keinen Bonus, neue Versionen eines offenen Angebots mit zugesagtem Bonus behalten ihn
// (höchstens bis zum zugesagten Betrag), gegen die echte Datenbank.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createOffer, updateDraftOffer } from "@/lib/offers";
import { addDaysIso, berlinTodayIso } from "@/lib/offer-pricing";
import { requireTestDb } from "./db";
import { zugesagterBonus } from "./zugesagter-bonus";

const tag = Math.random().toString(36).slice(2, 8);
let contactId = "";
const bis = addDaysIso(berlinTodayIso(), 2);
const eingabe = (x: Record<string, unknown> = {}) =>
  ({
    contactName: "Bea Bonus",
    company: `Agentur ${tag}`,
    email: `bea-${tag}@example.test`,
    term: "12m",
    products: [{ name: "TKV-Katze", dailyBudget: 30 }],
    startDate: addDaysIso(berlinTodayIso(), 20),
    abschlussBonus: 300,
    abschlussBonusBis: bis,
    ...x,
  }) as Parameters<typeof createOffer>[1];

describe("Abschlussbonus abgeschafft", () => {
  beforeAll(async () => {
    requireTestDb();
    contactId = (await prisma.salesContact.create({ data: { name: `Bonus ${tag}`, email: `bonus-${tag}@example.test` } })).id;
  });
  afterAll(async () => {
    await prisma.offer.deleteMany({ where: { salesContactId: contactId } });
    await prisma.salesContact.delete({ where: { id: contactId } }).catch(() => {});
  });

  it("neues Angebot: kein Bonus, auch wenn die Eingabe einen verlangt", async () => {
    const o = await createOffer({ salesContactId: contactId }, eingabe(), null);
    expect(o.abschlussBonus).toBeNull();
    expect(o.abschlussBonusBis).toBeNull();
    // Entwurf bearbeiten ändert daran nichts
    const u = await updateDraftOffer(o.id, eingabe());
    expect(u.abschlussBonus).toBeNull();
  });

  it("neue Version eines verschickten Angebots mit zugesagtem Bonus: bleibt, höchstens bis zum zugesagten Betrag", async () => {
    const alt = await prisma.offer.findFirstOrThrow({ where: { salesContactId: contactId, status: "draft" } });
    await zugesagterBonus(alt.id, 300, bis);
    await prisma.offer.update({ where: { id: alt.id }, data: { status: "sent", sentAt: new Date() } });
    const neu = await createOffer({ salesContactId: contactId }, eingabe({ abschlussBonus: 500 }), null);
    expect(Number(neu.abschlussBonus)).toBe(300);
    expect(berlinTodayIso(neu.abschlussBonusBis!)).toBe(bis);
    expect((await prisma.offer.findUniqueOrThrow({ where: { id: alt.id } })).status).toBe("superseded");
    // Entwurf der neuen Version bearbeiten: Bonus bleibt, bewusst abgewählt ist er weg
    expect(Number((await updateDraftOffer(neu.id, eingabe({ abschlussBonus: 250 }))).abschlussBonus)).toBe(250);
    expect((await updateDraftOffer(neu.id, eingabe({ abschlussBonus: 0 }))).abschlussBonus).toBeNull();
  });
});
