// WhatsApp über die Nummer aus der Online-Buchung (Ole, 23.11.2026, lib/whatsapp/buchungsnummer.ts): Formular-Nummer ohne
// WhatsApp, Lead bucht online mit anderer Handynummer. Übernahme, Wahl der Nummer, Nachtrag (Ops-Aktion) mit Vorlage.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  lead: null as null | Record<string, unknown>,
  leads: [] as { id: string }[],
  convs: [] as { id: string; customerId: string; contactPhone: string; leadId: string | null; optedOutAt: Date | null; botActive?: boolean; marker?: boolean }[],
  termine: [] as { conversationId: string | null; status: string; startsAt: Date; cancelledBy?: string | null; cancelledAt?: Date | null }[],
  verlauf: [] as { text: string }[],
  nachfassDoppelt: 0,
  history: vi.fn(async () => undefined),
  leadUpdate: vi.fn(async () => ({})),
  streckeUpdate: vi.fn(async () => ({ count: 1 })),
  messageCreate: vi.fn(async (a?: unknown) => ({ a })),
  send: vi.fn(),
  bestaetigung: vi.fn(async () => undefined),
  zeiten: null as null | { labels: string[]; payloads: string[]; starts: string[] },
  audit: vi.fn(async () => undefined),
}));

class NoTemplateError extends Error {}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    lead: {
      findUnique: async () => h.lead,
      findMany: async () => h.leads,
      update: h.leadUpdate,
    },
    conversation: {
      findUnique: async ({ where }: { where: { customerId_contactPhone: { contactPhone: string } } }) =>
        h.convs.find((c) => c.contactPhone === where.customerId_contactPhone.contactPhone) ?? null,
      findFirst: async ({ where }: { where: { leadId: string } }) => {
        const c = h.convs.filter((x) => x.leadId === where.leadId && x.marker && !x.optedOutAt).at(-1);
        return c ? { contactPhone: c.contactPhone } : null;
      },
      findMany: async ({ where }: { where: { id: { in: string[] } } }) => h.convs.filter((c) => where.id.in.includes(c.id)),
      upsert: async ({ where, create, update }: { where: { customerId_contactPhone: { contactPhone: string } }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
        let c = h.convs.find((x) => x.contactPhone === where.customerId_contactPhone.contactPhone);
        if (c) Object.assign(c, update);
        else {
          c = { id: `conv${h.convs.length + 1}`, ...(create as { customerId: string; contactPhone: string; leadId: string }), optedOutAt: null };
          h.convs.push(c);
        }
        return { id: c.id };
      },
    },
    whatsAppAccount: { findUnique: async () => ({ id: "wa1" }) },
    message: {
      count: async ({ where }: { where: { conversationId: string; kind?: string; purpose?: unknown } }) =>
        where.kind ? (h.convs.find((c) => c.id === where.conversationId)?.marker ? 1 : 0) : where.purpose ? h.nachfassDoppelt : 0,
      create: async (args: { data: { conversationId: string; kind: string } }) => {
        const c = h.convs.find((x) => x.id === args.data.conversationId);
        if (c && args.data.kind === "wa_nummer_uebernommen") c.marker = true;
        return h.messageCreate(args);
      },
    },
    leadMailStrecke: { updateMany: h.streckeUpdate },
    leadHistory: { findMany: async () => h.verlauf },
    appointment: {
      findMany: async () => h.termine.filter((t) => t.conversationId),
      findFirst: async ({ where }: { where: { status: string } }) => {
        const t = h.termine.find((x) => x.status === where.status && (where.status !== "booked" || x.startsAt.getTime() > Date.now()));
        return t ? { ...t, mode: "video", meetUrl: null, ort: null } : null;
      },
    },
  },
}));
vi.mock("@/lib/lead-history", () => ({ logLeadHistory: h.history }));
vi.mock("@/lib/audit", () => ({ audit: h.audit }));
vi.mock("@/lib/whatsapp/templates", () => ({
  NoTemplateError,
  sendWhatsAppNotice: h.send,
  firstNameOf: (n: string | null) => (n ?? "").split(" ")[0] || "du",
  noticeText: (purpose: string, an: string, _who: unknown, _k: unknown, rest: string[]) => `[${purpose}:${an}] ${rest.join(" | ")}`,
}));
vi.mock("@/lib/whatsapp/reminders", () => ({ anspracheOf: async () => "sie", sendBookingConfirmation: h.bestaetigung }));
vi.mock("@/lib/lead-anrede", () => ({ ansprechpartner: async () => ({ kontakt: { fullName: "Miroslaw Ignasiak" } }) }));
vi.mock("@/lib/whatsapp/termin-vorschlaege", () => ({ zweiTerminvorschlaege: async () => h.zeiten }));

