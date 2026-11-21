// Erstanschreiben v5 (Ole, 16.11.2026) bzw. seit v6 (17.11.2026): eine Begrüßung, Dank mit Thema, „digitaler
// KI-Assistent von <Vermittler>“, erste offene Frage fett als letzte Zeile; kein „Mensch“ in Nachricht 1.
// Seit v9 (Ole, 18.11.2026) für Leads mit Anfrage eine Zeile ohne Vermittler, Frage fett am Ende, KI-Kennzeichnung im
// Freitext als kursive Zeile darunter (in der Vorlage die Fußzeile); Tierkrankenversicherung „schön, dass Sie … 🐾“.
// Seit v10 (Ole, 19.11.2026) eine feste Frage je Zweck mit Knöpfen, darunter nur „KI-Assistent“; v9 bleibt Rückfall,
// wenn das Formular die feste Frage schon beantwortet.
import { describe, expect, it } from "vitest";
import { erstanschreibenKopf, erstanschreibenText, ersteFrage, v10FrageIn, v10Moeglich, type Herkunft } from "@/lib/whatsapp/erstanschreiben";
import { kurzNameFuerLeads, vornameAus } from "@/lib/advisor-name";
import { hasKiHinweis, kiHinweisNoetig, wantsHuman, ERSTINFO_PDF_CAPTION } from "@/lib/whatsapp/ki-hinweis";
import { buildTemplateRequest, metaTemplateProblems, plannedTemplates } from "@/lib/whatsapp/template-plan";
import { ERSTINFO_FOOTER, ERSTINFO_FOOTER_V8, ERSTINFO_FOOTER_V9, ERSTINFO_FOOTER_V10, ERSTINFO_FOOTER_V12, fillNames, OUTREACH_PURPOSES, renderTemplate, templateTextFor } from "@/lib/whatsapp/templates";
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
      "Hallo Herr Müller, schön, dass Sie Ihre Katze gut absichern möchten 🐾 *Was soll abgesichert sein?*\n\n_Digitaler KI-Assistent_",
    );
  });

  it("Du, Lead hat zuerst geschrieben, nur Vorname", () => {
    expect(erstanschreibenText({ an: "du", kontakt: NUR_VORNAME, name: "Ole", source: "Katzenversicherung (TKV)", herkunft: "nachricht" })).toBe(
      "Hallo Thomas, danke für deine Nachricht zur Tierkrankenversicherung! Hier schreibt der digitale KI-Assistent von Ole.\n\n*Wie alt ist deine Katze?*",
    );
  });

  it("Zahnzusatz: neutrale Frage nach dem Tarifbaustein (Art. 9 DSGVO), Sie ohne Nachnamen", () => {
    expect(erstanschreibenText({ an: "sie", kontakt: NUR_VORNAME, name: "Agentur Meier", source: "Zahnzusatz", herkunft: "anfrage" })).toBe(
      "Hallo, danke für Ihre Anfrage zur Zahnzusatzversicherung! *Was ist Ihnen am wichtigsten?*\n\n_Digitaler KI-Assistent_",
    );
  });

  // Sie/Du × Anfrage/Nachricht × mit/ohne Nachnamen, für Katze, Zahn und weitere Produkte
  const quellen = ["Katzenversicherung (TKV)", "Zahnzusatz", "Hundekrankenversicherung", "PKV Wechsel", "Privatschutz", "Sterbegeldversicherung", null];
  const faelle: { an: Ansprache; herkunft: Herkunft; kontakt: typeof MUELLER | typeof NUR_VORNAME | null }[] = [];
  for (const an of ["sie", "du"] as const) for (const herkunft of ["anfrage", "nachricht"] as const) for (const kontakt of [MUELLER, NUR_VORNAME, null]) faelle.push({ an, herkunft, kontakt });

  it.each(quellen)("Regeln für %s: eine Begrüßung, Name höchstens zweimal, kein „Mensch“, keine Gedankenstriche, Frage fett (v10)", (source) => {
    for (const f of faelle) {
      for (const name of ["Ole", "Agentur Susanne Meier"]) {
        const t = erstanschreibenText({ ...f, name, source });
        const was = `${source} ${f.an} ${f.herkunft} ${f.kontakt?.fullName ?? "-"}`;
        expect(t.match(GRUSS) ?? [], was).toHaveLength(1);
        expect(t.startsWith("Hallo"), was).toBe(true);
        expect(anzahl(t, name), was).toBeLessThanOrEqual(2);
        expect(t, was).not.toMatch(/Mensch|berate nicht|kein Mensch/i);
        expect(t, was).not.toMatch(/[–—]/);
        expect(hasKiHinweis(t), was).toBe(true);
        expect(t, was).not.toMatch(/https?:\/\//); // Erstinformation kommt als PDF, nicht als Link
        expect(t, was).not.toContain("??");
        const zeilen = t.split("\n");
        const frage = `*${ersteFrage(source, f.an, name)}*`;
        if (f.herkunft === "anfrage") {
          // v10: eine Zeile mit der festen Frage fett, KI-Kennzeichnung kursiv darunter (nur „KI-Assistent“)
          expect(v10Moeglich(source, []), was).toBe(true);
          expect(zeilen, was).toHaveLength(3);
          expect(v10FrageIn(zeilen[0]), was).not.toBeNull();
          expect(zeilen[0], was).toMatch(/\*[^*]+\?\*$/);
          expect(zeilen.at(-1), was).toBe("_Digitaler KI-Assistent_");
          expect(t, was).not.toMatch(/Assistent von/); // ohne Vermittler im Dank
          // Tierkrankenversicherung emotional, sonst Dank für die Anfrage
          expect(t, was).toContain(/Katze|Hund/.test(source ?? "") ? "gut absichern" : "Anfrage");
        } else {
          // Lead hat zuerst geschrieben: Kopf mit KI im Satz, Frage fett als letzte Zeile
          expect(t, was).toContain("digitale KI-Assistent");
          expect(zeilen.at(-1), was).toBe(frage);
          expect(t, was).toContain("Nachricht");
        }
        expect(frage, was).toMatch(/^\*[^*?]+\?\*$/); // fett
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

  it("ohne Produkt: feste Telefonatsfrage (v10); ohne Lead allgemein", () => {
    const t = erstanschreibenText({ an: "sie", kontakt: MUELLER, name: "Ole", vermittler: "Herrn Schmidt", vermittlerNom: "Herr Schmidt", source: null });
    expect(t).toBe("Hallo Herr Müller, danke für Ihre Anfrage! *Wann passt Ihnen ein kurzes Telefonat?*\n\n_Digitaler KI-Assistent_");
    // schon gebucht: v9 mit der Frage, ob der Vermittler vorab etwas wissen sollte
    expect(erstanschreibenText({ an: "sie", kontakt: MUELLER, name: "Ole", vermittler: "Herrn Schmidt", vermittlerNom: "Herr Schmidt", source: null, gebucht: true })).toBe(
      "Hallo Herr Müller, danke für Ihre Anfrage! *Gibt es vorab noch etwas, das Herr Schmidt für den Termin wissen sollte?*\n\n_KI-Assistent · Erstinformation folgt als PDF_",
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

  it("Vorlage mit Parametern ergibt denselben Text wie der Freitext (v10, Fassung a und b)", () => {
    const fall = [
      { purpose: "outreach_tkv" as const, source: "TKV Katze", sie: ["Herr Müller", "Ihre Katze"], du: ["Thomas", "deine Katze"] },
      { purpose: "outreach_zahn" as const, source: "Zahnzusatz", sie: ["Herr Müller"], du: ["Thomas"] },
      { purpose: "outreach" as const, source: null, sie: ["Herr Müller"], du: ["Thomas"] },
    ];
    const opts = (an: Ansprache, kontakt: typeof MUELLER | null, source: string | null) => ({ an, kontakt, name: "Ole", vermittler: an === "du" ? "Ole" : "Herrn Schmidt", vermittlerNom: an === "du" ? "Ole" : "Herr Schmidt", source });
    for (const f of fall) {
      for (const an of ["sie", "du"] as const) {
        const tpl = renderTemplate(fillNames(templateTextFor(f.purpose, an), names), f[an]);
        // gleicher Text; im Freitext steht die KI-Kennzeichnung der Fußzeile als kursive Zeile darunter
        expect(tpl, `${f.purpose} ${an}`).toBe(erstanschreibenText(opts(an, MUELLER, f.source), { ohneFuss: true }));
        expect(erstanschreibenText(opts(an, MUELLER, f.source)), `${f.purpose} ${an}`).toBe(`${tpl}\n\n_Digitaler KI-Assistent_`);
        // Fassung b (v11): ebenso gleich
        const tplB = renderTemplate(fillNames(templateTextFor(f.purpose, an, "b"), names), f[an]);
        expect(tplB, `${f.purpose} ${an} b`).toBe(erstanschreibenText({ ...opts(an, MUELLER, f.source), variant: "b" }, { ohneFuss: true }));
      }
      // Sie ohne Namen: „Hallo,“ und Platzhalter rücken auf
      const ohne = renderTemplate(fillNames(templateTextFor(f.purpose, "sie_ohne_name"), names), f.sie.slice(1));
      expect(ohne).toBe(erstanschreibenText(opts("sie", null, f.source), { ohneFuss: true }));
    }
  });

  it("alle v10-Fassungen erfüllen Metas Regeln, immer mit PDF im Kopf, Fußzeile höchstens 60 Zeichen", () => {
    expect(ERSTINFO_FOOTER.length).toBeLessThanOrEqual(60);
    expect(ERSTINFO_FOOTER_V8.length).toBeLessThanOrEqual(60);
    expect(ERSTINFO_FOOTER_V9.length).toBeLessThanOrEqual(60);
    expect(ERSTINFO_FOOTER_V10).toBe("KI-Assistent");
    for (const { purpose, form, variant, kopf } of plannedTemplates([...OUTREACH_PURPOSES])) {
      const req = buildTemplateRequest(purpose, names, undefined, form, { variant, documentExample: "https://x.de/erstinformation/abc/pdf", kopf });
      expect(req.name).toMatch(/_v1[23](_|$)/);
      expect(kopf).toBe(true);
      const comps = req.components as { type: string; text?: string; example?: { body_text: string[][] } }[];
      expect(comps[0].type).toBe(kopf ? "HEADER" : "BODY");
      const body = comps.find((c) => c.type === "BODY")!;
      expect(metaTemplateProblems(body.text!, body.example?.body_text[0] ?? []), `${req.name}: ${body.text}`).toEqual([]);
      expect(body.text).not.toMatch(/Mensch|\[(Firma|Berater|Rolle|Kurzname)\]/);
      expect(body.text).not.toMatch(/[–—]|\?\?/);
      expect(comps.find((c) => c.type === "FOOTER")?.text).toBe(ERSTINFO_FOOTER_V12);
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
