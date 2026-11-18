// Erstanschreiben v5 (Ole, 16.11.2026) bzw. seit v6 (17.11.2026): eine Begrüßung, Dank mit Thema, „digitaler
// KI-Assistent von <Vermittler>“, erste offene Frage fett als letzte Zeile; kein „Mensch“ in Nachricht 1.
import { describe, expect, it } from "vitest";
import { erstanschreibenKopf, erstanschreibenText, ersteFrage, type Herkunft } from "@/lib/whatsapp/erstanschreiben";
import { kurzNameFuerLeads, vornameAus } from "@/lib/advisor-name";
import { hasKiHinweis, kiHinweisNoetig, wantsHuman, ERSTINFO_PDF_CAPTION } from "@/lib/whatsapp/ki-hinweis";
import { buildTemplateRequest, metaTemplateProblems, plannedTemplates } from "@/lib/whatsapp/template-plan";
import { ERSTINFO_FOOTER, fillNames, OUTREACH_PURPOSES, renderTemplate, templateTextFor } from "@/lib/whatsapp/templates";
import { buildSystemPrompt } from "@/lib/whatsapp/bot";
import { erstinfoPdfHash } from "@/lib/erstinformation";
import type { ErstinfoDaten } from "@/lib/erstinformation-shared";
import type { Ansprache } from "@/lib/ansprache";

const MUELLER = { fullName: "Thomas Müller", salutation: "Herr" };
const NUR_VORNAME = { fullName: "Thomas" };
const GRUSS = /\b(Hallo|Guten Tag|Guten Morgen|Guten Abend|Hi|Moin|Servus)\b/g;
const anzahl = (t: string, s: string) => t.split(s).length - 1;

