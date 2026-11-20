// Spickzettel in der Terminvorbereitung (Policen auslesen, Paket 3): alle sieben Zustände mit nächster Handlung, Fragen
// aus derselben Quelle wie die Vertragsseite (höchstens 3, Rest als „Mehr“), Chat-Sparten ausblenden, Liste aufklappen.
import { describe, expect, it } from "vitest";
import type { Felder } from "@/lib/policen/auslesen/felder";
import { zusammenfassung } from "@/lib/policen/auslesen/zusammenfassung";
import { chatSpartenAusgelesen, spickzettel, SPICKZETTEL_TEXT, unterlagenAufgeklappt, type SpickzettelEingabe } from "@/lib/policen/auslesen/spickzettel";
import { GRUND_TEXT, K6_SATZ, kopfZeile, SPERRE_TEXT } from "@/lib/policen/auslesen/vertragsseite";

const NOW = new Date("2026-11-19T10:00:00Z");
const ok = (o: Record<string, string | number | boolean | string[]>): Felder => Object.fromEntries(Object.entries(o).map(([k, w]) => [k, { w, s: "ok" as const }]));
const leerZ = zusammenfassung([], NOW);
const ein = (x: Partial<SpickzettelEingabe>): SpickzettelEingabe => ({ sperre: null, vertraege: [], offen: [], zusammenfassung: leerZ, ...x });
const doc = (documentId: string, status: string) => ({ documentId, status, datum: "2026-11-18T09:00:00Z" });
const AUS = { gebetenAm: null, policenAn: true };

describe("Zustände ohne Unterlagen", () => {
  it("nie gebeten: automatisch, Assistent bittet", () => {
    const s = spickzettel(null, AUS)!;
    expect(s.zustand).toBe("nie_gebeten");
    expect(s.text).toBe(SPICKZETTEL_TEXT.nieGebeten);
  });
  it("gebeten: Datum in Europe/Berlin und Hinweis für den Termin", () => {
    const s = spickzettel(null, { gebetenAm: "2026-11-16T23:30:00Z", policenAn: true })!;
    expect(s.zustand).toBe("gebeten");
    expect(s.text).toBe("Um Policen gebeten am 17.11., noch keine Antwort.");
    expect(s.hinweis).toBe("Sonst im Termin nach den Policen fragen.");
  });
  it("ohne eingerichtete Policen-Funktion und ohne Bitte: nichts", () => {
    expect(spickzettel(null, { gebetenAm: null, policenAn: false })).toBeNull();
    expect(spickzettel(ein({}), { gebetenAm: null, policenAn: false })).toBeNull();
  });
});

describe("Zustände mit Unterlagen, aber ohne ausgelesene Verträge", () => {
  it("ohne KI: Text der Vertragsseite und Link zu den Unterlagen (keine Sackgasse), Liste aufgeklappt", () => {
    const s = spickzettel(ein({ sperre: "ohne_ki", offen: [doc("d1", "nicht_ausgelesen"), doc("d2", "nicht_ausgelesen")] }), AUS)!;
    expect(s.zustand).toBe("ohne_ki");
    expect(s.text).toBe(SPERRE_TEXT.ohne_ki);
    expect(s.aktion).toEqual({ art: "unterlagen", text: "Unterlagen ansehen" });
    expect(unterlagenAufgeklappt(s, 2)).toBe(true);
  });
  it("Sparte offen: Chips für die erste Unterlage, Anzahl im Text", () => {
    const s = spickzettel(ein({ offen: [doc("d1", "sparte_offen"), doc("d2", "sparte_abweichend")] }), AUS)!;
    expect(s.zustand).toBe("sparte_offen");
    expect(s.text).toBe("2 Unterlagen warten auf Ihre Sparten-Wahl.");
    expect(s.sparteWahl).toMatchObject({ documentId: "d1", frage: GRUND_TEXT.sparte_offen });
    expect(unterlagenAufgeklappt(s, 2)).toBe(false);
  });
  it("wird ausgelesen", () => {
    const s = spickzettel(ein({ offen: [doc("d1", "laeuft")] }), AUS)!;
    expect(s.zustand).toBe("wird_ausgelesen");
    expect(s.text).toBe(GRUND_TEXT.neu);
    expect(s.aktion).toBeNull();
  });
  it("gesperrt (BU ohne Freigabe): Link direkt zum Original", () => {
    const s = spickzettel(ein({ offen: [doc("d9", "gesperrt")] }), AUS)!;
    expect(s.zustand).toBe("gesperrt");
    expect(s.text).toBe(GRUND_TEXT.gesperrt);
    expect(s.aktion).toEqual({ art: "original", text: "Im Original ansehen", documentId: "d9" });
  });
  it("mehrere nicht ausgelesene: Link zur Liste", () => {
    const s = spickzettel(ein({ offen: [doc("d1", "gesperrt"), doc("d2", "limit")] }), AUS)!;
    expect(s.text).toBe("2 Unterlagen werden nicht automatisch ausgelesen.");
    expect(s.aktion?.art).toBe("unterlagen");
  });
  it("ohne Zustimmung zum Auslesen: Sperrtext der Vertragsseite; Funktion aus bzw. nicht freigeschaltet: still, Liste offen", () => {
    expect(spickzettel(ein({ sperre: "einwilligung", offen: [doc("d1", "nicht_ausgelesen")] }), AUS)).toMatchObject({ zustand: "gesperrt", text: SPERRE_TEXT.einwilligung });
    for (const sperre of ["aus", "kunde", "pause"]) {
      const s = spickzettel(ein({ sperre, offen: [doc("d1", "nicht_ausgelesen")] }), AUS);
      expect(s).toBeNull();
      expect(unterlagenAufgeklappt(s, 1)).toBe(true);
    }
  });
  it("Sperre geht der Sparten-Wahl vor (keine Chips ohne Erlaubnis)", () => {
    expect(spickzettel(ein({ sperre: "einwilligung", offen: [doc("d1", "sparte_offen")] }), AUS)?.sparteWahl).toBeNull();
  });
});

