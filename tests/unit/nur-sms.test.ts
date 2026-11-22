// SMS ohne E-Mail (Ole, 22.11.2026): Kunden mit ausgeschalteten E-Mail-Funktionen bekommen bei „kein WhatsApp“ statt
// nichts höchstens 2 SMS, nur zu Geschäftszeiten, mit Rückruf zu Geschäftszeiten (lib/mail-strecke/nur-sms.ts, server.ts).
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  lead: { findUnique: vi.fn(), updateMany: vi.fn() },
  appointment: { count: vi.fn() },
  leadMailStrecke: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  bestandOptOut: { count: vi.fn() },
  calendarLeadTimes: { findUnique: vi.fn() },
  erstinformation: { findUnique: vi.fn() },
  customer: { count: vi.fn(), findUnique: vi.fn() },
  message: { count: vi.fn() },
}));
const sms = vi.hoisted(() => ({ sendSms: vi.fn(), smsAktiv: vi.fn() }));
const tel = vi.hoisted(() => ({ istMobil: vi.fn(), istFestnetz: vi.fn() }));
const verlauf = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/sms/seven", () => sms);
vi.mock("@/lib/telefon-typ", () => tel);
vi.mock("@/lib/lead-history", () => ({ logLeadHistory: verlauf }));
vi.mock("@/lib/dsgvo/server", () => ({ sperreFuer: vi.fn(async () => null) }));
vi.mock("@/lib/mail/sperren", () => ({ istAbgemeldet: vi.fn(async () => false) }));
vi.mock("@/lib/mail/kontakt-mail", () => ({ hatMailAntwort: vi.fn(async () => false) }));
vi.mock("@/lib/whatsapp/gespraech", () => ({ formularAus: () => [] }));
vi.mock("@/lib/lead-anrede", () => ({
  ansprechpartner: vi.fn(async () => ({ vermittler: { name: "Thomas Lohmann", anrede: "Herr" }, advisor: "Allianz Lohmann", firm: "Allianz Lohmann", kontakt: { firstName: "Julia", lastName: "Becker", salutation: "Frau" } })),
}));

import { hatGedankenstrich } from "@/lib/gedankenstriche";
import {
  GESCHAEFTSZEITEN_STANDARD,
  geschaeftszeitenAusPlan,
  geschaeftszeitText,
  imGeschaeftsfenster,
  nurSmsAn,
  nurSmsText,
  smsFuerVerlauf,
  smsSegmente,
  zweiteSmsFaellig,
  type NurSmsInput,
} from "@/lib/mail-strecke/nur-sms";
import { nurSmsTakt, sendeStreckenSms, starteMailStrecke } from "@/lib/mail-strecke/server";

const berlin = (s: string) => new Date(`${s}+01:00`); // November: MEZ
const LINK = "https://app.performancegrowth.de/t/cmabc1234567890xyzabcdef.AbCdEfGhIjKlMnOpQrStUv";

