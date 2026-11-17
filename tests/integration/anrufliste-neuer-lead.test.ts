// Nacht-QA 17.11.2026: Ohne WhatsApp-Erstanschreiben stand ein neuer Lead 24 Stunden lang nirgends auf „Heute“.
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getCallbackLeads, NEUER_LEAD_REASON } from "@/lib/whatsapp/outreach";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

requireTestDb();
const ids: string[] = [];
afterAll(async () => {
  for (const id of ids) await cleanupCustomer(id);
});

describe("Anrufliste: neuer Lead ohne Erstanschreiben", () => {
  it("steht sofort oben, wenn der Assistent nicht anschreibt; mit Erstanschreiben erst nach 24 Stunden", async () => {
    const c = await makeCustomer();
    ids.push(c.id);
    await prisma.agentConfig.create({ data: { customerId: c.id, active: true, outreachEnabled: false } });
    const lead = await prisma.lead.create({ data: { customerId: c.id, name: "Paul Neumann", phone: "4915100000778", status: "Neuer Lead" } });
    const list = await getCallbackLeads(c.id);
    expect(list[0]).toMatchObject({ id: lead.id, reason: NEUER_LEAD_REASON, urgent: true });

    // Mit Termin nicht mehr
    const a = await prisma.appointment.create({ data: { customerId: c.id, leadId: lead.id, mode: "video", startsAt: new Date(Date.now() + 86_400_000), status: "booked" } });
    expect((await getCallbackLeads(c.id)).some((x) => x.id === lead.id)).toBe(false);
    await prisma.appointment.delete({ where: { id: a.id } });

    // Erstanschreiben an (Wartezeit läuft): erst nach 24 Stunden
    await prisma.agentConfig.update({ where: { customerId: c.id }, data: { outreachEnabled: true, outreachDelayMin: 15 } });
    expect((await getCallbackLeads(c.id)).some((x) => x.id === lead.id)).toBe(false);
  });
});
