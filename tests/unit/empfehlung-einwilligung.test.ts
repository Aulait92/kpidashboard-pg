// Paket 1 (19.11.2026): Einwilligung, STOPP und Obergrenze der Empfehlungsbitten in allen Abläufen.
// R1 nach Termin, R2 „Link senden“, R3 Obergrenze (3 in 365 Tagen, alter Wortlaut = 1 Bitte), Dank nur mit statusConsent.
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    prisma: {
      appointment: { findMany: fn(), updateMany: fn(), update: fn() },
      lead: { findFirst: fn(), findMany: fn(), updateMany: fn(), update: fn() },
      reviewRequest: { findMany: fn(), update: fn(), updateMany: fn() },
      referralLink: { findFirst: fn(), findMany: fn(), update: fn(), create: fn() },
      existingCustomer: { findFirst: fn(), findUnique: fn() },
      auditLog: { findMany: fn() },
      conversation: { findUnique: fn() },
      customer: { findUnique: fn() },
      reviewSettings: { findUnique: fn() },
      $transaction: fn(),
    },
    sendWhatsAppNotice: vi.fn(),
    sendWhatsAppMessage: vi.fn(),
    audit: vi.fn(),
  };
});
vi.mock("@/lib/prisma", () => ({ prisma: m.prisma }));
vi.mock("@/lib/audit", () => ({ audit: m.audit }));
vi.mock("@/lib/monitoring", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/whatsapp/templates", () => ({ sendWhatsAppNotice: m.sendWhatsAppNotice, NoTemplateError: class NoTemplateError extends Error {} }));
vi.mock("@/lib/whatsapp/gateway", () => ({ sendWhatsAppMessage: m.sendWhatsAppMessage }));
vi.mock("@/lib/lead-anrede", () => ({
  ansprechpartner: vi.fn(async () => null),
  kontaktFromExisting: (e: { firstName?: string | null; lastName?: string | null }) => ({ firstName: e.firstName, lastName: e.lastName }),
}));

import {
  NO_CONSENT_ERROR,
  NO_FEEDBACK_CONSENT,
  sendAfterAppointmentReferrals,
  sendDueReferrals,
  sendDueReviews,
  sendReferralLinkNow,
  sendReferralThanks,
} from "@/lib/empfehlung/requests";
import { DAY_MS, FEEDBACK_CONSENT_TEXT, FEEDBACK_CONSENT_TEXT_V1, REFERRAL_LEGACY_ERROR, REFERRAL_LIMIT_ERROR, referralAskAllowed } from "@/lib/empfehlung/shared";

// Dienstag 11 Uhr in Berlin: im Versandfenster
const NOW = new Date("2026-11-17T10:00:00Z");
const ago = (days: number) => new Date(NOW.getTime() - days * DAY_MS);
const LINK = { id: "link1", customerId: "c1", token: "tok1234567890", leadId: "l1", existingCustomerId: null, kind: "contact" };
const CONSENT = { feedbackConsentAt: ago(30), feedbackOptOutAt: null, feedbackConsentText: FEEDBACK_CONSENT_TEXT };
const NO_CONSENT = { feedbackConsentAt: null, feedbackOptOutAt: null, feedbackConsentText: null };

function asks(n: number, daysAgo = 10) {
  m.prisma.auditLog.findMany.mockResolvedValue(Array.from({ length: n }, () => ({ at: ago(daysAgo) })));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  m.prisma.customer.findUnique.mockResolvedValue({ name: "Max Muster", leadAddress: "sie", bestandAddress: "sie" });
  m.prisma.reviewSettings.findUnique.mockResolvedValue(null);
  m.prisma.referralLink.findFirst.mockResolvedValue(LINK);
  m.prisma.referralLink.findMany.mockResolvedValue([]);
  m.prisma.referralLink.update.mockResolvedValue({});
  m.prisma.existingCustomer.findUnique.mockResolvedValue(null);
  m.prisma.appointment.updateMany.mockResolvedValue({ count: 1 });
  m.prisma.lead.updateMany.mockResolvedValue({ count: 1 });
  m.prisma.reviewRequest.updateMany.mockResolvedValue({ count: 1 });
  m.prisma.reviewRequest.update.mockResolvedValue({});
  m.prisma.$transaction.mockResolvedValue([]);
  m.prisma.conversation.findUnique.mockResolvedValue(null);
  m.sendWhatsAppNotice.mockResolvedValue({ mode: "text", conversationId: "conv1" });
  m.sendWhatsAppMessage.mockResolvedValue({ messageId: "x" });
  asks(0);
});

