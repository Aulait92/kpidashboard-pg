import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { eigeneAntwortNach, mitVideo, nachfassenAm } from "@/lib/vertrieb/instantly-eigene-antwort";
import type { ApiEmail } from "@/lib/vertrieb/instantly";

const mail = (ue: number, iso: string, id = iso): ApiEmail =>
  ({ id, ue_type: ue, timestamp_email: iso, timestamp_created: iso, subject: "AW", from_address_email: null, body: null, content_preview: null, lead: null, campaign_id: null, thread_id: "t", is_auto_reply: 0 }) as ApiEmail;

// Eigene Antwort in Instantly → Nachfassen in 2 Werktagen (Ole, 24.11.2026)
describe("eigene Antwort in Instantly", () => {
  it("findet nur unsere von Hand gesendete Mail nach der Antwort des Kontakts", () => {
    const antwort = new Date("2026-11-21T17:05:00Z");
    const thread = [mail(1, "2026-11-20T08:00:00Z"), mail(2, "2026-11-21T17:05:00Z"), mail(3, "2026-11-24T09:00:00Z", "a"), mail(3, "2026-11-25T09:00:00Z", "b")];
    expect(eigeneAntwortNach(thread, antwort)?.id).toBe("a");
    expect(eigeneAntwortNach([mail(1, "2026-11-20T08:00:00Z"), mail(2, "2026-11-21T17:05:00Z")], antwort)).toBeNull();
    // Von Hand, aber vor der Antwort: zählt nicht
    expect(eigeneAntwortNach([mail(3, "2026-11-21T10:00:00Z")], antwort)).toBeNull();
  });

  it("Video erkannt (Wort oder Link), Videocall nicht", () => {
    expect(mitVideo("Hier das Video: https://app.performancegrowth.de/praesentation/x")).toBe(true);
    expect(mitVideo("anbei das kurze Erklärvideo")).toBe(true);
    expect(mitVideo("https://www.loom.com/share/abc")).toBe(true);
    expect(mitVideo("Gern, lassen Sie uns einen Videocall machen")).toBe(false);
    expect(mitVideo(null)).toBe(false);
  });

  it("fällig 2 Werktage später um 9 Uhr deutscher Zeit, über das Wochenende", () => {
    expect(nachfassenAm(new Date("2026-11-24T10:00:00Z")).toISOString()).toBe("2026-11-26T08:00:00.000Z");
    // Freitag → Dienstag
    expect(nachfassenAm(new Date("2026-11-27T15:00:00Z")).toISOString()).toBe("2026-12-01T08:00:00.000Z");
  });
});
