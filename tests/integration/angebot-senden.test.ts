import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Angebot senden und nachfassen (Paket P3): WhatsApp, Mail und Push simuliert, Rest gegen die Test-DB.
const wa = vi.fn();
vi.mock("@/lib/whatsapp/templates", async (orig) => {
  const real = await orig<typeof import("@/lib/whatsapp/templates")>();
  return { ...real, sendWhatsAppNotice: (...a: unknown[]) => wa(...a) };
});
type MailCall = { to: string; subject: string; text: string; anhang: number; art: string; leadId: string };
const mails: MailCall[] = [];
vi.mock("@/lib/mail/lead-versand", async (orig) => {
  const real = await orig<typeof import("@/lib/mail/lead-versand")>();
  return {
    ...real,
    sendeLeadMail: async (_k: unknown, o: { to: string; inhalt: (s: { text: string; html: string }) => { subject: string; text: string }; attachments?: unknown[]; protokoll: { art: string; leadId: string } }) => {
      const m = o.inhalt({ text: "Viele Grüße\nOle Kannapinn", html: "<p>Viele Grüße</p>" });
      mails.push({ to: o.to, subject: m.subject, text: m.text, anhang: o.attachments?.length ?? 0, art: o.protokoll.art, leadId: o.protokoll.leadId });
      return { sent: true, via: "resend" };
    },
  };
});
const pushes: { title: string; url: string }[] = [];
vi.mock("@/lib/push", () => ({
  sendToUser: async (_u: string, p: { title: string; url: string }) => void pushes.push(p),
  sendToBuyersOfCustomer: async (_c: string, p: { title: string; url: string }) => void pushes.push(p),
}));

import { prisma } from "@/lib/prisma";
import { angebotSelbst, angebotSenden, ladeAngebotDatei, ladeAngebotInfo, rueckrufWunsch, runAngebotVorabCheck } from "@/lib/angebot-senden-server";
import { runSequences } from "@/lib/lead-sequences";
import { loadInbox } from "@/lib/inbox";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";
import { rueckrufTage } from "@/lib/rueckruf";
import { DEFAULT_LEAD_TIMES } from "@/lib/calendar/lead-times";

const DAY = 24 * 60 * 60 * 1000;
// Di 17.11.2026, 10:00 Uhr Berlin
const T0 = new Date("2026-11-17T09:00:00.000Z");