describe("Obergrenze der Empfehlungsbitten (R3)", () => {
  it("höchstens 3 Bitten in 365 Tagen, ältere zählen nicht", () => {
    const consent = { at: ago(400), text: FEEDBACK_CONSENT_TEXT };
    expect(referralAskAllowed([ago(10), ago(100)], NOW, consent)).toEqual({ ok: true });
    expect(referralAskAllowed([ago(10), ago(100), ago(200)], NOW, consent)).toEqual({ ok: false, error: REFERRAL_LIMIT_ERROR });
    expect(referralAskAllowed([ago(10), ago(100), ago(370)], NOW, consent)).toEqual({ ok: true });
  });

  it("Einwilligung mit altem Wortlaut deckt nur eine Bitte", () => {
    const alt = { at: ago(50), text: FEEDBACK_CONSENT_TEXT_V1 };
    expect(referralAskAllowed([], NOW, alt)).toEqual({ ok: true });
    expect(referralAskAllowed([ago(20)], NOW, alt)).toEqual({ ok: false, error: REFERRAL_LEGACY_ERROR });
    // Bitten vor der Einwilligung zählen dafür nicht
    expect(referralAskAllowed([ago(60)], NOW, alt)).toEqual({ ok: true });
    expect(referralAskAllowed([ago(20)], NOW, { at: ago(50), text: FEEDBACK_CONSENT_TEXT })).toEqual({ ok: true });
  });

  it("Bestandskunden (Einwilligung im Bestandsmodul): nur die Obergrenze", () => {
    expect(referralAskAllowed([ago(1), ago(2)], NOW, null)).toEqual({ ok: true });
    expect(referralAskAllowed([ago(1), ago(2), ago(3)], NOW, null)).toMatchObject({ ok: false });
  });
});

