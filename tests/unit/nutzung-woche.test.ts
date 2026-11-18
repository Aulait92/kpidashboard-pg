// Usability-Woche (Diagnose q=nutzung-woche): reiner Kern ohne Datenbank. Nur Zahlen, keine Namen, IDs oder Texte.
import { describe, expect, it } from "vitest";
import { auswerten, fehlerName, hilfeThema, median, prozent, rangliste, seitenName, tageAus, vergleich, type Rohdaten } from "@/lib/ops/nutzung-woche";

const NOW = new Date("2026-11-18T12:00:00Z");
const min = (m: number) => new Date(NOW.getTime() - 3 * 24 * 3600 * 1000 + m * 60000);

function roh(extra: Partial<Rohdaten> = {}): Rohdaten {
  return {
    tage: 7,
    now: NOW,
    kunden: { gesamt: 10, software: 8 },
    aktiv: [
      { periode: "a", kunden: 4, nutzer: 6, kundentage: 10 },
      { periode: "v", kunden: 2, nutzer: 2, kundentage: 3 },
    ],
    ereignisse: [],
    audit: [],
    hilfe: [],
    support: [],
    umfrage: [],
    aufgaben: { wiedervorlagenOffen: 20, wiedervorlagenFaellig: 8, wiedervorlagenUeber24h: 5, aufgabenWartend: 3, aufgabenWartendFaellig: 1, termine30Tage: 10, termineOhneErgebnis: 2 },
    naechsterSchritt: { offen: 40, ohne: 10, ergebnisFehlt: 3 },
    reaktion: [],
    admin: null,
    ...extra,
  };
}

