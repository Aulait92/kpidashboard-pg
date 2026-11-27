// Antwortmail aus dem Verlauf (Ole, 27.11.2026): Verlauf geht an das Modell, Antwort wird geprüft (Form, Länge).
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { mailVorschlag } from "@/lib/vertrieb/mail-vorschlag";
import type { LlmCall } from "@/lib/kampagnen/llm";
import { requireTestDb } from "./db";

const tag = `mv${Date.now()}`;
const usage = { tokensIn: 1, tokensOut: 1, costCents: 0 };

afterAll(async () => {
  await prisma.salesContact.deleteMany({ where: { email: { startsWith: tag } } });
});

describe("mailVorschlag", () => {
  requireTestDb();
  it("gibt den Verlauf ans Modell und übernimmt Du-Form aus der Antwort", async () => {
    const c = await prisma.salesContact.create({ data: { name: "Julian Test", email: `${tag}@example.org`, firstName: "Julian", lastName: "Test", stage: "TERMIN" } });
    await prisma.salesActivity.create({ data: { contactId: c.id, type: "TERMIN", outcome: "Termin abgesagt", note: "Meld dich gerne nächstes Jahr im Mai nochmal. Die Kosten sind derzeit zu hoch." } });
    let gesehen = "";
    const llm: LlmCall = async (req) => {
      gesehen = req.system + "\n" + req.user;
      return { text: JSON.stringify({ du: true, betreff: "Gern im Mai", text: "Hallo Julian,\n\ndanke dir für die offene Rückmeldung. Ich melde mich wie gewünscht im Mai.\n\nViele Grüße\nOle Kannapinn" }), usage };
    };
    const v = await mailVorschlag(c.id, { du: null, absender: { displayName: "Ole Kannapinn", email: "ole@example.org" }, llm });
    expect(gesehen).toContain("nächstes Jahr im Mai");
    expect(gesehen).toContain("Hallo Julian");
    expect(v).toEqual({ subject: "Gern im Mai", body: expect.stringContaining("im Mai"), du: true });
  });

  it("feste Sie-Form: duzende Antwort wird zurückgewiesen und neu angefragt", async () => {
    const c = await prisma.salesContact.create({ data: { name: "Frau Test", email: `${tag}b@example.org`, salutation: "Frau", lastName: "Test" } });
    let n = 0;
    const llm: LlmCall = async () => {
      n++;
      const text = n === 1 ? "Hallo Frau Test,\n\nwie geht es dir?\n\nViele Grüße\nOle" : "Hallo Frau Test,\n\nich melde mich kurz zu unserem Angebot. Passt Ihnen ein kurzes Telefonat?\n\nViele Grüße\nOle";
      return { text: JSON.stringify({ du: false, betreff: "Kurze Rückfrage", text }), usage };
    };
    const v = await mailVorschlag(c.id, { du: false, absender: { displayName: "Ole", email: "ole@example.org" }, llm });
    expect(n).toBe(2);
    expect(v?.du).toBe(false);
    expect(v?.body).toContain("Ihnen");
  });

  it("gesperrte Kontakte bekommen keinen Vorschlag", async () => {
    const c = await prisma.salesContact.create({ data: { name: "Gesperrt", email: `${tag}c@example.org`, nieKontaktierenAt: new Date() } });
    const llm: LlmCall = async () => {
      throw new Error("darf nicht aufgerufen werden");
    };
    expect(await mailVorschlag(c.id, { du: null, absender: { displayName: null, email: "ole@example.org" }, llm })).toBeNull();
  });
});
