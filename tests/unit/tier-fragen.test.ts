// Feste Tierfragen nach der Buchung (TKV, lib/whatsapp/tier-fragen.ts): nur was fehlt, du/Sie, mehrere Tiere, Auswertung.
import { describe, expect, it } from "vitest";
import { istTierStrecke, offeneTierFragen, tierAntwortAuswerten, tierErgaenzen, tierFrage, type TierQuelle } from "@/lib/whatsapp/tier-fragen";
import { testLeadAnswers } from "@/lib/testlead";

const katze = (o: Partial<TierQuelle> = {}): TierQuelle => ({ source: "TKV-Katze", formular: testLeadAnswers("TKV-Katze"), angaben: {}, ...o });
const ohne = (re: RegExp) => testLeadAnswers("TKV-Katze").filter((f) => !re.test(f.label));

describe("Tierfragen (TKV)", () => {
  it("nur Tierkranken, nicht Privatschutz, Futter oder Halterhaftpflicht", () => {
    expect(istTierStrecke("TKV-Katze")).toBe(true);
    expect(istTierStrecke("Hunde-OP")).toBe(true);
    expect(istTierStrecke("Privatschutz")).toBe(false);
    expect(istTierStrecke("Hundefutter")).toBe(false);
    expect(istTierStrecke("Hundehalter-Haftpflicht")).toBe(false);
  });

  it("volles Formular: Gesundheit, Schutzwunsch, Tierversicherung, Geburtsdatum; nie Kastration", () => {
    expect(offeneTierFragen(katze(), new Set())).toEqual(["gesundheit", "tarifwunsch", "vorhanden", "geburt"]);
    expect(offeneTierFragen(katze({ angaben: { tarifwunsch: "OP", vorhanden: "keine", geburt: "1.1.1990" } }), new Set())).toEqual(["gesundheit"]);
    expect(offeneTierFragen(katze({ angaben: { tiergesundheit: "gesund", tarifwunsch: "OP", vorhanden: "keine", geburt: "1.1.1990" } }), new Set())).toEqual([]);
  });

  it("fehlende Formularfelder: Geburtsjahr (Alter aus dem Chat zählt), Rasse, Geschlecht, Haltung nur bei Katzen", () => {
    const leer = { source: "TKV-Katze", formular: [{ label: "Tierart", value: "Katze" }], angaben: { tarifwunsch: "OP", vorhanden: "keine", geburt: "x" } };
    expect(offeneTierFragen(leer, new Set())).toEqual(["gesundheit", "geburtTier", "rasse", "geschlecht", "haltung"]);
    expect(offeneTierFragen({ ...leer, angaben: { ...leer.angaben, tier: "Katze, 3 Jahre alt" } }, new Set(["gesundheit"]))).toEqual(["rasse", "geschlecht", "haltung"]);
    const hund = { source: "TKV-Hund", formular: [{ label: "Tierart", value: "Hund" }], angaben: leer.angaben };
    expect(offeneTierFragen(hund, new Set())).toEqual(["gesundheit", "geburtTier", "rasse", "geschlecht"]);
    expect(offeneTierFragen({ ...leer, formular: ohne(/haltung/i) }, new Set(["gesundheit"]))).toEqual(["haltung"]);
  });

  it("Texte Sie und du, ohne Name „Ihre Katze“, Gedankenstriche nie", () => {
    expect(tierFrage("gesundheit", katze(), "sie", "Herr Kannapinn").text).toBe("Ist Minka aktuell gesund?");
    const ohneName = katze({ formular: ohne(/tiername/i) });
    expect(tierFrage("gesundheit", ohneName, "sie", "Herr Kannapinn").text).toBe("Ist Ihre Katze aktuell gesund?");
    expect(tierFrage("gesundheit", ohneName, "du", "Ole").text).toBe("Ist deine Katze aktuell gesund?");
    expect(tierFrage("gesundheitDetail", katze(), "du", "Ole").text).toBe("Danke! Was war es ungefähr, und wann? Ein Stichwort reicht, z. B. Zahnbehandlung im Frühjahr. Ole bespricht das im Termin mit dir.");
    expect(tierFrage("geburt", katze(), "du", "Ole").text).toBe("Für das Angebot braucht Ole noch dein Geburtsdatum. Wie lautet es?");
    expect(tierFrage("haltung", ohneName, "du", "Ole").text).toBe("Ist deine Katze eine Wohnungskatze oder ein Freigänger?");
    for (const k of ["gesundheit", "gesundheitDetail", "geburtTier", "rasse", "geschlecht", "haltung", "weitere", "tarifwunsch", "vorhanden", "vorhandenAblauf", "geburt"] as const) {
      for (const an of ["sie", "du"] as const) {
        const f = tierFrage(k, katze(), an, "Herr Kannapinn");
        expect(f.text).not.toMatch(/[–—]/);
        for (const b of f.buttons ?? []) expect(b.title.length).toBeLessThanOrEqual(20);
      }
    }
  });

  it("mehrere Katzen: Gesundheit einmal für alle, Nachfrage welches Tier, eine Frage zu den weiteren", () => {
    const zwei = katze({ formular: testLeadAnswers("TKV-Katze").map((f) => (/anzahl/i.test(f.label) ? { ...f, value: "2" } : f)) });
    expect(tierFrage("gesundheit", zwei, "sie", "Herr Kannapinn").text).toBe("Sind Minka und Ihre anderen Katzen aktuell gesund?");
    expect(tierFrage("gesundheit", zwei, "sie", "Herr Kannapinn").buttons?.[0].title).toBe("Ja, alle gesund");
    expect(tierFrage("gesundheitDetail", zwei, "sie", "Herr Kannapinn").text).toMatch(/^Danke! Welches Tier war es, was war es ungefähr, und wann\?/);
    expect(offeneTierFragen(zwei, new Set(["gesundheit"]))).toContain("weitere");
    expect(tierAntwortAuswerten("gesundheit", "Ja, gesund", "gesund", zwei)?.angaben).toEqual({ tiergesundheit: "alle gesund" });
  });

  it("Auswertung: Knopf, Text, Rückfrage, weiß nicht", () => {
    const q = katze();
    expect(tierAntwortAuswerten("gesundheit", "ja", null, q)).toEqual({ angaben: { tiergesundheit: "gesund" }, beantwortet: ["gesundheit"] });
    for (const t of ["Ja, sie ist kerngesund", "nicht krank", "Nein, keine Probleme", "alles gut", "gesund!"]) expect(tierAntwortAuswerten("gesundheit", t, null, q)?.angaben.tiergesundheit, t).toBe("gesund");
    expect(tierAntwortAuswerten("gesundheit", "nicht ganz gesund", null, q)?.angaben.tiergesundheit).toBe("War in Behandlung");
    expect(tierAntwortAuswerten("gesundheit", "Nein", null, q)).toEqual({ angaben: { tiergesundheit: "War in Behandlung" }, beantwortet: ["gesundheit"] });
    expect(tierAntwortAuswerten("gesundheit", "Ja, aber sie hatte letztes Jahr eine Zahn-OP", null, q)?.angaben.tiergesundheit).toBe("War in Behandlung: Ja, aber sie hatte letztes Jahr eine Zahn-OP");
    expect(tierAntwortAuswerten("gesundheit", "Sie hatte im Sommer Durchfall", null, q)?.beantwortet).toEqual(["gesundheit", "gesundheitDetail"]);
    expect(tierAntwortAuswerten("gesundheit", "Wozu brauchen Sie das?", null, q)).toBeNull();
    expect(tierAntwortAuswerten("gesundheit", "weiß ich nicht", null, q)?.angaben.tiergesundheit).toBe("unklar, im Termin klären");
    expect(tierAntwortAuswerten("vorhanden", "Ja", null, q)).toEqual({ angaben: { vorhanden: "Tierversicherung vorhanden" }, beantwortet: ["vorhanden"] });
    expect(offeneTierFragen(katze({ angaben: { vorhanden: "Tierversicherung vorhanden" } }), new Set(["gesundheit", "vorhanden"]))[1]).toBe("vorhandenAblauf");
    expect(tierAntwortAuswerten("vorhandenAblauf", "März 2027", null, q)?.angaben.vorhanden).toBe("Tierversicherung vorhanden, läuft bis März 2027");
    expect(tierAntwortAuswerten("vorhanden", "Ja, bei der Uelzener bis Juni", null, q)?.beantwortet).toEqual(["vorhanden", "vorhandenAblauf"]);
    expect(tierAntwortAuswerten("tarifwunsch", "Auch Behandlungen", "voll", q)?.angaben.tarifwunsch).toBe("volle Krankenversicherung (auch Tierarztbehandlung)");
  });

  it("Angaben zum Tier anhängen, gleiche Angabe ersetzen, höchstens 200 Zeichen", () => {
    expect(tierErgaenzen("Minka, 4 Jahre", "Rasse", "Perser")).toBe("Minka, 4 Jahre; Rasse: Perser");
    expect(tierErgaenzen("Minka, 4 Jahre; Rasse: Perser", "Rasse", "Maine Coon")).toBe("Minka, 4 Jahre; Rasse: Maine Coon");
    expect(tierErgaenzen("x".repeat(300), "Rasse", "Perser").length).toBeLessThanOrEqual(200);
    expect(tierErgaenzen("x".repeat(300), "Rasse", "Perser")).toMatch(/; Rasse: Perser$/);
  });
});
