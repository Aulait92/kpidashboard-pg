import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Angebotsmail aus dem CRM: Du/Sie, Rechner, Präsentation – und die vollständige Mail im Verlauf
const sent: { subject: string; text: string; attachments?: { filename: string }[] }[] = [];
vi.mock("@/lib/mail-guard", () => ({
  wasBlocked: () => false,
  MAIL_BLOCKED_TEXT: "gesperrt",
  mailClient: () => ({ emails: { send: async (m: (typeof sent)[number]) => (sent.push(m), { error: null }) } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/auth", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth")>()),
  getCurrentSession: async () => ({ userId: "admin-test", email: "admin@example.test", role: "ADMIN" }),
}));

import { prisma } from "@/lib/prisma";
import { createOffer } from "@/lib/offers";
import { addDaysIso, berlinTodayIso } from "@/lib/offer-pricing";
import { savePresentation } from "@/lib/vertrieb/praesentationen";
import { sendOfferEmailAction } from "@/app/admin/vertrieb/offer-actions";
import { requireTestDb } from "./db";

const tag = Math.random().toString(36).slice(2, 8);
let contactId = "";

describe("Angebotsmail im Verlauf", () => {
  beforeAll(async () => {
    requireTestDb();
    process.env.RESEND_API_KEY = "re_test";
    process.env.APP_URL = process.env.APP_URL || "https://app.test";
    const c = await prisma.salesContact.create({ data: { name: "Max Muster", firstName: "Max", lastName: "Muster", salutation: "Herr", insurer: "Makler", email: `mail-${tag}@example.test` } });
    contactId = c.id;
    await savePresentation({ audience: "makler", format: "pdf", fileName: "Makler.pdf", data: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x0a]), uploadedById: null });
  });
  afterAll(async () => {
    delete process.env.RESEND_API_KEY;
    await prisma.offer.deleteMany({ where: { salesContactId: contactId } });
    await prisma.salesContact.delete({ where: { id: contactId } }).catch(() => {});
    await prisma.salesPresentation.deleteMany({ where: { audience: "makler", format: "pdf" } });
  });

  it("Du + Rechner + Präsentation: Mail korrekt, vollständig als E-Mail im Verlauf", async () => {
    const offer = await createOffer(
      { salesContactId: contactId },
      { contactName: "Max Muster", email: `mail-${tag}@example.test`, term: "12m", products: [{ name: "TKV-Katze", dailyBudget: 30 }], startDate: addDaysIso(berlinTodayIso(), 20) },
      null,
    );
    sent.length = 0;
    expect(await sendOfferEmailAction(offer.id, { du: true, rechner: true, praesentation: true, audience: "makler" })).toEqual({ ok: true });
    const m = sent[0];
    expect(m.subject).toMatch(/^Dein Angebot von performancegrowth/);
    expect(m.text.startsWith("Hallo Max,")).toBe(true);
    expect(m.text).toContain("/rechner?typ=makler&budget=30");
    expect(m.attachments?.[0].filename).toBe("Makler.pdf");

    const act = await prisma.salesActivity.findFirst({ where: { contactId, type: "EMAIL" }, orderBy: { occurredAt: "desc" } });
    expect(act?.outcome).toMatch(/per E-Mail .* gesendet \(mit Rechner-Link und Makler-Präsentation\)/);
    expect(act?.note).toContain(`An: mail-${tag}@example.test`);
    expect(act?.note).toContain(`Betreff: ${m.subject}`);
    expect(act?.note).toContain("Anhang: Makler.pdf");
    expect(act?.note).toContain(m.text);
  });
});
