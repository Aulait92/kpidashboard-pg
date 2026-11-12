import { describe, expect, it } from "vitest";
import { detectInsurer, extractFax, extractLeaders, extractOpeningHours, extractSocials, extractTeamSize, isPlausible, placeQuery, type Place } from "@/lib/vertrieb/contact-enrich";

// Erfundene Beispieldaten (keine echten Kontakte)
const HOME_HTML = `
  <footer>
    <a href="https://www.facebook.com/agentur.muster.test/">Facebook</a>
    <a href="https://www.facebook.com/sharer/sharer.php?u=x">Teilen</a>
    <a href="https://www.instagram.com/allianz/">Konzern</a>
    <a href="https://www.instagram.com/agentur_muster_test">Instagram</a>
    <a href="https://www.xing.com/profile/Max_Muster123">XING</a>
    <a href="https://de.linkedin.com/in/max-muster-test">LinkedIn</a>
  </footer>`;

const HOME_TEXT = `Willkommen
Unser Team aus 6 Mitarbeitern berät Sie gern.
Öffnungszeiten
Mo - Fr 09:00 - 17:00 Uhr
Sa 10:00 - 12:00 Uhr
und nach Vereinbarung
Kontakt`;

const IMPRESSUM = `Impressum
Agentur Muster
Inhaber: Max Muster und Erika Beispiel
Hauptstraße 1
12345 Musterstadt
Telefon: 030 1234567
Fax: 030 1234568
Gebundener Versicherungsvertreter nach § 34d Abs. 7 GewO für die Allianz Versicherungs-AG`;

describe("Kontakt anreichern: Website auswerten", () => {
  it("liest Öffnungszeiten als Block", () => {
    expect(extractOpeningHours(HOME_TEXT)).toBe("Mo - Fr 09:00 - 17:00 Uhr\nSa 10:00 - 12:00 Uhr\nund nach Vereinbarung");
    expect(extractOpeningHours("Öffnungszeiten: Mo–Fr 9–17 Uhr")).toBe("Mo–Fr 9–17 Uhr");
    expect(extractOpeningHours("Kein Hinweis auf Zeiten")).toBeNull();
  });

  it("findet Social-Links der Agentur, ignoriert Teilen-Knöpfe und Konzern-Profile", () => {
    expect(extractSocials(HOME_HTML)).toEqual({
      facebookUrl: "https://www.facebook.com/agentur.muster.test",
      instagramUrl: "https://www.instagram.com/agentur_muster_test",
      xingUrl: "https://www.xing.com/profile/Max_Muster123",
      linkedinUrl: "https://de.linkedin.com/in/max-muster-test",
    });
  });

  it("Fax, Inhaber, Versicherer und Teamgröße", () => {
    expect(extractFax(IMPRESSUM)).toBe("030 1234568");
    expect(extractLeaders(IMPRESSUM)).toBe("Max Muster, Erika Beispiel");
    expect(detectInsurer(IMPRESSUM, "info@agentur-muster.test")).toBe("Allianz");
    expect(detectInsurer("Wir sind unabhängiger Versicherungsmakler nach § 34d Abs. 1 GewO")).toBe("Makler");
    expect(detectInsurer("irgendwas", "max.muster@signal-iduna.net")).toBe("Signal Iduna");
    expect(detectInsurer("Ein Text ohne Status")).toBeNull();
    expect(extractTeamSize(HOME_TEXT)).toBe(6);
  });
});

