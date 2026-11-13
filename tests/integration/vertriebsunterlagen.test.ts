import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Angebotsmail: Resend abfangen, um Anhang und Rechner-Link zu prüfen
const sent: { text: string; html: string; attachments?: { filename: string; content: Buffer }[] }[] = [];
vi.mock("@/lib/mail-guard", () => ({
  wasBlocked: () => false,
  MAIL_BLOCKED_TEXT: "gesperrt",
  mailClient: () => ({
    emails: {
      send: async (m: (typeof sent)[number]) => {
        sent.push(m);
        return { error: null };
      },
    },
  }),
}));

import { prisma } from "@/lib/prisma";
import { sendOfferEmail } from "@/lib/email";
import { customerGreeting } from "@/lib/offer-links";
import {
  audienceForContact,
  deletePresentation,
  getPresentation,
  listPresentations,
  looksLike,
  rechnerUrl,
  savePresentation,
} from "@/lib/vertrieb/praesentationen";
import { requireTestDb } from "./db";

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a]); // „%PDF-1.7“
const PPTX = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]); // ZIP

describe("Vertriebsunterlagen (Präsentationen)", () => {
  beforeAll(() => {
    requireTestDb();
    process.env.RESEND_API_KEY = "re_test";
  });
  afterAll(async () => {
    delete process.env.RESEND_API_KEY;
    await prisma.salesPresentation.deleteMany({});
  });

  it("prüft den Dateityp am Inhalt", () => {
    expect(looksLike("pdf", PDF)).toBe(true);
    expect(looksLike("pdf", PPTX)).toBe(false);
    expect(looksLike("pptx", PPTX)).toBe(true);
    expect(looksLike("pptx", PDF)).toBe(false);
  });

  it("speichert je Zielgruppe und Format eine Datei; neuer Upload ersetzt die alte", async () => {
    expect(await savePresentation({ audience: "makler", format: "pdf", fileName: "Alt.pdf", data: PDF, uploadedById: null })).toEqual({ ok: true });
    expect(await savePresentation({ audience: "makler", format: "pdf", fileName: "Neu.pdf", data: PDF, uploadedById: null })).toEqual({ ok: true });
    expect(await savePresentation({ audience: "makler", format: "pptx", fileName: "Makler.pptx", data: PPTX, uploadedById: null })).toEqual({ ok: true });
    const list = await listPresentations();
    expect(list.filter((p) => p.audience === "makler")).toHaveLength(2);
    expect((await getPresentation("makler", "pdf"))?.fileName).toBe("Neu.pdf");
    expect((await getPresentation("makler", "pptx"))?.contentType).toMatch(/presentationml/);
  });

  it("lehnt falsche oder leere Dateien ab", async () => {
    expect(await savePresentation({ audience: "vertreter", format: "pdf", fileName: "x.pdf", data: PPTX, uploadedById: null })).toMatchObject({ ok: false });
    expect(await savePresentation({ audience: "vertreter", format: "pptx", fileName: "x.pptx", data: new Uint8Array(), uploadedById: null })).toMatchObject({ ok: false });
    expect(await getPresentation("vertreter", "pdf")).toBeNull();
  });

  it("entfernt eine Datei", async () => {
    await deletePresentation("makler", "pptx");
    expect(await getPresentation("makler", "pptx")).toBeNull();
  });

  it("Zielgruppe aus dem Kontakt und Rechner-Link mit Budget", () => {
    expect(audienceForContact({ insurer: "Makler" })).toBe("makler");
    expect(audienceForContact({ insurer: "Allianz" })).toBe("vertreter");
    expect(audienceForContact(null)).toBe("vertreter");
    expect(rechnerUrl("https://app.test/", "makler", [{ name: "TKV-Katze", dailyBudget: 30 }, { name: "TKV-Hund", dailyBudget: 20 }])).toBe(
      "https://app.test/rechner?typ=makler&budget=50",
    );
    expect(rechnerUrl("https://app.test", "vertreter", null)).toBe("https://app.test/rechner?typ=vertreter");
  });

  it("Angebotsmail mit Rechner-Link und PDF-Anhang; ohne Extras unverändert", async () => {
    const file = await getPresentation("makler", "pdf");
    sent.length = 0;
    const base = { to: "k@example.test", greeting: "Hallo Herr Kunde,", number: "PG-1", offerUrl: "https://app.test/angebot/x", validUntil: new Date() };
    expect(await sendOfferEmail({ ...base, rechnerUrl: "https://app.test/rechner?typ=makler", attachment: { filename: file!.fileName, content: Buffer.from(file!.data) } })).toMatchObject({ ok: true });
    expect(sent[0].attachments?.[0].filename).toBe("Neu.pdf");
    expect(sent[0].text).toContain("https://app.test/rechner?typ=makler");
    expect(sent[0].text).toContain("Präsentation");
    expect(sent[0].html).toContain("Zum Rechner");

    await sendOfferEmail(base);
    expect(sent[1].attachments).toBeUndefined();
    expect(sent[1].text).not.toContain("Rechner");
  });

  it("Du-Form: Betreff, Text und Anrede mit Vornamen", async () => {
    sent.length = 0;
    const c = await prisma.salesContact.create({ data: { name: "Max Muster", firstName: "Max", lastName: "Muster", salutation: "Herr", email: `du-${Date.now()}@example.test` } });
    try {
      expect(await customerGreeting({ salesContactId: c.id, contactName: "Max Muster" }, true)).toBe("Hallo Max,");
      expect(await customerGreeting({ salesContactId: c.id, contactName: "Max Muster" })).toBe("Hallo Herr Muster,");
      expect(await customerGreeting({ salesContactId: null, contactName: "Herr Karl Kunde" }, true)).toBe("Hallo Karl,");
      await sendOfferEmail({ to: "k@example.test", greeting: "Hallo Max,", number: "PG-2", offerUrl: "https://app.test/angebot/y", validUntil: new Date(), du: true, rechnerUrl: "https://app.test/rechner", attachment: { filename: "p.pdf", content: Buffer.from("x") } });
      const m = sent[0] as unknown as { subject: string; text: string; html: string };
      expect(m.subject).toMatch(/^Dein Angebot/);
      expect(m.text).toContain("findest du dein Angebot");
      expect(m.text).toContain("siehst du");
      expect(m.text).toContain("findest du zum Nachlesen");
      expect(m.text).not.toMatch(/\b(Sie|Ihr|Ihnen)\b/);
      expect(m.html).not.toMatch(/\b(Sie|Ihr|Ihnen)\b/);
    } finally {
      await prisma.salesContact.delete({ where: { id: c.id } });
    }
  });
});