describe("Geschäftszeiten", () => {
  it("Standard Mo bis Fr 9 bis 18 Uhr ohne eigenen Zeitplan", () => {
    expect(geschaeftszeitenAusPlan(null)).toEqual(GESCHAEFTSZEITEN_STANDARD);
    expect(geschaeftszeitText(GESCHAEFTSZEITEN_STANDARD)).toBe("Mo bis Fr, 9 bis 18 Uhr");
  });

  it("aus den Buchungszeiten des Kalenders, begrenzt auf 8 bis 20 Uhr", () => {
    const g = geschaeftszeitenAusPlan({ days: { 1: [["08:30", "12:00"], ["14:00", "17:30"]], 2: [["09:00", "17:00"]], 4: [["07:00", "21:00"]] } });
    expect(g).toEqual({ tage: [1, 2, 4], von: 8, bis: 20 });
    expect(geschaeftszeitText(g)).toBe("Mo, Di, Do, 8 bis 20 Uhr");
    // Zu kurz bzw. nur Wochenende: Standard
    expect(geschaeftszeitenAusPlan({ days: { 1: [["10:00", "11:00"]] } })).toEqual(GESCHAEFTSZEITEN_STANDARD);
    expect(geschaeftszeitenAusPlan({ days: { 6: [["09:00", "14:00"]] } })).toEqual(GESCHAEFTSZEITEN_STANDARD);
  });

  it("sendet nur zu Geschäftszeiten: werktags, nicht am Wochenende, nicht abends, nicht an Feiertagen", () => {
    const g = GESCHAEFTSZEITEN_STANDARD;
    expect(imGeschaeftsfenster(berlin("2026-11-23T09:00:00"), g)).toBe(true); // Montag
    expect(imGeschaeftsfenster(berlin("2026-11-23T08:59:00"), g)).toBe(false);
    expect(imGeschaeftsfenster(berlin("2026-11-23T18:00:00"), g)).toBe(false);
    expect(imGeschaeftsfenster(berlin("2026-11-22T12:00:00"), g)).toBe(false); // Sonntag
    expect(imGeschaeftsfenster(berlin("2026-12-25T12:00:00"), g)).toBe(false); // 1. Weihnachtstag
  });

  it("zweite SMS ab dem zweiten Geschäftstag nach der ersten", () => {
    const g = GESCHAEFTSZEITEN_STANDARD;
    const erste = berlin("2026-11-20T16:00:00"); // Freitag
    expect(zweiteSmsFaellig(erste, berlin("2026-11-23T10:00:00"), g)).toBe(false); // Montag = 1. Geschäftstag
    expect(zweiteSmsFaellig(erste, berlin("2026-11-24T08:00:00"), g)).toBe(false); // vor 9 Uhr
    expect(zweiteSmsFaellig(erste, berlin("2026-11-24T09:00:00"), g)).toBe(true); // Dienstag
    expect(zweiteSmsFaellig(erste, berlin("2026-11-28T10:00:00"), g)).toBe(false); // Samstag
  });

  it("Schalter STRECKE_NUR_SMS: Standard an", () => {
    expect(nurSmsAn({})).toBe(true);
    expect(nurSmsAn({ STRECKE_NUR_SMS: "aus" })).toBe(false);
  });
});

describe("Text der SMS", () => {
  const basis: NurSmsInput = {
    an: "sie",
    anredeName: "Frau Becker",
    person: { nom: "Herr Lohmann", dat: "Herrn Lohmann" },
    source: "Zahnzusatzversicherung",
    link: LINK,
    art: "erst",
    telefon: "0451 1234567",
    zeiten: GESCHAEFTSZEITEN_STANDARD,
  };

  it("Sie: Dank, Link, Rückruf zu Geschäftszeiten, Abmelden", () => {
    const t = nurSmsText(basis);
    expect(t).toBe(
      `Hallo Frau Becker, danke für Ihre Anfrage zur Zahnzusatzversicherung bei Herrn Lohmann. Termin wählen: ${LINK} Oder rufen Sie an: 0451 1234567 (Mo bis Fr, 9 bis 18 Uhr). Abmelden über den Link.`,
    );
    expect(smsSegmente(t)).toMatchObject({ unicode: false });
    expect(smsSegmente(t).segmente).toBeLessThanOrEqual(2);
  });

  it("Du und Erinnerung", () => {
    const du = nurSmsText({ ...basis, an: "du", anredeName: "Julia", person: { nom: "Thomas", dat: "Thomas" } });
    expect(du).toContain("danke für deine Anfrage");
    expect(du).toContain("Oder ruf an: 0451 1234567 (Mo bis Fr, 9 bis 18 Uhr).");
    expect(du).not.toMatch(/\bSie\b|\bIhre?\b/);
    const e = nurSmsText({ ...basis, art: "erinnerung" });
    expect(e.startsWith("Hallo Frau Becker, Herr Lohmann hat noch Zeit für Sie. Termin wählen: ")).toBe(true);
    const eDu = nurSmsText({ ...basis, an: "du", anredeName: "Julia", person: { nom: "Thomas", dat: "Thomas" }, art: "erinnerung" });
    expect(eDu).toContain("Thomas hat noch Zeit für dich.");
  });

  it("ohne Nummer: Rückruf über die Seite, mit Geschäftszeiten", () => {
    const t = nurSmsText({ ...basis, telefon: null });
    expect(t).toContain("Lieber telefonieren? Auf der Seite Telefon wählen, Rückruf Mo bis Fr, 9 bis 18 Uhr.");
  });

  it("höchstens 2 Teile, ohne Gedankenstriche; zu lang: erst Thema, dann Name weg", () => {
    for (const an of ["sie", "du"] as const)
      for (const art of ["erst", "erinnerung"] as const)
        for (const source of ["Zahnzusatzversicherung", "Berufsunfähigkeitsversicherung", "Private Krankenversicherung", null]) {
          const t = nurSmsText({ ...basis, an, art, source, anredeName: an === "du" ? "Maximiliane" : "Frau Müller-Lüdenscheidt", telefon: "+49 4521 7654321" });
          expect(smsSegmente(t).segmente, t).toBeLessThanOrEqual(2);
          expect(hatGedankenstrich(t)).toBe(false);
          expect(t).toContain(LINK);
          expect(t).toContain("9 bis 18 Uhr");
        }
    const lang = nurSmsText({ ...basis, person: { nom: "Frau Dr. Alexandra von Hohenzollern-Sigmaringen", dat: "Frau Dr. Alexandra von Hohenzollern-Sigmaringen" }, source: "Berufsunfähigkeitsversicherung" });
    expect(lang).not.toContain("Berufsunfähigkeit");
    expect(smsSegmente(lang).segmente).toBeLessThanOrEqual(2);
  });

  it("Segmente nach GSM bzw. Unicode", () => {
    expect(smsSegmente("a".repeat(160)).segmente).toBe(1);
    expect(smsSegmente("a".repeat(161)).segmente).toBe(2);
    expect(smsSegmente("ä".repeat(160)).unicode).toBe(false);
    expect(smsSegmente("€".repeat(80)).zeichen).toBe(160);
    expect(smsSegmente("„Hallo“").unicode).toBe(true);
  });

  it("Verlauf ohne persönlichen Link", () => {
    expect(smsFuerVerlauf(`Termin wählen: ${LINK} Oder`)).toBe("Termin wählen: (Link zur Terminwahl) Oder");
  });
});

