// Policen je Berater (Persona-Test 20.11.2026, Großagentur): geschickt (Einwilligung oder Unterlage), vor dem Termin geprüft.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { policenJeLead, policenZeile } from "@/lib/policen/team-zahlen";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const H = 60 * 60 * 1000;

describe("Policen je Berater", () => {
  let customerId = "";
  let n = 0;
  const neuerLead = () => prisma.lead.create({ data: { customerId, name: "Test Lead", phone: `49151666${String(++n).padStart(4, "0")}` } });
  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer()).id;
  });
  afterAll(async () => {
    // Nachweise sind nur anhängbar; Löschen nur mit SET LOCAL (wie lib/erasure.ts)
    await prisma.$transaction([prisma.$executeRawUnsafe(`SET LOCAL app.policen_nachweis_loeschen = 'ja'`), prisma.policenNachweis.deleteMany({ where: { customerId } })]);
    await prisma.auditLog.deleteMany({ where: { customerId } });
    await cleanupCustomer(customerId);
  });

  it("zählt Einwilligung oder Unterlage als geschickt, geprüft nur vor dem ersten Termin", async () => {
    const termin = new Date(Date.now() + 24 * H);
    const ab = new Date(Date.now() - 24 * H);
    const [a, b, c, d] = await Promise.all([neuerLead(), neuerLead(), neuerLead(), neuerLead()]);
    // a: Einwilligung (Unterlage schon gelöscht), vor dem Termin geprüft
    await prisma.policenNachweis.create({ data: { customerId, leadId: a.id, phone: a.phone!, art: "einwilligung", ki: true, quelle: "whatsapp" } });
    await prisma.auditLog.create({ data: { customerId, action: "policen.auslesen_geprueft_alle", entity: "Lead", entityId: a.id, at: new Date() } });
    // b: Unterlage, Korrektur nach dem Termin zählt nicht als „vor dem Termin geprüft“
    await prisma.leadDocument.create({ data: { customerId, leadId: b.id, status: "gespeichert", mimeType: "image/jpeg", fileName: "x.jpg", size: 1 } });
    await prisma.auditLog.create({ data: { customerId, action: "policen.auslesen_korrigiert", entity: "PolicenAuszug", entityId: "x", details: { leadId: b.id }, at: new Date(termin.getTime() + H) } });
    // c: nichts geschickt; d: Policen, aber ohne Termin
    await prisma.leadDocument.create({ data: { customerId, leadId: d.id, status: "gespeichert", mimeType: "image/jpeg", fileName: "x.jpg", size: 1 } });
    const m = await policenJeLead(
      customerId,
      [
        { id: a.id, ersterTermin: termin },
        { id: b.id, ersterTermin: termin },
        { id: c.id, ersterTermin: termin },
        { id: d.id, ersterTermin: null },
      ],
      ab,
    );
    expect(m.get(a.id)).toEqual({ geschickt: true, geprueftVorTermin: true });
    expect(m.get(b.id)).toEqual({ geschickt: true, geprueftVorTermin: false });
    expect(m.has(c.id)).toBe(false);
    expect(m.has(d.id)).toBe(false);
  });

  it("Zeile für das Handy", () => {
    expect(policenZeile({ geschickt: 3, termine: 8, geprueft: 2 })).toBe("3 von 8 Terminen · 2 geprüft");
    expect(policenZeile({ geschickt: 0, termine: 1, geprueft: 0 })).toBe("0 von 1 Termin");
  });
});
