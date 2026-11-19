// Datumsangaben aus Chat-Antworten (lib/datum-antwort.ts): Ablauf (Monat und Jahr) und Geburtsdatum mit Plausibilität,
// dazu die Prüfung des vom Assistenten festgehaltenen Geburtsdatums (lib/whatsapp/geburt-chat.ts). Ole, 19.11.2026.
import { describe, expect, it } from "vitest";
import { ablaufBeispiel, ablaufLesen, geburtsdatumPruefen } from "@/lib/datum-antwort";
import { BESTAETIGT, geburtImChat, type GeburtMerker } from "@/lib/whatsapp/geburt-chat";
import { minderjaehrigLautChat } from "@/lib/policen/regeln";

const heute = new Date("2026-11-19T10:00:00Z");
const mj = (monat: number, jahr: number) => ({ monat, jahr });

describe("ablaufLesen", () => {
  it("Beispiel: Monat in etwa 4 Monaten (Berlin), MM/JJJJ", () => {
    expect(ablaufBeispiel(heute)).toBe("03/2027");
    expect(ablaufBeispiel(new Date("2026-08-31T22:30:00Z"))).toBe("01/2027"); // in Berlin schon der 1. September
  });

  it("Zahlenformate", () => {
    for (const t of ["03/2027", "03/27", "3/27", "3.2027", "03.2027", "15.03.2027", "bis 03/2027", "2027-03"]) expect(ablaufLesen(t, heute), t).toEqual(mj(3, 2027));
  });

  it("Monatsnamen mit und ohne Jahr", () => {
    expect(ablaufLesen("März 2027", heute)).toEqual(mj(3, 2027));
    expect(ablaufLesen("Mär 27", heute)).toEqual(mj(3, 2027));
    expect(ablaufLesen("Ende Juni 2028", heute)).toEqual(mj(6, 2028));
    // nur Monat: nächstes Vorkommen, der laufende Monat zählt als dieses Jahr
    expect(ablaufLesen("März", heute)).toEqual(mj(3, 2027));
    expect(ablaufLesen("im März", heute)).toEqual(mj(3, 2027));
    expect(ablaufLesen("November", heute)).toEqual(mj(11, 2026));
    expect(ablaufLesen("dezember", heute)).toEqual(mj(12, 2026));
    expect(ablaufLesen("Oktober", heute)).toEqual(mj(10, 2027));
    expect(ablaufLesen("Mai nächsten Jahres", heute)).toEqual(mj(5, 2027));
  });

  it("relative Angaben", () => {
    expect(ablaufLesen("Anfang nächsten Jahres", heute)).toEqual(mj(1, 2027));
    expect(ablaufLesen("Anfang des nächsten Jahres", heute)).toEqual(mj(1, 2027));
    expect(ablaufLesen("Ende des Jahres", heute)).toEqual(mj(12, 2026));
    expect(ablaufLesen("Jahresende", heute)).toEqual(mj(12, 2026));
    expect(ablaufLesen("nächsten Monat", heute)).toEqual(mj(12, 2026));
    expect(ablaufLesen("in 3 Monaten", heute)).toEqual(mj(2, 2027));
    expect(ablaufLesen("Anfang 2028", heute)).toEqual(mj(1, 2028));
  });

  it("weiß nicht und Unklares", () => {
    for (const t of ["weiß nicht", "keine Ahnung", "weiß ich nicht genau", "k.A.", "Ich weiß es nicht", "muss ich nachschauen"]) expect(ablaufLesen(t, heute), t).toBe("weiss_nicht");
    for (const t of ["bei der Uelzener", "ja", "", "jährlich"]) expect(ablaufLesen(t, heute), t).toBeNull();
    // Datum schlägt „weiß nicht genau“
    expect(ablaufLesen("weiß nicht genau, ich glaube März", heute)).toEqual(mj(3, 2027));
  });
});

describe("geburtsdatumPruefen", () => {
  it("echtes Datum, Formate", () => {
    expect(geburtsdatumPruefen("14.05.1985", heute)).toMatchObject({ art: "ok", datum: "14.05.1985", alter: 41 });
    expect(geburtsdatumPruefen("14.5.85", heute)).toMatchObject({ art: "ok", datum: "14.05.1985" });
    expect(geburtsdatumPruefen("1985-05-14", heute)).toMatchObject({ art: "ok", datum: "14.05.1985" });
    expect(geburtsdatumPruefen("14. Mai 1985", heute)).toMatchObject({ art: "ok", datum: "14.05.1985" });
  });
  it("unter 18, Zukunft, über 100, Grenzen", () => {
    expect(geburtsdatumPruefen("23.09.2025", heute)).toMatchObject({ art: "minderjaehrig", datum: "23.09.2025", alter: 1 });
    expect(geburtsdatumPruefen("1.1.2090", heute)).toEqual({ art: "unplausibel", datum: "01.01.2090" });
    expect(geburtsdatumPruefen("01.01.1920", heute)).toEqual({ art: "unplausibel", datum: "01.01.1920" });
    expect(geburtsdatumPruefen("19.11.2008", heute).art).toBe("ok"); // heute 18
    expect(geburtsdatumPruefen("20.11.2008", heute).art).toBe("minderjaehrig");
    expect(geburtsdatumPruefen("31.02.1985", heute).art).toBe("unlesbar");
  });
  it("weiß nicht bzw. keine Angabe", () => {
    for (const t of ["weiß nicht", "keine Angabe", "möchte ich nicht sagen", ""]) expect(geburtsdatumPruefen(t, heute).art, t).toBe("unbekannt");
  });
});

