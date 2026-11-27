// Ops-Aktion vertrieb_abmahnung_reduzieren (Ole, 27.11.2026): Kontakt aus einer Abmahnung auf Name und E-Mail reduzieren,
// Mails und Verlauf bleiben als Beleg, nie kontaktieren gesetzt (Instantly ohne Schlüssel: später).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { fuehreAktionAus } from "@/lib/ops-aktionen";
import { requireTestDb } from "./db";

const tag = Math.random().toString(36).slice(2, 8);
const email = `abm-${tag}@agentur-${tag}.test`;
let id = "";

beforeAll(async () => {
  await requireTestDb();
  const c = await prisma.salesContact.create({
    data: {
      email, name: "Max Muster (Repräsentant)", firstName: "Max", lastName: "Muster", phone: "+49 176 1", phoneDigits: "491761",
      street: "Weg 1", zip: "12345", city: "Ort", url: "https://x.test/max", openingHours: "Mo 10-21", instagramUrl: "https://instagram.com/x",
      description: "Über Instantly angelegt", enrichment: { website: { url: "https://x.test/max/impressum" } },
      phones: { create: { phone: "+491761", source: "website" } },
      activities: { create: [{ type: "NOTIZ", note: "Adresse von der Website ergänzt: Weg 1" }, { type: "NOTIZ", note: "Mail gesendet", outcome: "Instantly" }] },
    },
  });
  id = c.id;
});

afterAll(async () => {
  await prisma.salesContact.deleteMany({ where: { email } });
});

describe("vertrieb_abmahnung_reduzieren", () => {
  it("löscht Zusatzdaten, behält Name, E-Mail und Verlauf, setzt nie kontaktieren", async () => {
    const r = await fuehreAktionAus("vertrieb_abmahnung_reduzieren", { salesContactId: id });
    expect(r.ok).toBe(true);
    const c = await prisma.salesContact.findUniqueOrThrow({ where: { id }, include: { phones: true, activities: true } });
    expect(c.name).toBe("Max Muster");
    expect(c.email).toBe(email);
    expect([c.phone, c.street, c.zip, c.city, c.url, c.openingHours, c.instagramUrl, c.description, c.enrichment]).toEqual([null, null, null, null, null, null, null, null, null]);
    expect(c.phones).toHaveLength(0);
    expect(c.nieKontaktierenAt).not.toBeNull();
    const notes = c.activities.map((a) => a.note ?? "");
    expect(notes.some((n) => n.startsWith("Adresse von der Website"))).toBe(false);
    expect(notes).toContain("Mail gesendet");
  });
});
