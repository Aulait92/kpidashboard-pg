// Erneut eingetragen (Ole, 16.11.2026, lib/lead-erneut.ts): dieselbe Person beim selben Kunden (Telefon oder E-Mail)
// → kein zweiter Lead, Verlauf, Antworten ergänzt, Wiedervorlage heute oben, Push, keine zweite Begrüßung.
// Fehler in der Dublettenlogik → wie bisher neuer Lead.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({ boom: false }));
const push = vi.fn();
vi.mock("@/lib/push", () => ({
  sendToAdmins: vi.fn(async () => ({ sent: 1, removed: 0, errors: [] })),
  sendToBuyersOfCustomer: vi.fn(async (_c: string, p: unknown) => {
    push(p);
    return { sent: 1, removed: 0, errors: [] };
  }),
  sendToUser: vi.fn(async (_u: string, p: unknown) => {
    push(p);
    return { sent: 1, removed: 0, errors: [] };
  }),
}));
const mail = vi.fn();
vi.mock("@/lib/email", async (orig) => ({ ...(await orig<typeof import("@/lib/email")>()), sendCustomerMail: (...a: unknown[]) => mail(...a) }));
const send = vi.fn();
vi.mock("@/lib/whatsapp/templates", async (orig) => {
  const real = await orig<typeof import("@/lib/whatsapp/templates")>();
  return { ...real, sendWhatsAppNotice: (...a: unknown[]) => send(...a) };
});
const reported = vi.fn();
vi.mock("@/lib/monitoring", async (orig) => {
  const real = await orig<typeof import("@/lib/monitoring")>();
  return { ...real, reportError: (...a: unknown[]) => reported(...a) };
});
// Fehler in der Dublettenlogik nachstellen (isLostStatus wird nur beim Speichern der erneuten Eintragung gerufen)
vi.mock("@/lib/lead-lost", async (orig) => {
  const real = await orig<typeof import("@/lib/lead-lost")>();
  return {
    ...real,
    isLostStatus: (s: string | null | undefined) => {
      if (st.boom) throw new Error("kaputt");
      return real.isLostStatus(s);
    },
  };
});

import { prisma } from "@/lib/prisma";
import { ingestLead, type IncomingLead } from "@/lib/lead-intake";
import { loadInbox } from "@/lib/inbox";
import { CROSS_SELL_TODO } from "@/lib/vertraege-shared";
import { POLICY_TODO } from "@/lib/lead-followup";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 10);
const erneutErrors = () => reported.mock.calls.filter((c) => String(c[1]).startsWith("lead-erneut"));
let n = 0;
const nextPhone = () => `0171 77${String(++n).padStart(3, "0")}${Math.floor(Math.random() * 90 + 10)}`;
const norm = (p: string) => `49${p.replace(/\D/g, "").slice(1)}`;

