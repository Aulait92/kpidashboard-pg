// Keine WhatsApp an Festnetznummern (Ole, 20.11.2026, lib/whatsapp/festnetz.ts).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  conversation: { findUnique: vi.fn() },
  message: { count: vi.fn() },
  lead: { findFirst: vi.fn() },
}));
const mark = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/monitoring", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/whatsapp/kein-whatsapp", () => ({ markLeadNoWhatsApp: mark }));

import { FESTNETZ_REASON, FESTNETZ_VERLAUF, festnetzSperrt, pruefeFestnetz, WhatsAppFestnetzError } from "@/lib/whatsapp/festnetz";
import { WhatsAppUnavailableError } from "@/lib/whatsapp/stopp";
import { istFestnetz, istMobil } from "@/lib/telefon-typ";
import { hatGedankenstrich } from "@/lib/gedankenstriche";

const FESTNETZ = "493012345678"; // Berlin
const MOBIL = "4915112345678";

beforeEach(() => {
  vi.clearAllMocks();
  db.conversation.findUnique.mockResolvedValue(null);
  db.message.count.mockResolvedValue(0);
  db.lead.findFirst.mockResolvedValue(null);
  mark.mockResolvedValue("flagged");
});

describe("Art der Nummer", () => {
  it("Festnetz sicher erkannt, Mobil nicht als Festnetz", async () => {
    expect(await istFestnetz(FESTNETZ)).toBe(true);
    expect(await istFestnetz(`+${FESTNETZ}`)).toBe(true);
    expect(await istFestnetz(MOBIL)).toBe(false);
    expect(await istMobil(MOBIL)).toBe(true);
  });

  it("unbekannte bzw. ungültige Nummern sind kein Festnetz", async () => {
    for (const n of [null, undefined, "", "12345", "490000000", "abc", "4930"]) expect(await istFestnetz(n), String(n)).toBe(false);
  });

  it("sperrt nur, solange der Kontakt nie selbst geschrieben hat", () => {
    expect(festnetzSperrt({ festnetz: true, eingehend: 0 })).toBe(true);
    expect(festnetzSperrt({ festnetz: true, eingehend: 1 })).toBe(false);
    expect(festnetzSperrt({ festnetz: false, eingehend: 0 })).toBe(false);
  });
});

describe("pruefeFestnetz (vor jedem Versand)", () => {
  it("Festnetz: nicht senden, Lead in den Anrufweg", async () => {
    const err = await pruefeFestnetz({ customerId: "c1", to: FESTNETZ, leadId: "l1" }).catch((e) => e);
    expect(err).toBeInstanceOf(WhatsAppFestnetzError);
    // Aufrufer (Erstanschreiben, Abfolgen) behandeln es wie „kein WhatsApp“
    expect(err).toBeInstanceOf(WhatsAppUnavailableError);
    expect(mark).toHaveBeenCalledWith("l1", expect.objectContaining({ grund: "festnetz" }));
  });

  it("Festnetz ohne leadId: Lead über die Nummer finden", async () => {
    db.lead.findFirst.mockResolvedValue({ id: "l2" });
    await expect(pruefeFestnetz({ customerId: "c1", to: FESTNETZ })).rejects.toBeInstanceOf(WhatsAppFestnetzError);
    expect(mark).toHaveBeenCalledWith("l2", expect.objectContaining({ grund: "festnetz" }));
  });

  it("Festnetz, aber der Kontakt hat selbst geschrieben: senden", async () => {
    db.conversation.findUnique.mockResolvedValue({ id: "k1", leadId: "l1" });
    db.message.count.mockResolvedValue(2);
    await expect(pruefeFestnetz({ customerId: "c1", to: FESTNETZ, leadId: "l1" })).resolves.toBeUndefined();
    expect(mark).not.toHaveBeenCalled();
  });

  it("Mobil: senden", async () => {
    await expect(pruefeFestnetz({ customerId: "c1", to: MOBIL, leadId: "l1" })).resolves.toBeUndefined();
    expect(mark).not.toHaveBeenCalled();
    expect(db.message.count).not.toHaveBeenCalled();
  });

  it("unbekannt bzw. ungültig: senden (nicht blockieren)", async () => {
    for (const to of ["12345", "490000000", "999123456789"]) {
      await expect(pruefeFestnetz({ customerId: "c1", to, leadId: "l1" }), to).resolves.toBeUndefined();
    }
    expect(mark).not.toHaveBeenCalled();
  });
});

describe("Einbau und Texte", () => {
  const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it("beide zentralen Versandwege prüfen vor dem Versand", () => {
    const tpl = src("src/lib/whatsapp/templates.ts");
    expect(tpl.indexOf("pruefeFestnetz(")).toBeGreaterThan(-1);
    expect(tpl.indexOf("pruefeFestnetz(")).toBeLessThan(tpl.indexOf("await sendTemplate("));
    const gw = src("src/lib/whatsapp/gateway.ts");
    const fn = gw.slice(gw.indexOf("export async function sendWhatsAppMessage"));
    expect(fn.indexOf("pruefeFestnetz(")).toBeGreaterThan(-1);
    expect(fn.indexOf("pruefeFestnetz(")).toBeLessThan(fn.indexOf("await sendTemplate("));
  });

  it("Texte für Vermittler ohne Gedankenstriche", () => {
    expect(FESTNETZ_REASON).toBe("Keine Handynummer: bitte anrufen");
    for (const t of [FESTNETZ_REASON, FESTNETZ_VERLAUF, new WhatsAppFestnetzError().message]) expect(hatGedankenstrich(t), t).toBe(false);
  });
});