// ─── Server: Start und Takt ─────────────────────────────────────────────────────────────

const kunde = (o: Record<string, unknown> = {}) => ({
  dormantSince: null,
  dataDeletedAt: null,
  mailFeaturesOff: true,
  plan: "service",
  retainerMonthly: 500,
  onboarding: { id: "o1" },
  agentConfig: { active: true, outreachEnabled: true },
  ...o,
});
const leadRow = (o: Record<string, unknown> = {}, c: Record<string, unknown> = {}) => ({
  id: "l1",
  customerId: "c1",
  email: null,
  phone: "491631234567",
  status: "Neuer Lead",
  erasedAt: null,
  airtableId: null,
  externalId: "meta-1",
  formData: null,
  source: "Zahnzusatzversicherung",
  customer: kunde(c),
  ...o,
});
const strecke = (o: Record<string, unknown> = {}) => ({
  id: "s1",
  customerId: "c1",
  leadId: "l1",
  ausloeser: "kein_whatsapp",
  schritt: "sms",
  nurSms: true,
  smsZahl: 0,
  smsAt: null,
  zeiten: [],
  reaktionAt: null,
  appointmentId: null,
  erstmailAt: null,
  createdAt: berlin("2026-11-23T10:00:00"),
  lead: {
    id: "l1",
    customerId: "c1",
    name: "Julia Becker",
    email: null,
    weitereEmails: [],
    phone: "491631234567",
    source: "Zahnzusatzversicherung",
    status: "Neuer Lead",
    formData: null,
    needData: null,
    erasedAt: null,
    reached: false,
    customer: { leadAddress: "sie", name: "Allianz Lohmann", onboarding: null, calendarConnection: null },
  },
  ...o,
});

