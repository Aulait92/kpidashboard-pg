// Fragen-Engine der Terminvorbereitung (Ole, 26.11.2026, lib/vorbereitung/fragen.ts) und Video als Standard bei
// Online-Buchungen (lib/termin-formate.ts buchungsModus). Rein, ohne Datenbank.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { antwortAuswerten, bekannt, feldWert, frageNachricht, fragenPlan, offeneFragen, payloadLesen, REST_KNOPF, type SparteDef } from "@/lib/vorbereitung/fragen";
import { aktiveSparten, SPARTEN_DEFINITIONEN, vorlaeufigeErlaubt } from "@/lib/vorbereitung/sparten";
import { buchungsModus } from "@/lib/termin-formate";
import { anredeZeile } from "@/lib/ansprache";
import { metaTemplateProblems, exampleValuesFor, templateBodyFor, templateNamesOf } from "@/lib/whatsapp/template-plan";
import { vorbereitungAusText } from "@/lib/vorbereitung/fragen";

const JETZT = new Date("2026-11-26T09:00:00.000Z");
const plan = fragenPlan(["haftpflicht", "hausrat"], SPARTEN_DEFINITIONEN);
const frage = (id: string) => plan.find((f) => f.id === id)!;

describe("Fragen-Engine: Plan und Bekanntes", () => {
  it("Pflicht vor optional, geteilte Fragen nur einmal, nur Sparten mit Definition", () => {
    expect(plan.map((f) => f.id)).toEqual(["haftpflicht.mitversicherte", "haftpflicht.beruf", "hausrat.wohnung", "haftpflicht.vorvertrag", "haftpflicht.vorschaeden", "hausrat.vorvertrag"]);
    expect(fragenPlan(["kfz"], SPARTEN_DEFINITIONEN)).toEqual([]);
  });
  it("aus Formular bzw. Angaben bekannte Fragen werden übersprungen", () => {
    const q = { formular: [{ label: "Beruf", value: "Angestellt" }], angaben: { versichern: "Familie", vorhanden: "Haftpflicht: HUK-Coburg" }, erledigt: ["hausrat.wohnung"] };
    expect(offeneFragen(plan, q).map((f) => f.id)).toEqual(["haftpflicht.vorschaeden", "hausrat.vorvertrag"]);
    expect(bekannt(frage("hausrat.vorvertrag"), q)).toBe(false);
  });
  it("vorläufige Definitionen sind im Betrieb aus (nur mit Schalter)", () => {
    expect(SPARTEN_DEFINITIONEN.every((d) => d.vorlaeufig)).toBe(true);
    expect(vorlaeufigeErlaubt(undefined)).toBe(false);
    expect(aktiveSparten(SPARTEN_DEFINITIONEN, false)).toEqual([]);
    expect(aktiveSparten(SPARTEN_DEFINITIONEN, true)).toHaveLength(SPARTEN_DEFINITIONEN.length);
    const fertig: SparteDef = { sparte: "x", label: "X", vorlaeufig: false, fragen: [] };
    expect(aktiveSparten([fertig, ...SPARTEN_DEFINITIONEN], false)).toEqual([fertig]);
  });
});

describe("Fragen-Engine: Nachricht", () => {
  it("bis 2 Antworten: Knöpfe mit „Rest im Termin“; mehr: Liste (bis 10 Zeilen); Freitext: nur „Rest im Termin“", () => {
    const k = frageNachricht(frage("haftpflicht.vorschaeden"), "sie", 1);
    expect(k.text).toBe("Letzte kurze Frage: Gab es in den letzten 5 Jahren Schäden?");
    expect(k.buttons?.map((b) => b.title)).toEqual(["Keine Schäden", "Ja, gab es", "Rest im Termin"]);
    expect(k.buttons?.every((b) => b.title.length <= 20)).toBe(true);
    const l = frageNachricht(frage("haftpflicht.beruf"), "du", 5, "Super, danke!");
    expect(l.text).toBe("Super, danke! Noch 5 kurze Fragen. Wie bist du beruflich tätig?");
    expect(l.buttons).toBeNull();
    expect(l.liste?.zeilen.map((z) => z.id)).toEqual(["vf:haftpflicht.beruf:angestellt", "vf:haftpflicht.beruf:selbststaendig", "vf:haftpflicht.beruf:oeffentlich", REST_KNOPF.id]);
    expect(l.liste!.zeilen.length).toBeLessThanOrEqual(10);
    expect(frageNachricht(frage("hausrat.wohnung"), "sie", 2).buttons).toEqual([REST_KNOPF]);
  });
  it("Payloads lesen", () => {
    expect(payloadLesen("vf:haftpflicht.beruf:oeffentlich")).toEqual({ id: "haftpflicht.beruf", option: "oeffentlich" });
    expect(payloadLesen("vf:rest")).toEqual({ rest: true });
    expect(payloadLesen("komplettcheck:ja")).toBeNull();
  });
  it("Texte ohne Gedankenstriche, Sie und Du", () => {
    for (const f of fragenPlan(["haftpflicht", "hausrat", "rechtsschutz", "wohngebaeude"], SPARTEN_DEFINITIONEN)) {
      expect(f.frage.sie).not.toMatch(/[–—]|\b(du|dein)\b/);
      expect(f.frage.du).not.toMatch(/[–—]|\b(Sie|Ihr|Ihre)\b/);
    }
  });
});