describe("Kontakt anreichern: Google-Treffer prüfen", () => {
  const contact = {
    name: "Agentur Muster",
    email: "info@agentur-muster.test",
    url: "https://www.agentur-muster.test",
    phone: null,
    zip: "12345",
    city: "Musterstadt",
    firstName: "Max",
    lastName: "Muster",
    insurer: "Allianz",
  };
  const place = (p: Partial<Place>): Place => ({ id: "p1", ...p });

  it("Suchtext: Agentur + Ort, sonst Person + Versicherer + PLZ", () => {
    expect(placeQuery(contact)).toBe("Agentur Muster Musterstadt");
    expect(placeQuery({ ...contact, city: null })).toBe("Max Muster Allianz 12345");
    expect(placeQuery({ ...contact, city: null, zip: null })).toBe("Allianz Max Muster");
    expect(placeQuery({ ...contact, city: null, zip: null, insurer: null })).toBeNull();
  });

  it("gleiche Website oder Telefon → plausibel", () => {
    expect(isPlausible(place({ websiteUri: "https://agentur-muster.test/" }), contact)).toBe(true);
    expect(isPlausible(place({ nationalPhoneNumber: "030 9876543" }), { ...contact, phone: "+49 30 9876543" })).toBe(true);
  });

  it("Nachname + PLZ/Ort → plausibel; fremder Eintrag → nicht", () => {
    const comps = [
      { longText: "12345", types: ["postal_code"] },
      { longText: "Musterstadt", types: ["locality"] },
    ];
    expect(isPlausible(place({ displayName: { text: "Allianz Versicherung Max Muster" }, addressComponents: comps }), contact)).toBe(true);
    expect(isPlausible(place({ displayName: { text: "Versicherungsbüro Andere" }, addressComponents: comps, websiteUri: "https://andere.test" }), contact)).toBe(false);
    // Nachname aus Kontaktname bzw. E-Mail, Ort als Teil der Adresse
    const ohneNachname = { ...contact, name: "Allianz Thomas Broza", lastName: null, firstName: null, email: "thomas.broza@allianz.de", zip: null, city: "Frankfurt" };
    expect(isPlausible(place({ displayName: { text: "Allianz Versicherung Thomas Broza - Generalvertretung" }, formattedAddress: "Hauptstr. 1, 60311 Frankfurt am Main", addressComponents: [{ longText: "Frankfurt am Main", types: ["locality"] }] }), ohneNachname)).toBe(true);
    expect(isPlausible(place({ displayName: { text: "Allianz Versicherung Thomas Broza" }, formattedAddress: "Ring 2, 80331 München", addressComponents: [{ longText: "München", types: ["locality"] }] }), ohneNachname)).toBe(false);
    // Vor- + Nachname + Versicherer im Eintrag, ohne Ort am Kontakt (Fall Signal Iduna)
    const si = { ...contact, name: "Jens Sajdev", firstName: null, lastName: null, email: "jens.sajdev@signal-iduna.net", zip: null, city: null, url: null, insurer: "Signal Iduna" };
    expect(placeQuery(si)).toBe("Signal Iduna Jens Sajdev");
    expect(isPlausible(place({ displayName: { text: "SIGNAL IDUNA Versicherung Jens Sajdev - Versicherungsagentur" }, formattedAddress: "Weidkamp 116, 45355 Essen" }), si)).toBe(true);
    expect(isPlausible(place({ displayName: { text: "SIGNAL IDUNA Versicherung Jens Müller" } }), si)).toBe(false);
    // Konzern-Website allein reicht nicht
    expect(isPlausible(place({ websiteUri: "https://www.allianz.de/" }), { ...contact, url: "https://vertretung.allianz.de/max.muster/" })).toBe(false);
  });
});

describe("Konzern-Impressum", () => {
  it("erkennt Vorstand/Aufsichtsrat und übernimmt dann keine Agenturdaten", async () => {
    const { isCorporateImprint } = await import("@/lib/vertrieb/contact-enrich");
    expect(isCorporateImprint("Impressum\nVorstand: Claudia Pauls (Vorsitzende), Dr. Christian Schumacher\nVorsitzender des Aufsichtsrats: …")).toBe(true);
    expect(isCorporateImprint("Impressum\nGeneralagentur Max Muster\nInhaber: Max Muster\nMusterweg 1, 12345 Musterstadt")).toBe(false);
  });
});