function standard() {
  vi.clearAllMocks();
  delete process.env.STRECKE_NUR_SMS;
  db.appointment.count.mockResolvedValue(0);
  db.bestandOptOut.count.mockResolvedValue(0);
  db.calendarLeadTimes.findUnique.mockResolvedValue(null);
  db.erstinformation.findUnique.mockResolvedValue({ telefon: "0451 1234567" });
  db.leadMailStrecke.create.mockResolvedValue({ id: "s1" });
  db.leadMailStrecke.findUnique.mockResolvedValue(strecke());
  db.leadMailStrecke.updateMany.mockResolvedValue({ count: 1 });
  db.leadMailStrecke.update.mockResolvedValue({});
  db.customer.count.mockResolvedValue(0);
  db.customer.findUnique.mockResolvedValue(kunde());
  db.message.count.mockResolvedValue(0);
  tel.istMobil.mockResolvedValue(true);
  tel.istFestnetz.mockResolvedValue(false);
  sms.smsAktiv.mockReturnValue(true);
  sms.sendSms.mockResolvedValue({ status: "sent", id: "x" });
  verlauf.mockResolvedValue(null);
}

describe("Start bei E-Mail-Funktionen aus", () => {
  beforeEach(standard);

  it("kein WhatsApp, Handynummer: Strecke nur mit SMS, erste SMS sofort zur Geschäftszeit", async () => {
    db.lead.findUnique.mockResolvedValue(leadRow());
    const r = await starteMailStrecke("l1", "kein_whatsapp", { now: berlin("2026-11-23T10:00:00") });
    expect(r).toEqual({ ergebnis: "gestartet", kanal: "sms", gesendet: true });
    expect(db.leadMailStrecke.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ nurSms: true, schritt: "sms" }) }));
    expect(sms.sendSms).toHaveBeenCalledTimes(1);
    const [nummer, text, opts] = sms.sendSms.mock.calls[0];
    expect(nummer).toBe("491631234567");
    expect(text).toContain("Hallo Frau Becker, danke für Ihre Anfrage zur Zahnzusatzversicherung bei Herrn Lohmann.");
    expect(text).toContain("Oder rufen Sie an: 0451 1234567 (Mo bis Fr, 9 bis 18 Uhr).");
    expect(opts).toEqual({ from: null }); // „Thomas Lohmann“ hat mehr als 11 Zeichen: Standard-Absender
    // Verlauf: Start und SMS-Text (ohne Link)
    const texte = verlauf.mock.calls.map((c) => c[2] as string);
    expect(texte.some((t) => t.startsWith("SMS-Strecke gestartet"))).toBe(true);
    expect(texte.some((t) => t.startsWith("SMS an den Lead (erste Nachricht): Hallo Frau Becker") && t.includes("(Link zur Terminwahl)"))).toBe(true);
  });

  it("außerhalb der Geschäftszeit: gestartet, SMS wartet", async () => {
    db.lead.findUnique.mockResolvedValue(leadRow());
    const r = await starteMailStrecke("l1", "kein_whatsapp", { now: berlin("2026-11-22T19:00:00") });
    expect(r).toEqual({ ergebnis: "gestartet", kanal: "sms", gesendet: false, grund: "ruhezeit" });
    expect(sms.sendSms).not.toHaveBeenCalled();
  });

  it("Festnetz bzw. keine Handynummer: nichts", async () => {
    db.lead.findUnique.mockResolvedValue(leadRow());
    tel.istMobil.mockResolvedValue(false);
    expect(await starteMailStrecke("l1", "kein_whatsapp", { now: berlin("2026-11-23T10:00:00") })).toEqual({ ergebnis: "nicht_moeglich", grund: "keine_handynummer" });
    expect(await starteMailStrecke("l1", "festnetz", { now: berlin("2026-11-23T10:00:00") })).toEqual({ ergebnis: "nicht_moeglich", grund: "keine_adresse" });
    expect(db.leadMailStrecke.create).not.toHaveBeenCalled();
  });

  it("Sperren: Pay-per-Lead, Produkt ohne Nachrichten, ruhend, Assistent aus, abgemeldet, Schalter aus", async () => {
    const now = berlin("2026-11-23T10:00:00");
    db.lead.findUnique.mockResolvedValue(leadRow({}, { plan: "ppl", onboarding: null, retainerMonthly: null }));
    expect((await starteMailStrecke("l1", "kein_whatsapp", { now })).grund).toBe("pay_per_lead");
    db.lead.findUnique.mockResolvedValue(leadRow({ source: "PKV-Tarifoptimierung" }));
    expect((await starteMailStrecke("l1", "kein_whatsapp", { now })).grund).toBe("produkt");
    db.lead.findUnique.mockResolvedValue(leadRow({}, { dormantSince: new Date() }));
    expect((await starteMailStrecke("l1", "kein_whatsapp", { now })).grund).toBe("ruhend");
    db.lead.findUnique.mockResolvedValue(leadRow({}, { agentConfig: { active: false, outreachEnabled: true } }));
    expect((await starteMailStrecke("l1", "kein_whatsapp", { now })).grund).toBe("assistent_aus");
    db.lead.findUnique.mockResolvedValue(leadRow({ status: "Termin vereinbart" }));
    expect((await starteMailStrecke("l1", "kein_whatsapp", { now })).grund).toBe("status");
    db.lead.findUnique.mockResolvedValue(leadRow());
    db.bestandOptOut.count.mockResolvedValueOnce(1);
    expect((await starteMailStrecke("l1", "kein_whatsapp", { now })).grund).toBe("gesperrt");
    process.env.STRECKE_NUR_SMS = "aus";
    expect((await starteMailStrecke("l1", "kein_whatsapp", { now })).grund).toBe("mail_aus");
    expect(sms.sendSms).not.toHaveBeenCalled();
  });
});

