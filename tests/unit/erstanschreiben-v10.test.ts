// Erstanschreiben v10 und v11 (Ole, 19.11.2026): feste Frage je Zweck mit Antwortknöpfen, kurz, ohne „Mehr lesen“,
// Fußzeile nur „KI-Assistent“; v11 = Fassung b „Frage zuerst“ im A/B-Test gegen v10 (erst ab 150 Sendungen je Fassung).
// Rückfall auf v9, wenn das Formular die feste Frage schon beantwortet bzw. bis v10 bei Meta freigegeben ist.
// Rein, ohne Datenbank.
import { describe, expect, it } from "vitest";
import {
  enthaeltErsteFrage,
  ERSTANSCHREIBEN_V10,
  erstanschreibenFusszeile,
  erstanschreibenText,
  erstanschreibenV9Params,
  erstanschreibenV10Params,
  ersteFrageKnoepfe,
  ersteFrageRegel,
  erstfrageKnopfWert,
  frageplan,
  MAX_FRAGEN_VOR_TERMIN,
  v10FrageIn,
  v10Moeglich,
  type ErstanschreibenZweck,
} from "@/lib/whatsapp/erstanschreiben";
import {
  ERSTINFO_FOOTER_V10,
  erstinfoFooterFor,
  OUTREACH_PURPOSES,
  PLATZHALTER_AB,
  rankOutreach,
  REST_PARAMS,
  renderTemplate,
  TEMPLATE_BODY,
  TEMPLATE_BODY_B,
  TEMPLATE_BUTTONS,
  templateTextFor,
  variantsFor,
  type NoticePurpose,
} from "@/lib/whatsapp/templates";
import { exampleRestFor, exampleValuesFor } from "@/lib/whatsapp/template-plan";
import { erstfrageHinweis, knopfAktion } from "@/lib/whatsapp/knopf";
import { decideAbWinner, MIN_JE_FASSUNG, MIN_JE_FASSUNG_ERSTANSCHREIBEN, minJeFassung } from "@/lib/whatsapp/ab-test";
import { zwischenSchritt, type VerlaufNachricht } from "@/lib/whatsapp/zwischenfrage";
import { vermittlerName } from "@/lib/vermittler-nennung";

const ZWECKE = Object.keys(ERSTANSCHREIBEN_V10) as ErstanschreibenZweck[];
const HERR = vermittlerName("sie", { name: "Ole Kannapinn", anrede: "Herr", fallback: "Agentur" });
/** Sichtbarer Text (ohne Fett-Sternchen), Platzhalter wie im Alltag belegt */
const sichtbar = (t: string) => [...t.replace("{{2}}", "Minka").replace(/\*/g, "")].length;

/** Quelle (Lead.source) und Formular je Zweck */
const QUELLE: Record<ErstanschreibenZweck, { source: string | null; formular: { label: string; value: string }[] }> = {
  outreach: { source: null, formular: [] },
  outreach_tkv: { source: "TKV-Katze", formular: [{ label: "Tiername", value: "Minka" }] },
  outreach_zahn: { source: "Zahnzusatz", formular: [] },
  outreach_pkv: { source: "PKV Wechsel", formular: [] },
  outreach_privatschutz: { source: "Privatschutz", formular: [{ label: "Versicherungsinteresse", value: "Haftpflicht, Hausrat" }] },
  outreach_hausrat: { source: "Privatschutz", formular: [{ label: "Versicherungsinteresse", value: "Hausrat" }] },
};
/** Formularfeld, das genau die feste Frage beantwortet (dann v9). Zahn: kein Formularfeld fragt den Tarifbaustein ab. */
const BEANTWORTET: Record<Exclude<ErstanschreibenZweck, "outreach" | "outreach_zahn">, { label: string; value: string }> = {
  outreach_tkv: { label: "Gewünschter Schutz", value: "OP-Schutz" },
  outreach_pkv: { label: "Situation", value: "Angestellt" },
  outreach_privatschutz: { label: "Bereits versichert", value: "nein" },
  outreach_hausrat: { label: "Bereits versichert", value: "nein" },
};