import {
  buchungsnummerNachtragen,
  buchungsnummerUebernehmen,
  nummerAusVerlauf,
  uebernahmeNotiz,
  uebernimmBuchungsnummer,
  waNummerFuerLead,
} from "@/lib/whatsapp/buchungsnummer";
import { fuehreAktionAus } from "@/lib/ops-aktionen";
import { hatGedankenstrich } from "@/lib/gedankenstriche";

const FORM = "4915112345678";
const NEU = "491746112780";
const flagged = new Date("2026-11-23T10:00:00Z");

beforeEach(() => {
  h.lead = { id: "l1", customerId: "c1", name: "Miroslaw Ignasiak", phone: FORM, status: "Nicht erreicht", waUnavailableAt: flagged, outreachStatus: "no_whatsapp", erasedAt: null };
  h.leads = [{ id: "l1" }];
  h.convs = [{ id: "convForm", customerId: "c1", contactPhone: FORM, leadId: "l1", optedOutAt: null }];
  h.termine = [];
  h.verlauf = [];
  h.nachfassDoppelt = 0;
  h.zeiten = null;
  for (const f of [h.history, h.leadUpdate, h.streckeUpdate, h.messageCreate, h.send, h.bestaetigung, h.audit]) f.mockClear();
  h.send.mockReset();
  h.send.mockImplementation(async (o: { purpose: string }) => ({ mode: "template", purpose: o.purpose }));
});

describe("Wann wird die Nummer aus der Buchung übernommen?", () => {
  it("nur bei anderer, gültiger Nummer und Formular-Nummer ohne WhatsApp", () => {
    expect(buchungsnummerUebernehmen({ formPhone: FORM, neu: NEU, waUnavailableAt: flagged })).toBe(true);
    expect(buchungsnummerUebernehmen({ formPhone: FORM, neu: NEU, waUnavailableAt: null })).toBe(false);
    // gleiche Nummer in anderer Schreibweise
    expect(buchungsnummerUebernehmen({ formPhone: FORM, neu: "0151 12345678", waUnavailableAt: flagged })).toBe(false);
    expect(buchungsnummerUebernehmen({ formPhone: FORM, neu: "12", waUnavailableAt: flagged })).toBe(false);
    expect(buchungsnummerUebernehmen({ formPhone: null, neu: NEU, waUnavailableAt: flagged })).toBe(true);
  });

  it("liest die Nummer aus dem Verlaufseintrag der Buchung", () => {
    expect(nummerAusVerlauf(["Anruf", "Online-Buchung mit abweichender Handynummer +491746112780. Die Nummer aus dem Formular bleibt gespeichert, Bestätigung an die neue Nummer."])).toBe(NEU);
    expect(nummerAusVerlauf(["nichts"])).toBeNull();
  });

  it("Verlaufstext ohne Gedankenstrich, mit Nummer", () => {
    const t = uebernahmeNotiz(NEU);
    expect(t).toContain("WhatsApp jetzt über die Nummer aus der Online-Buchung +491746112780");
    expect(hatGedankenstrich(t)).toBe(false);
  });
});

