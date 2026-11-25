// Diagnose q=lead-zeitleiste (Ole, 25.11.2026): liest echte Daten, gibt nur Kürzel und Zahlen aus.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { leadZeitleisteDiagnose } from "@/lib/ops/lead-zeitleiste";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const MIN = 60_000;

describe("Diagnose Lead-Zeitleiste", () => {
  let kunde = "";
  beforeAll(async () => {
    requireTestDb();
    kunde = (await makeCustomer({ plan: "ppl_software" })).id;
  });
  afterAll(async () => cleanupCustomer(kunde));

  it("je Lead Zeiten und Termin, je Berater Summen, ohne Namen, Nummern und Inhalte", async () => {
    const berater = await makeBuyer(kunde, "advisor");
    const t0 = new Date(Date.now() - 2 * 24 * 60 * MIN);
    const lead = await prisma.lead.create({ data: { customerId: kunde, name: "Geheim Name", phone: "4915199887766", email: "geheim@example.test", source: "Kfz", createdAt: t0, assignedUserId: berater.id, status: "In Beratung" } });
    await prisma.lead.create({ data: { customerId: kunde, name: "Test", createdAt: t0, isTest: true } });
    const conv = await prisma.conversation.create({ data: { customerId: kunde, contactPhone: "4915199887766", contactName: "Geheim Name", leadId: lead.id } });
    await prisma.message.createMany({
      data: [
        { conversationId: conv.id, direction: "outbound", sentBy: "system", body: "Geheimer Text", createdAt: new Date(t0.getTime() + 2 * MIN) },
        { conversationId: conv.id, direction: "inbound", body: "Geheime Antwort", createdAt: new Date(t0.getTime() + 10 * MIN) },
        { conversationId: conv.id, direction: "outbound", sentBy: "agent", sentByUserId: berater.id, body: "Geheim", createdAt: new Date(t0.getTime() + 25 * MIN) },
      ],
    });
    await prisma.appointment.create({ data: { customerId: kunde, leadId: lead.id, mode: "video", startsAt: new Date(t0.getTime() + 24 * 60 * MIN), bookedVia: "booking_page", createdAt: new Date(t0.getTime() + 30 * MIN) } });
    const r = await leadZeitleisteDiagnose(new URLSearchParams({ kunde, tage: "14" }));
    if ("fehler" in r) throw new Error(String(r.fehler));
    expect(r.anzahlLeads).toBe(1);
    expect(r.leads[0]).toMatchObject({
      lead: "L1",
      produkt: "Kfz",
      ersterKontakt: { wer: "Assistent", minuten: 2 },
      ersteAntwortLead: { minutenNachEingang: 10 },
      ersteMenschlicheReaktion: { minuten: 15, berater: "B1" },
      termin: { gebuchtUeber: "booking_page", minutenNachEingang: 30, ergebnis: "Ergebnis fehlt" },
      berater: "B1",
    });
    expect(r.jeBerater[0]).toMatchObject({ berater: "B1", rolle: "Berater", leads: 1, medianReaktionMin: 15 });
    const json = JSON.stringify(r);
    for (const geheim of ["Geheim", "4915199887766", "example.test", lead.id, berater.id]) expect(json).not.toContain(geheim);
    expect(await leadZeitleisteDiagnose(new URLSearchParams())).toEqual({ fehler: "kunde=<Kunden-ID> fehlt" });
  });
});
