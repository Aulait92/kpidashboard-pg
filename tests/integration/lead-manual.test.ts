// Kontakt (Ole, 14.11.2026): Termin von Hand eintragen, WhatsApp-Gespräch starten (Gründe, wenn es nicht geht).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const sent: Array<{ purpose: string; to: string }> = [];
vi.mock("@/lib/whatsapp/templates", async (orig) => {
  const real = await orig<typeof import("@/lib/whatsapp/templates")>();
  return {
    ...real,
    sendWhatsAppNotice: vi.fn(async (o: { purpose: string; to: string; customerId: string; leadId?: string | null }) => {
      sent.push({ purpose: o.purpose, to: o.to });
      const { prisma } = await import("@/lib/prisma");
      const c = await prisma.conversation.create({ data: { customerId: o.customerId, contactPhone: o.to, leadId: o.leadId ?? null } });
      return { mode: "template" as const, conversationId: c.id };
    }),
  };
});

import { prisma } from "@/lib/prisma";
import { berlinDateTime, createManualAppointment, startLeadChat } from "@/lib/lead-manual";
import { terminArtLabel } from "@/lib/termin-art";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

let customerId = "";

describe("Termin von Hand und Gespräch starten", () => {
  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer()).id;
  });
  afterAll(() => cleanupCustomer(customerId));

  it("Berliner Zeit (Sommer und Winter)", () => {
    expect(berlinDateTime("2026-11-18", "10:30")?.toISOString()).toBe("2026-11-18T09:30:00.000Z");
    expect(berlinDateTime("2027-07-01", "10:30")?.toISOString()).toBe("2027-07-01T08:30:00.000Z");
    expect(berlinDateTime("2026-11-18", "25:00")).toBeNull();
    expect(terminArtLabel("onsite")).toBe("Vor Ort");
  });

  it("legt den Termin an, setzt „In Beratung“, keine Erinnerung an den Lead, Eintrag im Verlauf", async () => {
    const lead = await prisma.lead.create({ data: { customerId, name: "Mia Hand", phone: "4917600000101", status: "Erreicht" } });
    const now = new Date("2026-11-14T12:00:00Z");
    const r = await createManualAppointment({ leadId: lead.id, customerId, userId: null, date: "2026-11-18", time: "10:30", mode: "onsite", note: "Bei ihr zu Hause", now });
    expect(r.ok).toBe(true);
    const appt = await prisma.appointment.findFirstOrThrow({ where: { leadId: lead.id } });
    expect(appt).toMatchObject({ mode: "onsite", status: "booked", calendarEventId: null });
    expect(appt.reminderSentAt).not.toBeNull();
    expect(appt.endsAt!.getTime() - appt.startsAt.getTime()).toBe(30 * 60_000);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe("In Beratung");
    const h = await prisma.leadHistory.findFirstOrThrow({ where: { leadId: lead.id } });
    expect(h.text).toMatch(/Termin von Hand eingetragen: .*Vor Ort\. Notiz: Bei ihr zu Hause/);
    expect(await createManualAppointment({ leadId: lead.id, customerId, userId: null, date: "2026-11-01", time: "10:00", mode: "phone", now })).toMatchObject({ ok: false });
    expect(await createManualAppointment({ leadId: lead.id, customerId: "fremd", userId: null, date: "2026-11-18", time: "10:00", mode: "phone", now })).toMatchObject({ ok: false });
  });

  it("Gespräch starten: erklärt, was fehlt, und sendet sonst die Erstnachricht", async () => {
    const formLead = await prisma.lead.create({ data: { customerId, name: "Tom Formular", phone: "4917600000102", formData: [{ label: "Tier", value: "Katze" }] } });
    expect(await startLeadChat({ leadId: formLead.id, customerId })).toMatchObject({ ok: false, reason: "no_whatsapp" });

    await prisma.whatsAppAccount.create({ data: { customerId, status: "connected", apiKeyEnc: "x", phoneNumberId: `pn-${customerId}` } });
    const noPhone = await prisma.lead.create({ data: { customerId, name: "Ohne Nummer", formData: [] } });
    expect(await startLeadChat({ leadId: noPhone.id, customerId })).toMatchObject({ ok: false, reason: "no_phone" });
    const manual = await prisma.lead.create({ data: { customerId, name: "Von Hand", phone: "4917600000103" } });
    expect(await startLeadChat({ leadId: manual.id, customerId })).toMatchObject({ ok: false, reason: "no_consent" });

    const r = await startLeadChat({ leadId: formLead.id, customerId });
    expect(r.ok).toBe(true);
    expect(sent.at(-1)).toEqual({ purpose: "outreach", to: "4917600000102" });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: formLead.id } })).outreachStatus).toBe("sent");
    // Zweites Mal: Gespräch existiert schon
    expect(await startLeadChat({ leadId: formLead.id, customerId })).toMatchObject({ ok: false, reason: "exists" });
  });
});