describe("Helfer", () => {
  it("tage: Standard 7, 1 bis 30", () => {
    expect(tageAus(new URLSearchParams())).toBe(7);
    expect(tageAus(new URLSearchParams("tage=0"))).toBe(7);
    expect(tageAus(new URLSearchParams("tage=14"))).toBe(14);
    expect(tageAus(new URLSearchParams("tage=400"))).toBe(30);
  });

  it("Prozent, Vergleich, Median", () => {
    expect(prozent(1, 3)).toBe(33.3);
    expect(prozent(1, 0)).toBeNull();
    expect(vergleich(15, 10)).toEqual({ aktuell: 15, vorher: 10, veraenderungProzent: 50 });
    expect(vergleich(3, 0).veraenderungProzent).toBeNull();
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it("Seiten ohne IDs und Abfrage", () => {
    expect(seitenName("/buyer/leads/[id]")).toBe("/buyer/leads/[id]");
    expect(seitenName("/buyer/termine/cmh3x9k2a0001qz8y7v6u5t4s/vorbereitung")).toBe("/buyer/termine/[id]/vorbereitung");
    expect(seitenName("/buyer/kontakte/123?q=Max")).toBe("/buyer/kontakte/[id]");
    expect(seitenName("/buyer/einstellungen")).toBe("/buyer/einstellungen");
  });

  it("Fehler-Toasts ohne E-Mails, Nummern und Zitate", () => {
    expect(fehlerName("toast: Senden hat nicht geklappt.")).toBe("Senden hat nicht geklappt.");
    const s = fehlerName("toast: „Max Mustermann“ max@example.com +49 151 1234567 hat 3 offene");
    expect(s).not.toMatch(/Max|example|151|1234567/);
    expect(s).toContain("[E-Mail]");
    expect(s).toContain("[Nummer]");
    expect(fehlerName("toast: Police_Mustermann.pdf: höchstens 8 MB.")).toBe("[Datei]: höchstens N MB.");
    expect(fehlerName("toast: ")).toBe("(ohne Text)");
  });

  it("Hilfe-Themen nach Stichwörtern", () => {
    expect(hilfeThema("Wie verbinde ich WhatsApp?")).toBe("WhatsApp");
    expect(hilfeThema("Wo finde ich meine Rechnung?")).toBe("Abrechnung/Rechnung");
    expect(hilfeThema("Wie verschiebe ich einen Termin im Kalender?")).toBe("Termine/Kalender");
    expect(hilfeThema("Wie erstelle ich ein Angebot für die Präsentation?")).toBe("Angebot/Präsentation");
    expect(hilfeThema("Wo lade ich die Police hoch?")).toBe("Policen");
    expect(hilfeThema("Wie ändere ich mein Passwort?")).toBe("Einstellungen/Konto");
    expect(hilfeThema("Warum sehe ich keine neuen Leads?")).toBe("Leads");
    expect(hilfeThema("Hallo")).toBe("Sonstiges");
    expect(hilfeThema(null)).toBe("Sonstiges");
    // „bot“ steckt in „Angebot“, zählt aber nur am Wortanfang
    expect(hilfeThema("Angebot nachfassen")).toBe("Angebot/Präsentation");
  });
});

describe("Ranglisten", () => {
  const ev: Rohdaten["ereignisse"] = [
    { periode: "a", type: "page", name: "/buyer/heute", kunde: "k1", anzahl: 10 },
    { periode: "a", type: "page", name: "/buyer/heute", kunde: "k2", anzahl: 5 },
    { periode: "v", type: "page", name: "/buyer/heute", kunde: "k1", anzahl: 4 },
    { periode: "a", type: "page", name: "/buyer/leads/[id]", kunde: "k1", anzahl: 3 },
    { periode: "a", type: "page", name: "/buyer/termine/cmh3x9k2a0001qz8y7v6u5t4s", kunde: "k1", anzahl: 1 },
    { periode: "a", type: "page", name: "/buyer/termine/cmh3x9k2a0001qz8y7v6u5t4x", kunde: "k2", anzahl: 1 },
    { periode: "f", type: "page", name: "/buyer/zahlen", kunde: "k1", anzahl: 7 },
    { periode: "v", type: "page", name: "/buyer/team", kunde: "k1", anzahl: 2 },
    { periode: "a", type: "action", name: "chat.done", kunde: "k1", anzahl: 9 },
  ];

  it("Top nach Anzahl mit Vorher und Kundenzahl, IDs zusammengefasst", () => {
    const r = rangliste(ev, "page", seitenName);
    expect(r.top[0]).toEqual({ name: "/buyer/heute", anzahl: 15, vorher: 4, kunden: 2 });
    expect(r.top.find((x) => x.name === "/buyer/termine/[id]")).toEqual({ name: "/buyer/termine/[id]", anzahl: 2, vorher: 0, kunden: 2 });
    expect(r.gesamt).toEqual({ aktuell: 20, vorher: 6, veraenderungProzent: 233 });
  });

  it("ungenutzt: früher genutzt, im Zeitraum nicht", () => {
    const r = rangliste(ev, "page", seitenName);
    expect(r.ungenutzt).toEqual([
      { name: "/buyer/zahlen", anzahlDavor: 7 },
      { name: "/buyer/team", anzahlDavor: 2 },
    ]);
    expect(rangliste(ev, "action").top).toEqual([{ name: "chat.done", anzahl: 9, vorher: 0, kunden: 1 }]);
  });

  it("höchstens 15 Einträge", () => {
    const viele = Array.from({ length: 30 }, (_, i) => ({ periode: "a" as const, type: "action", name: `a${i}`, kunde: "k", anzahl: i + 1 }));
    expect(rangliste(viele, "action").top).toHaveLength(15);
  });
});

describe("Bericht", () => {
  it("aktive Kunden und Nutzer im Vergleich", () => {
    const b = auswerten(roh());
    expect(b.aktiv.kunden).toEqual({ aktuell: 4, vorher: 2, veraenderungProzent: 100 });
    expect(b.aktiv.kundenProzent).toEqual({ aktuell: 40, vorher: 20 });
    expect(b.aktiv.nutzer.aktuell).toBe(6);
    expect(b.aktiv.aktiveTageJeKunde).toEqual({ aktuell: 2.5, vorher: 1.5 });
  });

  it("Abbrüche je Kunde, ohne Start oder ohne Ereignisse: keine Messung", () => {
    const b = auswerten(
      roh({
        ereignisse: [
          { periode: "a", type: "page", name: "/buyer/bestand/import", kunde: "k1", anzahl: 3 },
          { periode: "a", type: "page", name: "/buyer/bestand/import", kunde: "k2", anzahl: 1 },
          { periode: "a", type: "action", name: "angebot.app", kunde: "k1", anzahl: 2 },
        ],
        audit: [
          { periode: "a", action: "bestand.import", ergebnis: null, kunde: "k1", anzahl: 1 },
          { periode: "a", action: "whatsapp.self_connect", ergebnis: "pending", kunde: "k3", anzahl: 1 },
          { periode: "a", action: "whatsapp.self_connect", ergebnis: "connected", kunde: "k4", anzahl: 1 },
          { periode: "a", action: "whatsapp.self_connect", ergebnis: "pending", kunde: "k4", anzahl: 1 },
        ],
      }),
    );
    expect(b.abbrueche.import).toMatchObject({ messung: "ja", aktuell: { gestartet: 2, abgeschlossen: 1, abgebrochen: 1, abbruchProzent: 50 } });
    expect(b.abbrueche.whatsappVerbinden).toMatchObject({ messung: "ja", aktuell: { gestartet: 2, abgeschlossen: 1, abbruchProzent: 50 } });
    expect(b.abbrueche.kampagneAnlegen).toMatchObject({ messung: "keine Messung" });
    expect(b.abbrueche.angebotSenden).toMatchObject({ messung: "keine Messung", abgeschlossen: { aktuell: 2 } });
  });

  it("Fehler-Toasts zusammengefasst nach Typ", () => {
    const b = auswerten(
      roh({
        ereignisse: [
          { periode: "a", type: "error", name: "toast: Lead 123 nicht gefunden", kunde: "k1", anzahl: 1 },
          { periode: "a", type: "error", name: "toast: Lead 456 nicht gefunden", kunde: "k2", anzahl: 2 },
          { periode: "v", type: "error", name: "toast: Senden hat nicht geklappt.", kunde: "k1", anzahl: 1 },
        ],
      }),
    );
    expect(b.fehlerToasts.top).toEqual([{ name: "Lead N nicht gefunden", anzahl: 3, vorher: 0, kunden: 2 }]);
    expect(b.fehlerToasts.gesamt).toEqual({ aktuell: 3, vorher: 1, veraenderungProzent: 200 });
  });

  it("Umfrage: Start-Smileys und NPS mit Verteilung", () => {
    const b = auswerten(
      roh({
        umfrage: [
          { periode: "a", art: "day7", wert: 5 },
          { periode: "a", art: "day7", wert: 4 },
          { periode: "a", art: "day30", wert: 10 },
          { periode: "a", art: "day30", wert: 9 },
          { periode: "a", art: "day90", wert: 7 },
          { periode: "a", art: "day30", wert: 3 },
          { periode: "v", art: "day30", wert: 2 },
        ],
      }),
    );
    const u = b.feedback.umfrage.aktuell;
    expect(u.antworten).toBe(6);
    expect(u.startTag7).toMatchObject({ anzahl: 2, schnitt: 4.5, verteilung: { "1": 0, "4": 1, "5": 1 } });
    expect(u.weiterempfehlung).toMatchObject({ anzahl: 4, nps: 25, promotoren: 2, passive: 1, kritiker: 1, schnitt: 7.3 });
    expect(b.feedback.umfrage.vorher.weiterempfehlung.nps).toBe(-100);
  });

  it("Hilfe nur als Themen, Support nach Grund und Kanal, ohne Text", () => {
    const frage = "Max Mustermann max@example.com: wie geht WhatsApp?";
    const b = auswerten(
      roh({
        hilfe: [
          { periode: "a", frage, bewertung: "down" },
          { periode: "a", frage: "Rechnung herunterladen", bewertung: "up" },
          { periode: "v", frage: "Hallo", bewertung: null },
        ],
        support: [
          { periode: "a", name: "offered", grund: "bug", kanal: null, anzahl: 2 },
          { periode: "a", name: "contacted", grund: "billing", kanal: "email", anzahl: 1 },
        ],
      }),
    );
    expect(b.hilfeFragen.gesamt).toEqual({ aktuell: 2, vorher: 1, veraenderungProzent: 100 });
    expect(b.hilfeFragen.themen.find((t) => t.thema === "WhatsApp")).toEqual({ thema: "WhatsApp", anzahl: 1, vorher: 0 });
    expect(b.hilfeFragen.themen.find((t) => t.thema === "Sonstiges")).toEqual({ thema: "Sonstiges", anzahl: 0, vorher: 1 });
    expect(b.feedback.hilfeBewertung.nichtHilfreich.aktuell).toBe(1);
    expect(b.support.angeboten.aktuell).toBe(3);
    expect(b.support.kontaktiert.aktuell).toBe(1);
    expect(b.support.nachGrund).toEqual({ Abrechnung: 1 });
    expect(b.support.nachKanal).toEqual({ email: 1 });
    const json = JSON.stringify(b);
    expect(json).not.toContain("Mustermann");
    expect(json).not.toContain("example.com");
    expect(json).not.toContain("herunterladen");
  });

  it("Aufgaben und nächster Schritt als Anteile", () => {
    const b = auswerten(roh());
    expect(b.aufgaben).toMatchObject({ wiedervorlagenOffen: 20, ueberfaelligUeber24h: 5, ueberfaelligProzent: 25, termineOhneErgebnisProzent: 20 });
    expect(b.naechsterSchritt).toMatchObject({ offeneLeads: 40, mitSchritt: 30, ohneSchritt: 10, mitSchrittProzent: 75 });
  });

  it("erste Reaktion: Median in Minuten, frühere Zeitpunkte zählen nicht", () => {
    const b = auswerten(
      roh({
        reaktion: [
          { periode: "a", angelegt: min(0), kontakt: min(30), nachricht: min(2), agent: null, verlauf: null },
          { periode: "a", angelegt: min(0), kontakt: null, nachricht: null, agent: min(60), verlauf: min(10) },
          { periode: "a", angelegt: min(0), kontakt: min(-5), nachricht: min(6), agent: null, verlauf: null },
          { periode: "a", angelegt: min(0), kontakt: null, nachricht: null, agent: null, verlauf: null },
        ],
      }),
    );
    const r = b.ersteReaktion.aktuell;
    expect(r.neueLeads).toBe(4);
    expect(r.ersteReaktion).toEqual({ gemessen: 3, ohne: 1, medianMinuten: 6 });
    expect(r.ersteNachricht).toEqual({ gemessen: 2, ohne: 2, medianMinuten: 4 });
    expect(r.ersteVermittlerAktion).toEqual({ gemessen: 2, ohne: 2, medianMinuten: 20 });
    expect(b.ersteReaktion.vorher.ersteReaktion.medianMinuten).toBeNull();
  });

  it("Admin-Nutzung nur zusammengefasst", () => {
    const b = auswerten(
      roh({
        admin: {
          seit: "2026-11-17T12:00Z",
          summen: { adminAktionen: 3 },
          aktionenAdmin: [{ aktion: "customer.update", text: "Kunde geändert", anzahl: 3 }],
          funktionen: [{ id: "kunden--speichern", anzahl: 4, admins: 1 }],
          inGruppe: [{ id: "kunden--speichern", anzahl: 1, admins: 2 }],
          seiten: [{ pfad: "/admin/neu/kunden/:id", anzahl: 9, admins: 2 }],
        },
      }),
    );
    expect(b.adminNutzungSeitGestern).toEqual({
      seit: "2026-11-17T12:00Z",
      summen: { adminAktionen: 3 },
      topFunktionen: [{ id: "kunden--speichern", anzahl: 5, admins: 2 }],
      topSeiten: [{ pfad: "/admin/neu/kunden/:id", anzahl: 9 }],
      topAktionen: [{ aktion: "customer.update", text: "Kunde geändert", anzahl: 3 }],
    });
    expect(auswerten(roh()).adminNutzungSeitGestern).toMatchObject({ messung: "keine Messung" });
  });
});