describe("Fragen-Engine: Antworten auswerten", () => {
  it("Knopf, Text und Synonyme; Unklares bleibt unklar", () => {
    expect(antwortAuswerten(frage("haftpflicht.mitversicherte"), null, "familie", JETZT)).toEqual({ art: "wert", wert: "Familie" });
    expect(antwortAuswerten(frage("haftpflicht.mitversicherte"), "mit meiner Frau", null, JETZT)).toEqual({ art: "wert", wert: "Paar" });
    expect(antwortAuswerten(frage("haftpflicht.beruf"), "Beamter", null, JETZT)).toEqual({ art: "wert", wert: "Öffentlicher Dienst" });
    expect(antwortAuswerten(frage("haftpflicht.beruf"), "hm", null, JETZT)).toEqual({ art: "unklar" });
  });
  it("zusammengesetzt: Zahlen nach Bereich, Versicherer und Ablauf, „noch nicht versichert“", () => {
    expect(antwortAuswerten(frage("hausrat.wohnung"), "1990 gebaut, 75 qm", null, JETZT)).toEqual({ art: "wert", wert: "75 m², Baujahr 1990" });
    expect(antwortAuswerten(frage("hausrat.wohnung"), "ca. 80", null, JETZT)).toEqual({ art: "wert", wert: "80 m²" });
    expect(antwortAuswerten(frage("hausrat.wohnung"), "groß", null, JETZT)).toEqual({ art: "unklar" });
    expect(antwortAuswerten(frage("hausrat.vorvertrag"), "bei der Allianz, läuft bis März 2027", null, JETZT)).toEqual({ art: "wert", wert: "Allianz, Ablauf 03/2027" });
    expect(antwortAuswerten(frage("hausrat.vorvertrag"), "nein, noch nicht", null, JETZT)).toEqual({ art: "wert", wert: "noch nicht versichert" });
  });
  it("„weiß nicht“ bleibt offen, „Rest lieber im Termin“ stoppt", () => {
    expect(antwortAuswerten(frage("hausrat.wohnung"), "weiß ich nicht", null, JETZT)).toEqual({ art: "offen" });
    expect(antwortAuswerten(frage("hausrat.wohnung"), "Den Rest lieber im Termin", null, JETZT)).toEqual({ art: "rest" });
  });
  it("angehängte Werte mit Sparte, ohne Doppelung", () => {
    const f = frage("hausrat.vorvertrag");
    expect(feldWert(f, "Allianz", null)).toBe("Hausrat: Allianz");
    expect(feldWert(f, "Allianz", "Haftpflicht: HUK-Coburg")).toBe("Haftpflicht: HUK-Coburg; Hausrat: Allianz");
    expect(feldWert(f, "Allianz", "Hausrat: Allianz")).toBe("Hausrat: Allianz");
  });
});

describe("Getippte Antwort auf die Frage nach der Vorbereitung", () => {
  it("kurz und eindeutig", () => {
    expect(vorbereitungAusText("Ja gerne")).toBe("ja");
    expect(vorbereitungAusText("ok 👍")).toBe("ja");
    expect(vorbereitungAusText("lieber im Termin")).toBe("termin");
    expect(vorbereitungAusText("Nein danke")).toBe("termin");
    expect(vorbereitungAusText("Ja, aber kann ich auch per Telefon statt Video?")).toBeNull();
  });
});