describe("geburtImChat (Assistent)", () => {
  const basis = { an: "sie" as const, person: "Herr Kannapinn", jetzt: heute, schon: [] as GeburtMerker[] };

  it("echtes Datum übernehmen, weiß nicht wie bisher", () => {
    expect(geburtImChat({ ...basis, wert: "14.5.1985", tierLead: false })).toEqual({ geburt: "14.05.1985", hinweis: null, merker: null });
    expect(geburtImChat({ ...basis, wert: "weiß nicht", tierLead: false })).toEqual({ geburt: "weiß nicht", hinweis: null, merker: null });
  });

  it("Tier-Lead, Datum unter 18: als Datum des Tieres, Nachfrage nach dem eigenen", () => {
    const r = geburtImChat({ ...basis, wert: "23.09.2025", tierLead: true, tierName: "Minka", tierBisher: "Katze Minka" });
    expect(r.geburt).toBeNull();
    expect(r.tier).toBe("Katze Minka; Geboren: 23.09.2025");
    expect(r.hinweis).toContain("„Danke, das ist sicher das Geburtsdatum von Minka, das habe ich notiert. Für den Vertrag braucht Herr Kannapinn noch Ihr eigenes Geburtsdatum.“");
    expect(r.merker).toEqual({ art: "tier", datum: "23.09.2025" });
  });

  it("ohne Tier, unter 18: einmal fragen, ob es das eigene ist; erst die Bestätigung zählt als minderjährig", () => {
    const r = geburtImChat({ ...basis, wert: "03.04.2012", tierLead: false });
    expect(r.geburt).toBeNull();
    expect(r.hinweis).toContain("„Ist das Ihr eigenes Geburtsdatum? Dann bräuchten wir für das Angebot einen Erziehungsberechtigten.“");
    expect(minderjaehrigLautChat({ geburt: "03.04.2012" }, heute)).toBe(false);
    const du = geburtImChat({ ...basis, an: "du", wert: "03.04.2012", tierLead: false });
    expect(du.hinweis).toContain("„Ist das dein eigenes Geburtsdatum? Dann bräuchten wir für das Angebot einen Erziehungsberechtigten.“");
    // Bestätigung: dasselbe Datum noch einmal
    const b = geburtImChat({ ...basis, wert: "03.04.2012", tierLead: false, schon: [r.merker!] });
    expect(b.geburt).toBe(`03.04.2012 (${BESTAETIGT})`);
    expect(minderjaehrigLautChat({ geburt: b.geburt }, heute)).toBe(true);
    // anderes Datum unter 18 nach der Frage: offen, nicht weiter fragen
    expect(geburtImChat({ ...basis, wert: "05.06.2013", tierLead: false, schon: [r.merker!] }).geburt).toBe("offen (Angabe: 05.06.2013)");
  });

  it("Zukunft bzw. über 100: einmal neu fragen, danach offen", () => {
    const r = geburtImChat({ ...basis, wert: "1.1.2090", tierLead: false });
    expect(r.geburt).toBeNull();
    expect(r.hinweis).toContain("„Das Datum scheint nicht zu passen. Wie lautet Ihr Geburtsdatum, zum Beispiel 14.05.1985?“");
    const zweite = geburtImChat({ ...basis, wert: "1.1.2091", tierLead: false, schon: [r.merker!] });
    expect(zweite.geburt).toBe("offen (Angabe: 01.01.2091)");
    expect(zweite.merker).toBeNull();
  });

  it("Texte ohne Gedankenstriche", () => {
    for (const wert of ["23.09.2025", "03.04.2012", "1.1.2090"])
      for (const tierLead of [true, false])
        for (const an of ["sie", "du"] as const) expect(geburtImChat({ ...basis, an, wert, tierLead }).hinweis ?? "").not.toMatch(/[–—]/);
  });
});

describe("geburtImChat: kein Datum erkennbar (Ole, 19.11.2026)", () => {
  const basis = { an: "sie" as const, person: "Herr Kannapinn", schon: [] as GeburtMerker[], jetzt: new Date("2026-11-19T12:00:00Z") };
  it("speichert „36272“ nicht und fragt einmal mit Beispiel nach", () => {
    const r = geburtImChat({ ...basis, wert: "36272", tierLead: false });
    expect(r.geburt).toBeNull();
    expect(r.merker).toEqual({ art: "unlesbar", datum: "36272" });
    expect(r.hinweis).toContain("zum Beispiel 14.05.1985");
  });
  it("notiert die zweite unlesbare Antwort als offen", () => {
    const r = geburtImChat({ ...basis, wert: "irgendwann im Mai", tierLead: false, schon: [{ art: "unlesbar", datum: "36272" }] });
    expect(r.geburt).toBe("offen (Angabe: irgendwann im Mai)");
    expect(r.merker).toBeNull();
  });
  it("„weiß nicht“ bleibt wie bisher", () => {
    expect(geburtImChat({ ...basis, wert: "weiß nicht", tierLead: false }).geburt).toBe("weiß nicht");
  });
});
