// Mail-Strecke für Leads ohne WhatsApp und Betroffenenrechte (Ole, 18.11.2026, E12-Auswahl und D12-Auswahl):
//   - 131026 bzw. keine Nummer → Erstmail binnen Minuten, genau einmal
//   - Abruf der Antwortseite (Link-Scanner) speichert und bucht nichts; Doppelklick bucht genau einmal
//   - Zeit vergeben → neue Zeiten; Einladung genau einmal; Abmeldung stoppt; Takt mit Reaktion und SMS (max. 2, Ruhezeit)
//   - DSGVO: Erkennung im Chat vor dem Assistenten, Bestätigung, Widerspruch stoppt alles Werbliche, Karte auf Heute
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const pushes: Array<{ title: string }> = [];
vi.mock("@/lib/push", () => ({
  sendToAdmins: vi.fn(async (p: { title: string }) => (pushes.push(p), { sent: 1, removed: 0, errors: [] })),
  sendToBuyersOfCustomer: vi.fn(async (_c: string, p: { title: string }) => (pushes.push(p), { sent: 1, removed: 0, errors: [] })),
  sendToUser: vi.fn(async (_u: string, p: { title: string }) => (pushes.push(p), { sent: 1, removed: 0, errors: [] })),
}));
type Mail = { userId: string; to: string; subject: string; text: string; attachments?: unknown[]; protokoll?: { art: string; leadId?: string | null } };
const mails: Mail[] = [];
vi.mock("@/lib/mail/postfach", async (orig) => {
  const real = await orig<typeof import("@/lib/mail/postfach")>();
  return {
    ...real,
    sendViaPostfach: vi.fn(async (userId: string, m: Omit<Mail, "userId" | "protokoll">, protokoll?: Mail["protokoll"]) => {
      mails.push({ userId, ...m, protokoll });
      return { ok: true as const, from: "berater@test.local" };
    }),
  };
});
const waSend = vi.fn();
vi.mock("@/lib/whatsapp/dialog360", async (orig) => {
  const real = await orig<typeof import("@/lib/whatsapp/dialog360")>();
  return { ...real, sendTemplate: (...a: unknown[]) => waSend(...a), sendText: (...a: unknown[]) => waSend(...a), sendButtons: (...a: unknown[]) => waSend(...a) };
});
const bot = vi.fn(async () => {});
vi.mock("@/lib/whatsapp/bot", () => ({ runBotTurn: (...a: unknown[]) => bot(...(a as [])) }));
const sms: Array<{ to: string; text: string; from?: string | null }> = [];
vi.mock("@/lib/sms/seven", async (orig) => {
  const real = await orig<typeof import("@/lib/sms/seven")>();
  return { ...real, smsAktiv: () => true, sendSms: vi.fn(async (to: string, text: string, o?: { from?: string | null }) => (sms.push({ to, text, from: o?.from }), { status: "sent" as const, id: "x" })) };
});

