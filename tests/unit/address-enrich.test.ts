import { describe, expect, it } from "vitest";
import { enrichmentSourceUrl, extractAddress, fillEmpty, needsAddress } from "@/lib/vertrieb/address-enrich";

describe("Adresse ergänzen: Quelle bestimmen", () => {
  it("nimmt die Website des Kontakts", () => {
    expect(enrichmentSourceUrl({ url: "agentur-muster.de", email: "info@gmail.com" })).toBe("https://agentur-muster.de/");
  });
  it("leitet aus der E-Mail-Domain ab, aber nicht bei Freemail", () => {
    expect(enrichmentSourceUrl({ email: "info@versicherung-mueller.de" })).toBe("https://versicherung-mueller.de");
    for (const d of ["gmail.com", "web.de", "gmx.net", "t-online.de", "outlook.de", "icloud.com", "yahoo.de", "hotmail.com"]) {
      expect(enrichmentSourceUrl({ email: `max@${d}` })).toBeNull();
    }
  });
  it("Versicherer-Konzerndomains: Mail und Konzernseite nein, Agentur-Unterseite ja", () => {
    // Vertreter-Mail → Agentur-Seite des Vertreters (nicht die Konzernseite)
    expect(enrichmentSourceUrl({ email: "max.muster@allianz.de" })).toBe("https://vertretung.allianz.de/max.muster/");
    expect(enrichmentSourceUrl({ url: "https://www.allianz.de/", email: "max.muster@allianz.de" })).toBe("https://vertretung.allianz.de/max.muster/");
    expect(enrichmentSourceUrl({ email: "info@allianz.de" })).toBeNull();
    expect(enrichmentSourceUrl({ email: "torsten.hosang@signal-iduna.net" })).toBe("https://www.signal-iduna.de/torsten.hosang/");
    expect(enrichmentSourceUrl({ email: "volker.wenzel@axa.de" })).toBe("https://www.axa-betreuer.de/volker_wenzel");
    expect(enrichmentSourceUrl({ url: "https://www.allianz.de/versicherung/", email: null })).toBeNull();
    expect(enrichmentSourceUrl({ url: "https://vertretung.allianz.de/max.muster/" })).toBe("https://vertretung.allianz.de/max.muster/");
    expect(enrichmentSourceUrl({ url: "https://vertretung.allianz.de/" })).toBeNull();
    expect(enrichmentSourceUrl({ email: "a@ergo.de" })).toBeNull();
  });
  it("keine Platzhalter, sozialen Netzwerke oder internen Adressen", () => {
    expect(enrichmentSourceUrl({ email: "lead-1@ohne-email.invalid" })).toBeNull();
    expect(enrichmentSourceUrl({ url: "https://www.linkedin.com/in/max", email: "x@gmail.com" })).toBeNull();
    expect(enrichmentSourceUrl({ url: "http://localhost:3000", email: null })).toBeNull();
    expect(enrichmentSourceUrl({ url: "http://192.168.1.10/impressum", email: null })).toBeNull();
    expect(enrichmentSourceUrl({ url: "ftp://agentur.de", email: null })).toBeNull();
  });
  it("eine Domain wie fdp.de gilt nicht als intern", () => {
    expect(enrichmentSourceUrl({ email: "info@fdp-agentur.de" })).toBe("https://fdp-agentur.de");
  });
});

describe("Adresse ergänzen: aus dem Impressum lesen", () => {
  it("Straße in der Zeile davor, Telefon", () => {
    const t = `Impressum\nAngaben gemäß § 5 TMG\nVersicherungsbüro Muster\nInh. Max Muster\nHauptstraße 12a\n12345 Musterstadt\nTelefon: 030 / 123 45 67\nE-Mail: info@muster.de`;
    expect(extractAddress(t)).toEqual({ street: "Hauptstraße 12a", zip: "12345", city: "Musterstadt", phone: "030 / 123 45 67" });
  });
  it("alles in einer Zeile mit Kommas", () => {
    const t = `Agentur Beispiel, Am Markt 3, 54321 Bad Beispiel (Taunus) | Tel. +49 6172 98765`;
    expect(extractAddress(t)).toMatchObject({ street: "Am Markt 3", zip: "54321", city: "Bad Beispiel (Taunus)", phone: "+49 6172 98765" });
  });
  it("überspringt Register-, Kammer- und Versicherer-Adressen", () => {
    const t = [
      "Vermittlerregister: DIHK e.V.",
      "Breite Straße 29",
      "10178 Berlin",
      "Telefon: 0180 600 58 50",
      "Allianz Versicherungs-AG",
      "Königinstraße 28",
      "80802 München",
      "Unsere Agentur",
      "Lindenweg 4",
      "99999 Neustadt",
      "Tel.: 0361 555 12",
    ].join("\n");
    expect(extractAddress(t)).toEqual({ street: "Lindenweg 4", zip: "99999", city: "Neustadt", phone: "0361 555 12" });
  });
  it("PLZ ohne erkennbare Straße: nur PLZ/Ort", () => {
    expect(extractAddress("Agentur Muster\n12345 Musterstadt")).toEqual({ street: null, zip: "12345", city: "Musterstadt", phone: null });
  });
  it("nichts gefunden", () => {
    expect(extractAddress("Willkommen auf unserer Seite")).toEqual({ street: null, zip: null, city: null, phone: null });
  });
});

describe("Adresse ergänzen: nur leere Felder", () => {
  it("überschreibt nichts Vorhandenes", () => {
    const cur = { street: null, zip: "11111", city: "", phone: "0151 1" };
    expect(fillEmpty(cur, { street: "Weg 1", zip: "22222", city: "Ort", phone: "030 1" })).toEqual({ street: "Weg 1", city: "Ort" });
  });
  it("vollständige Adresse braucht nichts", () => {
    expect(needsAddress({ street: "Weg 1", zip: "1", city: "Ort" })).toBe(false);
    expect(needsAddress({ street: "Weg 1", zip: "1", city: " " })).toBe(true);
  });
});