describe("R2: Empfehlungslink jetzt senden (Lead)", () => {
  const lead = (extra: object) => ({ id: "l1", name: "Julia Schneider", phone: "+491555000001", status: "Abschluss", source: "Kfz", bestandKunde: null, followUpAt: null, ...extra });

  it("STOPP blockt immer, auch mit Einwilligung", async () => {
    m.prisma.lead.findFirst.mockResolvedValue(lead({ ...CONSENT, feedbackOptOutAt: ago(1) }));
    const r = await sendReferralLinkNow("c1", { leadId: "l1" });
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/STOPP/) });
    expect(m.sendWhatsAppNotice).not.toHaveBeenCalled();
    expect(m.sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it("Sperre als Bestandskunde blockt ebenfalls", async () => {
    m.prisma.lead.findFirst.mockResolvedValue(lead({ ...CONSENT, bestandKunde: { optOutAt: null, blockedAt: ago(2) } }));
    expect(await sendReferralLinkNow("c1", { leadId: "l1" })).toMatchObject({ ok: false });
    expect(m.sendWhatsAppNotice).not.toHaveBeenCalled();
  });

  it("ohne Einwilligung und ohne offenes 24-h-Fenster: „Einwilligung fehlt“, kein Text zum Teilen", async () => {
    m.prisma.lead.findFirst.mockResolvedValue(lead(NO_CONSENT));
    m.prisma.conversation.findUnique.mockResolvedValue({ windowExpiresAt: ago(1) });
    const r = await sendReferralLinkNow("c1", { leadId: "l1" });
    expect(r).toEqual({ ok: false, error: NO_CONSENT_ERROR });
    expect(m.sendWhatsAppNotice).not.toHaveBeenCalled();
    expect(m.sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it("ohne Einwilligung im offenen Fenster: nur freie Nachricht, nie eine Vorlage", async () => {
    m.prisma.lead.findFirst.mockResolvedValue(lead(NO_CONSENT));
    m.prisma.conversation.findUnique.mockResolvedValue({ windowExpiresAt: new Date(NOW.getTime() + 3600_000) });
    const r = await sendReferralLinkNow("c1", { leadId: "l1" });
    expect(r).toMatchObject({ ok: true, mode: "text" });
    expect(m.sendWhatsAppNotice).not.toHaveBeenCalled();
    expect(m.sendWhatsAppMessage).toHaveBeenCalledTimes(1);
    expect(m.sendWhatsAppMessage.mock.calls[0][0].body).toMatch(/STOPP/);
  });

  it("mit Einwilligung: Bitte geht raus, mit Thema und in der Ansprache des Kunden", async () => {
    m.prisma.customer.findUnique.mockResolvedValue({ name: "Max Muster", leadAddress: "du", bestandAddress: "sie" });
    m.prisma.lead.findFirst.mockResolvedValue(lead(CONSENT));
    const r = await sendReferralLinkNow("c1", { leadId: "l1" });
    expect(r).toMatchObject({ ok: true });
    const call = m.sendWhatsAppNotice.mock.calls[0][0];
    expect(call.text).toMatch(/^Hallo Julia, hier ist Max Muster\. Schön, dass das Thema Kfz bei dir/);
    expect(call.text).toMatch(/Antworte mit STOPP/);
    // Vorlage bleibt Sie (Parameter Vorname, Thema, Link)
    expect(call.params).toEqual(["Julia", "Kfz", expect.stringContaining("/empfehlung/tok1234567890")]);
  });

  it("ersetzt die geplante automatische Empfehlungsbitte (keine zweite Bitte kurz danach)", async () => {
    m.prisma.lead.findFirst.mockResolvedValue(lead(CONSENT));
    expect(await sendReferralLinkNow("c1", { leadId: "l1" })).toMatchObject({ ok: true });
    expect(m.prisma.reviewRequest.updateMany).toHaveBeenCalledWith({ where: { leadId: "l1", referralStatus: "waiting" }, data: { referralStatus: "sent", referralSentAt: NOW } });
  });

  it("Obergrenze erreicht bzw. alte Einwilligung schon genutzt: nichts geht raus", async () => {
    m.prisma.lead.findFirst.mockResolvedValue(lead(CONSENT));
    asks(3);
    expect(await sendReferralLinkNow("c1", { leadId: "l1" })).toEqual({ ok: false, error: REFERRAL_LIMIT_ERROR });
    m.prisma.lead.findFirst.mockResolvedValue(lead({ ...CONSENT, feedbackConsentText: FEEDBACK_CONSENT_TEXT_V1 }));
    asks(1, 5);
    expect(await sendReferralLinkNow("c1", { leadId: "l1" })).toEqual({ ok: false, error: REFERRAL_LEGACY_ERROR });
    expect(m.sendWhatsAppNotice).not.toHaveBeenCalled();
  });
});

describe("R1: Empfehlungsbitte nach einem Termin", () => {
  const appt = (lead: object) => ({
    id: "a1",
    customerId: "c1",
    lead: { id: "l1", name: "Julia Schneider", phone: "+491555000001", status: "Abschluss", source: "Kfz", followUpNote: null, erasedAt: null, bestandKunde: null, reviewRequest: null, ownReferralLink: null, ...lead },
  });

  it("ohne Einwilligung oder nach STOPP geht nichts raus", async () => {
    m.prisma.appointment.findMany.mockResolvedValue([appt(NO_CONSENT), appt({ ...CONSENT, feedbackOptOutAt: ago(1) }), appt({ ...CONSENT, bestandKunde: { optOutAt: ago(3), blockedAt: null } })]);
    const out = await sendAfterAppointmentReferrals(NOW);
    expect(out).toEqual({ sent: 0, skipped: 3 });
    expect(m.sendWhatsAppNotice).not.toHaveBeenCalled();
  });

  it("mit Einwilligung: geht raus und zählt für die Obergrenze; bei erreichter Obergrenze nicht", async () => {
    m.prisma.appointment.findMany.mockResolvedValue([appt(CONSENT)]);
    expect(await sendAfterAppointmentReferrals(NOW)).toEqual({ sent: 1, skipped: 0 });
    expect(m.audit).toHaveBeenCalledWith("empfehlung.bitte", expect.objectContaining({ entityId: "link1", details: { weg: "termin" } }));
    vi.clearAllMocks();
    m.prisma.appointment.updateMany.mockResolvedValue({ count: 1 });
    asks(3);
    expect(await sendAfterAppointmentReferrals(NOW)).toEqual({ sent: 0, skipped: 1 });
    expect(m.sendWhatsAppNotice).not.toHaveBeenCalled();
  });
});

describe("Tag X: Bewertungsbitte und Empfehlungsbitte nur mit Einwilligung", () => {
  it("Bewertungsbitte ohne Einwilligung wartet", async () => {
    m.prisma.reviewSettings.findUnique.mockResolvedValue({ googleReviewUrl: "https://g.page/r/x/review" });
    m.prisma.reviewRequest.findMany.mockResolvedValue([
      { id: "r1", customerId: "c1", token: "t", lead: { id: "l1", name: "Julia", phone: "+491555000001", status: "Abschluss", closedAt: ago(14), erasedAt: null, ...NO_CONSENT } },
    ]);
    const out = await sendDueReviews(NOW);
    expect(out.waiting).toBe(1);
    expect(m.prisma.reviewRequest.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ note: NO_FEEDBACK_CONSENT }) }));
    expect(m.sendWhatsAppNotice).not.toHaveBeenCalled();
  });

  it("Empfehlungsbitte ohne Einwilligung bzw. über der Obergrenze entfällt", async () => {
    const lead = { id: "l1", name: "Julia", phone: "+491555000001", status: "Abschluss", source: "Kfz", followUpNote: null, erasedAt: null };
    m.prisma.reviewRequest.findMany.mockResolvedValue([{ id: "r1", customerId: "c1", leadId: "l1", status: "sent", sentiment: null, note: null, lead: { ...lead, ...NO_CONSENT } }]);
    expect(await sendDueReferrals(NOW)).toEqual({ sent: 0, skipped: 1 });
    m.prisma.reviewRequest.findMany.mockResolvedValue([{ id: "r1", customerId: "c1", leadId: "l1", status: "sent", sentiment: null, note: null, lead: { ...lead, ...CONSENT } }]);
    asks(3);
    expect(await sendDueReferrals(NOW)).toEqual({ sent: 0, skipped: 1 });
    expect(m.sendWhatsAppNotice).not.toHaveBeenCalled();
    asks(0);
    expect(await sendDueReferrals(NOW)).toEqual({ sent: 1, skipped: 0 });
    expect(m.audit).toHaveBeenCalledWith("empfehlung.bitte", expect.objectContaining({ details: { weg: "automatik" } }));
  });
});

