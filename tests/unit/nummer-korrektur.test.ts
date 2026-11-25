// Nummer korrigiert: Sperre „kein WhatsApp“ fällt weg, neuer Versuch (Ole, 22.11.2026)
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  lead: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  conversation: { updateMany: vi.fn() },
  appointment: { findFirst: vi.fn() },
}));
const bestaetigung = vi.hoisted(() => vi.fn());
const outreach = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/monitoring", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/whatsapp/reminders", () => ({ sendBookingConfirmation: bestaetigung }));
vi.mock("@/lib/whatsapp/outreach", () => ({ runOutreach: outreach }));

import { nachNummernKorrektur } from "@/lib/whatsapp/kein-whatsapp";

const lead = (o: Record<string, unknown> = {}) => ({ id: "l1", customerId: "c1", name: "Herr Defontaine", phone: "491752429849", waUnavailableAt: new Date(), erasedAt: null, isTest: false, outreachStatus: "sent", ...o });

describe("nachNummernKorrektur", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.lead.updateMany.mockResolvedValue({ count: 1 });
  });

  it("mit Termin: Sperre weg, Assistent an, Terminbestätigung an die neue Nummer", async () => {
    db.lead.findUnique.mockResolvedValue(lead());
    db.appointment.findFirst.mockResolvedValue({ startsAt: new Date("2026-11-24T09:00:00Z"), mode: "video", meetUrl: null, ort: null });
    expect(await nachNummernKorrektur("l1", new Date("2026-11-22T12:00:00Z"))).toBe("termin");
    // Atomar (25.11.2026): nur wenn noch gesperrt, sonst hat ein paralleler Klick schon übernommen
    expect(db.lead.updateMany).toHaveBeenCalledWith({ where: { id: "l1", waUnavailableAt: { not: null } }, data: { waUnavailableAt: null, outreachAt: null, outreachStatus: null } });
    expect(db.conversation.updateMany).toHaveBeenCalledWith({ where: { customerId: "c1", leadId: "l1" }, data: { botActive: true } });
    expect(bestaetigung).toHaveBeenCalledWith(expect.objectContaining({ to: "491752429849", leadId: "l1", mode: "video" }));
    expect(outreach).not.toHaveBeenCalled();
  });

  it("Erstanschreiben kam nie an (Defontaine): zuerst das Erstanschreiben, auch mit Termin", async () => {
    db.lead.findUnique.mockResolvedValue(lead({ outreachStatus: "no_whatsapp" }));
    db.appointment.findFirst.mockResolvedValue({ startsAt: new Date("2026-11-24T09:00:00Z"), mode: "video", meetUrl: null, ort: null });
    expect(await nachNummernKorrektur("l1", new Date("2026-11-22T12:00:00Z"))).toBe("erstanschreiben");
    expect(outreach).toHaveBeenCalledWith("c1", { leadIds: ["l1"] });
    expect(bestaetigung).not.toHaveBeenCalled();
  });

  it("ohne Termin: Erstanschreiben nur für diesen Lead", async () => {
    db.lead.findUnique.mockResolvedValue(lead());
    db.appointment.findFirst.mockResolvedValue(null);
    expect(await nachNummernKorrektur("l1")).toBe("erstanschreiben");
    expect(outreach).toHaveBeenCalledWith("c1", { leadIds: ["l1"] });
  });

  it("Doppelklick: der zweite Aufruf findet die Sperre schon aufgehoben, nichts", async () => {
    db.lead.findUnique.mockResolvedValue(lead());
    db.lead.updateMany.mockResolvedValue({ count: 0 });
    expect(await nachNummernKorrektur("l1")).toBe("nichts");
    expect(outreach).not.toHaveBeenCalled();
    expect(bestaetigung).not.toHaveBeenCalled();
  });

  it("war nicht gesperrt: nichts", async () => {
    db.lead.findUnique.mockResolvedValue(lead({ waUnavailableAt: null }));
    expect(await nachNummernKorrektur("l1")).toBe("nichts");
    expect(db.lead.update).not.toHaveBeenCalled();
  });
});
