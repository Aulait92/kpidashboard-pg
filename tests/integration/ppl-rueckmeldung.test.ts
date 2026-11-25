// Rückmeldung des Pay-per-Lead-Käufers mit einem Tipp (Ole, 25.11.2026) gegen die Test-Datenbank: Link aus der
// Liefer-E-Mail, Speichern (Phase, erreicht, Anrufversuch, Wiedervorlage nächster Werktag 9 Uhr, Verlauf), Ändern,
// Leadliste mit Rückgängig, Diagnose q=ppl-rueckmeldung und Morgen-Erinnerung „Heute fällig“.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({ userId: "", customerId: "" }));
vi.mock("@/lib/auth", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth")>()),
  getCurrentSession: async () => ({ userId: st.userId, email: "x@example.test", role: "BUYER", customerId: st.customerId }),
}));
vi.mock("@/lib/buyer-context", () => ({
  getBuyerContext: async () => ({ customerId: st.customerId, email: "x@example.test", preview: false, userId: st.userId, teamRole: "owner" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
const push = vi.fn();
type Mail = { to: string; subject: string; html?: string; textBlocks?: string[] };
const mails: Mail[] = [];
vi.mock("@/lib/push", async (orig) => ({ ...(await orig<typeof import("@/lib/push")>()), sendToUser: (...a: unknown[]) => push(...a), sendToAdmins: async () => {} }));
vi.mock("@/lib/email", async (orig) => ({
  ...(await orig<typeof import("@/lib/email")>()),
  sendCustomerMail: async (o: Mail) => {
    mails.push(o);
    return { ok: true };
  },
}));

import { prisma } from "@/lib/prisma";
import { deliverTo } from "@/lib/ppl/delivery";
import { RUECKMELDUNG_WIEDERVORLAGE } from "@/lib/ppl/rueckmeldung";
import { rueckmeldungToken } from "@/lib/ppl/rueckmeldung-token";
import { ladeRueckmeldungSeite, neuePhase, setzeRueckmeldung } from "@/lib/ppl/rueckmeldung-server";
import { pplRueckmeldungResult } from "@/app/buyer/rueckmeldung-actions";
import { undoInboxAction } from "@/app/buyer/inbox-actions";
import { pplRueckmeldung } from "@/lib/ops/ppl-rueckmeldung";
import { runNextStepReminders } from "@/lib/next-step-reminder";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const produkt = `PKV-Rueck-${Math.random().toString(36).slice(2, 7)}`;

describe("Pay-per-Lead: Rückmeldung mit einem Tipp", () => {
  let kunde = "";
  let anderer = "";
  let subId = "";
  let n = 0;
  const lead = (extra: Record<string, unknown> = {}) =>
    prisma.lead.create({
      data: { customerId: kunde, subscriptionId: subId, name: "Max Mustermann", phone: `49151300${String(++n).padStart(4, "0")}`, status: "Neuer Lead", deliveredAt: new Date(), source: produkt, ...extra },
    });

  beforeAll(async () => {
    requireTestDb();
    process.env.AUTH_SECRET ??= "localtestsecret_localtestsecret_0123456789";
    const c = await makeCustomer({ plan: "ppl" });
    kunde = c.id;
    const u = await makeBuyer(c.id, "owner");
    st.userId = u.id;
    st.customerId = c.id;
    anderer = (await makeCustomer()).id;
    subId = (await prisma.leadSubscription.create({ data: { customerId: kunde, productKey: produkt, price: 60, period: "once", goal: 5, delivery: "email", deliveryEmail: "makler@example.com" } })).id;
  });
  afterAll(async () => {
    await cleanupCustomer(kunde);
    await cleanupCustomer(anderer);
  });
  beforeEach(() => {
    push.mockReset();
    push.mockResolvedValue(undefined);
    mails.length = 0;
  });

  it("Phase nur nach vorn, vorige Rückmeldung darf ersetzt werden", () => {
    expect(neuePhase("erreicht", "Neuer Lead", null)).toBe("Erreicht");
    expect(neuePhase("erreicht", null, null)).toBe("Erreicht");
    expect(neuePhase("nicht_erreicht", "Neuer Lead", null)).toBe("Nicht erreicht");
    expect(neuePhase("nicht_erreicht", "Erreicht", null)).toBeNull();
    expect(neuePhase("nicht_erreicht", "Erreicht", "erreicht")).toBe("Nicht erreicht");
    expect(neuePhase("termin", "Erreicht", null)).toBe("Termin vereinbart");
    expect(neuePhase("termin", "Angebot gesendet", null)).toBeNull();
    expect(neuePhase("erreicht", "Termin vereinbart", null)).toBeNull();
    expect(neuePhase("erreicht", "Termin vereinbart", "termin")).toBe("Erreicht");
  });

  it("Liefer-E-Mail enthält die drei Knöpfe mit gültigem Link", async () => {
    const vorher = process.env.APP_URL;
    process.env.APP_URL = "https://app.example.test";
    try {
      const l = await lead();
      const sub = await prisma.leadSubscription.findUniqueOrThrow({ where: { id: subId } });
      const r = await deliverTo(sub, { id: l.id, product: produkt, name: l.name, phone: l.phone, email: null, answers: [], date: new Date(), consentAt: null });
      expect(r.ok).toBe(true);
      const m = mails.find((x) => x.to === "makler@example.com")!;
      expect(m.html).toContain("/rueckmeldung/");
      const href = m.html!.match(/href="https:\/\/app\.example\.test\/rueckmeldung\/([^"?]+)\?a=nicht_erreicht"/);
      expect(href).not.toBeNull();
      expect(href![1]).not.toContain("Mustermann");
      const seite = await ladeRueckmeldungSeite(href![1]);
      expect(seite).toMatchObject({ ok: true, leadId: l.id, customerId: kunde, aktuell: null });
      expect(m.textBlocks?.some((t) => t.startsWith("Termin vereinbart: https://app.example.test/rueckmeldung/"))).toBe(true);
      // Test-Lead: keine Knöpfe
      mails.length = 0;
      await deliverTo(sub, { id: l.id, product: produkt, name: l.name, phone: l.phone, email: null, answers: [], date: new Date(), consentAt: null, test: true });
      expect(mails[0].html ?? "").not.toContain("/rueckmeldung/");
    } finally {
      if (vorher === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = vorher;
    }
  });

  it("Link: fremder Käufer, gelöschter Lead und Lead ohne Bezug sind ungültig", async () => {
    const l = await lead();
    expect((await ladeRueckmeldungSeite(rueckmeldungToken(l.id, anderer))).ok).toBe(false);
    const ohneBezug = await lead({ subscriptionId: null });
    expect((await ladeRueckmeldungSeite(rueckmeldungToken(ohneBezug.id, kunde))).ok).toBe(false);
    await prisma.lead.update({ where: { id: l.id }, data: { erasedAt: new Date() } });
    expect((await ladeRueckmeldungSeite(rueckmeldungToken(l.id, kunde))).ok).toBe(false);
    const alt = rueckmeldungToken(ohneBezug.id, kunde, new Date(Date.now() - 31 * 86_400_000));
    await prisma.lead.update({ where: { id: ohneBezug.id }, data: { subscriptionId: subId } });
    expect(await ladeRueckmeldungSeite(alt)).toEqual({ ok: false, grund: "abgelaufen" });
  });

  it("Nicht erreicht per Mail: Phase, Anrufversuch, Wiedervorlage nächster Werktag 9 Uhr, Verlauf; Ändern auf Erreicht", async () => {
    const l = await lead();
    const mi = new Date("2026-11-25T15:00:00Z"); // Mittwoch
    const r = await setzeRueckmeldung({ leadId: l.id, customerId: kunde, art: "nicht_erreicht", quelle: "mail", now: mi });
    expect(r).toMatchObject({ ok: true, phase: "Nicht erreicht" });
    let x = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } });
    expect(x.status).toBe("Nicht erreicht");
    expect(x.reached).toBe(false);
    expect(x.callAttempts).toBe(1);
    expect(x.firstContactAt?.toISOString()).toBe(mi.toISOString());
    expect(x.followUpAt?.toISOString()).toBe("2026-11-26T08:00:00.000Z");
    expect(x.followUpNote).toBe(RUECKMELDUNG_WIEDERVORLAGE);
    expect(x).toMatchObject({ kaeuferRueckmeldung: "nicht_erreicht", kaeuferRueckmeldungQuelle: "mail" });
    const h = await prisma.leadHistory.findMany({ where: { leadId: l.id } });
    expect(h.map((e) => e.text)).toContain("Rückmeldung (per E-Mail): Nicht erreicht · Wiedervorlage Do., 26.11., 9 Uhr");
    expect(h[0].userId).toBeNull();
    // zweiter Klick kurz danach zählt keinen weiteren Versuch
    await setzeRueckmeldung({ leadId: l.id, customerId: kunde, art: "nicht_erreicht", quelle: "mail", now: new Date(mi.getTime() + 60_000) });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })).callAttempts).toBe(1);
    // Ändern: erreicht → Phase Erreicht, unsere Wiedervorlage entfällt
    await setzeRueckmeldung({ leadId: l.id, customerId: kunde, art: "erreicht", quelle: "mail", now: new Date(mi.getTime() + 120_000) });
    x = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } });
    expect(x).toMatchObject({ status: "Erreicht", reached: true, followUpAt: null, followUpNote: null, kaeuferRueckmeldung: "erreicht" });
    // Termin vereinbart
    await setzeRueckmeldung({ leadId: l.id, customerId: kunde, art: "termin", quelle: "mail" });
    x = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } });
    expect(x.status).toBe("Termin vereinbart");
    // falscher Käufer: nichts
    expect((await setzeRueckmeldung({ leadId: l.id, customerId: anderer, art: "erreicht", quelle: "mail" })).ok).toBe(false);
  });

  it("eigene spätere Wiedervorlage bleibt; Abschluss bleibt Abschluss", async () => {
    const eigen = new Date(Date.now() + 5 * 86_400_000);
    const l = await lead({ status: "Nicht erreicht", followUpAt: eigen, followUpNote: "Nach dem Urlaub anrufen" });
    await setzeRueckmeldung({ leadId: l.id, customerId: kunde, art: "nicht_erreicht", quelle: "app" });
    const x = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } });
    expect(x.followUpAt?.toISOString()).toBe(eigen.toISOString());
    expect(x.followUpNote).toBe("Nach dem Urlaub anrufen");
    const w = await lead({ status: "Abschluss", closedAt: new Date() });
    await setzeRueckmeldung({ leadId: w.id, customerId: kunde, art: "termin", quelle: "app" });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: w.id } })).status).toBe("Abschluss");
  });

  it("Leadliste: ein Tipp, Toast-Text und Rückgängig", async () => {
    const l = await lead();
    const r = await pplRueckmeldungResult(l.id, "nicht_erreicht");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.text).toMatch(/^Nicht erreicht, Wiedervorlage \w{2}\., \d{2}\.\d{2}\., 9 Uhr$/);
    let x = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } });
    expect(x).toMatchObject({ status: "Nicht erreicht", kaeuferRueckmeldungQuelle: "app", followUpNote: RUECKMELDUNG_WIEDERVORLAGE });
    expect((await prisma.leadHistory.findFirst({ where: { leadId: l.id } }))?.userId).toBe(st.userId);
    await undoInboxAction(r.undo!);
    x = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } });
    expect(x).toMatchObject({ status: "Neuer Lead", followUpAt: null, callAttempts: 0, kaeuferRueckmeldung: null, kaeuferRueckmeldungQuelle: null });
    expect((await pplRueckmeldungResult(l.id, "unsinn")).ok).toBe(false);
  });

  it("Diagnose zählt die Rückmeldungen je Weg", async () => {
    await prisma.leadSubscription.update({ where: { id: subId }, data: { active: true } });
    const d = await pplRueckmeldung(new URLSearchParams({ produkt, tage: "5" }));
    const k = d.kunden.find((x) => x.geliefert > 0)!;
    expect(k.rueckmeldungMail).toBeGreaterThanOrEqual(1);
    expect(k.rueckmeldungApp).toBeGreaterThanOrEqual(1);
    expect(k.erreicht).toBeGreaterThanOrEqual(1);
  });

  it("Morgen-Erinnerung: reiner Pay-per-Lead-Kunde bekommt werktags nur „Heute fällig“", async () => {
    await prisma.lead.deleteMany({ where: { customerId: kunde } });
    await lead({ status: "Nicht erreicht", followUpAt: new Date("2026-11-24T08:00:00Z"), followUpNote: RUECKMELDUNG_WIEDERVORLAGE });
    await lead({ status: "Nicht erreicht", followUpAt: new Date("2026-11-26T08:00:00Z"), followUpNote: RUECKMELDUNG_WIEDERVORLAGE });
    // ohne nächsten Schritt: zählt bei reinen Pay-per-Lead-Kunden nicht
    await lead({ status: "Erreicht" });
    await prisma.user.update({ where: { id: st.userId }, data: { nextStepReminderDay: null } });
    // Samstag 8:05: nichts
    await runNextStepReminders(new Date("2026-11-28T07:05:00Z"));
    expect(push.mock.calls.filter((c) => c[0] === st.userId)).toHaveLength(0);
    // Donnerstag 26.11. 8:05: beide fällig, eine überfällig
    await runNextStepReminders(new Date("2026-11-26T07:05:00Z"));
    const mine = push.mock.calls.filter((c) => c[0] === st.userId);
    expect(mine).toHaveLength(1);
    expect(mine[0][1]).toMatchObject({ title: "Heute fällig: 2 Wiedervorlagen", body: "Davon 1 überfällig. Auf „Heute“ mit einem Tipp erledigen oder auf morgen schieben.", url: "/buyer#faellig" });
    expect(mails.some((m) => m.subject === "Heute fällig: 2 Wiedervorlagen")).toBe(true);
  });
});
