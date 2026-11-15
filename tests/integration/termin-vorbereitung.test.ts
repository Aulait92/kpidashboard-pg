// Terminvorbereitung: Aufgabe auf „Heute“ (36 Std. vorher bis abgehakt), Sichtbereich, Daten aus Lead und Chat.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { angeboteSpeichern, auslesenUndSpeichern, listVorbereitungen, loadAngebote, loadPraesentation, loadVorbereitung, setPrepared } from "@/lib/termin-vorbereitung-server";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const HOUR = 60 * 60 * 1000;

describe("Terminvorbereitung", () => {
  let customerId = "";
  let otherId = "";
  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer({ name: "Agentur Susanne Meier" })).id;
    otherId = (await makeCustomer()).id;
  });
  afterAll(async () => {
    await cleanupCustomer(customerId);
    await cleanupCustomer(otherId);
  });

  it("listet Termine der nächsten 36 Std. bis „Vorbereitet“; lädt Angaben aus Formular und Chat", async () => {
    const now = new Date();
    const lead = await prisma.lead.create({
      data: { customerId, name: "Julia Schneider", phone: "4915133330001", source: "Privatschutz", formData: [{ label: "Versicherungsinteresse", value: "Hausratversicherung" }] },
    });
    const conv = await prisma.conversation.create({
      data: { customerId, leadId: lead.id, contactPhone: "4915133330001", qualificationSummary: "Möchte Hausrat.", qualificationData: { geburt: "22.08.1992", wohnflaeche: "78 m²" } },
    });
    const soon = await prisma.appointment.create({ data: { customerId, leadId: lead.id, conversationId: conv.id, mode: "phone", status: "booked", startsAt: new Date(now.getTime() + 20 * HOUR) } });
    await prisma.appointment.create({ data: { customerId, leadId: lead.id, mode: "phone", status: "booked", startsAt: new Date(now.getTime() + 72 * HOUR) } });
    await prisma.appointment.create({ data: { customerId, leadId: lead.id, mode: "phone", status: "cancelled", startsAt: new Date(now.getTime() + 5 * HOUR) } });
    const ctx = { customerId, userId: null, teamRole: "owner" as const };

    const list = await listVorbereitungen(ctx, now);
    expect(list.map((t) => t.id)).toEqual([soon.id]);
    expect(list[0]).toMatchObject({ name: "Julia Schneider", produkt: "Privatschutz" });

    const d = await loadVorbereitung(soon.id, ctx);
    expect(d?.zusammenfassung).toBe("Möchte Hausrat.");
    expect(d?.termin.berater).toBe("Susanne Meier");
    expect(d?.formular[0].label).toBe("Versicherungsinteresse");

    // fremder Kunde sieht den Termin nicht
    expect(await loadVorbereitung(soon.id, { customerId: otherId, userId: null, teamRole: "owner" })).toBeNull();
    expect(await setPrepared(soon.id, { customerId: otherId, userId: null, teamRole: "owner" }, true)).toBe(false);

    expect(await setPrepared(soon.id, ctx, true)).toBe(true);
    expect(await listVorbereitungen(ctx, now)).toHaveLength(0);
    expect(await setPrepared(soon.id, ctx, false)).toBe(true);
    expect(await listVorbereitungen(ctx, now)).toHaveLength(1);
  });

  it("Angebote: speichern, bestätigen, Präsentation mit Allianz-Marke; Auslesen nur für Testkunden", async () => {
    const lead = await prisma.lead.create({ data: { customerId, name: "Max Weber", phone: "4915133330002", source: "Privatschutz" } });
    const appt = await prisma.appointment.create({ data: { customerId, leadId: lead.id, mode: "video", status: "booked", startsAt: new Date(Date.now() + 10 * HOUR) } });
    const ctx = { customerId, userId: null, teamRole: "owner" as const };
    // Kein Testkunde → Auslesen gesperrt (Datenschutz), von Hand eintragen geht
    const r = await auslesenUndSpeichern(appt.id, ctx);
    expect(r.ok).toBe(false);
    expect(await angeboteSpeichern(appt.id, ctx, { items: [{ sparte: "Hausrat", tarif: "Komfort", beitragMonat: 8.2, empfohlen: true }] }, false)).toBe(true);
    let p = await loadPraesentation(appt.id, ctx);
    expect(p?.angeboteBestaetigt).toBe(false);
    expect(p?.folien.find((f) => f.id === "empfehlung")?.html).toContain("im Gespräch");
    await prisma.customer.update({ where: { id: customerId }, data: { name: "Allianz Agentur Lohmann" } });
    expect(await angeboteSpeichern(appt.id, ctx, (await loadAngebote(appt.id, ctx))!.angebote, true)).toBe(true);
    p = await loadPraesentation(appt.id, ctx);
    expect(p?.angeboteBestaetigt).toBe(true);
    expect(p?.marke.gesellschaft).toBe("Allianz");
    expect(p?.folien.find((f) => f.id === "empfehlung")?.html).toContain("8,20");
    expect(await loadPraesentation(appt.id, { customerId: otherId, userId: null, teamRole: "owner" })).toBeNull();
  });
});