describe("Angebot senden und nachfassen (P3)", () => {
  let customerId = "";
  let n = 0;
  const ctx = () => ({ customerId, userId: null, teamRole: "owner" as const });

  async function terminMitLead(extra: { email?: string | null; status?: string } = {}) {
    const lead = await prisma.lead.create({
      data: { customerId, name: "Anna Becker", formData: [{ label: "Anrede", value: "Frau" }], phone: `49151200${String(++n).padStart(4, "0")}`, email: extra.email === undefined ? "anna@example.org" : extra.email, status: extra.status ?? "Termin vereinbart" },
    });
    const t = await prisma.appointment.create({
      data: { customerId, leadId: lead.id, startsAt: new Date(T0.getTime() - 2 * 60 * 60 * 1000), endsAt: new Date(T0.getTime() - 60 * 60 * 1000), status: "completed", mode: "video" },
    });
    const pdf = await prisma.leadFile.create({
      data: { leadId: lead.id, customerId, kind: "angebot", fileName: "Angebot Allianz.pdf", contentType: "application/pdf", size: 8, data: Buffer.from("%PDF-1.4") },
    });
    return { lead, t, pdf };
  }

  // Andere Leads aus früheren Fällen laufen mit: nur Aufrufe zu diesem Lead zählen
  const waFuer = (leadId: string) => wa.mock.calls.map((c) => c[0] as { leadId: string; purpose: string; text: string }).filter((c) => c.leadId === leadId);
  const pushFuer = (push: { mock: { calls: unknown[][] } }, leadId: string) =>
    push.mock.calls.map((c) => c[2] as { title: string; url: string }).filter((p) => p.url.includes(leadId));

  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer({ leadAddress: "sie" })).id;
    await prisma.agentConfig.create({ data: { customerId, active: true, followUpSequencesEnabled: true } });
    await prisma.whatsAppAccount.create({ data: { customerId, status: "connected", apiKeyEnc: "x" } });
  });
  afterAll(() => cleanupCustomer(customerId));
  beforeEach(() => {
    wa.mockReset();
    wa.mockResolvedValue({ mode: "text", conversationId: "c" });
    mails.length = 0;
    pushes.length = 0;
  });

  it("Blatt: abgelegtes PDF vorausgewählt, Kanäle und Vorschau", async () => {
    const { t, pdf } = await terminMitLead();
    const info = (await ladeAngebotInfo(t.id, ctx(), T0))!;
    expect(info.vorausgewaehlt).toBe(pdf.id);
    expect(info.email).toBe("anna@example.org");
    expect(info.whatsapp.moeglich).toBe(true);
    expect(info.vorschau).toContain("Vielen Dank für das Gespräch, Frau Becker!");
    expect(info.stand.gesendetAt).toBeNull();
  });

  it("„Über die App senden“: WhatsApp und Mail mit PDF, Kennzeichen, Link, Nachfassen „offer“ erst jetzt", async () => {
    const { lead, t, pdf } = await terminMitLead();
    const r = await angebotSenden(t.id, ctx(), { dateiId: pdf.id, kundenlink: false }, { now: T0 });
    expect(r).toMatchObject({ ok: true, kanaele: ["whatsapp", "email"], nachfassen: true });
    expect(wa.mock.calls[0][0]).toMatchObject({ purpose: "offer_send", leadId: lead.id });
    expect(wa.mock.calls[0][0].text).toContain("/ihr-angebot/");
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ to: "anna@example.org", anhang: 1, art: "angebot" });
    expect(mails[0].subject).toContain("Ihr Angebot");
    // {anruf_tag}: Tag 3 nach Di 17.11. ist Freitag
    expect(mails[0].text).toContain("Ich rufe Sie am Freitag kurz an");

    const nachher = await prisma.appointment.findUniqueOrThrow({ where: { id: t.id } });
    expect(nachher).toMatchObject({ angebotVersand: "app", angebotKanaele: "whatsapp,email", angebotDateiId: pdf.id });
    expect(nachher.angebotGesendetAt?.getTime()).toBe(T0.getTime());
    expect((await ladeAngebotDatei(nachher.angebotToken!, T0))?.fileName).toBe("Angebot Allianz.pdf");
    expect(await ladeAngebotDatei(nachher.angebotToken!, new Date(T0.getTime() + 61 * DAY))).toBeNull();
    const seq = await prisma.leadSequence.findFirstOrThrow({ where: { leadId: lead.id, stoppedAt: null } });
    expect(seq.kind).toBe("offer");
    expect(seq.nextAt?.getTime()).toBe(T0.getTime() + 2 * DAY);
  });

  it("Abfolge: Vorab-Check am Vorabend, Tag 2 WhatsApp, Tag 3 Anruf mit Push, Tag 5 Mail mit [Rückruf wünschen]", async () => {
    const { lead, t, pdf } = await terminMitLead();
    await angebotSenden(t.id, ctx(), { dateiId: pdf.id, kundenlink: false }, { now: T0 });
    mails.length = 0;
    wa.mockClear();
    const push = vi.fn(async () => undefined);

    // Mi 18.11., 17:30 Uhr: noch kein Vorab-Check; 18:30 Uhr: Push „Morgen fasst die App nach“, nur einmal
    await runAngebotVorabCheck(new Date("2026-11-18T16:30:00Z"), push);
    expect(pushFuer(push, lead.id)).toHaveLength(0);
    await runAngebotVorabCheck(new Date("2026-11-18T17:30:00Z"), push);
    await runAngebotVorabCheck(new Date("2026-11-18T17:45:00Z"), push);
    expect(pushFuer(push, lead.id)).toEqual([expect.objectContaining({ title: "Hat Frau Becker abgeschlossen?", url: `/buyer/abschluss?l=${lead.id}` })]);

    await runSequences(new Date(T0.getTime() + 2 * DAY));
    expect(waFuer(lead.id)).toHaveLength(1);
    expect(waFuer(lead.id)[0]).toMatchObject({ purpose: "followup_offer" });

    await runSequences(new Date(T0.getTime() + 3 * DAY));
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).followUpNote).toBe("Angebot nachfassen: anrufen");
    expect(pushes.filter((p) => p.url.includes(lead.id)).map((p) => p.title)).toContain("Frau Becker anrufen: Fragen zum Angebot?");

    // Tag 5 ist So 22.11.: Versand erst Mo 9 Uhr, Vorab-Check So 18 Uhr
    await runAngebotVorabCheck(new Date("2026-11-22T17:30:00Z"), push);
    expect(pushFuer(push, lead.id)).toHaveLength(2);
    await runSequences(new Date("2026-11-23T08:00:00Z")); // Mo 9 Uhr
    // Seit Paket M4 über die zentrale Funktion: Art = Schlüssel der Vorlage
    const meine = mails.filter((m) => m.art === "nachfassen_angebot" && m.leadId === lead.id);
    expect(meine).toHaveLength(1);
    expect(meine[0].text).toMatch(/Rückruf wünschen: \S+\/rueckruf\//);
    expect(meine[0].text).toMatch(/Angebot ansehen: \S+\/ihr-angebot\//);

    // Rückruf gewünscht (Ausbau P5): Aufgabe mit Zeitfenster, Push, Nachfassen pausiert (nicht beendet)
    const token = (await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).rueckrufToken!;
    const rpush = vi.fn(async () => undefined);
    const jetzt = new Date("2026-11-23T10:00:00Z");
    const fenster = rueckrufTage(jetzt, DEFAULT_LEAD_TIMES)[0].fenster[0];
    expect(await rueckrufWunsch(token, { fenster: fenster.key }, { now: jetzt, push: rpush })).toMatchObject({ ok: true, schon: false });
    expect(await rueckrufWunsch(token, { fenster: fenster.key }, { now: new Date("2026-11-23T10:05:00Z"), push: rpush })).toMatchObject({ ok: true, schon: true });
    expect(rpush).toHaveBeenCalledTimes(1);
    const pausiert = await prisma.leadSequence.findFirstOrThrow({ where: { leadId: lead.id, stoppedAt: null } });
    expect(pausiert.nextAt!.getTime()).toBeGreaterThanOrEqual(fenster.bis.getTime() + 2 * DAY);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).followUpNote).toBe("Rückrufwunsch: 11:30 bis 12 Uhr");
  });

  it("„Habe ich selbst gesendet“: ein Tipp, Nachfassen ohne E-Mail, Text mit dem Vermittler", async () => {
    const { lead, t } = await terminMitLead();
    const r = await angebotSelbst(t.id, ctx(), {}, { now: T0 });
    expect(r).toMatchObject({ ok: true, kanaele: [], nachfassen: true });
    expect(wa).not.toHaveBeenCalled();
    expect(mails).toHaveLength(0);
    const seq = await prisma.leadSequence.findFirstOrThrow({ where: { leadId: lead.id, stoppedAt: null } });
    expect(seq.kind).toBe("offer_selbst");
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: t.id } })).angebotVersand).toBe("selbst");
    await runSequences(new Date(T0.getTime() + 2 * DAY));
    const w = waFuer(lead.id);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ purpose: "followup_offer_selbst" });
    expect(w[0].text).toContain("das Angebot, das");
    expect(w[0].text).toContain("Ihnen geschickt hat");
  });

  it("Heute: „Angebote senden“ bis zum Versand, danach weg", async () => {
    const { lead, t } = await terminMitLead({ status: "Angebot gesendet" });
    const vorher = await loadInbox(ctx());
    expect(vorher.angebote?.map((g) => g.id)).toContain(t.id);
    await angebotSelbst(t.id, ctx(), {}, { now: new Date() });
    const nachher = await loadInbox(ctx());
    expect(nachher.angebote?.map((g) => g.leadId)).not.toContain(lead.id);
  });
});