describe("Erneut eingetragen", () => {
  let customerId = "";
  let otherId = "";
  const formId = `form-erneut-${uid()}`;
  const otherForm = `form-erneut-b-${uid()}`;

  const inc = (fields: Record<string, string>, over: Partial<IncomingLead> = {}): IncomingLead => ({
    externalId: `ext-erneut-${uid()}`,
    formId,
    pageId: "page-1",
    createdAt: new Date().toISOString(),
    campaignName: "Test",
    adName: null,
    fields,
    ...over,
  });

  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer()).id;
    otherId = (await makeCustomer()).id;
    await prisma.leadSource.create({ data: { formId, customerId, productKey: "Hausrat", leadPrice: 40 } });
    await prisma.leadSource.create({ data: { formId: otherForm, customerId: otherId, productKey: "Hausrat" } });
  });
  afterAll(async () => {
    for (const id of [customerId, otherId]) {
      await prisma.revenue.deleteMany({ where: { customerId: id } });
      await prisma.lead.deleteMany({ where: { customerId: id } });
      await prisma.leadSource.deleteMany({ where: { customerId: id } });
      await prisma.agentConfig.deleteMany({ where: { customerId: id } });
      await prisma.whatsAppAccount.deleteMany({ where: { customerId: id } });
      await cleanupCustomer(id);
    }
  });
  beforeEach(() => {
    st.boom = false;
    push.mockReset();
    mail.mockReset();
    send.mockReset();
    reported.mockReset();
    send.mockResolvedValue({ mode: "template", conversationId: "c", variant: null, documentHeader: false });
    mail.mockResolvedValue({ ok: true });
  });

  async function first(fields: Record<string, string>) {
    const res = await ingestLead(inc(fields), "meta");
    expect(res.status).toBe("created");
    return res.leadId!;
  }

  it("gleiche Nummer: kein zweiter Lead, Antworten ergänzt, Verlauf, Wiedervorlage heute oben, Push", async () => {
    const phone = nextPhone();
    const id = await first({ full_name: "Julia Muster", phone_number: phone, email: `julia${n}@example.com`, "wann_erreichbar?": "abends" });
    await prisma.lead.update({ where: { id }, data: { contactOverrides: { lastName: "Muster-Korrigiert" }, callbackSnoozedUntil: new Date(Date.now() + 86400000) } });
    // Eine andere, ältere Wiedervorlage desselben Kunden steht davor (Fälligkeit), die erneute Eintragung soll nach oben
    await prisma.lead.create({ data: { customerId, name: "Alt", phone: "4917100000001", status: "Neuer Lead", followUpAt: new Date(Date.now() - 3 * 86400000), followUpNote: "Rückruf" } });
    push.mockReset();

    const again = inc({ full_name: "Julia Muster", phone_number: phone, "wann_erreichbar?": "morgens", "wohnfläche": "80" });
    const res = await ingestLead(again, "meta");
    expect(res.status).toBe("reentry");
    expect(res.leadId).toBe(id);
    expect(await prisma.lead.count({ where: { customerId, phone: norm(phone) } })).toBe(1);
    expect(await prisma.revenue.count({ where: { customerId, leadId: id } })).toBe(1);

    const l = await prisma.lead.findUniqueOrThrow({ where: { id } });
    const form = l.formData as { label: string; value: string }[];
    expect(form[0]).toEqual({ label: "Wann erreichbar?", value: "abends" });
    expect(form.find((a) => a.label === "Erneut eingetragen")?.value).toMatch(/Hausrat$/);
    expect(form).toContainEqual({ label: "Wann erreichbar?", value: "morgens" });
    expect(form).toContainEqual({ label: "Wohnfläche", value: "80" });
    expect(l.contactOverrides).toEqual({ lastName: "Muster-Korrigiert" });
    expect(l.name).toBe("Julia Muster");
    expect(l.status).toBe("Neuer Lead");
    expect(l.followUpNote).toBe("Hat sich erneut eingetragen (Hausrat)");
    expect(l.followUpAt!.getTime()).toBeLessThanOrEqual(Date.now());
    expect(l.callbackSnoozedUntil).toBeNull();

    const hist = await prisma.leadHistory.findMany({ where: { leadId: id } });
    expect(hist.map((h) => h.text).join("\n")).toContain("Hat sich erneut eingetragen (Hausrat).");
    expect(push).toHaveBeenCalledTimes(1);
    const p = push.mock.calls[0][0] as { title: string; body: string };
    expect(p.title).toContain("Erneut eingetragen: Julia Muster");
    expect(`${p.title} ${p.body}`).not.toMatch(/[–—]/);
    expect(await prisma.leadReentry.count({ where: { leadId: id } })).toBe(1);

    const inbox = await loadInbox({ customerId, userId: null, teamRole: "owner" });
    expect(inbox.followUps[0].leadId).toBe(id);
    expect(inbox.followUps[0].note).toBe("Hat sich erneut eingetragen (Hausrat)");
    expect(erneutErrors()).toEqual([]);
  });

  it("gleiche E-Mail (andere Nummer): bestehender Lead, Nummer bleibt, neue Nummer als weitere Angabe", async () => {
    const phone = nextPhone();
    const email = `petra${uid()}@example.com`;
    const id = await first({ full_name: "Petra Lang", phone_number: phone, email });
    const other = nextPhone();
    const res = await ingestLead(inc({ full_name: "Petra Lang", phone_number: other, email: email.toUpperCase() }), "zapier");
    expect(res).toEqual({ status: "reentry", leadId: id });
    const l = await prisma.lead.findUniqueOrThrow({ where: { id } });
    expect(l.phone).toBe(norm(phone));
    expect(l.formData).toContainEqual({ label: "Weitere Telefonnummer", value: `+${norm(other)}` });
    expect(await prisma.lead.count({ where: { customerId, phone: norm(other) } })).toBe(0);
  });

  it("anderer Vermittler: neuer Lead wie bisher", async () => {
    const phone = nextPhone();
    const id = await first({ full_name: "Max Berg", phone_number: phone });
    const res = await ingestLead(inc({ full_name: "Max Berg", phone_number: phone }, { formId: otherForm }), "meta");
    expect(res.status).toBe("created");
    expect(res.leadId).not.toBe(id);
    const l = await prisma.lead.findUniqueOrThrow({ where: { id: res.leadId! } });
    expect(l.customerId).toBe(otherId);
  });

  it("gelöschter Lead (erasedAt) zählt nicht: neuer Lead", async () => {
    const phone = nextPhone();
    const id = await first({ full_name: "Eva Gelöscht", phone_number: phone });
    await prisma.lead.update({ where: { id }, data: { erasedAt: new Date() } });
    const res = await ingestLead(inc({ full_name: "Eva Gelöscht", phone_number: phone }), "meta");
    expect(res.status).toBe("created");
    expect(res.leadId).not.toBe(id);
  });

  it("verlorener Lead: zurück auf Neuer Lead, Verlustgrund im Verlauf", async () => {
    const phone = nextPhone();
    const id = await first({ full_name: "Tom Weiß", phone_number: phone });
    await prisma.lead.update({ where: { id }, data: { status: "Kein Interesse", lostReason: "schon_versichert", lostNote: "bei der HUK", lostAt: new Date() } });
    const res = await ingestLead(inc({ full_name: "Tom Weiß", phone_number: phone }), "meta");
    expect(res.status).toBe("reentry");
    const l = await prisma.lead.findUniqueOrThrow({ where: { id } });
    expect(l.status).toBe("Neuer Lead");
    expect(l.lostReason).toBeNull();
    expect(l.lostAt).toBeNull();
    expect(l.followUpNote).toBe("Hat sich erneut eingetragen (Hausrat)");
    const hist = (await prisma.leadHistory.findMany({ where: { leadId: id } })).map((h) => h.text).join("\n");
    expect(hist).toContain("vorher verloren: Schon versichert (bei der HUK)");
  });

  it("gewonnener Lead: Phase bleibt, Wiedervorlage weiteres Produkt; offene Police-Aufgabe bleibt", async () => {
    const phone = nextPhone();
    const id = await first({ full_name: "Anna Gold", phone_number: phone });
    await prisma.lead.update({ where: { id }, data: { status: "Abschluss", closedAt: new Date() } });
    expect((await ingestLead(inc({ full_name: "Anna Gold", phone_number: phone }), "meta")).status).toBe("reentry");
    const l = await prisma.lead.findUniqueOrThrow({ where: { id } });
    expect(l.status).toBe("Abschluss");
    expect(l.followUpNote?.startsWith(CROSS_SELL_TODO)).toBe(true);
    expect(l.followUpNote).toContain("erneut eingetragen (Hausrat)");

    const phone2 = nextPhone();
    const id2 = await first({ full_name: "Ben Gold", phone_number: phone2 });
    const due = new Date(Date.now() - 3600000);
    await prisma.lead.update({ where: { id: id2 }, data: { status: "Abschluss", closedAt: new Date(), followUpAt: due, followUpNote: POLICY_TODO } });
    expect((await ingestLead(inc({ full_name: "Ben Gold", phone_number: phone2 }), "meta")).status).toBe("reentry");
    const l2 = await prisma.lead.findUniqueOrThrow({ where: { id: id2 } });
    expect(l2.followUpNote).toBe(POLICY_TODO);
    expect(l2.followUpAt?.getTime()).toBe(due.getTime());
  });

  describe("WhatsApp", () => {
    beforeAll(async () => {
      await prisma.agentConfig.create({ data: { customerId, active: true, outreachEnabled: true, outreachDelayMin: 30 } });
      await prisma.whatsAppAccount.create({ data: { customerId, status: "connected" } });
    });

    it("bestehendes Gespräch: keine zweite Begrüßung, Hinweis im Chat", async () => {
      const phone = nextPhone();
      const id = await first({ full_name: "Clara Chat", phone_number: phone });
      const conv = await prisma.conversation.create({ data: { customerId, contactPhone: norm(phone), leadId: id, status: "open", lastMessageAt: new Date(), windowExpiresAt: new Date(Date.now() + 3600000) } });
      await prisma.message.create({ data: { conversationId: conv.id, direction: "inbound", kind: "text", body: "Hallo", sentBy: null } });
      await prisma.lead.update({ where: { id }, data: { outreachAt: new Date(), outreachStatus: "sent" } });
      send.mockReset();
      const res = await ingestLead(inc({ full_name: "Clara Chat", phone_number: phone }), "meta");
      expect(res.status).toBe("reentry");
      expect(send).not.toHaveBeenCalled();
      const l = await prisma.lead.findUniqueOrThrow({ where: { id } });
      expect(l.outreachStatus).toBe("sent");
      expect(await prisma.message.count({ where: { conversationId: conv.id, direction: "internal", kind: "erneut_eingetragen" } })).toBe(1);
      expect(await prisma.message.count({ where: { conversationId: conv.id, direction: "outbound" } })).toBe(0);
      expect(erneutErrors()).toEqual([]);
    });

    it("nie ein Gespräch: normales Erstanschreiben für den bestehenden Lead (einmal)", async () => {
      const phone = nextPhone();
      const id = await first({ full_name: "Olaf Ohne", phone_number: phone });
      // Alter Lead, Erstanschreiben damals nicht möglich (z. B. ohne Vorlage), kein Gespräch
      await prisma.lead.update({ where: { id }, data: { createdAt: new Date(Date.now() - 30 * 86400000), outreachAt: new Date(), outreachStatus: "failed: alt" } });
      send.mockReset();
      send.mockResolvedValue({ mode: "template", conversationId: "c", variant: null, documentHeader: false });
      const res = await ingestLead(inc({ full_name: "Olaf Ohne", phone_number: phone }, { formId }), "meta");
      expect(res.status).toBe("reentry");
      expect(send).toHaveBeenCalledTimes(1);
      expect((send.mock.calls[0][0] as { to: string; leadId: string }).leadId).toBe(id);
      const l = await prisma.lead.findUniqueOrThrow({ where: { id } });
      expect(l.outreachStatus).toBe("sent");
      expect(erneutErrors()).toEqual([]);
    });
  });

  it("dieselbe erneute Einsendung zweimal (Meta + Zapier): einmal verarbeitet, dann Dublette", async () => {
    const phone = nextPhone();
    const id = await first({ full_name: "Doris Doppelt", phone_number: phone });
    push.mockReset();
    const again = inc({ full_name: "Doris Doppelt", phone_number: phone });
    expect(await ingestLead(again, "meta")).toEqual({ status: "reentry", leadId: id });
    expect(await ingestLead(again, "zapier")).toEqual({ status: "duplicate", leadId: id });
    expect(await prisma.leadReentry.count({ where: { leadId: id } })).toBe(1);
    expect(push).toHaveBeenCalledTimes(1);
    const hist = await prisma.leadHistory.count({ where: { leadId: id, text: { startsWith: "Hat sich erneut eingetragen" } } });
    expect(hist).toBe(1);
  });

  it("gleiche externalId wie ein Lead: Dublette wie bisher", async () => {
    const phone = nextPhone();
    const one = inc({ full_name: "Egon Eins", phone_number: phone });
    const a = await ingestLead(one, "meta");
    const b = await ingestLead(one, "zapier");
    expect(b).toEqual({ status: "duplicate", leadId: a.leadId });
    expect(await prisma.leadReentry.count({ where: { leadId: a.leadId! } })).toBe(0);
  });

  it("Fehler in der Dublettenlogik: Lead wird trotzdem angelegt, Fehler gemeldet", async () => {
    const phone = nextPhone();
    const id = await first({ full_name: "Fritz Fehler", phone_number: phone });
    st.boom = true;
    const res = await ingestLead(inc({ full_name: "Fritz Fehler", phone_number: phone }), "meta");
    st.boom = false;
    expect(res.status).toBe("created");
    expect(res.leadId).not.toBe(id);
    expect(await prisma.lead.count({ where: { customerId, phone: norm(phone) } })).toBe(2);
    expect(await prisma.leadReentry.count({ where: { leadId: id } })).toBe(0);
    expect(reported.mock.calls.some((c) => c[1] === "lead-erneut-speichern")).toBe(true);
  });
});
