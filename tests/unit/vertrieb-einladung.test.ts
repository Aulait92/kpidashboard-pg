import { describe, expect, it } from "vitest";
import { gastBeschreibung, teamMailContent } from "@/lib/vertrieb/buchung";

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

// Mail an uns bei Buchung, Verschiebung und Absage über /termin (Ole, 19.11.2026)
describe("Vertriebsbuchung: Mail an uns", () => {
  const base = {
    title: "Meta-Leads-Call mit Ole Kannapinn",
    startAt: new Date("2026-11-24T09:00:00Z"),
    name: "Julian Bothe",
    email: "julian@example.de",
    joinUrl: "https://meet.example/x",
    answers: "Agentur/Firma: Agentur Bothe\nTelefon: +4915112345678\nNachricht: Bitte PKV",
  };
  it("Buchung: Betreff mit Name und Zeit, alle Angaben, Videolink", () => {
    const c = teamMailContent("booked", base);
    expect(c.subject).toBe("Neuer Termin: Julian Bothe, Di., 24.11., 10:00 Uhr");
    expect(c.paragraphs[0]).toContain("hat einen Meta-Leads-Call mit Ole Kannapinn gebucht: Dienstag, 24. November um 10:00 Uhr");
    expect(c.list).toEqual(["E-Mail: julian@example.de", "Agentur/Firma: Agentur Bothe", "Telefon: +4915112345678", "Nachricht: Bitte PKV", "Videocall: https://meet.example/x"]);
  });
  it("Verschiebung nennt alte und neue Zeit, Absage den Grund", () => {
    expect(teamMailContent("rescheduled", { ...base, previousStartAt: new Date("2026-11-23T09:00:00Z") }).paragraphs[0]).toMatch(/Neu: Dienstag.*\(war Montag/);
    const cancel = teamMailContent("cancelled", { ...base, reason: "Krank" });
    expect(cancel.subject).toMatch(/^Termin abgesagt: Julian Bothe/);
    expect(cancel.list).toContain("Grund: Krank");
    expect(cancel.list.some((l) => l.startsWith("Videocall"))).toBe(false);
  });
});