describe("v10/v11: Texte und Knöpfe", () => {
  it("Texte wie von Ole vorgegeben (Sie)", () => {
    expect(TEMPLATE_BODY.outreach_tkv.sie).toBe("schön, dass Sie {{2}} gut absichern möchten 🐾 *Was soll abgesichert sein?*");
    expect(TEMPLATE_BODY.outreach_privatschutz.sie).toBe("danke für Ihre Anfrage zum Privatschutz! *Ist davon schon etwas versichert?*");
    expect(TEMPLATE_BODY.outreach_hausrat.sie).toBe("danke für Ihre Anfrage zu Ihrer Hausratversicherung! *Haben Sie schon eine Hausrat?*");
    expect(TEMPLATE_BODY.outreach_zahn.sie).toBe("danke für Ihre Anfrage zur Zahnzusatzversicherung! *Was ist Ihnen am wichtigsten?*");
    expect(TEMPLATE_BODY.outreach_pkv.sie).toBe("danke für Ihre Anfrage zur privaten Krankenversicherung! *Wie sind Sie beruflich aufgestellt?*");
    expect(TEMPLATE_BODY.outreach.sie).toBe("danke für Ihre Anfrage! *Wann passt Ihnen ein kurzes Telefonat?*");
    expect(TEMPLATE_BODY.outreach_tkv.du).toBe("schön, dass du {{2}} gut absichern möchtest 🐾 *Was soll abgesichert sein?*");
    expect(TEMPLATE_BODY_B.outreach_tkv!.sie).toBe("*was soll für {{2}} abgesichert sein?* 🐾");
    expect(TEMPLATE_BODY_B.outreach_privatschutz!.sie).toBe("*ist beim Privatschutz schon etwas versichert?* Danke für Ihre Anfrage!");
  });

  it.each(ZWECKE)("%s: kurz (ca. 90 Zeichen nach der Anrede), eine Zeile, Frage fett, keine Gedankenstriche, richtige Ansprache", (z) => {
    for (const variant of ["a", "b"] as const) {
      for (const an of ["sie", "du"] as const) {
        const t = ERSTANSCHREIBEN_V10[z][variant][an];
        const was = `${z} ${variant} ${an}`;
        // Ole: höchstens ca. 90 Zeichen; einzig PKV v10 (Oles Wortlaut) hat 92 sichtbare Zeichen
        expect(sichtbar(t), was).toBeLessThanOrEqual(z === "outreach_pkv" && variant === "a" ? 92 : 90);
        expect(t, was).not.toMatch(/[–—]/);
        expect(t, was).not.toContain("\n");
        expect(t, was).not.toMatch(/Garantie|garantiert/i);
        expect(t, was).toMatch(/\*[^*]+\?\*/);
        if (an === "du") expect(t, was).not.toMatch(/\b(Sie|Ihnen|Ihre?)\b/);
        else expect(t, was).not.toMatch(/\b(du|dir|dich|deine?)\b/);
        // Platzhalter: nur TKV hat das Tier
        expect((t.match(/\{\{\d+\}\}/g) ?? []).length, was).toBe(z === "outreach_tkv" ? 1 : 0);
      }
    }
    // v11 „Frage zuerst“: die Frage steht direkt hinter der Anrede
    for (const an of ["sie", "du"] as const) expect(ERSTANSCHREIBEN_V10[z].b[an].startsWith("*"), `${z} ${an}`).toBe(true);
  });

  it.each(ZWECKE)("%s: Knöpfe höchstens 3, je höchstens 20 Zeichen, in Vorlage (a und b) und Freitext gleich", (z) => {
    const k = ERSTANSCHREIBEN_V10[z].knoepfe;
    expect(k.length).toBeGreaterThanOrEqual(2);
    expect(k.length).toBeLessThanOrEqual(3);
    for (const x of k) expect(x.length, x).toBeLessThanOrEqual(20);
    for (const x of k) expect(x, x).not.toMatch(/[–—]/);
    expect(TEMPLATE_BUTTONS[z]).toEqual(k);
    expect(variantsFor(z)).toEqual(["a", "b"]);
    const q = QUELLE[z];
    expect(ersteFrageKnoepfe(q.source, q.formular)).toEqual(k);
    // Knöpfe der festen Frage sind keine Sonderknöpfe (Termin, Absage): sie gehen an den Assistenten
    for (const x of k) expect(knopfAktion("button", x, x), x).toBeNull();
  });
});

