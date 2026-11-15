// Terminvorbereitung: Aufgabe auf „Heute“ (36 Std. vorher bis abgehakt), Sichtbereich, Daten aus Lead und Chat.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { listVorbereitungen, loadVorbereitung, setPrepared } from "@/lib/termin-vorbereitung-server";
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
});
