import { describe, expect, it } from "vitest";
import {
  dateiArt,
  dateiInfo,
  GESCHUETZT_LABEL,
  groesseText,
  istDateiPlatzhalter,
  leadMitGesundheitsbezug,
  nameAusText,
  pruefeGrund,
  supportZugriffText,
  textMitGesundheitsbezug,
  type DateiKontext,
  type DateiNachricht,
} from "@/lib/chat-dateien";
import { ERSTINFO_PDF_CAPTION } from "@/lib/whatsapp/ki-hinweis";
import { dateiMetadaten } from "@/lib/whatsapp/gateway";

const jetzt = new Date("2026-11-25T13:03:00Z"); // 14:03 Berlin
const nachricht = (x: Partial<DateiNachricht> = {}): DateiNachricht => ({
  id: "m1",
  direction: "outbound",
  kind: "document",
  body: "[document]",
  sentBy: "app",
  createdAt: jetzt,
  mediaId: "wamid-media-1",
  mediaName: "Angebot_Hausrat.pdf",
  mediaMime: "application/pdf",
  mediaSize: 120 * 1024,
  ...x,
});
const kontext = (x: Partial<DateiKontext> = {}): DateiKontext => ({ leadChat: true, leadSource: "Hausrat", leadName: "Max Muster", vermittlerName: "Anid Beispiel", now: jetzt, ...x });

describe("Dateien im Admin-Chat: Metadaten", () => {
  it("zeigt Name, Art, Größe und Absender wie im Beispiel", () => {
    const d = dateiInfo(nachricht(), kontext())!;
    expect(d.zeile).toBe("Angebot_Hausrat.pdf · PDF · 120 KB · von Anid");
    expect(d.details).toBe("PDF · 120 KB · von Anid · 25.11., 14:03");
    expect(d.geschuetzt).toBe(false);
    expect(d.zugriff).toBe("moeglich");
  });

  it("Absender: Lead mit Vorname, Assistent, Login mit Namen", () => {
    expect(dateiInfo(nachricht({ direction: "inbound", sentBy: null }), kontext({ leadChat: false }))!.von).toBe("Max");
    expect(dateiInfo(nachricht({ sentBy: "bot" }), kontext())!.von).toBe("Assistent");
    const k = kontext({ nutzerNamen: new Map([["u1", "Ole Kannapinn"]]) });
    expect(dateiInfo({ ...nachricht({ sentBy: "agent" }), sentByUserId: "u1" }, k)!.von).toBe("Ole");
  });

  it("Text und Termine sind keine Dateien", () => {
    expect(dateiInfo(nachricht({ kind: "text" }), kontext())).toBeNull();
    expect(dateiInfo(nachricht({ kind: "template" }), kontext())).toBeNull();
  });

  it("Erstinformation: Name aus dem gespeicherten Text, Inhalt über die eigene Adresse", () => {
    const body = `${ERSTINFO_PDF_CAPTION}\nErstinformation_Agentur.pdf\nhttps://app.test/erstinformation/abc`;
    expect(nameAusText(body)).toBe("Erstinformation_Agentur.pdf");
    const d = dateiInfo(nachricht({ sentBy: "bot", body, mediaName: null, mediaId: null, mediaLink: "https://app.test/x.pdf" }), kontext())!;
    expect(d.titel).toBe("Erstinformation_Agentur.pdf");
    expect(d.geschuetzt).toBe(false);
    expect(d.zugriff).toBe("moeglich");
  });

  it("ältere Nachricht ohne Media-ID: Name unbekannt, Inhalt liegt nicht bei uns", () => {
    const d = dateiInfo(nachricht({ mediaId: null, mediaName: null, mediaMime: null, mediaSize: null }), kontext())!;
    expect(d.titel).toBe("Datei");
    expect(d.zugriff).toBe("nicht_gespeichert");
  });

  it("Media-ID älter als 30 Tage: nicht mehr abrufbar", () => {
    const alt = new Date(jetzt.getTime() - 31 * 86_400_000);
    expect(dateiInfo(nachricht({ createdAt: alt }), kontext())!.zugriff).toBe("abgelaufen");
  });

  it("Support-Nummer: Metadaten ja, Support-Zugriff nein", () => {
    const d = dateiInfo(nachricht({ direction: "inbound", sentBy: null }), kontext({ leadChat: false, supportChat: true, leadSource: null }))!;
    expect(d.titel).toBe("Angebot_Hausrat.pdf");
    expect(d.zugriff).toBe("support");
  });

  it("Art, Größe, Platzhalter", () => {
    expect(dateiArt("image/jpeg", null)).toBe("Bild");
    expect(dateiArt(null, "Antrag.docx")).toBe("Word");
    expect(dateiArt("application/octet-stream", "x.bin")).toBe("Datei");
    expect(groesseText(1500 * 1024)).toBe("1,5 MB");
    expect(groesseText(null)).toBeNull();
    expect(istDateiPlatzhalter("[document]")).toBe(true);
    expect(istDateiPlatzhalter("Dokument empfangen")).toBe(true);
    expect(istDateiPlatzhalter("Hier das Angebot")).toBe(false);
  });
});

