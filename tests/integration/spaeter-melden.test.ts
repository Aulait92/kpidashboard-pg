import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// „Später melden“ (Ole, 18.11.2026): ein Blatt statt „Alle pausieren“ (P6) und „Bedenkzeit eintragen“ (P5). Ohne Angebot
// Pause bis zum Tag (der Cron setzt fort), mit Angebot Bedenkzeit, ohne Datum Pause bis „Fortsetzen“. WhatsApp und Mail
// simuliert, Rest gegen die Test-DB.
const send = vi.fn();
vi.mock("@/lib/whatsapp/templates", async (orig) => {
  const real = await orig<typeof import("@/lib/whatsapp/templates")>();
  return { ...real, sendWhatsAppNotice: (...a: unknown[]) => send(...a) };
});
vi.mock("@/lib/whatsapp/termin-vorschlaege", () => ({ zweiTerminvorschlaege: async () => null }));
const mail = vi.fn(async (...a: unknown[]) => ({ sent: a.length > 0 }));
vi.mock("@/lib/mail/vorlagen-mail", async (orig) => {
  const real = await orig<typeof import("@/lib/mail/vorlagen-mail")>();
  return { ...real, sendeVorlagenMail: (...a: unknown[]) => mail(...a) };
});

import { prisma } from "@/lib/prisma";
import { runSequences, startSequence, startAngebotNachfassen } from "@/lib/lead-sequences";
import { pausenBeenden } from "@/lib/nachrichtenplan-aktionen";
import { loadNachrichtenPlan } from "@/lib/nachrichtenplan-server";
import { spaeterMelden } from "@/lib/spaeter-melden";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const H = 60 * 60 * 1000;
const DAY = 24 * H;
// Di 17.11.2026, 10:00 Uhr Berlin
const T0 = new Date("2026-11-17T09:00:00.000Z");

describe("Später melden", () => {
  let customerId = "";
  let n = 0;
  const neuerLead = async (extra: Record<string, unknown> = {}) =>
    prisma.lead.create({ data: { customerId, name: "Anna Becker", email: "anna@example.org", phone: `49151888${String(++n).padStart(4, "0")}`, status: "Neuer Lead", ...extra } });
  const lead = (id: string) => prisma.lead.findUniqueOrThrow({ where: { id } });

  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer({ name: "Agentur Später Melden Test" })).id;
    await prisma.agentConfig.create({ data: { customerId, active: true, followUpSequencesEnabled: true } });
    await prisma.whatsAppAccount.create({ data: { customerId, status: "connected", apiKeyEnc: "x" } });
  });
  afterAll(() => cleanupCustomer(customerId));
  beforeEach(() => {
    send.mockReset();
    send.mockResolvedValue({ mode: "template", conversationId: "c" });
    mail.mockClear();
  });

  it("ohne Angebot: Pause bis zum Tag, nichts geht raus; am Tag setzt der Cron fort, der nächste Schritt kommt dann", async () => {
    const l = await neuerLead();
    const s = (await startSequence(l.id, "not_reached", T0))!;
    const r = await spaeterMelden(l.id, { wahl: "2w" }, { now: T0 });
    expect(r).toMatchObject({ ok: true, weg: "pause", mail: null });
    const bis = new Date((r as { bis: string }).bis);
    // 2 Wochen ab Di 17.11. = Di 1.12., 10 Uhr Berlin
    expect(bis.toISOString()).toBe("2026-12-01T09:00:00.000Z");
    expect((await lead(l.id)).nachrichtenPausiertBis?.toISOString()).toBe(bis.toISOString());
    await runSequences(new Date(T0.getTime() + 3 * DAY));
    expect(send).not.toHaveBeenCalled();
    // Nächste Nachrichten zeigen die Schritte ab dem Tag (wie der Cron fortsetzt), weiter als pausiert
    const plan = (await loadNachrichtenPlan(l.id, new Date(T0.getTime() + H))).filter((e) => e.quelle === "abfolge");
    expect(plan[0]).toMatchObject({ at: bis.toISOString(), pausiert: true });
    // vor dem Tag: nichts
    expect(await pausenBeenden(new Date(bis.getTime() - H))).toBe(0);
    // am Tag: fortgesetzt, der erste Schritt ist ab dem Tag fällig
    expect(await pausenBeenden(bis)).toBe(1);
    const nach = await lead(l.id);
    expect(nach.nachrichtenPausiertAt).toBeNull();
    expect(nach.nachrichtenPausiertBis).toBeNull();
    expect((await prisma.leadSequence.findUniqueOrThrow({ where: { id: s.id } })).nextAt!.toISOString()).toBe(bis.toISOString());
    await runSequences(bis);
    expect(send).toHaveBeenCalledTimes(1);
    const verlauf = await prisma.leadHistory.findMany({ where: { leadId: l.id }, select: { text: true } }).catch(() => []);
    expect(verlauf.map((v) => v.text).join(" ")).toContain("Später melden");
  });

  it("ohne Datum: wie „Alle pausieren“, kein Tag, der Cron setzt nicht fort", async () => {
    const l = await neuerLead();
    await startSequence(l.id, "not_reached", T0);
    expect(await spaeterMelden(l.id, { ohneDatum: true }, { now: T0 })).toMatchObject({ ok: true, weg: "ohne_datum", bis: null });
    const x = await lead(l.id);
    expect(x.nachrichtenPausiertAt?.toISOString()).toBe(T0.toISOString());
    expect(x.nachrichtenPausiertBis).toBeNull();
    await pausenBeenden(new Date(T0.getTime() + 60 * DAY));
    expect((await lead(l.id)).nachrichtenPausiertAt).not.toBeNull();
  });

  it("mit Angebot: Bedenkzeit wie bisher (Nachfassen zum Angebot startet am Tag neu), eine Pause ohne Datum endet", async () => {
    const l = await neuerLead({ status: "Angebot gesendet" });
    await startAngebotNachfassen(l.id, "app", T0);
    await spaeterMelden(l.id, { ohneDatum: true }, { now: T0 });
    const r = await spaeterMelden(l.id, { wahl: "1w" }, { now: T0, mail: true });
    expect(r).toMatchObject({ ok: true, weg: "bedenkzeit", mail: "gesendet" });
    expect((await lead(l.id)).nachrichtenPausiertAt).toBeNull();
    const laufend = await prisma.leadSequence.findMany({ where: { leadId: l.id, stoppedAt: null }, select: { kind: true, nextAt: true } });
    expect(laufend).toEqual([{ kind: "offer_bedenkzeit", nextAt: new Date("2026-11-24T09:00:00.000Z") }]);
    // E-Mail „Wie besprochen“ mit dem Tag, einmal je Tag
    expect(mail).toHaveBeenCalledWith(l.id, "wie_besprochen", expect.objectContaining({ automatisch: false, anlass: "spaeter:2026-11-24", werte: { melde_wann: "am Dienstag, 24. November", melde_datum: "Dienstag, 24. November" } }));
  });

  it("ungültiges Datum: Fehler, nichts geändert", async () => {
    const l = await neuerLead();
    expect(await spaeterMelden(l.id, { datum: "2026-11-17" }, { now: T0 })).toMatchObject({ ok: false });
    expect((await lead(l.id)).nachrichtenPausiertAt).toBeNull();
  });
});