describe("SMS senden", () => {
  beforeEach(standard);

  it("höchstens 2: danach nichts mehr", async () => {
    db.leadMailStrecke.findUnique.mockResolvedValue(strecke({ smsZahl: 2 }));
    expect(await sendeStreckenSms("s1", "erinnerung", berlin("2026-11-25T10:00:00"))).toBe("max");
    db.leadMailStrecke.findUnique.mockResolvedValue(strecke({ smsZahl: 1, schritt: "gebucht" }));
    expect(await sendeStreckenSms("s1", "erinnerung", berlin("2026-11-25T10:00:00"))).toBe("max");
    expect(sms.sendSms).not.toHaveBeenCalled();
  });

  it("zweite SMS schließt die Strecke ab", async () => {
    db.leadMailStrecke.findUnique.mockResolvedValue(strecke({ smsZahl: 1, smsAt: berlin("2026-11-23T10:00:00") }));
    expect(await sendeStreckenSms("s1", "erinnerung", berlin("2026-11-25T10:00:00"))).toBe("sent");
    expect(sms.sendSms.mock.calls[0][1]).toContain("Herr Lohmann hat noch Zeit für Sie.");
    expect(db.leadMailStrecke.updateMany).toHaveBeenCalledWith({ where: { id: "s1", schritt: "sms" }, data: { schritt: "fertig" } });
  });

  it("Du-Ansprache des Kunden", async () => {
    const s = strecke();
    db.leadMailStrecke.findUnique.mockResolvedValue({ ...s, lead: { ...s.lead, customer: { ...s.lead.customer, leadAddress: "du" } } });
    expect(await sendeStreckenSms("s1", "erst", berlin("2026-11-23T10:00:00"))).toBe("sent");
    const t = sms.sendSms.mock.calls[0][1] as string;
    expect(t).toContain("Hallo Julia, danke für deine Anfrage");
    expect(t).toContain("Oder ruf an:");
  });
});

