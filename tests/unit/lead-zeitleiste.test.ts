// Diagnose q=lead-zeitleiste (Ole, 25.11.2026): reine Auswertung, anonym (Kürzel statt Namen und IDs).
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { median, zeitleisteAuswerten } from "@/lib/ops/lead-zeitleiste";

const t = (min: number) => new Date(Date.UTC(2026, 10, 20, 9, 0) + min * 60_000);
const now = new Date("2026-11-25T09:00:00Z");

describe("Lead-Zeitleiste", () => {
  it("Median", () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 10])).toBe(3);
  });

  it("je Lead Kontakt, Antwort, Reaktion, Termin, Aufgabe; je Berater Summen", () => {
    const r = zeitleisteAuswerten({
      now,
      nutzer: [{ id: "owner-x", teamRole: "owner" }, { id: "berater-y", teamRole: "advisor" }],
      leads: [
        { id: "lead-b", createdAt: t(60), source: "Kfz", status: "Nicht erreicht", assignedUserId: "berater-y", callAttempts: 2, reached: false, followUpAt: t(-10) },
        { id: "lead-a", createdAt: t(0), source: "Hausrat", status: "In Beratung", assignedUserId: "berater-y", callAttempts: 0, reached: true, followUpAt: null },
      ],
      nachrichten: [
        { leadId: "lead-a", direction: "outbound", sentBy: "system", sentByUserId: null, createdAt: t(1), errorCode: null },
        { leadId: "lead-a", direction: "inbound", sentBy: null, sentByUserId: null, createdAt: t(30), errorCode: null },
        { leadId: "lead-a", direction: "outbound", sentBy: "agent", sentByUserId: "berater-y", createdAt: t(45), errorCode: null },
        { leadId: "lead-b", direction: "outbound", sentBy: "system", sentByUserId: null, createdAt: t(61), errorCode: 131026 },
      ],
      anrufe: [{ leadId: "lead-b", userId: "berater-y", createdAt: t(200) }],
      termine: [{ leadId: "lead-a", createdAt: t(50), startsAt: t(60 * 24), status: "booked", attendance: null, bookedVia: "bot", angebotAbgelegtAt: null, angebotGesendetAt: null }],
      aufgaben: [],
    });
    expect(r.leads.map((l) => l.lead)).toEqual(["L1", "L2"]);
    const [a, b] = r.leads;
    expect(a).toMatchObject({
      produkt: "Hausrat",
      ersterKontakt: { wer: "Assistent", weg: "WhatsApp", minuten: 1 },
      ersteAntwortLead: { minutenNachEingang: 30 },
      ersteMenschlicheReaktion: { minuten: 15, weg: "WhatsApp", berater: "B1" },
      termin: { gebuchtUeber: "bot", minutenNachEingang: 50, ergebnis: "Ergebnis fehlt" },
      berater: "B1",
    });
    expect(b).toMatchObject({ zustellfehler: [131026], anrufe: { imVerlauf: 1, gezaehlteVersuche: 2, erreicht: false }, naechsteAufgabe: { art: "Wiedervorlage", ueberfaellig: true }, ersteAntwortLead: null, termin: null });
    expect(r.jeBerater).toEqual([{ berater: "B1", rolle: "Berater", leads: 2, reaktionen: 1, medianReaktionMin: 15, offeneAufgabenUeberfaellig: 1 }]);
    // Anonym: keine internen IDs in der Ausgabe
    expect(JSON.stringify(r)).not.toMatch(/lead-a|lead-b|berater-y|owner-x/);
  });
});