const DAY = 86_400_000;
const cal = { busy: new Set<string>(), buchungen: 0 };
/** Freie Zeiten ab morgen 10 Uhr (UTC, nur für den Test) */
const slots = () => {
  const out: { start: string; end: string }[] = [];
  const b = new Date(Date.now() + DAY);
  b.setUTCHours(9, 0, 0, 0);
  for (let i = 0; i < 6; i++) {
    const s = new Date(b.getTime() + Math.floor(i / 2) * DAY + (i % 2) * 4 * 3600_000);
    if (!cal.busy.has(s.toISOString())) out.push({ start: s.toISOString(), end: new Date(s.getTime() + 30 * 60_000).toISOString() });
  }
  return out;
};
vi.mock("@/lib/calendar", async (orig) => {
  const real = await orig<typeof import("@/lib/calendar")>();
  const { prisma } = await import("@/lib/prisma");
  return {
    ...real,
    bookingDurationMin: async () => 30,
    bookingPausedUntil: async () => null,
    suggestSlots: async () => slots(),
    adapterFor: async () => ({ getBusy: async () => [], updateEventEnd: async () => {}, updateEventTime: async () => {} }),
    bookAppointment: async (o: { customerId: string; leadId: string | null; conversationId: string | null; start: string; mode: string; bookedVia?: string | null }) => {
      await new Promise((r) => setTimeout(r, 30));
      if (cal.busy.has(o.start)) throw new real.SlotBusyError();
      cal.buchungen++;
      const a = await prisma.appointment.create({
        data: { customerId: o.customerId, leadId: o.leadId, conversationId: o.conversationId, startsAt: new Date(o.start), endsAt: new Date(new Date(o.start).getTime() + 30 * 60_000), mode: o.mode, meetUrl: "https://meet.google.com/abc", status: "booked", calendarEventId: "ev1", manageToken: `m${Math.random().toString(36).slice(2)}`, bookedVia: o.bookedVia ?? null },
      });
      return { appointmentId: a.id, meetUrl: a.meetUrl, start: o.start, manageUrl: "https://x/manage" };
    },
  };
});

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { encryptSecret } from "@/lib/encryption";
import { handleInboundPayload } from "@/lib/whatsapp/gateway";
import { markLeadNoWhatsApp } from "@/lib/whatsapp/kein-whatsapp";
import { adresseSetzen, angabenSpeichern, einladungenNachholen, komplettcheckSetzen, runMailStrecke, seiteGeoeffnet, seitenStand, starteMailStrecke, terminFestmachen } from "@/lib/mail-strecke/server";
import { leadAbmelden } from "@/lib/bestand/abmelden";
import { pruefeDsgvoEingang } from "@/lib/dsgvo/server";
import { sendeVorlagenMail } from "@/lib/mail/vorlagen-mail";
import { loadInbox } from "@/lib/inbox";
import { cleanupCustomer, makeBuyer, makeCustomer, ohneSplittest, requireTestDb } from "./db";
import { KOMPLETTCHECK_RE } from "@/lib/whatsapp/gespraech";

// Buchungen im Chat immer mit Fassung a der Bestätigung (Splittest termin_zusage; Fassung b: eigener Test)
ohneSplittest("termin_zusage");

const uid = () => Math.random().toString(36).slice(2, 10);
let n = 0;
const mobil = () => `49151${String(Date.now()).slice(-5)}${String(++n).padStart(3, "0")}`;

