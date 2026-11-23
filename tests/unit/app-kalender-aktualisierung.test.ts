// App-Kalender: Aktualisierung behält Name und Angaben (Ole, 21.11.2026: im Allianz-Kalender stand nach einer
// Änderung nur noch „Beratungstermin“ ohne Namen).
import { describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  lead: { findUnique: vi.fn() },
  conversation: { findUnique: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { eintragText } from "@/lib/calendar/app-kalender";

const termin = {
  customerId: "c1",
  startsAt: new Date("2026-11-24T08:00:00Z"),
  endsAt: new Date("2026-11-24T08:45:00Z"),
  meetUrl: "https://allianz.webex.com/meet/lohmann",
  mode: "video",
  ort: null,
  leadId: "l1",
  conversationId: "k1",
  bookedVia: "bot",
};

describe("eintragText", () => {
  it("Titel und Beschreibung mit Name, Nummer und Qualifizierung wie bei der Buchung", async () => {
    db.lead.findUnique.mockResolvedValue({ name: "Frau Schneider", phone: "491701234567", email: null, source: "Hausrat" });
    db.conversation.findUnique.mockResolvedValue({ contactName: "Anna", contactPhone: "491701234567", contactEmail: "anna@example.de", qualificationSummary: "Hausrat, 80 qm" });
    const t = await eintragText(termin);
    expect(t.summary).toBe("Video-Beratung: Frau Schneider (Hausrat)");
    expect(t.description).toContain("Lead: Frau Schneider");
    expect(t.description).toContain("491701234567");
    expect(t.description).toContain("anna@example.de");
    expect(t.description).toContain("Hausrat, 80 qm");
    expect(t.description).toContain("KI-Assistenten");
  });

  it("ohne Termin bzw. ohne Namen bleibt es beim neutralen Titel", async () => {
    expect(await eintragText(null)).toEqual({ summary: "Beratungstermin", description: "" });
    db.lead.findUnique.mockResolvedValue({ name: "", phone: null, email: null, source: null });
    db.conversation.findUnique.mockResolvedValue(null);
    expect((await eintragText(termin)).summary).toBe("Beratungstermin");
  });
});
