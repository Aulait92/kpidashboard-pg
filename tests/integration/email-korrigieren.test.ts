import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const sent: unknown[] = [];
vi.mock("resend", () => ({ Resend: class { emails = { send: async (m: unknown) => (sent.push(m), { data: { id: "x" }, error: null }) }; } }));

import { prisma } from "@/lib/prisma";
import { updatePrimaryEmail } from "@/lib/vertrieb/contact-merge";
import { sendOfferEmail } from "@/lib/email";
import { requireTestDb } from "./db";

const tag = Math.random().toString(36).slice(2, 8);
const ids: string[] = [];

describe("Haupt-E-Mail korrigieren + Mail-Sperre der Testumgebung", () => {
  beforeAll(() => requireTestDb());
  afterAll(async () => {
    await prisma.offer.deleteMany({ where: { salesContactId: { in: ids } } });
    await prisma.salesContact.deleteMany({ where: { id: { in: ids } } });
    delete process.env.MAIL_NUR_AN;
    delete process.env.RESEND_API_KEY;
  });

  it("ersetzt die Tippfehler-Adresse, auch im offenen Angebot, nicht im angenommenen", async () => {
    const c = await prisma.salesContact.create({ data: { name: "Tipp Fehler", email: `falsch-${tag}@example.test` } });
    ids.push(c.id);
    const base = { contactName: "Tipp Fehler", term: "12m", products: [], setupFee: 0, monthlyFee: 700, softwareFee: 349, validUntil: new Date("2026-12-31"), salesContactId: c.id };
    const open = await prisma.offer.create({ data: { ...base, number: `EK-${tag}-1`, token: `ek-${tag}-1`, email: `falsch-${tag}@example.test`, status: "sent" } });
    const done = await prisma.offer.create({ data: { ...base, number: `EK-${tag}-2`, token: `ek-${tag}-2`, email: `falsch-${tag}@example.test`, status: "accepted", acceptedAt: new Date() } });
    expect(await updatePrimaryEmail(c.id, ` Richtig-${tag}@Example.test `)).toEqual({ ok: true, offers: 1 });
    expect((await prisma.salesContact.findUniqueOrThrow({ where: { id: c.id } })).email).toBe(`richtig-${tag}@example.test`);
    expect((await prisma.offer.findUniqueOrThrow({ where: { id: open.id } })).email).toBe(`richtig-${tag}@example.test`);
    expect((await prisma.offer.findUniqueOrThrow({ where: { id: done.id } })).email).toBe(`falsch-${tag}@example.test`);
    expect(await updatePrimaryEmail(c.id, "keine-mail")).toMatchObject({ ok: false });
  });

  it("gesperrte Angebotsmail (MAIL_NUR_AN) meldet einen Fehler statt „gesendet“", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.MAIL_NUR_AN = "@performancegrowth.de";
    const base = { greeting: "Hallo,", number: "PG-T", offerUrl: "https://x.test/a", validUntil: new Date() };
    const blocked = await sendOfferEmail({ ...base, to: "jemand@hotmail.test" });
    expect(blocked).toMatchObject({ ok: false });
    expect((blocked as { error: string }).error).toMatch(/Testumgebung/);
    expect(await sendOfferEmail({ ...base, to: "ole@performancegrowth.de" })).toMatchObject({ ok: true });
  });
});