describe("Mail-Strecke und Betroffenenrechte", () => {
  let customerId = "";
  let ownerId = "";
  const pnid = `pnid-ms-${uid()}`;

  const lead = (extra: Record<string, unknown> = {}) =>
    prisma.lead.create({ data: { customerId, name: "Nina Winter", email: `nina${++n}@example.org`, source: "Zahnzusatzversicherung", status: "Neuer Lead", formData: [{ label: "Produkt", value: "Zahn" }], createdAt: new Date(Date.now() - 2 * 60_000), ...extra } });
  const strecke = (leadId: string) => prisma.leadMailStrecke.findUniqueOrThrow({ where: { leadId } });
  const inbound = (from: string, body: string) =>
    handleInboundPayload({ entry: [{ changes: [{ value: { metadata: { phone_number_id: pnid }, contacts: [{ profile: { name: "Nina" } }], messages: [{ from, id: `wamid.in-${uid()}`, type: "text", text: { body } }] } }] }] });

  beforeAll(async () => {
    requireTestDb();
    process.env.PUBLIC_BOOKING_URL ||= "https://termin.example.org";
    process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
    // Software-Kunde (mit Betreuung); Pay-per-Lead-Kunden bekommen keine Strecke (eigener Test unten)
    customerId = (await makeCustomer({ leadAddress: "sie", retainerMonthly: 990 })).id;
    ownerId = (await makeBuyer(customerId, "owner")).id;
    await prisma.mailConnection.create({ data: { userId: ownerId, customerId, provider: "smtp", email: "berater@test.local", fromName: "Anna Berater" } });
    await prisma.agentConfig.create({ data: { customerId, active: true, outreachEnabled: true, followUpSequencesEnabled: true } });
    await prisma.whatsAppAccount.create({ data: { customerId, status: "connected", phoneNumberId: pnid, apiKeyEnc: encryptSecret("k") } });
    await prisma.calendarConnection.create({ data: { customerId, provider: "google", status: "connected", bookingSlug: `ms-${uid()}` } });
  });
  afterAll(() => cleanupCustomer(customerId));
  beforeEach(() => {
    pushes.length = 0;
    mails.length = 0;
    sms.length = 0;
    waSend.mockReset();
    waSend.mockResolvedValue({ messageId: `wamid.out-${uid()}` });
    bot.mockClear();
    cal.busy.clear();
    delete process.env.MAIL_STRECKE_SMS;
  });

  it("keine Nummer: der Minuten-Cron sendet die Erstmail binnen Minuten, genau einmal", async () => {
    const l = await lead();
    const r = await runMailStrecke(new Date());
    expect(r.gestartet).toBeGreaterThanOrEqual(1);
    const m = mails.filter((x) => x.to === l.email);
    expect(m).toHaveLength(1);
    expect(m[0].protokoll).toMatchObject({ art: "mail_strecke", leadId: l.id });
    expect(m[0].subject).toBe("Ihre Anfrage zur Zahnzusatzversicherung");
    expect(m[0].text).toContain("Hier schreibt der digitale KI-Assistent von");
    expect(m[0].text).toContain("Welcher Tarifbaustein ist Ihnen am wichtigsten?");
    expect(m[0].text).toMatch(/Andere Zeit: .*\/book\/ms-.*\?t=/);
    expect(m[0].text).toMatch(/abmelden: /);
    expect(m[0].text).not.toMatch(/[–—]/);
    const s = await strecke(l.id);
    expect(s).toMatchObject({ ausloeser: "keine_nummer", schritt: "erstmail" });
    expect(s.zeiten).toHaveLength(2);
    expect(s.erstmailAt!.getTime() - l.createdAt.getTime()).toBeLessThan(5 * 60_000);
    await runMailStrecke(new Date());
    expect(mails.filter((x) => x.to === l.email)).toHaveLength(1);
    // Von Hand angelegt (keine eigene Anfrage): keine Strecke
    const hand = await lead({ formData: undefined });
    await prisma.lead.update({ where: { id: hand.id }, data: { formData: Prisma.DbNull } });
    await runMailStrecke(new Date());
    expect(await prisma.leadMailStrecke.count({ where: { leadId: hand.id } })).toBe(0);
  });

  it("Pay-per-Lead-Kunde: seine Leads kontaktieren wir nie (keine Strecke, keine Mail, keine SMS)", async () => {
    const ppl = (await makeCustomer({ leadAddress: "sie" })).id;
    try {
      await prisma.agentConfig.create({ data: { customerId: ppl, active: true, outreachEnabled: true } });
      const l = await prisma.lead.create({ data: { customerId: ppl, name: "Paula Ppl", email: `ppl${++n}@example.org`, source: "Zahnzusatzversicherung", status: "Neuer Lead", formData: [{ label: "Produkt", value: "Zahn" }], createdAt: new Date(Date.now() - 2 * 60_000) } });
      process.env.MAIL_STRECKE_SMS = "1";
      await runMailStrecke(new Date());
      expect(await prisma.leadMailStrecke.count({ where: { leadId: l.id } })).toBe(0);
      expect(await starteMailStrecke(l.id, "kein_whatsapp")).toMatchObject({ ergebnis: "nicht_moeglich", grund: "pay_per_lead" });
      expect(mails.filter((x) => x.to === l.email)).toHaveLength(0);
      expect(sms).toHaveLength(0);
    } finally {
      await cleanupCustomer(ppl);
    }
  });

  it("131026: Erstmail der Strecke statt der alten Einmal-Mail; 131050 startet nichts", async () => {
    const phone = mobil();
    const l = await lead({ phone, outreachAt: new Date(), outreachStatus: "sent" });
    expect(await markLeadNoWhatsApp(l.id, { code: 131026 })).toBe("flagged");
    const m = mails.filter((x) => x.to === l.email);
    expect(m).toHaveLength(1);
    expect(m[0].protokoll?.art).toBe("mail_strecke");
    expect(m[0].text).toContain("Per WhatsApp kam meine Nachricht leider nicht an");
    expect((await strecke(l.id)).ausloeser).toBe("kein_whatsapp");
    expect(pushes.some((p) => p.title.startsWith("Sofort anrufen"))).toBe(true);
    // Festnetz und Einwilligung „nein“ startet der Cron, eine Mobilnummer mit Einwilligung nicht
    const fest = await lead({ phone: "493012345678" });
    const nein = await lead({ phone: mobil(), waConsent: "nein" });
    const ok = await lead({ phone: mobil() });
    await runMailStrecke(new Date());
    expect((await strecke(fest.id)).ausloeser).toBe("festnetz");
    expect((await strecke(nein.id)).ausloeser).toBe("keine_einwilligung");
    expect(await prisma.leadMailStrecke.count({ where: { leadId: ok.id } })).toBe(0);
  });

  it("Abruf der Seite (Link-Scanner) speichert und bucht nichts; erst der Klick (POST) bucht, Doppelklick genau einmal", async () => {
    const l = await lead();
    await starteMailStrecke(l.id, "keine_nummer");
    const vorher = await strecke(l.id);
    // GET wie ein Link-Scanner: Seite mit ?a=0 bzw. ?z=1 rendert nur den Stand
    const st = await seitenStand(vorher.id);
    expect(st?.frage?.knoepfe[0]).toBe("Starker Zahnersatz");
    const nachher = await strecke(l.id);
    expect(nachher.updatedAt.getTime()).toBe(vorher.updatedAt.getTime());
    expect(nachher.antworten).toBeNull();
    expect(nachher.reaktionAt).toBeNull();
    expect(await prisma.appointment.count({ where: { leadId: l.id } })).toBe(0);

    const vor = cal.buchungen;
    const [r1, r2] = await Promise.all([terminFestmachen(vorher.id, { start: vorher.zeiten[1], mode: "video" }), terminFestmachen(vorher.id, { start: vorher.zeiten[1], mode: "video" })]);
    expect([r1.ok, r2.ok].filter(Boolean).length).toBeGreaterThanOrEqual(1);
    expect(cal.buchungen - vor).toBe(1);
    expect(await prisma.appointment.count({ where: { leadId: l.id, status: "booked" } })).toBe(1);
    const t = await prisma.appointment.findFirstOrThrow({ where: { leadId: l.id } });
    expect(t).toMatchObject({ bookedVia: "mail_strecke", einladungAt: null });
    expect(t.einladungAusstehend).not.toBeNull();
    expect((await strecke(l.id)).schritt).toBe("gebucht");
    // Dritter Klick später: kein zweiter Termin
    const r3 = await terminFestmachen(vorher.id, { start: vorher.zeiten[0], mode: "video" });
    expect(r3).toMatchObject({ ok: true, schon: true });
    expect(cal.buchungen - vor).toBe(1);
  });

  it("Zeit inzwischen vergeben: kein Termin, zwei neue Zeiten", async () => {
    const l = await lead();
    await starteMailStrecke(l.id, "keine_nummer");
    const s = await strecke(l.id);
    cal.busy.add(s.zeiten[0]);
    const r = await terminFestmachen(s.id, { start: s.zeiten[0], mode: "video" });
    expect(r).toEqual({ ok: false, grund: "vergeben" });
    const neu = await strecke(l.id);
    expect(neu.zeiten.length).toBe(2);
    expect(neu.zeiten).not.toContain(s.zeiten[0]);
    expect(neu.buchungAt).toBeNull();
    expect(await prisma.appointment.count({ where: { leadId: l.id } })).toBe(0);
    // Telefon ohne Nummer geht nicht (Telefon freigegeben; sonst wird per Video gebucht, Ole 26.11.2026)
    await prisma.agentConfig.upsert({ where: { customerId: l.customerId }, create: { customerId: l.customerId, allowPhone: true }, update: { allowPhone: true } });
    expect(await terminFestmachen(s.id, { start: neu.zeiten[0], mode: "phone" })).toEqual({ ok: false, grund: "telefon" });
  });

  it("nach der Buchung: Komplettcheck, Angaben, Adresse; Einladung genau einmal", async () => {
    const l = await lead({ source: "Hausratversicherung" });
    await starteMailStrecke(l.id, "keine_nummer");
    const s = await strecke(l.id);
    await terminFestmachen(s.id, { start: s.zeiten[0], mode: "video" });
    let st = await seitenStand(s.id);
    expect(st?.nach).toBe("komplettcheck");
    expect(st?.komplettcheckText).toMatch(KOMPLETTCHECK_RE);
    expect(st?.komplettcheckText).not.toMatch(/\d+ Minuten/);
    await komplettcheckSetzen(s.id, false);
    st = await seitenStand(s.id);
    expect(st?.nach).toBe("angaben");
    expect(st?.folgefragen.length).toBeGreaterThan(0);
    await angabenSpeichern(s.id, { [st!.folgefragen[0].key]: "01.02.1990" });
    expect(JSON.stringify((await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })).needData)).toContain("01.02.1990");
    st = await seitenStand(s.id);
    expect(st?.nach).toBe("adresse");
    expect(st?.bereitlegen.length).toBeGreaterThan(0);
    mails.length = 0;
    await adresseSetzen(s.id, {});
    await adresseSetzen(s.id, {});
    await einladungenNachholen(new Date(Date.now() + 2 * 3600_000));
    const einl = mails.filter((m) => m.protokoll?.art === "terminbestaetigung" && m.protokoll?.leadId === l.id);
    expect(einl).toHaveLength(1);
    expect(einl[0].to).toBe(l.email);
    expect((await seitenStand(s.id))?.nach).toBe("fertig");
  });

  it("ohne Antwort geht die ausstehende Einladung nach 15 Minuten trotzdem (einmal)", async () => {
    const l = await lead();
    await starteMailStrecke(l.id, "keine_nummer");
    const s = await strecke(l.id);
    await terminFestmachen(s.id, { start: s.zeiten[0], mode: "video" });
    mails.length = 0;
    expect(await einladungenNachholen(new Date(Date.now() + 5 * 60_000))).toBe(0);
    expect(await einladungenNachholen(new Date(Date.now() + 16 * 60_000))).toBe(1);
    expect(await einladungenNachholen(new Date(Date.now() + 30 * 60_000))).toBe(0);
    expect(mails.filter((m) => m.protokoll?.art === "terminbestaetigung" && m.protokoll?.leadId === l.id)).toHaveLength(1);
  });

  it("Takt: Tag 2 Mail mit neuen Zeiten; Reaktion (Seite im Browser) stoppt; Abmeldung stoppt", async () => {
    const tag2 = (start: Date) => {
      const d = new Date(start.getTime() + DAY);
      d.setUTCHours(9, 30, 0, 0); // 10:30 Berlin
      return d;
    };
    const a = await lead();
    const b = await lead();
    const c = await lead();
    for (const x of [a, b, c]) await starteMailStrecke(x.id, "keine_nummer");
    const start = (await strecke(a.id)).erstmailAt!;
    mails.length = 0;
    await seiteGeoeffnet((await strecke(b.id)).id);
    await leadAbmelden(c.id, customerId);
    // Für den Test: alle drei am selben Zeitpunkt gestartet
    await prisma.leadMailStrecke.updateMany({ where: { leadId: { in: [a.id, b.id, c.id] } }, data: { erstmailAt: start } });
    await runMailStrecke(tag2(start));
    expect(mails.filter((m) => m.to === a.email)).toHaveLength(1);
    expect(mails.find((m) => m.to === a.email)?.subject).toMatch(/Zwei neue Zeiten/);
    expect(mails.filter((m) => m.to === b.email || m.to === c.email)).toHaveLength(0);
    expect((await strecke(b.id)).schritt).toBe("gestoppt");
    expect((await strecke(c.id)).schritt).toBe("abgemeldet");
    // Nochmal am selben Tag: nichts doppelt
    await runMailStrecke(new Date(tag2(start).getTime() + 3600_000));
    expect(mails.filter((m) => m.to === a.email)).toHaveLength(1);
  });

  it("SMS nur mit Schalter, nur Handy, höchstens 2, nicht in der Ruhezeit", async () => {
    const phone = mobil();
    const l = await lead({ phone, waConsent: "nein" });
    // Schalter aus: keine SMS
    await starteMailStrecke(l.id, "keine_einwilligung", { now: new Date("2026-11-18T10:00:00Z") });
    expect(sms).toHaveLength(0);
    process.env.MAIL_STRECKE_SMS = "an";
    const s = await strecke(l.id);
    const { sendeStreckenSms } = await import("@/lib/mail-strecke/server");
    expect(await sendeStreckenSms(s.id, "erst", new Date("2026-11-18T20:30:00Z"))).toBe("ruhezeit");
    expect(await sendeStreckenSms(s.id, "erst", new Date("2026-11-18T10:00:00Z"))).toBe("sent");
    expect(await sendeStreckenSms(s.id, "erinnerung", new Date("2026-11-21T14:00:00Z"))).toBe("sent");
    expect(await sendeStreckenSms(s.id, "erinnerung", new Date("2026-11-22T14:00:00Z"))).toBe("max");
    expect(sms).toHaveLength(2);
    expect(sms[0].to).toBe(phone);
    expect(sms[0].text).toMatch(/\/t\/.+\?ab=1/);
    // Festnetz bekommt keine SMS
    const f = await lead({ phone: "493012345678" });
    await starteMailStrecke(f.id, "festnetz", { now: new Date("2026-11-18T10:00:00Z") });
    expect(sms).toHaveLength(2);
  });

  describe("Erst-SMS bei „kein WhatsApp“ (Ole, 25.11.2026, Auswertung Lohmann)", () => {
    // Mittwoch, 25.11.2026, 10 Uhr Berlin (Geschäftszeit)
    const MI = new Date("2026-11-25T09:00:00Z");

    it("ohne E-Mail-Adresse: SMS mit Terminlink sofort statt nichts, ohne KI-Hinweis und Gedankenstriche, genau einmal", async () => {
      const phone = mobil();
      const l = await lead({ phone, email: null, outreachAt: MI, outreachStatus: "sent" });
      expect(await markLeadNoWhatsApp(l.id, { code: 131026, now: MI })).toBe("flagged");
      expect(sms).toHaveLength(1);
      expect(sms[0].to).toBe(phone);
      expect(sms[0].text).toMatch(/^Guten Tag, danke für Ihre Anfrage/);
      expect(sms[0].text).toMatch(/Termin wählen: \S+\/t\//);
      expect(sms[0].text).not.toMatch(/KI/);
      expect(sms[0].text).not.toMatch(/[–—]/);
      expect(await strecke(l.id)).toMatchObject({ ausloeser: "kein_whatsapp", nurSms: true, schritt: "sms", smsZahl: 1 });
      expect(pushes.find((p) => p.title.startsWith("Sofort anrufen"))?.title).toBeTruthy();
      // Doppelter Webhook bzw. Cron am selben Tag: keine zweite SMS
      expect(await markLeadNoWhatsApp(l.id, { code: 131026, now: MI })).toBe("already");
      await runMailStrecke(new Date(MI.getTime() + 10 * 60_000));
      expect(sms).toHaveLength(1);
    });

    it("Erstmail geht nicht raus: weiter als Nur-SMS-Strecke mit Terminlink", async () => {
      const { sendViaPostfach } = await import("@/lib/mail/postfach");
      vi.mocked(sendViaPostfach).mockResolvedValueOnce({ ok: false, error: "smtp" } as never);
      const l = await lead({ phone: mobil(), outreachAt: MI, outreachStatus: "sent" });
      expect(await starteMailStrecke(l.id, "kein_whatsapp", { now: MI })).toMatchObject({ ergebnis: "gestartet", kanal: "sms", gesendet: true });
      expect(sms).toHaveLength(1);
      expect(await strecke(l.id)).toMatchObject({ nurSms: true, schritt: "sms", erstmailAt: null });
    });

    it("Cron holt verpasste Starts nach (48 Stunden, nur Handy, nicht bei Termin oder Pay-per-Lead)", async () => {
      const vorher = new Date(MI.getTime() - 20 * 60_000);
      const verpasst = await lead({ phone: mobil(), email: null, waUnavailableAt: vorher, outreachStatus: "no_whatsapp" });
      const fest = await lead({ phone: "493012345678", email: null, waUnavailableAt: vorher, outreachStatus: "no_whatsapp" });
      const alt = await lead({ phone: mobil(), email: null, waUnavailableAt: new Date(MI.getTime() - 3 * DAY), outreachStatus: "no_whatsapp" });
      const termin = await lead({ phone: mobil(), email: null, waUnavailableAt: vorher, outreachStatus: "no_whatsapp" });
      await prisma.appointment.create({ data: { customerId, leadId: termin.id, mode: "phone", startsAt: new Date(Date.now() + 2 * DAY), status: "booked" } });
      const ppl = (await makeCustomer({ leadAddress: "sie" })).id;
      try {
        await prisma.agentConfig.create({ data: { customerId: ppl, active: true, outreachEnabled: true } });
        const pplLead = await prisma.lead.create({ data: { customerId: ppl, name: "Paula Ppl", phone: mobil(), status: "Neuer Lead", waUnavailableAt: vorher } });
        await runMailStrecke(MI);
        expect((await strecke(verpasst.id)).nurSms).toBe(true);
        for (const x of [fest.id, alt.id, termin.id, pplLead.id]) expect(await prisma.leadMailStrecke.count({ where: { leadId: x } })).toBe(0);
        expect(sms.map((x) => x.to)).toEqual([verpasst.phone]);
      } finally {
        await cleanupCustomer(ppl);
      }
    });
  });

  describe("Betroffenenrechte", () => {
    it("Löschwunsch im Chat: Anfrage, Bestätigung im Namen des Vermittlers, Assistent schweigt, Karte auf Heute", async () => {
      const phone = mobil();
      const l = await lead({ phone });
      await prisma.conversation.create({ data: { customerId, contactPhone: phone, leadId: l.id, botActive: true, status: "open", lastMessageAt: new Date() } });
      await inbound(phone, "Bitte löschen Sie meine Daten.");
      const anfrage = await prisma.dsgvoAnfrage.findFirstOrThrow({ where: { leadId: l.id } });
      expect(anfrage).toMatchObject({ art: "loeschung", kanal: "whatsapp", status: "offen" });
      expect(anfrage.bestaetigtAt).not.toBeNull();
      expect(anfrage.fristBis.getTime() - anfrage.eingangAt.getTime()).toBeGreaterThan(27 * DAY);
      const gesendet = JSON.stringify(waSend.mock.calls);
      expect(gesendet).toContain("Ihre Anfrage ist angekommen, Sie bekommen innerhalb eines Monats Antwort.");
      expect(bot).not.toHaveBeenCalled();
      expect(await prisma.dsgvoAnfrageLog.count({ where: { anfrageId: anfrage.id } })).toBe(2);
      const conv = await prisma.conversation.findFirstOrThrow({ where: { leadId: l.id } });
      expect(conv.needsAttention).toBe(true);
      expect(pushes.some((p) => p.title.startsWith("🔒 Datenschutz-Anfrage"))).toBe(true);
      const inbox = await loadInbox({ customerId, userId: ownerId, teamRole: "owner" } as Parameters<typeof loadInbox>[0]);
      expect(inbox.datenschutz?.some((d) => d.id === anfrage.id && d.art === "Löschung")).toBe(true);
    });

    it("kein Treffer bei STOPP und beim Widerruf der Unterlagen", async () => {
      const phone = mobil();
      const l = await lead({ phone });
      await prisma.conversation.create({ data: { customerId, contactPhone: phone, leadId: l.id, botActive: true, status: "open", lastMessageAt: new Date() } });
      await inbound(phone, "Bitte meine Unterlagen löschen");
      await inbound(phone, "STOPP");
      expect(await prisma.dsgvoAnfrage.count({ where: { leadId: l.id } })).toBe(0);
    });

    it("Widerspruch gegen Werbung stoppt sofort Abfolgen, Mail-Strecke, Meta-Rückmeldung und automatische Mails", async () => {
      const phone = mobil();
      const l = await lead({ phone, waConsent: "nein" });
      await starteMailStrecke(l.id, "keine_einwilligung");
      await prisma.conversation.create({ data: { customerId, contactPhone: phone, leadId: l.id, botActive: true, status: "open", lastMessageAt: new Date() } });
      await prisma.leadSequence.create({ data: { leadId: l.id, customerId, kind: "silent", step: 0, startedAt: new Date(), nextAt: new Date(Date.now() + 3600_000) } });
      const ev = await prisma.capiEvent.create({ data: { customerId, leadId: l.id, stage: "lead", eventTime: new Date() } });
      await inbound(phone, "Ich widerspreche der Nutzung meiner Daten für Werbung.");
      const a = await prisma.dsgvoAnfrage.findFirstOrThrow({ where: { leadId: l.id } });
      expect(a.art).toBe("widerspruch_werbung");
      expect(JSON.stringify(waSend.mock.calls)).toContain("Werbung schicken wir Ihnen ab sofort nicht mehr.");
      expect(await prisma.leadSequence.count({ where: { leadId: l.id, stoppedAt: null } })).toBe(0);
      expect((await strecke(l.id)).schritt).toBe("gestoppt");
      expect((await prisma.capiEvent.findUniqueOrThrow({ where: { id: ev.id } })).status).toBe("skipped");
      expect(await prisma.leadSperre.count({ where: { customerId, umfang: "werbung" } })).toBeGreaterThanOrEqual(2);
      expect(await prisma.dsgvoAnfrageLog.count({ where: { anfrageId: a.id, aktion: "widerspruch_umgesetzt" } })).toBe(1);
      const r = await sendeVorlagenMail(l.id, "nicht_erreicht", { anlass: `t-${uid()}` });
      expect(r).toMatchObject({ sent: false, reason: "abgemeldet" });
      // Neue Strecke startet nicht mehr
      expect((await starteMailStrecke(l.id, "keine_einwilligung")).ergebnis).not.toBe("gestartet");
    });

    it("Mail-Eingang: Auskunft erkannt, Bestätigung per E-Mail an den Absender, genau einmal je Eingang", async () => {
      const l = await lead();
      const e = { customerId, leadId: l.id, kanal: "email" as const, text: "Guten Tag, ich bitte um Auskunft über meine gespeicherten Daten.", betreff: "Anfrage", quelleId: `me-${uid()}`, absender: l.email };
      const r1 = await pruefeDsgvoEingang(e);
      const r2 = await pruefeDsgvoEingang(e);
      expect(r1).toMatchObject({ erkannt: true, art: "auskunft", bestaetigt: true });
      expect(r2).toMatchObject({ erkannt: true, neu: false });
      const b = mails.filter((m) => m.protokoll?.art === "datenschutz_bestaetigung");
      expect(b).toHaveLength(1);
      expect(b[0]).toMatchObject({ to: l.email, subject: "Ihre Datenschutz-Anfrage" });
      expect(b[0].text).toContain("Ihre Anfrage ist angekommen, Sie bekommen innerhalb eines Monats Antwort.");
      expect(await prisma.dsgvoAnfrage.count({ where: { leadId: l.id } })).toBe(1);
      expect((await pruefeDsgvoEingang({ ...e, quelleId: `me-${uid()}`, text: "Danke, passt mir am Dienstag." })).erkannt).toBe(false);
    });
  });
});