describe("Dateien im Admin-Chat: geschützt", () => {
  it("eingehende Datei im Lead-Chat (Policen-Ablage): ohne Namen, kein Support-Zugriff", () => {
    const d = dateiInfo(nachricht({ direction: "inbound", sentBy: null, mediaName: null, body: "Dokument empfangen" }), kontext())!;
    expect(d.titel).toBe(GESCHUETZT_LABEL);
    expect(d.name).toBeNull();
    expect(d.zeile.startsWith("Unterlage (geschützt) · PDF")).toBe(true);
    expect(d.zugriff).toBe("gesperrt");
  });

  it("Policen-Ablage (LeadDocument zur Nachricht)", () => {
    const d = dateiInfo(nachricht(), kontext({ ablage: new Map([["m1", { mimeType: "application/pdf", size: 1000 }]]) }))!;
    expect(d.geschuetzt).toBe(true);
    expect(d.zugriff).toBe("gesperrt");
  });

  it("Lead aus Kranken, BU, Leben: alles geschützt, Tierkranken nicht", () => {
    for (const source of ["PKV Vollversicherung", "Berufsunfähigkeit", "Risikolebensversicherung", "Zahnzusatz"]) {
      const d = dateiInfo(nachricht(), kontext({ leadSource: source }))!;
      expect(d.titel, source).toBe(GESCHUETZT_LABEL);
      expect(d.zeile, source).not.toContain("Angebot_Hausrat");
    }
    expect(leadMitGesundheitsbezug("Katzenkrankenversicherung")).toBe(false);
    expect(leadMitGesundheitsbezug("Hundekranken")).toBe(false);
    expect(dateiInfo(nachricht(), kontext({ leadSource: "Hundekrankenversicherung" }))!.geschuetzt).toBe(false);
  });

  it("Dateiname mit Gesundheitsbezug", () => {
    for (const name of ["BU_Antrag_Mueller.pdf", "Arztbrief_Diagnose.pdf", "Gesundheitsfragen_PKV.pdf", "Krankenversicherung_Angebot.pdf"]) {
      const d = dateiInfo(nachricht({ mediaName: name }), kontext())!;
      expect(d.titel, name).toBe(GESCHUETZT_LABEL);
      expect(d.zeile, name).not.toContain(name);
      expect(d.zugriff, name).toBe("gesperrt");
    }
    expect(textMitGesundheitsbezug("Angebot_Hausrat.pdf")).toBe(false);
    expect(textMitGesundheitsbezug(ERSTINFO_PDF_CAPTION)).toBe(false);
  });

  it("Begleittext mit Gesundheitsbezug", () => {
    const d = dateiInfo(nachricht({ body: "Hier die Unterlagen zu Ihrer Vorerkrankung" }), kontext())!;
    expect(d.geschuetzt).toBe(true);
  });
});

describe("Support-Zugriff: Grund und Mitteilung", () => {
  it("Grund ist Pflicht, mindestens 10 Zeichen", () => {
    expect(pruefeGrund("").ok).toBe(false);
    expect(pruefeGrund("zu kurz").ok).toBe(false);
    expect(pruefeGrund("   123456789   ").ok).toBe(false);
    const r = pruefeGrund("  Vermittler   bittet um Prüfung ");
    expect(r).toEqual({ ok: true, grund: "Vermittler bittet um Prüfung" });
    expect(pruefeGrund("x".repeat(301)).ok).toBe(false);
  });

  it("Mitteilungstext exakt, ohne Gedankenstriche", () => {
    const t = supportZugriffText({ adminName: "Ole Kannapinn", at: jetzt, dateiName: "Angebot_Hausrat.pdf", leadVorname: "Max", grund: "Vermittler bittet um Prüfung." });
    expect(t).toBe(
      "Ole Kannapinn hat am 25.11.2026 um 14:03 im Rahmen des Supports das Dokument „Angebot_Hausrat.pdf“ im Chat mit Max geöffnet. Grund: Vermittler bittet um Prüfung.",
    );
    expect(t).not.toMatch(/[–—]/);
  });
});

describe("Metadaten beim Empfang", () => {
  it("Lead-Chat: nur der Typ, kein Name, keine Media-ID", () => {
    expect(dateiMetadaten("document", { id: "x", mime_type: "application/pdf", filename: "Arztbrief.pdf" }, { nurTyp: true })).toEqual({ mediaMime: "application/pdf" });
  });
  it("WhatsApp-App bzw. Support-Nummer: Name, Typ, Media-ID", () => {
    expect(dateiMetadaten("document", { id: "x", mime_type: "application/pdf", filename: "Angebot/Hausrat.pdf", file_size: "2048" }, { nurTyp: false })).toEqual({
      mediaId: "x",
      mediaName: "Angebot_Hausrat.pdf",
      mediaMime: "application/pdf",
      mediaSize: 2048,
    });
    expect(dateiMetadaten("text", { id: "x" }, { nurTyp: false })).toEqual({});
  });
});