describe("Dank an Empfehlende", () => {
  const referred = (recommender: object) => ({
    id: "ref1",
    customerId: "c1",
    referralLink: { ...LINK, lead: { id: "l1", name: "Julia Schneider", phone: "+491555000001", erasedAt: null, ...recommender }, existingCustomer: null },
  });

  it("nur, wenn die empfohlene Person der Rückmeldung zugestimmt hat (statusConsent)", async () => {
    m.prisma.lead.findMany.mockResolvedValue([]);
    await sendReferralThanks(NOW);
    expect(m.prisma.lead.findMany.mock.calls[0][0].where).toMatchObject({ referralStatusConsent: true });
  });

  it("ohne Einwilligung oder nach STOPP des Empfehlenden kein Dank", async () => {
    m.prisma.lead.findMany.mockResolvedValue([referred(NO_CONSENT), referred({ ...CONSENT, feedbackOptOutAt: ago(1) })]);
    expect(await sendReferralThanks(NOW)).toBe(0);
    expect(m.sendWhatsAppNotice).not.toHaveBeenCalled();
  });

  it("mit Einwilligung: Dank mit Link und STOPP, ohne „Ich konnte weiterhelfen“; über der Obergrenze ohne Link", async () => {
    m.prisma.lead.findMany.mockResolvedValue([referred(CONSENT)]);
    expect(await sendReferralThanks(NOW)).toBe(1);
    const t = m.sendWhatsAppNotice.mock.calls[0][0].text as string;
    expect(t).toContain("/empfehlung/tok1234567890");
    expect(t).toMatch(/STOPP/);
    expect(t).not.toMatch(/weiterhelfen/);
    expect(m.audit).toHaveBeenCalledWith("empfehlung.bitte", expect.objectContaining({ details: { weg: "dank" } }));
    vi.clearAllMocks();
    m.prisma.lead.updateMany.mockResolvedValue({ count: 1 });
    m.sendWhatsAppNotice.mockResolvedValue({ mode: "text", conversationId: "conv1" });
    asks(3);
    expect(await sendReferralThanks(NOW)).toBe(1);
    const t2 = m.sendWhatsAppNotice.mock.calls[0][0].text as string;
    expect(t2).not.toContain("/empfehlung/");
    expect(m.audit).not.toHaveBeenCalled();
  });
});
