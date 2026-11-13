import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { recordReply } from "@/lib/vertrieb/instantly";
import { backfillPhonesFromMail } from "@/lib/vertrieb/signature-phone";
import { requireTestDb } from "./db";

// Cold-Mail-Kontakte ohne Nummer: Telefon aus der Signatur der Antwort ergänzen (Ole, 13.11.2026)
const tag = Math.random().toString(36).slice(2, 8);
const ids: string[] = [];
const contact = async (phone: string | null = null) => {
  const c = await prisma.salesContact.create({ data: { name: `Signatur ${tag}`, email: `sig-${ids.length}-${tag}@example.test`, phone } });
  ids.push(c.id);
  return c;
};
const sig = "Gerne, melden Sie sich.\n\nViele Grüße\nMax Muster\nTel.: 040 123 456 78";

describe("Telefon aus E-Mail-Signatur", () => {
  beforeAll(() => requireTestDb());
  afterAll(async () => {
    await prisma.salesContact.deleteMany({ where: { id: { in: ids } } });
  });

  it("neue Antwort füllt die leere Nummer und schreibt es in den Verlauf", async () => {
    const c = await contact();
    await recordReply(c.id, { subject: `Re: Test ${tag}`, text: sig, isAutoReply: false, sentAt: new Date() });
    const after = await prisma.salesContact.findUniqueOrThrow({ where: { id: c.id } });
    expect(after.phone).toBe("040 123 456 78");
    const note = await prisma.salesActivity.findFirst({ where: { contactId: c.id, note: { contains: "E-Mail-Signatur" } } });
    expect(note).not.toBeNull();
  });

  it("überschreibt keine vorhandene Nummer und nutzt keine Abwesenheitsnotiz", async () => {
    const withPhone = await contact("0171 7654321");
    await recordReply(withPhone.id, { subject: `Re: A ${tag}`, text: sig, isAutoReply: false, sentAt: new Date() });
    expect((await prisma.salesContact.findUniqueOrThrow({ where: { id: withPhone.id } })).phone).toBe("0171 7654321");

    const away = await contact();
    await recordReply(away.id, { subject: `Abwesend ${tag}`, text: `Ich bin nicht im Büro.\nVertretung Tel.: 040 999 888`, isAutoReply: true, sentAt: new Date() });
    expect((await prisma.salesContact.findUniqueOrThrow({ where: { id: away.id } })).phone).toBeNull();
  });

  it("holt die Nummer für bestehende Kontakte aus alten Antworten nach (einmalig)", async () => {
    const c = await contact();
    await prisma.salesEmail.create({ data: { contactId: c.id, direction: "IN", subject: "alt", text: sig, isAutoReply: false, sentAt: new Date(Date.now() - 86400000) } });
    await backfillPhonesFromMail(500);
    const after = await prisma.salesContact.findUniqueOrThrow({ where: { id: c.id } });
    expect(after.phone).toBe("040 123 456 78");
    expect(after.phoneMailCheckedAt).not.toBeNull();
  });
});