describe("Erstanschreiben (seit v6): Text", () => {
  it("Beispiel Katze, Sie, Meta-Lead mit Nachnamen (genau so)", () => {
    expect(erstanschreibenText({ an: "sie", kontakt: MUELLER, name: "Ole", vermittler: "Herrn Schmidt", source: "Katzenversicherung (TKV)", herkunft: "anfrage" })).toBe(
      "Hallo Herr Müller, danke für Ihre Anfrage zur Katzenversicherung 🐱! Ich bin der digitale KI-Assistent von Herrn Schmidt und kläre kurz ein paar Angaben, damit er Ihnen für Ihre Katze den passenden Schutz zeigen kann.\n\nWie alt ist Ihre Katze?",
    );
  });

  it("Du, Lead hat zuerst geschrieben, nur Vorname", () => {
    expect(erstanschreibenText({ an: "du", kontakt: NUR_VORNAME, name: "Ole", source: "Katzenversicherung (TKV)", herkunft: "nachricht" })).toBe(
      "Hallo Thomas, danke für deine Nachricht zur Katzenversicherung 🐱! Ich bin der digitale KI-Assistent von Ole und kläre kurz ein paar Angaben, damit Ole dir für deine Katze den passenden Schutz zeigen kann.\n\nWie alt ist deine Katze?",
    );
  });

  it("Zahnzusatz: neutrale Frage nach dem Tarifbaustein (Art. 9 DSGVO), Sie ohne Nachnamen", () => {
    expect(erstanschreibenText({ an: "sie", kontakt: NUR_VORNAME, name: "Agentur Meier", source: "Zahnzusatz", herkunft: "anfrage" })).toBe(
      "Hallo, danke für Ihre Anfrage zur Zahnzusatzversicherung! Ich bin der digitale KI-Assistent von Agentur Meier und kläre kurz ein paar Angaben, damit Agentur Meier Ihnen persönlich den passenden Schutz zeigen kann.\n\nWelcher Tarifbaustein ist Ihnen am wichtigsten?",
    );
  });

  // Sie/Du × Anfrage/Nachricht × mit/ohne Nachnamen, für Katze, Zahn und weitere Produkte
  const quellen = ["Katzenversicherung (TKV)", "Zahnzusatz", "Hundekrankenversicherung", "PKV Wechsel", "Privatschutz", "Sterbegeldversicherung", null];
  const faelle: { an: Ansprache; herkunft: Herkunft; kontakt: typeof MUELLER | typeof NUR_VORNAME | null }[] = [];
  for (const an of ["sie", "du"] as const) for (const herkunft of ["anfrage", "nachricht"] as const) for (const kontakt of [MUELLER, NUR_VORNAME, null]) faelle.push({ an, herkunft, kontakt });

  it.each(quellen)("Regeln für %s: eine Begrüßung, Name höchstens zweimal, kein „Mensch“, keine Gedankenstriche, Frage am Ende (nicht fett)", (source) => {
    for (const f of faelle) {
      for (const name of ["Ole", "Agentur Susanne Meier"]) {
        const t = erstanschreibenText({ ...f, name, source });
        const was = `${source} ${f.an} ${f.herkunft} ${f.kontakt?.fullName ?? "-"}`;
        expect(t.match(GRUSS) ?? [], was).toHaveLength(1);
        expect(t.startsWith("Hallo"), was).toBe(true);
        // v8: ohne bekannte Anrede steht der Name auch im Nutzen-Halbsatz (dann höchstens dreimal, wenn die Frage ihn
        // nennt); mit Anrede „er“/„sie“ höchstens zweimal
        expect(anzahl(t, name), was).toBeLessThanOrEqual(ersteFrage(source, f.an, name).includes(name) ? 3 : 2);
        expect(anzahl(erstanschreibenText({ ...f, name, source, vermittlerAnrede: "Frau" }), name), was).toBeLessThanOrEqual(2);
        expect(t, was).not.toMatch(/Mensch|berate nicht|kein Mensch/i);
        expect(t, was).not.toMatch(/[–—]/);
        expect(t, was).toContain("digitale KI-Assistent");
        expect(hasKiHinweis(t), was).toBe(true);
        expect(t, was).not.toMatch(/https?:\/\//); // Erstinformation kommt als PDF, nicht als Link
        const zeilen = t.split("\n");
        expect(zeilen.at(-1), was).toBe(ersteFrage(source, f.an, name));
        expect(zeilen.at(-1), was).toMatch(/^[^*?]+\?$/); // v7: nicht fett
        // Herkunft: „Anfrage“ (Formular) bzw. „Nachricht“ (Lead hat zuerst geschrieben)
        expect(t, was).toContain(f.herkunft === "anfrage" ? "Anfrage" : "Nachricht");
        // Ansprache
        if (f.an === "du") expect(t, was).not.toMatch(/\b(Sie|Ihnen|Ihre?)\b/);
        else expect(t, was).not.toMatch(/\b(du|dir|dich|deine?)\b/);
      }
    }
  });

  it("Anrede: Sie mit Nachnamen „Hallo Herr Müller,“, sonst „Hallo,“; Du „Hallo Thomas,“", () => {
    const k = (an: Ansprache, kontakt: unknown) => erstanschreibenKopf({ an, kontakt: kontakt as typeof MUELLER, name: "Ole", source: "TKV Katze" }).split(" danke")[0];
    expect(k("sie", MUELLER)).toBe("Hallo Herr Müller,");
    expect(k("sie", { fullName: "Frau Schneider" })).toBe("Hallo Frau Schneider,");
    expect(k("sie", NUR_VORNAME)).toBe("Hallo,");
    expect(k("sie", null)).toBe("Hallo,");
    expect(k("du", MUELLER)).toBe("Hallo Thomas,");
    expect(k("du", null)).toBe("Hallo,");
  });

  it("ohne Produkt: Telefonatsfrage mit dem Vermittler; ohne Lead allgemein", () => {
    const t = erstanschreibenText({ an: "sie", kontakt: MUELLER, name: "Ole", vermittler: "Herrn Schmidt", vermittlerNom: "Herr Schmidt", source: null });
    expect(t).toBe(
      "Hallo Herr Müller, danke für Ihre Anfrage zum Thema Versicherung! Ich bin der digitale KI-Assistent von Herrn Schmidt und kläre kurz ein paar Angaben, damit er Ihnen persönlich den passenden Schutz zeigen kann.\n\nWann erreicht Herr Schmidt Sie am besten für ein kurzes Telefonat?",
    );
    expect(erstanschreibenKopf({ an: "du", kontakt: null, name: "Ole", herkunft: "nachricht", ohneLead: true })).toBe("Hallo, danke für deine Nachricht! Ich bin der digitale KI-Assistent von Ole und helfe dir gern weiter.");
  });

  it("die erste Nachricht zählt als KI-Kennzeichnung (kein zweiter Hinweis in der nächsten Antwort)", () => {
    const t = erstanschreibenText({ an: "sie", kontakt: MUELLER, name: "Ole", source: "TKV Katze" });
    expect(kiHinweisNoetig({ outbound: [t], previousAt: new Date(), now: new Date() })).toBeNull();
  });
});

describe("Erstanschreiben (seit v6): Vorlage (Meta)", () => {
  const names = { firm: "Agentur Ole Schmidt", advisor: "Ole Schmidt", kurz: "Ole" };

  it("Vorlage v7 mit Parametern ergibt den bisherigen Aufbau (Freitext ist seit P2 v8, siehe erstanschreiben-v8.test.ts)", () => {
    const fall = [
      { purpose: "outreach_tkv" as const, source: "TKV Katze", sie: ["Herr Müller", "Katzenversicherung", "Herrn Schmidt", "Wie alt ist Ihre Katze"], du: ["Thomas", "Katzenversicherung", "Ole", "Wie alt ist deine Katze"] },
      { purpose: "outreach_zahn" as const, source: "Zahnzusatz", sie: ["Herr Müller", "Zahnzusatzversicherung", "Herrn Schmidt", "Welcher Tarifbaustein ist Ihnen am wichtigsten"], du: ["Thomas", "Zahnzusatzversicherung", "Ole", "Welcher Tarifbaustein ist dir am wichtigsten"] },
      { purpose: "outreach" as const, source: null, sie: ["Herr Müller", "Versicherung", "Herrn Schmidt", "Wann erreicht Herr Schmidt Sie am besten für ein kurzes Telefonat"], du: ["Thomas", "Versicherung", "Ole", "Wann erreicht Ole dich am besten für ein kurzes Telefonat"] },
    ];
    for (const f of fall) {
      for (const an of ["sie", "du"] as const) {
        const tpl = renderTemplate(fillNames(templateTextFor(f.purpose, an), names), f[an]);
        const frei = erstanschreibenText({ an, kontakt: MUELLER, name: "Ole", vermittler: an === "du" ? "Ole" : "Herrn Schmidt", vermittlerNom: an === "du" ? "Ole" : "Herr Schmidt", source: f.source });
        // gleicher Gruß, gleicher Vermittler, gleiche erste Frage am Ende
        expect(tpl.split(" danke")[0], `${f.purpose} ${an}`).toBe(frei.split(" danke")[0]);
        expect(frei.endsWith(`\n\n${f[an].at(-1)}?`)).toBe(true);
        expect(tpl.endsWith(`\n\n${f[an].at(-1)}?`)).toBe(true);
      }
      // Sie ohne Namen: „Hallo,“ und Platzhalter rücken auf
      const ohne = renderTemplate(fillNames(templateTextFor(f.purpose, "sie_ohne_name"), names), f.sie.slice(1));
      expect(ohne.startsWith("Hallo, danke für Ihre Anfrage")).toBe(true);
    }
  });

  it("alle v7-Fassungen erfüllen Metas Regeln, immer mit PDF im Kopf, Fußzeile höchstens 60 Zeichen", () => {
    expect(ERSTINFO_FOOTER.length).toBeLessThanOrEqual(60);
    for (const { purpose, form, variant, kopf } of plannedTemplates([...OUTREACH_PURPOSES])) {
      const req = buildTemplateRequest(purpose, names, undefined, form, { variant, documentExample: "https://x.de/erstinformation/abc/pdf", kopf });
      expect(req.name).toMatch(/_v7(_|$)/);
      expect(kopf).toBe(true);
      const comps = req.components as { type: string; text?: string; example?: { body_text: string[][] } }[];
      expect(comps[0].type).toBe(kopf ? "HEADER" : "BODY");
      const body = comps.find((c) => c.type === "BODY")!;
      expect(metaTemplateProblems(body.text!, body.example?.body_text[0] ?? []), `${req.name}: ${body.text}`).toEqual([]);
      expect(body.text).not.toMatch(/Mensch|\[(Firma|Berater|Rolle|Kurzname)\]/);
    }
  });
});

describe("Name im Erstanschreiben: Vorname laut Profil, sonst Agentur", () => {
  it("vornameAus und kurzNameFuerLeads", () => {
    expect(vornameAus("Ole Schmidt")).toBe("Ole");
    expect(vornameAus("Ole")).toBe("Ole");
    expect(vornameAus("Dr. Anna Weber")).toBe("Anna");
    expect(vornameAus("Agentur Meier")).toBeNull();
    expect(vornameAus("")).toBeNull();
    expect(kurzNameFuerLeads({ assignedDisplayName: "Tom Berater", profilName: "Ole Schmidt", customerName: "Agentur Ole Schmidt" })).toBe("Tom");
    expect(kurzNameFuerLeads({ profilName: "Ole Schmidt", customerName: "Agentur Ole Schmidt" })).toBe("Ole");
    expect(kurzNameFuerLeads({ profilName: null, customerName: "Allianz Agentur Meier" })).toBe("Agentur Meier");
  });
});

describe("Assistent: Übergabe und Tariffragen bleiben ausdrücklich", () => {
  it("wantsHuman: Mensch, Anruf, Rückruf oder der Vermittler persönlich; nicht „lieber telefonieren“", () => {
    const names = { names: ["Ole", "Ole Schmidt"] };
    for (const t of ["Mensch", "Rufen Sie mich bitte an", "ruf mich zurück", "Können Sie mich anrufen?", "Ich hätte gerne einen Rückruf", "Rückruf bitte", "Kann ich mit Ole sprechen?", "Ole soll mich bitte anrufen", "Ist Herr Schmidt erreichbar?"]) {
      expect(wantsHuman(t, { names: [...names.names, "Schmidt"] }), t).toBe(true);
    }
    for (const t of ["Lieber telefonieren", "Telefon", "Video bitte", "Morgen", "3 Jahre", "Was kostet das?", "Starker Zahnersatz"]) {
      expect(wantsHuman(t, names), t).toBe(false);
    }
  });

  it("System-Prompt: Übergabe jederzeit (mit Push) und bei Tariffragen „berate nicht zu Tarifen“ plus Termin", () => {
    const p = buildSystemPrompt({ systemPrompt: "", knowledge: "", personality: "" }, "TKV Katze", {
      qualified: false,
      summary: null,
      contact: { name: "Thomas Müller", phone: "49170", email: null },
      upcoming: null,
      formAnswers: [],
      advisorName: "Ole Schmidt",
      aiDisclosed: true,
      ansprache: "sie",
    });
    expect(p).toContain("Übergabe jederzeit");
    expect(p).toContain("nutze sofort handover_to_advisor");
    expect(p).toContain("dass du als KI-Assistent nicht zu Tarifen berätst, und biete direkt einen Termin mit Ole Schmidt an");
  });
});

describe("Erstinformation als PDF (Nachricht 2)", () => {
  const daten: ErstinfoDaten = {
    status: "vertreter",
    erlaubnis: "abs7",
    name: "Ole Schmidt",
    firma: "Agentur Ole Schmidt",
    anschrift: "Musterweg 1, 12345 Berlin",
    telefon: "030 123",
    email: "ole@example.de",
    registerNummer: "D-ABCD-EFGHI-12",
    ihk: "IHK Berlin",
    versicherer: ["Allianz"],
    beratung: true,
    beteiligungen: null,
    verguetung: ["provision"],
    zuwendungen: false,
  };
  it("Hash ändert sich mit den Angaben (neues PDF, neue Adresse), sonst bleibt er gleich", () => {
    const at = new Date("2026-11-16T10:00:00Z");
    const h = erstinfoPdfHash({ daten, an: "sie", updatedAt: at });
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(erstinfoPdfHash({ daten: { ...daten }, an: "sie", updatedAt: new Date(at) })).toBe(h);
    expect(erstinfoPdfHash({ daten: { ...daten, anschrift: "Neuer Weg 2, 12345 Berlin" }, an: "sie", updatedAt: at })).not.toBe(h);
    expect(erstinfoPdfHash({ daten, an: "du", updatedAt: at })).not.toBe(h);
  });
  it("Begleittext ohne Gedankenstriche", () => {
    expect(ERSTINFO_PDF_CAPTION).toBe("Unsere Erstinformation als Versicherungsvermittler, wie gesetzlich vorgesehen.");
  });
});
