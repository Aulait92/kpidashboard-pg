import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { handleLinkedInMessage, LINKEDIN_READ_TASK, parseLinkedInMessage } from "@/lib/vertrieb/linkedin-inbound";
import { requireTestDb } from "./db";

// LinkedIn-Benachrichtigungs-Mail ohne Nachrichtentext: Kontakt + Aufgabe statt verwerfen.
const tag = Math.random().toString(36).slice(2, 8);
const slug = `maria-muster-${tag}`;

describe("LinkedIn-Nachricht ohne sichtbaren Text", () => {
  beforeAll(() => requireTestDb());
  afterAll(async () => {
    await prisma.salesContact.deleteMany({ where: { email: `linkedin-${slug}@ohne-email.invalid` } });
  });

  it("erkennt, dass nur die Benachrichtigung im Text steht", () => {
    const m = parseLinkedInMessage({
      subject: `Maria Muster${tag} hat Ihnen eine neue Nachricht gesendet`,
      body_plain: `Maria Muster${tag} hat Ihnen eine neue Nachricht gesendet\nNachricht ansehen\nhttps://www.linkedin.com/comm/in/${slug}\nAbmelden`,
    });
    expect(m.name).toBe(`Maria Muster${tag}`);
    expect(m.profileUrl).toBe(`https://www.linkedin.com/in/${slug}`);
    expect(m.message).toBeNull();
  });

  it("legt Kontakt und Aufgabe an (zweite Mail: keine doppelte Aufgabe)", async () => {
    const raw = { subject: `Maria Muster${tag} hat Ihnen eine neue Nachricht gesendet`, body_plain: `https://www.linkedin.com/comm/in/${slug}` };
    const r = await handleLinkedInMessage(raw);
    expect(r).toMatchObject({ ok: true, sentiment: "UNBEKANNT", created: true });
    await handleLinkedInMessage(raw);
    const c = await prisma.salesContact.findUniqueOrThrow({ where: { email: `linkedin-${slug}@ohne-email.invalid` }, include: { tasks: true } });
    expect(c.linkedinUrl).toBe(`https://www.linkedin.com/in/${slug}`);
    expect(c.linkedinStatus).toBe("GEANTWORTET");
    expect(c.tasks.filter((t) => t.title === LINKEDIN_READ_TASK)).toHaveLength(1);
  });
});