describe("Übernahme", () => {
  it("Chat der neuen Nummer am Lead, Assistent an, Sperre und Strecke aus, Verlauf; Formular-Nummer bleibt", async () => {
    const r = await uebernimmBuchungsnummer("l1", "+49 174 6112780");
    expect(r).toMatchObject({ ok: true, nummer: NEU, schon: false });
    const c = h.convs.find((x) => x.contactPhone === NEU)!;
    expect(c).toMatchObject({ leadId: "l1", botActive: true, marker: true });
    expect(h.leadUpdate).toHaveBeenCalledWith({ where: { id: "l1" }, data: { waUnavailableAt: null, outreachStatus: "skipped_booked" } });
    expect(JSON.stringify(h.leadUpdate.mock.calls)).not.toContain('"phone"');
    expect(h.streckeUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { leadId: "l1", schritt: { in: ["neu", "erstmail", "sms"] } }, data: expect.objectContaining({ schritt: "gestoppt" }) }));
    expect(h.history).toHaveBeenCalledWith("l1", "status", expect.stringContaining("WhatsApp jetzt über die Nummer aus der Online-Buchung"), expect.anything());
    // zweites Mal: kein zweiter Merker, kein zweiter Verlaufseintrag
    const r2 = await uebernimmBuchungsnummer("l1", NEU);
    expect(r2).toMatchObject({ ok: true, schon: true });
    expect(h.history).toHaveBeenCalledTimes(1);
  });

  it("nicht bei gleicher Nummer, fremdem Chat oder STOPP", async () => {
    expect(await uebernimmBuchungsnummer("l1", "015112345678")).toEqual({ ok: false, grund: "gleiche_nummer" });
    h.convs.push({ id: "fremd", customerId: "c1", contactPhone: NEU, leadId: "l2", optedOutAt: null });
    expect(await uebernimmBuchungsnummer("l1", NEU)).toEqual({ ok: false, grund: "anderer_lead" });
    h.convs.at(-1)!.leadId = null;
    h.convs.at(-1)!.optedOutAt = new Date();
    expect(await uebernimmBuchungsnummer("l1", NEU)).toEqual({ ok: false, grund: "abgemeldet" });
    expect(h.leadUpdate).not.toHaveBeenCalled();
  });

  it("Nachfass-Abfolgen nutzen die übernommene Nummer, sonst Lead.phone", async () => {
    expect(await waNummerFuerLead({ id: "l1", customerId: "c1", phone: FORM })).toBe(FORM);
    await uebernimmBuchungsnummer("l1", NEU);
    expect(await waNummerFuerLead({ id: "l1", customerId: "c1", phone: FORM })).toBe(NEU);
  });
});