describe("Bestätigung v5 und Nachfrage: Texte nach Meta-Regeln", () => {
  const names = templateNamesOf("Allianz Anid Schwarzkopf", undefined, "Anid Schwarzkopf", "Herr");
  it("Sie: „bei Herrn Schwarzkopf“, Frage am Ende; Du: Vorname", () => {
    expect(templateBodyFor("booking_confirmation", names, "sie")).toBe(
      "Guten Tag {{1}}, Ihr Termin bei Herrn Schwarzkopf ist bestätigt: {{2}} ({{3}}). {{4}} Wenn Sie mir vorab ein paar kurze Fragen beantworten, kann Herr Schwarzkopf Ihr Angebot schon vorbereiten und Sie bekommen es schneller. Dauert etwa eine Minute. Wollen wir kurz starten?",
    );
    expect(templateBodyFor("booking_confirmation", names, "du")).toBe(
      "Hallo {{1}}, dein Termin bei Anid ist bestätigt: {{2}} ({{3}}). {{4}} Wenn du mir vorab ein paar kurze Fragen beantwortest, kann Anid dein Angebot schon vorbereiten und du bekommst es schneller. Dauert etwa eine Minute. Wollen wir kurz starten?",
    );
    expect(templateBodyFor("booking_prep_nudge", names, "sie")).toBe(
      "Guten Tag {{1}}, kurze Frage zu Ihrem Termin am {{2}}: Wenn Sie mir vorab ein paar kurze Fragen beantworten, kann Herr Schwarzkopf Ihr Angebot schon vorbereiten und Sie bekommen es schneller. Dauert etwa eine Minute. Wollen wir kurz starten?",
    );
    expect(templateBodyFor("reschedule", names, "sie")).toContain("Ihr Termin bei Herrn Schwarzkopf musste leider verschoben werden");
    for (const p of ["booking_confirmation", "booking_prep_nudge", "reschedule"] as const)
      for (const f of ["du", "sie", "sie_ohne_name"] as const) expect(metaTemplateProblems(templateBodyFor(p, names, f), exampleValuesFor(p, f)), `${p} ${f}`).toEqual([]);
  });
});

describe("Anrede des Leads: aus Angaben, sonst nur bei eindeutigem Vornamen (Ole, 26.11.2026)", () => {
  it("eindeutig → Herr/Frau, mehrdeutig → voller Name, Angabe hat Vorrang", () => {
    expect(anredeZeile("sie", { fullName: "Peter Kranert" })).toBe("Guten Tag Herr Kranert,");
    expect(anredeZeile("sie", { fullName: "Andrea Becker" })).toBe("Guten Tag Andrea Becker,");
    expect(anredeZeile("sie", { fullName: "Frau Becker" })).toBe("Guten Tag Frau Becker,");
    expect(anredeZeile("sie", { fullName: "Andrea Becker", salutation: "w" })).toBe("Guten Tag Frau Becker,");
  });
});

describe("Video als Standard", () => {
  it("Telefon nur gewählt und freigegeben, vor Ort nur freigegeben mit Anschrift", () => {
    const an = { telefon: true, vorOrt: true };
    expect(buchungsModus(null, an)).toBe("video");
    expect(buchungsModus(undefined, an)).toBe("video");
    expect(buchungsModus("video", an)).toBe("video");
    expect(buchungsModus("phone", an)).toBe("phone");
    expect(buchungsModus("phone", { telefon: false, vorOrt: false })).toBe("video");
    expect(buchungsModus("onsite", an, false)).toBe("video");
    expect(buchungsModus("onsite", an, true)).toBe("onsite");
  });
  it("Buchungsseite, Mail-Strecke, Verschieben: Video, wenn nichts gewählt ist", () => {
    expect(readFileSync("src/app/book/[slug]/actions.ts", "utf8")).toContain("buchungsModus(wunsch, formate, !!ort)");
    expect(readFileSync("src/lib/mail-strecke/server.ts", "utf8")).toContain("buchungsModus(o.mode,");
    expect(readFileSync("src/lib/calendar/manage.ts", "utf8")).toContain('mode: fresh?.mode ?? "video"');
    expect(readFileSync("src/lib/calendar/index.ts", "utf8")).toContain('old.mode === "phone" ? "phone" : old.mode === "onsite" ? "onsite" : "video"');
    // Buchungsseite: Video vorgewählt
    expect(readFileSync("src/app/book/[slug]/page.tsx", "utf8")).toContain('{ v: "video", label: "Videocall", Icon: Video, empfohlen: true }');
  });
});