describe("fertig", () => {
  // Wie Termin 3 der Testdaten: Kfz mit Frist, Haftpflicht doppelt, Hausrat ohne Elementar, Rechtsschutz
  const vertraege = [
    { id: "kfz", sparte: "kfz" as const, felder: ok({ versicherer: "DEVK", beitrag: 812.4, zahlweise: "jaehrlich", ablauf: "2027-01-01", kuendigungsfrist_monate: 1 }), geprueft: false },
    { id: "h1", sparte: "haftpflicht" as const, felder: ok({ versicherer: "HUK-Coburg", beitrag: 68.5, zahlweise: "jaehrlich", ablauf: "2027-04-01", kuendigungsfrist_monate: 3 }), geprueft: false },
    { id: "h2", sparte: "haftpflicht" as const, felder: ok({ versicherer: "ERGO", beitrag: 5.2, zahlweise: "monatlich" }), geprueft: true },
    { id: "hr", sparte: "hausrat" as const, felder: ok({ versicherer: "Allianz", beitrag: 14.9, zahlweise: "monatlich", elementar: false, ablauf: "2027-03-01", kuendigungsfrist_monate: 1 }), geprueft: false },
    { id: "rs", sparte: "rechtsschutz" as const, felder: ok({ versicherer: "ARAG", beitrag: 29.8, zahlweise: "monatlich" }), geprueft: false },
  ];
  const z = zusammenfassung(vertraege, NOW);
  const v = ein({ vertraege: vertraege.map((x) => ({ geprueft: x.geprueft })), zusammenfassung: z });

  it("Kopf und Fragen sind wortgleich mit der Vertragsseite, höchstens 3, Rest als Anzahl", () => {
    const s = spickzettel(v, AUS)!;
    expect(s.zustand).toBe("fertig");
    expect(s.kopf).toEqual(kopfZeile(z));
    expect(s.kopf?.zeile).toContain("5 Verträge");
    expect(s.kopf?.zeile).toContain("4 bitte prüfen");
    expect(z.fragen.length).toBeGreaterThan(3);
    expect(s.fragen).toEqual(z.fragen.slice(0, 3));
    expect(s.mehr).toBe(z.fragen.length - 3);
    expect(s.fragen[0].text).toContain("Kündigung bis 30.11.");
    expect(s.ungeprueft).toBe(4);
  });
  it("Nebenzeilen und Sparten-Wahl für nicht ausgelesene Unterlagen (wie Termin 4)", () => {
    const s = spickzettel({ ...v, offen: [doc("d1", "sparte_offen"), doc("d2", "gesperrt"), doc("d3", "neu")] }, AUS)!;
    expect(s.zustand).toBe("fertig");
    expect(s.sparteWahl).toMatchObject({ documentId: "d1", text: "1 Unterlage wartet auf Ihre Sparten-Wahl." });
    expect(s.neben).toEqual(["1 Unterlage wird noch ausgelesen.", "1 Unterlage wird nicht automatisch ausgelesen."]);
  });
  it("K6-Satz ist derselbe wie auf der Vertragsseite", () => {
    expect(K6_SATZ).toBe("Maschinell ausgelesen: bitte vor dem Termin mit dem Original prüfen.");
  });
  it("Texte ohne Gedankenstriche, ohne Garantie und ohne Wertung", () => {
    const alle = [
      ...Object.values(SPICKZETTEL_TEXT).map((t) => (typeof t === "function" ? (t as (x: never) => string)(2 as never) : t)),
      SPICKZETTEL_TEXT.gebeten("2026-11-17T10:00:00Z"),
      K6_SATZ,
    ].join(" ");
    expect(alle).not.toMatch(/[–—]|Garantie|sparen|zu teuer|empfehlen|Lücke/i);
  });
});

describe("Chat-Verträge ausblenden", () => {
  it("nur Sparten mit Werten, Leben/Rente bleibt", () => {
    expect(
      chatSpartenAusgelesen([
        { sparte: "haftpflicht", status: "ausgelesen" },
        { sparte: "haftpflicht", status: "ausgelesen" },
        { sparte: "hausrat", status: "leer" },
        { sparte: "leben", status: "ausgelesen" },
        { sparte: "kfz", status: "ausgelesen" },
      ]),
    ).toEqual(["Haftpflicht", "Kfz"]);
  });
});

describe("Datum „gebeten am“ aus vorhandenen Strecken-Einträgen", () => {
  it("der Eintrag heißt wie in der WhatsApp-Strecke", async () => {
    const { POLICEN_BITTE_KIND } = await import("@/lib/policen/auslesen/server");
    const { STRECKE } = await import("@/lib/whatsapp/termin-strecke");
    expect(POLICEN_BITTE_KIND).toBe(STRECKE.policenBitte);
  });
});
