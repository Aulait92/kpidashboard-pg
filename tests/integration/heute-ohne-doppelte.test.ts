// „Heute“ zeigt niemanden doppelt (Usability-Check 18.11.2026): Termin vor Wiedervorlage; das Termin-Ergebnis erledigt
// eine Wiedervorlage, die bis zum Terminbeginn fällig war; Aufgaben nach dem Abschluss bleiben.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({ userId: "", customerId: "" }));
vi.mock("@/lib/auth", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth")>()),
  getCurrentSession: async () => ({ userId: st.userId, email: "x@example.test", role: "BUYER", customerId: st.customerId }),
}));
vi.mock("@/lib/buyer-context", () => ({
  getBuyerContext: async () => ({ customerId: st.customerId, email: "x@example.test", preview: false, userId: st.userId, teamRole: "owner" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/push", async (orig) => ({ ...(await orig<typeof import("@/lib/push")>()), sendToUser: async () => {} }));
vi.mock("@/lib/email", async (orig) => ({ ...(await orig<typeof import("@/lib/email")>()), sendCustomerMail: async () => ({ ok: true }) }));
vi.mock("@/lib/whatsapp/templates", async (orig) => ({ ...(await orig<typeof import("@/lib/whatsapp/templates")>()), sendWhatsAppNotice: async () => ({ mode: "template", conversationId: "c" }) }));

import { prisma } from "@/lib/prisma";
import { loadInbox } from "@/lib/inbox";
import { appointmentOutcomeResult } from "@/app/buyer/inbox-actions";
import { POLICY_TODO } from "@/lib/lead-followup";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const HOUR = 3600_000;
const DAY = 24 * HOUR;

describe("Heute ohne doppelte Personen", () => {
  let customerId = "";
  let n = 0;
  const lead = (extra: Record<string, unknown> = {}) =>
    prisma.lead.create({ data: { customerId, name: `Kontakt ${++n}`, phone: `49151300${String(n).padStart(4, "0")}`, status: "Im Gespräch", ...extra } });
  const termin = (leadId: string, startsAt: Date) => prisma.appointment.create({ data: { customerId, leadId, startsAt, mode: "phone", status: "booked" } });

  beforeAll(async () => {
    requireTestDb();
    const c = await makeCustomer({});
    customerId = c.id;
    st.customerId = c.id;
    st.userId = (await makeBuyer(c.id, "owner")).id;
  });
  afterAll(() => cleanupCustomer(customerId));

  it("Termin geht vor: Wiedervorlage erscheint nicht zusätzlich (heute, demnächst, „Wie lief's?“); Aufgaben nach dem Abschluss bleiben", async () => {
    const now = Date.now();
    const mitTermin = await lead({ followUpAt: new Date(now - HOUR), followUpNote: "Zurückrufen" });
    await termin(mitTermin.id, new Date(now + 3 * DAY));
    const ohne = await lead({ followUpAt: new Date(now - HOUR), followUpNote: "Zurückrufen" });
    const wieLief = await lead({ followUpAt: new Date(now - HOUR), followUpNote: "Unterlagen anfordern" });
    await termin(wieLief.id, new Date(now - 2 * DAY));
    const police = await lead({ status: "Abschluss", followUpAt: new Date(now - HOUR), followUpNote: POLICY_TODO });
    await termin(police.id, new Date(now + 5 * DAY));
    const spaeter = await lead({ followUpAt: new Date(now + 6 * DAY), followUpNote: "Nachfassen" });
    await termin(spaeter.id, new Date(now + 4 * DAY));

    const inbox = await loadInbox({ customerId, userId: null, teamRole: "owner" });
    const wv = inbox.followUps.map((f) => f.leadId);
    expect(wv).toContain(ohne.id);
    expect(wv).toContain(police.id);
    expect(wv).not.toContain(mitTermin.id);
    expect(wv).not.toContain(wieLief.id);
    expect(inbox.outcomes.map((o) => o.leadId)).toContain(wieLief.id);
    // Demnächst: je Person nur der Termin
    const demnaechst = inbox.upcoming.filter((u) => u.leadId === spaeter.id || u.leadId === mitTermin.id);
    expect(demnaechst.map((u) => u.kind)).toEqual(["termin", "termin"]);
  });

  it("Ergebnis eintragen erledigt die Wiedervorlage vor dem Termin; spätere bleibt, bei „nicht erschienen“ bleibt sie auch", async () => {
    const now = Date.now();
    const l = await lead({ followUpAt: new Date(now - DAY), followUpNote: "Zurückrufen" });
    const t = await termin(l.id, new Date(now - 3 * HOUR));
    const r = await appointmentOutcomeResult(t.id, "lost");
    expect(r.ok).toBe(true);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })).followUpNote).toBeNull();

    const spaeter = await lead({ followUpAt: new Date(now + 2 * DAY), followUpNote: "Unterlagen nachreichen" });
    const t2 = await termin(spaeter.id, new Date(now - 3 * HOUR));
    await appointmentOutcomeResult(t2.id, "offer");
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: spaeter.id } })).followUpNote).toBe("Unterlagen nachreichen");

    const ns = await lead({ followUpAt: new Date(now - DAY), followUpNote: "Zurückrufen" });
    const t3 = await termin(ns.id, new Date(now - 3 * HOUR));
    await appointmentOutcomeResult(t3.id, "no_show");
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: ns.id } })).followUpNote).toBe("Zurückrufen");
  });

  it("„Angebot senden“ geht vor: kein zusätzliches „Angebot nachfassen“ (Usability-Check 25.11.2026); andere Wiedervorlagen bleiben", async () => {
    const now = Date.now();
    const doppelt = await lead({ status: "Angebot gesendet", followUpAt: new Date(now - 2 * DAY), followUpNote: "Angebot nachfassen" });
    await prisma.appointment.create({ data: { customerId, leadId: doppelt.id, startsAt: new Date(now - 5 * DAY), mode: "phone", status: "completed" } });
    const anders = await lead({ status: "Angebot gesendet", followUpAt: new Date(now - 2 * DAY), followUpNote: "Unterlagen anfordern" });
    await prisma.appointment.create({ data: { customerId, leadId: anders.id, startsAt: new Date(now - 5 * DAY), mode: "phone", status: "completed" } });
    const nurNachfassen = await lead({ status: "Angebot gesendet", followUpAt: new Date(now - 2 * DAY), followUpNote: "Angebot nachfassen" });

    const inbox = await loadInbox({ customerId, userId: null, teamRole: "owner" });
    const senden = (inbox.angebote ?? []).map((g) => g.leadId);
    const wv = inbox.followUps.map((f) => f.leadId);
    expect(senden).toContain(doppelt.id);
    expect(wv).not.toContain(doppelt.id);
    expect(senden).toContain(anders.id);
    expect(wv).toContain(anders.id);
    expect(wv).toContain(nurNachfassen.id);
  });
});
