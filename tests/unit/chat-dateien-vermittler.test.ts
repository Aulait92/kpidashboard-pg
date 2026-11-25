// Dateien im Chat für Vermittler (Ole, 25.11.2026, lib/chat-dateien.ts dateiFuerVermittler): Name, Art, Größe, Zeit;
// Öffnen frei bzw. mit Zwei-Faktor-Login bei Gesundheitsbezug, Policen-Ablage nur im Kontakt, alte Nachrichten ohne Daten.
import { describe, expect, it } from "vitest";
import { ALT_HINWEIS, dateiFuerVermittler, dateiVorschau, GESCHUETZT_LABEL, type DateiNachricht } from "@/lib/chat-dateien";

const jetzt = new Date("2026-11-25T14:00:00Z");
const m = (x: Partial<DateiNachricht> = {}): DateiNachricht => ({
  id: "m1",
  direction: "outbound",
  kind: "document",
  body: "[document]",
  sentBy: "app",
  createdAt: new Date("2026-11-25T13:03:00Z"),
  mediaId: "media-1",
  mediaName: "Angebot_Hausrat.pdf",
  mediaMime: "application/pdf",
  mediaSize: 120 * 1024,
  ...x,
});
const k = { leadChat: true, leadSource: "hausrat", leadId: "lead1", now: jetzt };

describe("dateiFuerVermittler", () => {
  it("eigene Datei: Name, Art, Größe, Zeit, Öffnen frei", () => {
    const d = dateiFuerVermittler(m(), k)!;
    expect(d).toMatchObject({ titel: "Angebot_Hausrat.pdf", art: "PDF", details: "PDF · 120 KB · 25.11., 14:03", geschuetzt: false, oeffnen: "frei", hinweis: null });
  });
  it("keine Datei: null", () => {
    expect(dateiFuerVermittler(m({ kind: "text" }), k)).toBeNull();
  });
  it("Gesundheitsbezug (Lead aus Kranken bzw. Dateiname): Name bleibt, Öffnen nur mit Zwei-Faktor-Login", () => {
    expect(dateiFuerVermittler(m(), { ...k, leadSource: "pkv" })).toMatchObject({ geschuetzt: true, oeffnen: "zwei_faktor", titel: "Angebot_Hausrat.pdf" });
    expect(dateiFuerVermittler(m({ mediaName: "Krankenversicherung_Angebot.pdf" }), k)).toMatchObject({ geschuetzt: true, oeffnen: "zwei_faktor" });
  });
  it("Policen-Ablage: kein Öffnen im Chat, Weg zu den Unterlagen im Kontakt (Name aus der Ablage)", () => {
    const ablage = new Map([["m1", { mimeType: "application/pdf", size: 2048, fileName: "Police_Kfz.pdf" }]]);
    const d = dateiFuerVermittler(m({ direction: "inbound", mediaId: null, mediaName: null, mediaSize: null }), { ...k, ablage })!;
    expect(d).toMatchObject({ titel: "Police_Kfz.pdf", oeffnen: null, kontaktHref: "/buyer/leads/lead1#dokumente", geschuetzt: true });
  });
  it("eingehende Datei im Lead-Chat ohne Ablage: nicht gespeichert, kein Öffnen", () => {
    const d = dateiFuerVermittler(m({ direction: "inbound", mediaId: null, mediaName: null, mediaSize: null, mediaMime: "image/jpeg", kind: "image" }), k)!;
    expect(d).toMatchObject({ titel: "Bild", oeffnen: null, hinweis: "Nicht in den Unterlagen gespeichert" });
  });
  it("alte Nachricht ohne Metadaten: „Datei“ mit Hinweis statt „[document]“", () => {
    const d = dateiFuerVermittler(m({ mediaId: null, mediaName: null, mediaMime: null, mediaSize: null }), k)!;
    expect(d).toMatchObject({ titel: "Datei", oeffnen: null, hinweis: ALT_HINWEIS });
    expect(ALT_HINWEIS).toBe("Vor dem 25.11. gesendet, nicht gespeichert");
  });
  it("Erstinformation mit eigener Adresse: Öffnen frei, auch nach 30 Tagen", () => {
    const d = dateiFuerVermittler(m({ sentBy: "bot", mediaId: null, mediaLink: "https://app.example.de/erstinformation/t/pdf?v=1", createdAt: new Date("2026-09-01T10:00:00Z") }), k)!;
    expect(d.oeffnen).toBe("frei");
  });
  it("Medien-ID älter als 30 Tage: nicht mehr abrufbar", () => {
    expect(dateiFuerVermittler(m({ createdAt: new Date("2026-10-01T10:00:00Z") }), k)).toMatchObject({ oeffnen: null, hinweis: "Nicht mehr abrufbar (älter als 30 Tage)" });
  });
  it("Admin-Vorschau: nie Öffnen, geschützt ohne Namen", () => {
    expect(dateiFuerVermittler(m(), { ...k, vorschau: true })).toMatchObject({ oeffnen: null, titel: "Angebot_Hausrat.pdf" });
    expect(dateiFuerVermittler(m(), { ...k, leadSource: "pkv", vorschau: true })).toMatchObject({ oeffnen: null, titel: GESCHUETZT_LABEL });
  });
});

describe("dateiVorschau (Chatliste)", () => {
  it("statt „[document]“ Art und Name, ohne Namen mit Gesundheitsbezug", () => {
    expect(dateiVorschau({ kind: "document", body: "[document]", mediaName: "Angebot.pdf" })).toBe("Datei: Angebot.pdf");
    expect(dateiVorschau({ kind: "document", body: "[document]", mediaName: "BU_Antrag.pdf" })).toBe("Datei");
    expect(dateiVorschau({ kind: "image", body: "[image]" })).toBe("Bild");
    expect(dateiVorschau({ kind: "document", body: "Hier das Angebot" })).toBeNull();
  });
});