describe("v10: Platzhalter je Version und Fußzeile", () => {
  it("REST_PARAMS ab v10, ältere Fassungen behalten ihre Belegung (PLATZHALTER_AB)", () => {
    for (const p of OUTREACH_PURPOSES) {
      expect(REST_PARAMS[p], p).toEqual(p === "outreach_tkv" ? ["Tier"] : []);
      expect(PLATZHALTER_AB[p], p).toEqual({ version: 10, frueher: p === "outreach_tkv" ? ["Tier", "Erste Frage"] : ["Erste Frage"] });
    }
    expect(exampleValuesFor("outreach_tkv", "sie")).toEqual(["Frau Schneider", "Minka"]);
    expect(exampleRestFor("outreach_tkv", "sie", 10)).toEqual(["Minka"]);
    expect(exampleRestFor("outreach_tkv", "sie", 9)).toEqual(["Minka", "Wie alt ist Ihre Katze"]);
    expect(exampleRestFor("outreach_pkv", "sie", 9)).toEqual(["Wie sind Sie aktuell beruflich aufgestellt"]);
    expect(exampleRestFor("outreach_pkv", "sie", 8)).toEqual(["Herrn Schmidt", "Wie sind Sie aktuell beruflich aufgestellt"]);
    expect(exampleRestFor("outreach_pkv", "sie", 7)).toEqual(["private Krankenversicherung", "Herrn Schmidt", "Wie sind Sie aktuell beruflich aufgestellt"]);
  });

  it("Parameter: v10 nur das Tier; v9 mit Frage, beim Rückfall auf die allgemeine Fassung ohne Tier", () => {
    const tkv = QUELLE.outreach_tkv;
    expect(erstanschreibenV10Params({ ...tkv, an: "sie", purpose: "outreach_tkv" })).toEqual(["Minka"]);
    expect(erstanschreibenV10Params({ source: "TKV-Katze", an: "du", formular: [], purpose: "outreach_tkv" })).toEqual(["deine Katze"]);
    expect(erstanschreibenV10Params({ ...QUELLE.outreach_pkv, an: "sie", purpose: "outreach_pkv" })).toEqual([]);
    expect(erstanschreibenV9Params({ ...tkv, an: "sie", person: HERR, kurz: "Ole" })).toEqual(["Minka", "Wie alt ist Ihre Katze"]);
    // allgemeine v9 hat nur einen Platzhalter nach dem Namen: die Frage, kein Tier
    expect(erstanschreibenV9Params({ ...tkv, an: "sie", person: HERR, kurz: "Ole", purpose: "outreach" })).toEqual(["Wie alt ist Ihre Katze"]);
    // gerendert: Vorlage v10 mit Parametern
    expect(renderTemplate(templateTextFor("outreach_tkv", "sie"), ["Herr Pan", "Minka"])).toBe("Hallo Herr Pan, schön, dass Sie Minka gut absichern möchten 🐾 *Was soll abgesichert sein?*");
    expect(renderTemplate(templateTextFor("outreach_tkv", "sie_ohne_name", "b"), ["Minka"])).toBe("Hallo, *was soll für Minka abgesichert sein?* 🐾");
    expect(templateTextFor("outreach_pkv", "sie_ohne_name")).not.toMatch(/\{\{/);
  });

  it("Fußzeile je Version: v10 nur „KI-Assistent“, v9 mit Hinweis auf das PDF", () => {
    expect(ERSTINFO_FOOTER_V10).toBe("KI-Assistent");
    expect(erstinfoFooterFor(10)).toBe("KI-Assistent");
    expect(erstinfoFooterFor("v10")).toBe("KI-Assistent");
    expect(erstinfoFooterFor(9)).toBe("KI-Assistent · Erstinformation im PDF oben");
    expect(erstanschreibenFusszeile("Privatschutz", [])).toBe("KI-Assistent");
    expect(erstanschreibenFusszeile("Privatschutz", [BEANTWORTET.outreach_privatschutz])).toBe("KI-Assistent · Erstinformation im PDF oben");
  });
});

describe("v10: Rückfall auf v9, wenn das Formular die feste Frage beantwortet", () => {
  it.each(Object.keys(BEANTWORTET) as (keyof typeof BEANTWORTET)[])("%s", (z) => {
    const q = QUELLE[z];
    expect(v10Moeglich(q.source, q.formular)).toBe(true);
    const f = [...q.formular, BEANTWORTET[z]];
    expect(v10Moeglich(q.source, f)).toBe(false);
    // Freitext dann wie v9 (Frage als Platzhalter), nie die schon beantwortete feste Frage
    const t = erstanschreibenText({ an: "sie", kontakt: { fullName: "Peter Pan", salutation: "Herr" }, name: "Ole", vermittler: HERR.dat, vermittlerNom: HERR.nom, source: q.source, formular: f });
    expect(v10FrageIn(t)).toBeNull();
    expect(t.endsWith("_KI-Assistent · Erstinformation folgt als PDF_")).toBe(true);
  });

  it("allgemeine Fassung: schon gebucht → v9 (Frage, ob der Vermittler vorab etwas wissen sollte), ohne Knöpfe", () => {
    expect(v10Moeglich(null, [])).toBe(true);
    expect(v10Moeglich(null, [], { gebucht: true })).toBe(false);
    expect(ersteFrageKnoepfe(null, [], { gebucht: true })).toEqual([]);
  });

  it("Vorlagenwahl: höchste Version je Zweck (maxVersion), bis v10 freigegeben ist die neueste ältere", () => {
    const t = (name: string, purpose: NoticePurpose) => ({ name, purpose, body: "Hallo {{1}}, x", headerFormat: "DOCUMENT" });
    const liste = [t("pg_outreach_tkv_v9_sie", "outreach_tkv"), t("pg_outreach_tkv_v10_sie", "outreach_tkv"), t("pg_outreach_v10_sie", "outreach")];
    const kontakt = { fullName: "Peter Pan", salutation: "Herr" };
    const pick = (opts: Parameters<typeof rankOutreach>[4]) => {
      const r = rankOutreach(liste, ["outreach_tkv", "outreach"], "sie", kontakt, opts);
      return r && "tpl" in r ? r.tpl.name : r;
    };
    expect(pick({ pdf: "vollstaendig" })).toBe("pg_outreach_tkv_v10_sie");
    // Formular beantwortet die feste Frage: höchstens v9
    expect(pick({ pdf: "vollstaendig", maxVersion: { outreach_tkv: 9, outreach: 9 } })).toBe("pg_outreach_tkv_v9_sie");
    // v10 des Produkts noch nicht freigegeben: nie die allgemeine Telefonatsfrage für einen Produkt-Lead, sondern v9
    const ohneTkv10 = liste.filter((x) => x.name !== "pg_outreach_tkv_v10_sie");
    const r = rankOutreach(ohneTkv10, ["outreach_tkv", "outreach"], "sie", kontakt, { pdf: "vollstaendig", maxVersion: { outreach: 9 } });
    expect(r && "tpl" in r ? [r.tpl.name, r.version] : r).toEqual(["pg_outreach_tkv_v9_sie", 9]);
    // Fassung b bevorzugt, wenn zugeteilt und freigegeben
    const mitB = [...liste, t("pg_outreach_tkv_v10_b_sie", "outreach_tkv")];
    const b = rankOutreach(mitB, ["outreach_tkv", "outreach"], "sie", kontakt, { pdf: "vollstaendig", variant: "b" });
    expect(b && "tpl" in b ? [b.tpl.name, b.variant, b.current] : b).toEqual(["pg_outreach_tkv_v10_b_sie", "b", true]);
  });
});

describe("v10/v11: Frage-Erkennung (frageplan) und Assistent", () => {
  const kontakt = { fullName: "Peter Pan", salutation: "Herr" };
  for (const z of ZWECKE) {
    for (const variant of ["a", "b"] as const) {
      for (const an of ["sie", "du"] as const) {
        it(`${z} ${variant} ${an}: gesendete Frage wird mit dem richtigen Feld als gestellt erkannt, nicht erneut gefragt`, () => {
          const q = QUELLE[z];
          const gesendet = erstanschreibenText({ an, kontakt, name: "Ole", vermittler: HERR.dat, vermittlerNom: HERR.nom, source: q.source, formular: q.formular, variant });
          const v = v10FrageIn(gesendet, z);
          expect(v?.zweck).toBe(z);
          const plan = frageplan(q.source, q.formular, { gesendet });
          expect(plan.gestellt?.feld).toBe(ERSTANSCHREIBEN_V10[z].feld);
          expect(plan.gestellt?.knoepfe).toEqual(ERSTANSCHREIBEN_V10[z].knoepfe);
          expect(gesendet).toContain(plan.gestellt!.sie.slice(1));
          // höchstens noch die nächste offene Frage, dann Terminvorschlag
          expect((plan.gestellt ? 1 : 0) + plan.offen.length).toBeLessThanOrEqual(MAX_FRAGEN_VOR_TERMIN);
          for (const f of plan.offen) expect(f.feld).not.toBe(plan.gestellt!.feld);
          if (q.source) expect(enthaeltErsteFrage(gesendet, q.source)).toBe(true);
          const regel = ersteFrageRegel(q.source, "Ole", { gesendet, an, formular: q.formular, personNom: HERR.nom });
          expect(regel).toContain(`„${plan.gestellt!.sie}“`);
          for (const k of ERSTANSCHREIBEN_V10[z].knoepfe) expect(regel).toContain(`„${k}“`);
          if (z !== "outreach") expect(regel).toContain(`angaben.${ERSTANSCHREIBEN_V10[z].feld}`);
        });
      }
    }
  }

  it("TKV: nach der festen Frage noch das Alter, falls nicht im Formular; mit Alter im Formular direkt Termine", () => {
    const gesendet = "Hallo Herr Pan, *was soll für Minka abgesichert sein?* 🐾";
    const plan = frageplan("TKV-Katze", [], { gesendet });
    expect(plan.gestellt).toMatchObject({ key: "frage2", feld: "tarifwunsch", sie: "Was soll für Minka abgesichert sein?" });
    expect(plan.offen.map((f) => f.sie)).toEqual(["Wie alt ist Ihre Katze?"]);
    const mitAlter = frageplan("TKV-Katze", [{ label: "Geburtsjahr (Tier)", value: "2022" }], { gesendet });
    expect(mitAlter.offen).toEqual([]);
    const regel = ersteFrageRegel("TKV-Katze", "Ole", { gesendet, an: "sie", formular: [] });
    expect(regel).toContain("„Nur Operationen“ = „nur OP-Schutz“");
    expect(regel).toContain("„Auch Behandlungen“ = „volle Krankenversicherung (auch Tierarztbehandlung)“");
    expect(regel).toContain("„Noch unsicher“ = „offen“");
    expect(regel).toMatch(/Danach noch genau diese Frage: „Wie alt ist Ihre Katze\?“ \(angaben\.tier\)/);
  });

  it("allgemein: Telefonatsfrage erkannt, danach sofort Termine", () => {
    const gesendet = "[Erstinformation als PDF]\nHallo, *wann passt Ihnen ein kurzes Telefonat?* Danke für Ihre Anfrage!\n\nKI-Assistent";
    const plan = frageplan(null, [], { gesendet });
    expect(plan.gestellt).toMatchObject({ key: "telefonat", feld: "wunsch" });
    expect(plan.offen).toEqual([]);
    expect(ersteFrageRegel(null, "Ole", { gesendet, an: "sie" })).toContain("„Wann passt Ihnen ein kurzes Telefonat?“ mit den Knöpfen „Heute“, „Morgen“, „Lieber schriftlich“");
  });

  it("ältere Fassungen werden nicht für v10 gehalten", () => {
    expect(v10FrageIn("Hallo, danke für Ihre Anfrage zur Zahnzusatzversicherung! *Welcher Tarifbaustein ist Ihnen am wichtigsten?*")).toBeNull();
    expect(v10FrageIn("Hallo, danke für Ihre Anfrage zum Privatschutz! *Sind Haftpflicht und Hausrat schon versichert, oder wäre beides neu?*")).toBeNull();
    expect(v10FrageIn("Hallo, schön, dass Sie Minka gut absichern möchten 🐾 *Wie alt ist Ihre Katze?*")).toBeNull();
    // Hausrat a und b sind verschieden
    expect(v10FrageIn("*haben Sie schon eine Hausratversicherung?* Danke für Ihre Anfrage!")).toMatchObject({ zweck: "outreach_hausrat", variant: "b" });
  });
});

describe("v10/v11: Knopf-Antworten", () => {
  const TKV_A = "[Erstinformation als PDF]\nHallo Herr Pan, schön, dass Sie Minka gut absichern möchten 🐾 *Was soll abgesichert sein?*\n\nKI-Assistent";
  const TKV_B = "Hallo Peter, *was soll für Minka abgesichert sein?* 🐾\n\n_KI-Assistent_";
  it("TKV-Knopfwerte (Vorlage und Freitext, Fassung a und b)", () => {
    for (const g of [TKV_A, TKV_B]) {
      expect(erstfrageKnopfWert(g, "Nur Operationen")).toMatchObject({ feld: "tarifwunsch", wert: "nur OP-Schutz" });
      expect(erstfrageKnopfWert(g, "Auch Behandlungen")).toMatchObject({ feld: "tarifwunsch", wert: "volle Krankenversicherung (auch Tierarztbehandlung)" });
      expect(erstfrageKnopfWert(g, "Noch unsicher")).toMatchObject({ feld: "tarifwunsch", wert: "offen" });
      expect(erstfrageKnopfWert(g, "noch unsicher.")).toMatchObject({ wert: "offen" });
    }
    // kein Knopf dieser Frage bzw. keine v10 gesendet
    expect(erstfrageKnopfWert(TKV_A, "Heute")).toBeNull();
    expect(erstfrageKnopfWert("Hallo, *Wie alt ist Ihre Katze?*", "Nur Operationen")).toBeNull();
  });

  it("übrige Zwecke: Feld und Wert", () => {
    expect(erstfrageKnopfWert(TEMPLATE_BODY.outreach_pkv.sie, "Selbstständig")).toMatchObject({ feld: "beruf", wert: "Selbstständig" });
    expect(erstfrageKnopfWert(TEMPLATE_BODY.outreach_privatschutz.du!, "Alles neu")).toMatchObject({ feld: "vorhanden", wert: "noch nichts versichert, alles neu" });
    expect(erstfrageKnopfWert(TEMPLATE_BODY_B.outreach_hausrat!.sie, "Ja, habe ich")).toMatchObject({ feld: "vorhanden", wert: "Hausratversicherung vorhanden" });
    expect(erstfrageKnopfWert(TEMPLATE_BODY.outreach.sie, "Morgen")).toMatchObject({ feld: "wunsch", wert: "Telefonat morgen" });
  });

  it("Hinweis an den Assistenten: schon festgehalten, nicht erneut fragen", () => {
    const e = erstfrageKnopfWert(TKV_A, "Nur Operationen")!;
    const h = erstfrageHinweis(e);
    expect(h).toContain("per Knopf „Nur Operationen“");
    expect(h).toContain("angaben.tarifwunsch = „nur OP-Schutz“");
    expect(h).toContain("frag das nicht erneut");
    expect(h).not.toMatch(/[–—]/);
  });

  it("Privatschutz: Zwischenfrage hält den Knopfwert der festen Frage fest", () => {
    const erst: VerlaufNachricht = { direction: "outbound", kind: "template", purpose: "outreach_privatschutz", sentBy: "system", body: `[Erstinformation als PDF]\nHallo, ${TEMPLATE_BODY.outreach_privatschutz.sie}\n\nKI-Assistent` };
    const s = zwischenSchritt({ source: "Privatschutz", formular: QUELLE.outreach_privatschutz.formular, verlauf: [erst, { direction: "inbound", kind: "button", body: "Alles neu" }] });
    expect(s).toMatchObject({ art: "fragen", antwort: { feld: "vorhanden", wert: "noch nichts versichert, alles neu" } });
  });
});

describe("A/B-Test v10 gegen v11: erst ab 150 Sendungen je Fassung", () => {
  it("Mindestmenge je Zweck", () => {
    expect(MIN_JE_FASSUNG_ERSTANSCHREIBEN).toBe(150);
    for (const p of OUTREACH_PURPOSES) expect(minJeFassung(p)).toBe(150);
    expect(minJeFassung("followup_last")).toBe(MIN_JE_FASSUNG);
    expect(MIN_JE_FASSUNG).toBe(50);
  });

  it("deutlicher Unterschied bei 100 je Fassung: für andere Zwecke entschieden, fürs Erstanschreiben noch nicht", () => {
    const s = { a: { sent: 100, replied: 20 }, b: { sent: 100, replied: 45 } };
    expect(decideAbWinner(s, { min: minJeFassung("followup_last") }).winner).toBe("b");
    expect(decideAbWinner(s, { min: minJeFassung("outreach_tkv") })).toMatchObject({ winner: null, reason: "zu_wenig" });
    const genug = { a: { sent: 150, replied: 30 }, b: { sent: 150, replied: 68 } };
    expect(decideAbWinner(genug, { min: minJeFassung("outreach_tkv") }).winner).toBe("b");
  });
});