describe("Nachtrag (Ops-Aktion whatsapp_buchungsnummer)", () => {
  const absage = () => {
    h.convs.push({ id: "convNeu", customerId: "c1", contactPhone: NEU, leadId: "l1", optedOutAt: null });
    h.termine = [{ conversationId: "convNeu", status: "cancelled", cancelledBy: "lead", cancelledAt: new Date(Date.now() - 3600_000), startsAt: new Date(Date.now() + 86400_000) }];
  };

  it("Nummer aus dem Termin, dann Vorlage „Nachfassen nach verpasstem Termin“ an die neue Nummer", async () => {
    absage();
    const r = await buchungsnummerNachtragen("l1");
    expect(r).toMatchObject({ ok: true, nummer: NEU, uebernommen: true, nachricht: { gesendet: true, zweck: "followup_noshow", modus: "template" } });
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.send.mock.calls[0][0]).toMatchObject({ to: NEU, purpose: "followup_noshow", leadId: "l1", params: ["Miroslaw"] });
  });

  it("Nummer aus dem Verlauf, wenn kein Termin-Chat mit anderer Nummer da ist", async () => {
    h.verlauf = [{ text: "Online-Buchung mit abweichender Handynummer +491746112780. Die Nummer aus dem Formular bleibt gespeichert, Bestätigung an die neue Nummer." }];
    h.termine = [{ conversationId: null, status: "cancelled", cancelledBy: "lead", cancelledAt: new Date(), startsAt: new Date() }];
    const r = await buchungsnummerNachtragen("l1");
    expect(r).toMatchObject({ ok: true, nummer: NEU });
  });

  it("Vorlage nicht freigegeben: followup mit zwei Zeiten, sonst followup_nudge, sonst Grund", async () => {
    absage();
    h.zeiten = { labels: ["Mo 10 Uhr", "Di 14 Uhr"], payloads: ["slot:a", "slot:b"], starts: ["a", "b"] };
    h.send.mockImplementation(async (o: { purpose: string }) => {
      if (o.purpose === "followup_noshow") throw new NoTemplateError("x");
      return { mode: "template", purpose: o.purpose };
    });
    const r = await buchungsnummerNachtragen("l1");
    expect(r).toMatchObject({ ok: true, nachricht: { gesendet: true, zweck: "followup" } });
    expect(h.send.mock.calls[1][0]).toMatchObject({ purpose: "followup", params: ["Miroslaw", "Mo 10 Uhr", "Di 14 Uhr"], buttonPayloads: ["slot:a", "slot:b"] });

    h.send.mockReset();
    h.send.mockImplementation(async () => {
      throw new NoTemplateError("x");
    });
    h.nachfassDoppelt = 0;
    const r2 = await buchungsnummerNachtragen("l1");
    expect(r2).toMatchObject({ ok: true, uebernommen: false, nachricht: { gesendet: false, grund: expect.stringContaining("Keine freigegebene Vorlage") } });
  });

  it("Schutz: nicht markiert, keine Nummer, schon nachgefasst, kommender Termin = Bestätigung", async () => {
    h.lead = { ...h.lead!, waUnavailableAt: null };
    expect(await buchungsnummerNachtragen("l1")).toMatchObject({ ok: false, error: expect.stringContaining("nicht als „kein WhatsApp“") });

    h.lead = { ...h.lead!, waUnavailableAt: flagged };
    expect(await buchungsnummerNachtragen("l1")).toMatchObject({ ok: false, error: expect.stringContaining("Keine abweichende Nummer") });

    absage();
    h.nachfassDoppelt = 1;
    expect(await buchungsnummerNachtragen("l1")).toMatchObject({ ok: true, nachricht: null, hinweis: expect.stringContaining("schon raus") });
    expect(h.send).not.toHaveBeenCalled();

    h.termine.push({ conversationId: "convNeu", status: "booked", startsAt: new Date(Date.now() + 2 * 86400_000) });
    expect(await buchungsnummerNachtragen("l1")).toMatchObject({ ok: true, nachricht: "terminbestaetigung" });
    expect(h.bestaetigung).toHaveBeenCalledWith(expect.objectContaining({ to: NEU, leadId: "l1" }));
  });

  it("Ops-Aktion: Name nötig, eindeutiger Lead, Ergebnis mit Vorlage und Audit", async () => {
    expect(await fuehreAktionAus("whatsapp_buchungsnummer", { customerId: "c1", name: "Ig" })).toEqual({ ok: false, error: "Name zu kurz." });
    h.leads = [{ id: "l1" }, { id: "l2" }];
    expect(await fuehreAktionAus("whatsapp_buchungsnummer", { customerId: "c1", name: "Ignasiak" })).toMatchObject({ ok: false, error: "2 passende Leads, bitte genauer." });
    h.leads = [{ id: "l1" }];
    absage();
    const r = await fuehreAktionAus("whatsapp_buchungsnummer", { customerId: "c1", name: "Ignasiak" });
    expect(r).toMatchObject({ ok: true, info: expect.stringContaining("Vorlage followup_noshow") });
    expect(h.audit).toHaveBeenCalledWith("lead.whatsapp_buchungsnummer", expect.objectContaining({ entityId: "l1", details: expect.objectContaining({ nummer: "…2780", nachricht: "followup_noshow" }) }));
  });
});
