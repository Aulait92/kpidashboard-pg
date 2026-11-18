import { describe, expect, it } from "vitest";
import { gastBeschreibung } from "@/lib/vertrieb/buchung";

// Einladung zum Salescall: Gäste sehen keine Interna (Ole, 18.11.2026, Fall Einladung an einen Interessenten vom 17.11.)
describe("Kalendereinladung Vertrieb: Beschreibung für Gäste", () => {
  const base = { name: "Julian Bothe", videoUrl: null, phone: "+4915112345678", manageUrl: "https://app.example/termin/verwalten/abc" };
  it("Video: Begrüßung, Verschieben/Absagen, Gruß; kein CRM-Link, keine Interna", () => {
    const d = gastBeschreibung({ ...base, mode: "video" });
    expect(d.startsWith("Guten Tag Herr Bothe,")).toBe(true);
    expect(d).toContain("Verschieben oder absagen: https://app.example/termin/verwalten/abc");
    expect(d).not.toMatch(/admin|CRM|vom Team|Buchungsseite|E-Mail:/i);
    expect(d).not.toMatch(/[–—]/);
  });
  it("fester Videolink und Telefon", () => {
    expect(gastBeschreibung({ ...base, mode: "video", videoUrl: "https://meet.example/x" })).toContain("Videocall: https://meet.example/x");
    expect(gastBeschreibung({ ...base, mode: "phone" })).toContain("Ich rufe Sie zur vereinbarten Zeit unter +4915112345678 an.");
  });
});
