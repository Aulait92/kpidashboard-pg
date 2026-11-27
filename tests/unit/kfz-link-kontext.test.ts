// Fall Lohmann (Ole, 27.11.2026): mehrteilige Angaben bleiben ganz, Video-Link nur mit Kontext.
import { describe, expect, it } from "vitest";
import { teilangabenErhalten } from "@/lib/preise/rechner-angaben";
import { fragtNachVideoLink, ohneTerminLink, videoLinkText } from "@/lib/whatsapp/gespraech";

const URL = "https://allianz-agn.webex.com/meet/lohmann";
// Montag, 30.11.2026, 14 Uhr deutscher Zeit
const START = new Date("2026-11-30T13:00:00.000Z");

describe("teilangabenErhalten", () => {
  it("Kfz-Fahrzeugdaten: „bezahlt“ nach „12.000 km“ behält die Kilometer", () => {
    expect(teilangabenErhalten({ kfzDetails: "12.000 km" }, { kfzDetails: "bezahlt" })).toEqual({ kfzDetails: "12.000 km, bezahlt" });
  });
  it("vollständiger neuer Wert bleibt unverändert", () => {
    expect(teilangabenErhalten({ kfzDetails: "12.000 km" }, { kfzDetails: "12.000 km, bezahlt" })).toEqual({ kfzDetails: "12.000 km, bezahlt" });
    expect(teilangabenErhalten({ kfzFahrer: "privat" }, { kfzFahrer: "privat, Führerschein 2005" })).toEqual({ kfzFahrer: "privat, Führerschein 2005" });
  });
  it("Korrektur desselben Teils ersetzt (keine Verdopplung)", () => {
    expect(teilangabenErhalten({ kfzDetails: "12.000 km" }, { kfzDetails: "15.000 km" })).toEqual({ kfzDetails: "15.000 km" });
  });
  it("einteilige Felder und neue Felder unberührt", () => {
    expect(teilangabenErhalten({ geburt: "01.01.1980" }, { geburt: "02.02.1982", plz: "80331" })).toEqual({ geburt: "02.02.1982", plz: "80331" });
    expect(teilangabenErhalten(null, { kfzDetails: "bezahlt" })).toEqual({ kfzDetails: "bezahlt" });
  });
});

describe("Video-Link mit Kontext", () => {
  it("Sie- und Du-Fassung", () => {
    expect(videoLinkText("sie", { dat: "Herrn Lohmann" }, START, URL)).toBe(`Ihr Videotermin mit Herrn Lohmann ist am Montag, 30.11. um 14 Uhr. Hier ist der Link: ${URL}`);
    expect(videoLinkText("du", { dat: "Markus" }, START, URL)).toBe(`Dein Videotermin mit Markus ist am Montag, 30.11. um 14 Uhr. Hier ist der Link: ${URL}`);
  });
  it("erkennt die Frage nach dem Link, nicht den bloßen Dank", () => {
    for (const t of ["Wo finde ich den Link?", "Können Sie mir den Link schicken", "Link?", "Ich habe keinen Zugang zum Videoraum", "Schickst du mir die Zugangsdaten nochmal"]) expect(fragtNachVideoLink(t), t).toBe(true);
    for (const t of ["Danke für den Link", "bezahlt", "Danke", `Hier: ${URL}`, ""]) expect(fragtNachVideoLink(t), t).toBe(false);
  });
  it("entfernt Sätze mit dem Link aus der Antwort des Assistenten", () => {
    expect(ohneTerminLink(`Vielen Dank! Den Link finden Sie hier: ${URL}`, URL)).toBe("Vielen Dank!");
    expect(ohneTerminLink(`Gern. Hier ist der Link: ${URL}\nBis Montag!`, URL)).toBe("Gern.\nBis Montag!");
    expect(ohneTerminLink("Alles klar, bis Montag!", URL)).toBe("Alles klar, bis Montag!");
  });
});
