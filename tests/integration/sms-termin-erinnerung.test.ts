// SMS-Ersatz für WhatsApp-Terminerinnerungen an Leads (Ole, 25.11.2026): Erinnerung kommt mit „nicht zustellbar“ zurück
// → genau eine kurze SMS mit Datum, Uhrzeit, Art und Link zum Termin. Nicht bei Abmeldung, Pay-per-Lead, Festnetz.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/push", () => ({
  sendToAdmins: vi.fn(async () => ({ sent: 0, removed: 0, errors: [] })),
  sendToBuyersOfCustomer: vi.fn(async () => ({ sent: 0, removed: 0, errors: [] })),
  sendToUser: vi.fn(async () => ({ sent: 0, removed: 0, errors: [] })),
}));

import { prisma } from "@/lib/prisma";
import { handleFailedStatus } from "@/lib/whatsapp/kein-whatsapp";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 10);
const sms: Array<{ to: string; text: string; from: string }> = [];

describe("SMS-Ersatz für Terminerinnerungen", () => {
  const kunden: string[] = [];
  let kunde = "";
  let kundeDu = "";
  let ppl = "";

  beforeAll(async () => {
    requireTestDb();
    process.env.PUBLIC_BOOKING_URL = "https://www.dein-beratungstermin.de";
    kunde = (await makeCustomer({ plan: "ppl_software", leadAddress: "sie" })).id;
    kundeDu = (await makeCustomer({ plan: "ppl_software", leadAddress: "du" })).id;
    ppl = (await makeCustomer({ plan: "ppl" })).id;
    kunden.push(kunde, kundeDu, ppl);
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      if (String(url).includes("seven.io")) sms.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ success: "100", messages: [{ id: "1", success: true }] }), { status: 200 });
    }));
  });
  beforeEach(() => {
    sms.length = 0;
    process.env.SEVEN_API_KEY = "test-key";
    delete process.env.MAIL_NUR_AN;
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    delete process.env.SEVEN_API_KEY;
    delete process.env.PUBLIC_BOOKING_URL;
    for (const id of kunden) await cleanupCustomer(id);
  });

  async function erinnerung(customerId: string, o: { purpose?: string; phone?: string; mode?: string; startsIn?: number; optedOut?: boolean } = {}) {
    const phone = o.phone ?? `49151${Math.floor(10000000 + Math.random() * 89999999)}`;
    const lead = await prisma.lead.create({ data: { customerId, name: "Anna Becker", phone, formData: [{ label: "Anrede", value: "Frau" }], status: "In Beratung" } });
    const conv = await prisma.conversation.create({ data: { customerId, contactPhone: phone, contactName: "Anna Becker", leadId: lead.id, optedOutAt: o.optedOut ? new Date() : null } });
    // Lead hat schon geschrieben (sonst greift zusätzlich „kein WhatsApp“ am Lead)
    await prisma.message.create({ data: { conversationId: conv.id, direction: "inbound", body: "Hallo" } });
    const token = `mt-${uid()}`;
    const appt = await prisma.appointment.create({
      data: { customerId, leadId: lead.id, conversationId: conv.id, mode: o.mode ?? "video", meetUrl: "https://meet.google.com/abc-defg-hij", startsAt: new Date(Date.now() + (o.startsIn ?? 26) * 3_600_000), manageToken: token },
    });
    const wamid = `wamid.rem-${uid()}`;
    await prisma.message.create({ data: { conversationId: conv.id, direction: "outbound", kind: "template", body: "Erinnerung", waMessageId: wamid, status: "failed", sentBy: "system", purpose: o.purpose ?? "reminder" } });
    return { lead, appt, wamid, token, phone };
  }

  it("131026 auf die Vortags-Erinnerung: eine SMS (Sie) mit Datum, Art und Verwalten-Link, im Verlauf vermerkt", async () => {
    const e = await erinnerung(kunde);
    const r = await handleFailedStatus(e.wamid, [{ code: 131026, title: "Message undeliverable" }]);
    expect(r.sms).toBe("sent");
    expect(sms).toHaveLength(1);
    expect(sms[0].to).toBe(`+${e.phone}`);
    expect(sms[0].text).toMatch(/^Guten Tag Frau Becker, kurze Erinnerung an Ihren Termin mit .+ am \w+, \d\d\.\d\d\., um \d\d:\d\d Uhr per Video\. Verschieben oder absagen können Sie hier: /);
    expect(sms[0].text).toContain(`https://www.dein-beratungstermin.de/book/manage/${e.token}`);
    expect(sms[0].text).not.toMatch(/[–—]|KI/);
    const h = await prisma.leadHistory.findMany({ where: { leadId: e.lead.id } });
    expect(h.some((x) => x.text.startsWith("Terminerinnerung per SMS") && !x.text.includes("https://"))).toBe(true);
    // Webhook wiederholt: keine zweite SMS
    expect((await handleFailedStatus(e.wamid, [{ code: 131026, title: "Message undeliverable" }])).sms).toBe("already");
    expect(sms).toHaveLength(1);
  });

  it("131049 auf „kurz vorher“: Du-Fassung", async () => {
    const e = await erinnerung(kundeDu, { purpose: "reminder_soon", mode: "phone", startsIn: 1 });
    expect((await handleFailedStatus(e.wamid, [{ code: 131049, title: "not delivered" }])).sms).toBe("sent");
    expect(sms[0].text).toMatch(/^Hallo Anna, kurze Erinnerung an deinen Termin .* per Telefon\. Verschieben oder absagen kannst du hier: /);
  });

  it("nicht bei Abmeldung, Pay-per-Lead, Festnetz, ohne Termin, für andere Nachrichten oder Fehler auf unserer Seite", async () => {
    const a = await erinnerung(kunde);
    expect((await handleFailedStatus(a.wamid, [{ code: 131050, title: "opted out" }])).sms).toBe("skipped");
    const b = await erinnerung(kunde, { optedOut: true });
    expect((await handleFailedStatus(b.wamid, [{ code: 131026, title: "x" }])).sms).toBe("gesperrt");
    const c = await erinnerung(ppl);
    expect((await handleFailedStatus(c.wamid, [{ code: 131026, title: "x" }])).sms).toBe("pay_per_lead");
    const d = await erinnerung(kunde, { phone: `4930${Math.floor(1000000 + Math.random() * 8999999)}` });
    expect((await handleFailedStatus(d.wamid, [{ code: 131026, title: "x" }])).sms).toBe("keine_handynummer");
    const e = await erinnerung(kunde);
    await prisma.appointment.update({ where: { id: e.appt.id }, data: { status: "cancelled" } });
    expect((await handleFailedStatus(e.wamid, [{ code: 131026, title: "x" }])).sms).toBe("kein_termin");
    const f = await erinnerung(kunde, { purpose: "booking_confirmation" });
    expect((await handleFailedStatus(f.wamid, [{ code: 131026, title: "x" }])).sms).toBeUndefined();
    const g = await erinnerung(kunde);
    expect((await handleFailedStatus(g.wamid, [{ code: 132001, title: "Template does not exist" }])).sms).toBe("skipped");
    expect(sms).toHaveLength(0);
  });

  it("ohne Schlüssel nichts gesendet und nicht gesperrt", async () => {
    delete process.env.SEVEN_API_KEY;
    const e = await erinnerung(kunde);
    expect((await handleFailedStatus(e.wamid, [{ code: 131026, title: "x" }])).sms).toBe("no_key");
    expect((await prisma.message.findUnique({ where: { waMessageId: e.wamid } }))?.smsAt).toBeNull();
  });
});