describe("Takt (Cron)", () => {
  beforeEach(() => {
    standard();
    db.lead.findUnique.mockResolvedValue({ status: "Neuer Lead", reached: false, erasedAt: null, customerId: "c1", email: null, phone: "491631234567", source: "Zahnzusatzversicherung" });
  });
  const zeile = (o: Record<string, unknown> = {}) => ({ id: "s1", leadId: "l1", customerId: "c1", reaktionAt: null, appointmentId: null, erstmailAt: null, schritt: "sms", smsZahl: 0, smsAt: null, createdAt: berlin("2026-11-22T19:00:00"), nurSms: true, ...o });

  it("erste SMS zur nächsten Geschäftszeit (Montag 9 Uhr), nicht nachts", async () => {
    db.leadMailStrecke.findMany.mockResolvedValue([zeile()]);
    expect(await nurSmsTakt(berlin("2026-11-23T07:30:00"))).toBe(0);
    expect(await nurSmsTakt(berlin("2026-11-23T09:00:00"))).toBe(1);
    expect(sms.sendSms).toHaveBeenCalledTimes(1);
  });

  it("zweite SMS erst nach 2 Geschäftstagen", async () => {
    db.leadMailStrecke.findMany.mockResolvedValue([zeile({ smsZahl: 1, smsAt: berlin("2026-11-23T09:00:00") })]);
    db.leadMailStrecke.findUnique.mockResolvedValue(strecke({ smsZahl: 1, smsAt: berlin("2026-11-23T09:00:00") }));
    expect(await nurSmsTakt(berlin("2026-11-24T12:00:00"))).toBe(0);
    expect(await nurSmsTakt(berlin("2026-11-25T09:00:00"))).toBe(1);
  });

  it("Stopp bei Reaktion, Buchung, Status, Anruf erreicht, Abmeldung, ruhend, Assistent aus", async () => {
    const now = berlin("2026-11-25T10:00:00");
    const fall = async (o: Record<string, unknown>, vorher?: () => void) => {
      vi.clearAllMocks();
      standard();
      db.lead.findUnique.mockResolvedValue({ status: "Neuer Lead", reached: false, erasedAt: null, customerId: "c1", email: null, phone: "491631234567", source: "Zahnzusatzversicherung" });
      vorher?.();
      db.leadMailStrecke.findMany.mockResolvedValue([zeile({ smsZahl: 1, smsAt: berlin("2026-11-23T09:00:00"), ...o })]);
      await nurSmsTakt(now);
      expect(sms.sendSms).not.toHaveBeenCalled();
      return db.leadMailStrecke.update.mock.calls[0]?.[0]?.data;
    };
    expect(await fall({ reaktionAt: new Date() })).toEqual({ schritt: "gestoppt", stopGrund: "reaktion" });
    expect(await fall({ appointmentId: "a1" })).toEqual({ schritt: "gebucht", stopGrund: "gebucht" });
    expect(await fall({}, () => db.lead.findUnique.mockResolvedValue({ status: "Abgeschlossen", reached: false, erasedAt: null, customerId: "c1", email: null, phone: "491631234567", source: null }))).toEqual({ schritt: "gestoppt", stopGrund: "status" });
    expect(await fall({}, () => db.lead.findUnique.mockResolvedValue({ status: "Neuer Lead", reached: true, erasedAt: null, customerId: "c1", email: null, phone: "491631234567", source: null }))).toEqual({ schritt: "gestoppt", stopGrund: "anruf_erreicht" });
    expect(await fall({}, () => db.appointment.count.mockResolvedValue(1))).toEqual({ schritt: "gebucht", stopGrund: "gebucht" });
    expect(await fall({}, () => db.bestandOptOut.count.mockResolvedValue(1))).toEqual({ schritt: "abgemeldet", stopGrund: "gesperrt" });
    expect(await fall({}, () => db.customer.findUnique.mockResolvedValue(kunde({ dormantSince: new Date() })))).toEqual({ schritt: "gestoppt", stopGrund: "ruhend" });
    expect(await fall({}, () => db.customer.findUnique.mockResolvedValue(kunde({ agentConfig: { active: true, outreachEnabled: false } })))).toEqual({ schritt: "gestoppt", stopGrund: "assistent_aus" });
    expect(await fall({}, () => db.customer.count.mockResolvedValue(1))).toEqual({ schritt: "gestoppt", stopGrund: "pay_per_lead" });
  });

  it("erste SMS nach 5 Tagen ohne Geschäftszeit nicht mehr nachholen", async () => {
    db.leadMailStrecke.findMany.mockResolvedValue([zeile({ createdAt: berlin("2026-11-16T19:00:00") })]);
    expect(await nurSmsTakt(berlin("2026-11-23T10:00:00"))).toBe(0);
    expect(db.leadMailStrecke.update).toHaveBeenCalledWith({ where: { id: "s1" }, data: { schritt: "gestoppt", stopGrund: "abgelaufen" } });
  });
});
