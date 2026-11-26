// Feste Tierfragen nach der Buchung (TKV, lib/whatsapp/tier-fragen.ts): nur was fehlt, du/Sie, mehrere Tiere, Auswertung.
import { describe, expect, it } from "vitest";
import { istTierStrecke, offeneTierFragen, tierAntwortAuswerten, tierErgaenzen, tierFrage, type TierQuelle } from "@/lib/whatsapp/tier-fragen";
import { testLeadAnswers } from "@/lib/testlead";
import { kennzeichnungAusFormular, kennzeichnungLesen } from "@/lib/tier-kennzeichnung";

// Volles Formular mit der neuen Frage zur Kennzeichnung (Ole, 26.11.2026: kommt ins Meta-Formular)
const VOLL = [...testLeadAnswers("TKV-Katze"), { label: "Ist Ihre Katze gechippt oder tätowiert?", value: "Gechippt" }];
const katze = (o: Partial<TierQuelle> = {}): TierQuelle => ({ source: "TKV-Katze", formular: VOLL, angaben: {}, ...o });
const ohne = (re: RegExp) => VOLL.filter((f) => !re.test(f.label));

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
    expect(offeneTierFragen(leer, new Set())).toEqual(["gesundheit", "geburtTier", "rasse", "geschlecht", "haltung", "kennzeichnung"]);
    expect(offeneTierFragen({ ...leer, angaben: { ...leer.angaben, tier: "Katze, 3 Jahre alt" } }, new Set(["gesundheit"]))).toEqual(["rasse", "geschlecht", "haltung", "kennzeichnung"]);
    const hund = { source: "TKV-Hund", formular: [{ label: "Tierart", value: "Hund" }], angaben: leer.angaben };
    expect(offeneTierFragen(hund, new Set())).toEqual(["gesundheit", "geburtTier", "rasse", "geschlecht", "kennzeichnung"]);
    expect(offeneTierFragen({ ...leer, formular: ohne(/haltung/i) }, new Set(["gesundheit"]))).toEqual(["haltung"]);
  });

  it("Texte Sie und du, ohne Name „Ihre Katze“, Gedankenstriche nie", () => {
    expect(tierFrage("gesundheit", katze(), "sie", "Herr Kannapinn").text).toBe("Ist Minka aktuell gesund?");
    const ohneName = katze({ formular: ohne(/tiername/i) });
    expect(tierFrage("gesundheit", ohneName, "sie", "Herr Kannapinn").text).toBe("Ist Ihre Katze aktuell gesund?");
    expect(tierFrage("gesundheit", ohneName, "du", "Ole").text).toBe("Ist deine Katze aktuell gesund?");
    expect(tierFrage("gesundheitDetail", katze(), "du", "Ole").text).toBe("Danke! Was war es ungefähr, und wann? Ein Stichwort reicht, z. B. Zahnbehandlung im Frühjahr. Ole bespricht das im Termin mit dir.");
    expect(tierFrage("geburt", katze(), "du", "Ole").text).toBe("Für das Angebot braucht Ole noch dein eigenes Geburtsdatum als Versicherungsnehmer. Wie lautet es?");
    expect(tierFrage("haltung", ohneName, "du", "Ole").text).toBe("Ist deine Katze eine Wohnungskatze oder ein Freigänger?");
    for (const k of ["gesundheit", "gesundheitDetail", "geburtTier", "rasse", "geschlecht", "haltung", "kennzeichnung", "weitere", "tarifwunsch", "vorhanden", "vorhandenAblauf", "geburt", "geburtEigen", "geburtNochmal"] as const) {
      for (const an of ["sie", "du"] as const) {
        const f = tierFrage(k, katze(), an, "Herr Kannapinn");
        expect(f.text).not.toMatch(/[–—]/);
        for (const b of f.buttons ?? []) expect(b.title.length).toBeLessThanOrEqual(20);
        for (const z of f.liste?.zeilen ?? []) expect(z.title.length).toBeLessThanOrEqual(24);
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

  it("Ablauf der Tierversicherung: Monat und Jahr mit Beispiel in etwa 4 Monaten, Antworten gelesen (Ole, 19.11.2026)", () => {
    const heute = new Date("2026-11-19T10:00:00Z");
    const q = katze({ angaben: { vorhanden: "Tierversicherung vorhanden" } });
    for (const an of ["sie", "du"] as const) {
      expect(tierFrage("vorhandenAblauf", q, an, "Herr Kannapinn", heute).text).toBe("Bis wann läuft die Versicherung ungefähr? Monat und Jahr reichen, zum Beispiel 03/2027.");
    }
    expect(tierFrage("vorhandenAblauf", q, "sie", "Herr Kannapinn", new Date("2026-12-31T23:30:00Z")).text).toMatch(/zum Beispiel 05\/2027\.$/);
    const ab = (t: string) => tierAntwortAuswerten("vorhandenAblauf", t, null, q, heute)?.angaben.vorhanden;
    expect(ab("03/27")).toBe("Tierversicherung vorhanden, läuft bis März 2027");
    expect(ab("im März")).toBe("Tierversicherung vorhanden, läuft bis März 2027");
    expect(ab("Ende des Jahres")).toBe("Tierversicherung vorhanden, läuft bis Dezember 2026");
    expect(ab("weiß ich nicht genau")).toBe("Tierversicherung vorhanden, Ablauf offen");
    expect(ab("k.A.")).toBe("Tierversicherung vorhanden, Ablauf offen");
    expect(ab("Uelzener, jährlich")).toBe("Tierversicherung vorhanden, läuft bis Uelzener, jährlich");
    expect(tierAntwortAuswerten("vorhandenAblauf", "keine Ahnung", null, q, heute)?.beantwortet).toEqual(["vorhandenAblauf"]);
  });

  it("Geburtsdatum des Halters geprüft: Tierdatum, Tippfehler, echtes Datum, weiß nicht (Ole, 19.11.2026)", () => {
    const heute = new Date("2026-11-19T10:00:00Z");
    const q = katze();
    expect(tierFrage("geburt", q, "sie", "Herr Kannapinn").text).toBe("Für das Angebot braucht Herr Kannapinn noch Ihr eigenes Geburtsdatum als Versicherungsnehmer. Wie lautet es?");
    expect(tierFrage("geburt", q, "du", "Ole").text).toBe("Für das Angebot braucht Ole noch dein eigenes Geburtsdatum als Versicherungsnehmer. Wie lautet es?");
    // echtes Datum
    expect(tierAntwortAuswerten("geburt", "14.5.1985", null, q, heute)).toEqual({ angaben: { geburt: "14.05.1985" }, beantwortet: ["geburt", "geburtEigen", "geburtNochmal"] });
    // Datum der Katze (Formular: März 2022): neben dem bekannten notiert, dann einmal nach dem eigenen fragen
    const katzenDatum = tierAntwortAuswerten("geburt", "23.09.2025", null, q, heute)!;
    expect(katzenDatum.angaben.geburt).toBeUndefined();
    expect(katzenDatum.angaben.tier).toBe("Datum aus dem Chat: 23.09.2025");
    const nach = offeneTierFragen(q, new Set(["gesundheit", "tarifwunsch", "vorhanden", ...katzenDatum.beantwortet]));
    expect(nach).toEqual(["geburtEigen"]);
    expect(tierFrage("geburtEigen", q, "sie", "Herr Kannapinn").text).toBe(
      "Danke, das ist sicher das Geburtsdatum von Minka, das habe ich notiert. Für den Vertrag braucht Herr Kannapinn noch Ihr eigenes Geburtsdatum.",
    );
    const ohneName = katze({ formular: ohne(/tiername/i) });
    expect(tierFrage("geburtEigen", ohneName, "du", "Ole").text).toBe("Danke, das ist sicher das Geburtsdatum deiner Katze, das habe ich notiert. Für den Vertrag braucht Ole noch dein eigenes Geburtsdatum.");
    // ohne bekanntes Tierdatum bzw. gleiches Jahr: als Geburtsdatum des Tieres
    const ohneJahr = katze({ formular: ohne(/geburts(jahr|monat)/i) });
    expect(tierAntwortAuswerten("geburt", "23.09.2025", null, ohneJahr, heute)?.angaben.tier).toBe("Geboren: 23.09.2025");
    // danach das eigene
    expect(tierAntwortAuswerten("geburtEigen", "14.05.1985", null, q, heute)?.angaben.geburt).toBe("14.05.1985");
    // Tippfehler in der Zukunft: einmal neu fragen
    const zukunft = tierAntwortAuswerten("geburt", "1.1.2090", null, q, heute)!;
    expect(zukunft.angaben).toEqual({});
    expect(offeneTierFragen(q, new Set(["gesundheit", "tarifwunsch", "vorhanden", ...zukunft.beantwortet]))).toEqual(["geburtNochmal"]);
    expect(tierFrage("geburtNochmal", q, "sie", "Herr Kannapinn").text).toBe("Das Datum scheint nicht zu passen. Wie lautet Ihr Geburtsdatum, zum Beispiel 14.05.1985?");
    // zweites unpassendes Datum: offen, keine weitere Frage
    const zweite = tierAntwortAuswerten("geburtNochmal", "1.1.1900", null, q, heute)!;
    expect(zweite.angaben.geburt).toBe("offen (Angabe: 01.01.1900)");
    expect(offeneTierFragen(q, new Set(["gesundheit", "tarifwunsch", "vorhanden", ...zukunft.beantwortet, ...zweite.beantwortet]))).toEqual([]);
    // weiß nicht: weiter
    expect(tierAntwortAuswerten("geburt", "weiß ich nicht", null, q, heute)?.angaben.geburt).toBe("offen");
  });

  it("Angaben zum Tier anhängen, gleiche Angabe ersetzen, höchstens 200 Zeichen", () => {
    expect(tierErgaenzen("Minka, 4 Jahre", "Rasse", "Perser")).toBe("Minka, 4 Jahre; Rasse: Perser");
    expect(tierErgaenzen("Minka, 4 Jahre; Rasse: Perser", "Rasse", "Maine Coon")).toBe("Minka, 4 Jahre; Rasse: Maine Coon");
    expect(tierErgaenzen("x".repeat(300), "Rasse", "Perser").length).toBeLessThanOrEqual(200);
    expect(tierErgaenzen("x".repeat(300), "Rasse", "Perser")).toMatch(/; Rasse: Perser$/);
  });
});

describe("Kennzeichnung (Chip, Tätowierung), Ole 26.11.2026", () => {
  const ohneChip = katze({ formular: ohne(/gechippt/i) });
  it("Formular mit Antwort: keine Frage (deutsch, englisch, ohne Umlaut, Ja/Nein, auch unbekannte Werte)", () => {
    expect(offeneTierFragen(katze(), new Set())).not.toContain("kennzeichnung");
    for (const [label, value] of [
      ["ist_ihre_katze_gechippt_oder_tätowiert?", "taetowiert"],
      ["Is your pet microchipped?", "yes"],
      ["Kennzeichnung", "beides"],
      ["Chip / Tattoo", "irgendwas"],
    ]) {
      expect(offeneTierFragen(katze({ formular: [...ohneChip.formular, { label, value }] }), new Set()), label).not.toContain("kennzeichnung");
    }
    // schon im Chat genannt
    expect(offeneTierFragen(katze({ formular: ohneChip.formular, angaben: { tier: "Katze, gechippt" } }), new Set())).not.toContain("kennzeichnung");
  });

  it("ohne Formular: Frage nach Haltung, als Liste mit fünf Zeilen, Text Sie und du", () => {
    expect(offeneTierFragen(ohneChip, new Set())).toEqual(["gesundheit", "kennzeichnung", "tarifwunsch", "vorhanden", "geburt"]);
    const leer = { source: "TKV-Katze", formular: [{ label: "Tierart", value: "Katze" }], angaben: {} };
    const reihe = offeneTierFragen(leer, new Set());
    expect(reihe.indexOf("kennzeichnung")).toBe(reihe.indexOf("haltung") + 1);
    const f = tierFrage("kennzeichnung", ohneChip, "sie", "Herr Kannapinn");
    expect(f.text).toBe("Ist Minka gechippt oder tätowiert?");
    expect(f.buttons).toBeNull();
    expect(f.liste?.zeilen).toEqual([
      { id: "tier:kennzeichnung:chip", title: "Gechippt" },
      { id: "tier:kennzeichnung:tattoo", title: "Tätowiert" },
      { id: "tier:kennzeichnung:beides", title: "Beides" },
      { id: "tier:kennzeichnung:keine", title: "Weder noch" },
      { id: "tier:kennzeichnung:unbekannt", title: "Weiß ich nicht" },
    ]);
    const ohneName = katze({ formular: ohne(/gechippt|tiername/i) });
    expect(tierFrage("kennzeichnung", ohneName, "sie", "Herr Kannapinn").text).toBe("Ist Ihre Katze gechippt oder tätowiert?");
    expect(tierFrage("kennzeichnung", ohneName, "du", "Ole").text).toBe("Ist deine Katze gechippt oder tätowiert?");
    const hund = { source: "TKV-Hund", formular: [{ label: "Tierart", value: "Hund" }], angaben: {} };
    expect(tierFrage("kennzeichnung", hund, "sie", "Herr Kannapinn").text).toBe("Ist Ihr Hund gechippt oder tätowiert?");
    expect(offeneTierFragen({ source: "Pferde-OP", formular: [{ label: "Tierart", value: "Pferd" }], angaben: {} }, new Set())).toContain("kennzeichnung");
  });

  it("mehrere Tiere: Frage zum ersten, die weiteren in der Sammelfrage", () => {
    const zwei = katze({ formular: ohneChip.formular.map((f) => (/anzahl/i.test(f.label) ? { ...f, value: "2" } : f)) });
    expect(offeneTierFragen(zwei, new Set(["gesundheit"]))).toEqual(["kennzeichnung", "weitere", "tarifwunsch", "vorhanden", "geburt"]);
    expect(tierFrage("weitere", zwei, "sie", "Herr Kannapinn").text).toMatch(/ob gechippt oder tätowiert\.$/);
  });

  it("Antwort gespeichert: Knopf, getippt, weiß nicht", () => {
    const q = katze({ formular: ohneChip.formular, angaben: { tier: "Rasse: Perser" } });
    expect(tierAntwortAuswerten("kennzeichnung", "Gechippt", "chip", q)).toEqual({ angaben: { tier: "Rasse: Perser; Kennzeichnung: gechippt" }, beantwortet: ["kennzeichnung"] });
    expect(tierAntwortAuswerten("kennzeichnung", "Weder noch", "keine", q)?.angaben.tier).toMatch(/Kennzeichnung: weder gechippt noch tätowiert$/);
    expect(tierAntwortAuswerten("kennzeichnung", "Weiß ich nicht", "unbekannt", q)?.angaben.tier).toMatch(/Kennzeichnung: offen$/);
    expect(tierAntwortAuswerten("kennzeichnung", "ja sie ist gechippt und tätowiert", null, q)?.angaben.tier).toMatch(/Kennzeichnung: gechippt und tätowiert$/);
    expect(tierAntwortAuswerten("kennzeichnung", "nur tätowiert", null, q)?.angaben.tier).toMatch(/Kennzeichnung: tätowiert$/);
    expect(tierAntwortAuswerten("kennzeichnung", "weiß ich nicht", null, q)?.angaben.tier).toMatch(/Kennzeichnung: offen$/);
    expect(tierAntwortAuswerten("kennzeichnung", "Was bringt das?", null, q)).toBeNull();
    expect(offeneTierFragen({ ...q, angaben: { tier: "Kennzeichnung: gechippt" } }, new Set())).not.toContain("kennzeichnung");
  });
});

describe("kennzeichnungLesen (Formularwerte und Chat)", () => {
  it("Werte und Schreibweisen", () => {
    const fall: [string, string | null, string | null][] = [
      ["Gechippt", null, "chip"],
      ["Ja, gechippt", null, "chip"],
      ["microchip", null, "chip"],
      ["276098106543210", null, "chip"],
      ["Tätowiert", null, "tattoo"],
      ["taetowiert", null, "tattoo"],
      ["tatowiert", null, "tattoo"],
      ["tattoo", null, "tattoo"],
      ["Beides", null, "beides"],
      ["gechippt_und_tätowiert", null, "beides"],
      ["both", null, "beides"],
      ["Nein", null, "keine"],
      ["weder noch", null, "keine"],
      ["nicht gechippt", null, "keine"],
      ["none", null, "keine"],
      ["weiß nicht", null, "unbekannt"],
      ["weiss ich nicht", null, "unbekannt"],
      ["ja", "Ist Ihre Katze gechippt?", "chip"],
      ["ja", "Tätowiert?", "tattoo"],
      ["ja", "Gechippt oder tätowiert?", "ja"],
      ["Bello", null, null],
      ["", null, null],
    ];
    for (const [wert, label, erwartet] of fall) expect(kennzeichnungLesen(wert, label), wert).toBe(erwartet);
    expect(kennzeichnungAusFormular([{ label: "Kastriert (Tier)", value: "Ja" }])).toBeNull();
    expect(kennzeichnungAusFormular([{ label: "ist_ihre_katze_gechippt_oder_tätowiert?", value: "weder_noch" }])).toEqual({ art: "keine", text: "weder gechippt noch tätowiert" });
    expect(kennzeichnungAusFormular([{ label: "Kennzeichnung", value: "Lebensnummer" }])).toEqual({ art: null, text: "Lebensnummer" });
  });
});
