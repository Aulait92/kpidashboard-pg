import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { PKV_TEST_FIELDS, testFields, testLead } from "@/lib/ppl/test-lead";
import { categoryLabels, translatePerspective } from "@/lib/ppl/perspective";
import { machineMail } from "@/lib/ppl/lead-mail";
import { renderTemplate } from "@/lib/ppl/template";
import { leadPdfData, leadPdfFallback, leadPdfHtml, leadPdfMail, leadPdfName } from "@/lib/ppl/lead-pdf";
import { pplSlackText } from "@/lib/ppl/slack";
import { hatGedankenstrich } from "@/lib/gedankenstriche";

const now = new Date("2026-11-16T10:00:00Z");

describe("Testdatensatz: alle Felder des echten Funnels", () => {
  it("PKV: genau diese Felder in dieser Reihenfolge, ohne Source und Hinweis", () => {
    const t = testLead("PKV-Tarifoptimierung", now);
    expect(t.answers.map((a) => a.label)).toEqual([
      "Vorname",
      "Nachname",
      "Telefonnummer",
      "E-Mail",
      "Postleitzahl",
      "Ort",
      "Geburtsdatum",
      "Situation",
      "Gesetzlich oder privat?",
      "Aktuelle Versicherung",
      "Wie lange in PKV?",
      "Monatlicher Beitrag",
    ]);
    expect(t.answers.every((a) => a.value.trim())).toBe(true);
    expect(t.answers.some((a) => /^(source|hinweis)$/i.test(a.label))).toBe(false);
    expect(t.name).toBe("TEST Lead");
    expect(t.answers.find((a) => a.label === "Vorname")?.value).toBe("TEST");
    expect(t.answers.find((a) => a.label === "Nachname")?.value).toBe("Lead");
    expect(t.test).toBe(true);
    expect(t.id).toBe("TEST-20261116100000");
    expect(testFields("private-krankenversicherung")).toEqual([...PKV_TEST_FIELDS]);
  });

  it("PKV: dieselben Feldnamen, die translatePerspective für echte Leads liefert", () => {
    const real = translatePerspective(
      {
        id: "x",
        profile: { firstName: { value: "Erika" }, lastName: { value: "Muster" } },
        values: {
          email: "e@example.com",
          phone: "+4915112345678",
          birthday: "1980-01-01",
          "address#postalCode": "10115",
          "address#city": "Berlin",
          input_1w2ux1: "DKV",
          question_4lb8co: "5 Jahre",
          "custom-69e114fc5f2bf28c0301a25f": "850 €",
          question_lcbt58: "Angestellt",
          question_eqxptw: "Privat",
        },
      },
      "pkv-tarifoptimierung",
    );
    expect(new Set(Object.keys(real.fields))).toEqual(new Set(PKV_TEST_FIELDS));
  });

  it("andere Produkte: Grundfelder plus Fragen der Kategorie", () => {
    const base = ["Vorname", "Nachname", "Telefonnummer", "E-Mail", "Postleitzahl", "Ort", "Geburtsdatum"];
    expect(testFields("sterbegeldversicherung")).toEqual([...base, ...categoryLabels("sterbegeld")]);
    expect(testFields("hunde-op-versicherung")).toEqual([...base, "Tierart", ...categoryLabels("tier")]);
    // Kindersparpläne: „Alter der Kinder“ steht im Funnel zweimal, im Test nur einmal
    expect(testFields("kindersparplaene").filter((l) => l === "Alter der Kinder (KSP)")).toHaveLength(1);
    for (const key of ["sterbegeldversicherung", "hunde-op-versicherung", "hundefutter", "kindersparplaene", "zahnzusatz"]) {
      const t = testLead(key, now);
      // jedes Feld hat einen eigenen Testwert (kein Platzhalter „TEST“ außer beim Vornamen)
      expect(t.answers.filter((a) => a.value === "TEST").map((a) => a.label)).toEqual(["Vorname"]);
      expect(t.answers.some((a) => hatGedankenstrich(a.value))).toBe(false);
    }
    // unbekanntes Produkt: nur die Grundfelder
    expect(testFields("Privatschutz")).toEqual(base);
  });

  it("maschinenlesbare Mail enthält alle Felder, Kontaktfelder nicht doppelt", () => {
    const t = testLead("PKV-Tarifoptimierung", now);
    const m = machineMail({ ...t, consentText: null });
    const rows = m.text.split("\n");
    expect(rows).toContain("Vorname: TEST");
    expect(rows).toContain("Nachname: Lead");
    expect(rows).toContain("Telefon: +4915100000000");
    expect(rows).toContain("E-Mail: test-lead@example.com");
    expect(rows).toContain("PLZ: 10115");
    expect(rows).toContain("Ort: Berlin");
    for (const label of ["Geburtsdatum", "Situation", "Gesetzlich oder privat?", "Aktuelle Versicherung", "Wie lange in PKV?", "Monatlicher Beitrag"]) {
      expect(rows.filter((r) => r.startsWith(`${label}: `))).toHaveLength(1);
    }
    expect(rows.filter((r) => r.startsWith("E-Mail: "))).toHaveLength(1);
    expect(rows.some((r) => r.startsWith("Telefonnummer: "))).toBe(false);
    expect(m.json.antworten).toMatchObject({ "Wie lange in PKV?": "Mehr als 10 Jahre", "Monatlicher Beitrag": "850" });
  });

  it("Vorlage: jedes Feld per {Feldname} und die Kurzformen", () => {
    const t = testLead("PKV-Tarifoptimierung", now);
    const out = renderTemplate([...PKV_TEST_FIELDS.map((l) => `${l}: {${l}}`), "Kurz: {vorname} {nachname} {plz} {versicherer} {beitrag} {telefon}"].join("\n"), t);
    for (const l of PKV_TEST_FIELDS) expect(out).toContain(`${l}: ${t.answers.find((a) => a.label === l)!.value}`);
    expect(out).toContain("Kurz: TEST Lead 10115 Testversicherung AG 850 +49 151 00000000");
  });
});

describe("Lead-PDF", () => {
  it("PKV wie im alten Zap: Kontakt, Angaben zum Interessenten, Einwilligung, Referenz", () => {
    const t = testLead("PKV-Tarifoptimierung", now);
    const d = leadPdfData({ ...t, consentText: "Ich willige in die Weitergabe ein." });
    expect(d.produkt).toBe("PKV-Tarifoptimierung");
    expect(d.referenz).toBe("TEST-20261116100000");
    expect(d.uebermitteltAm).toBe("16.11.2026, 11:00");
    expect(d.name).toBe("TEST Lead");
    expect(d.kontakt).toEqual([
      { k: "Telefon", v: "+49 151 00000000", big: true },
      { k: "E-Mail", v: "test-lead@example.com" },
      { k: "PLZ", v: "10115" },
      { k: "Ort", v: "Berlin" },
    ]);
    expect(d.angabenLabel).toBe("Angaben zum Interessenten");
    expect(d.angaben.map((c) => [c.k, c.v])).toEqual([
      ["Aktuelle Gesellschaft", "Testversicherung AG"],
      ["Versicherungsdauer", "Mehr als 10 Jahre"],
      ["Monatsbeitrag", "850 €"],
      ["Situation", "Angestellt"],
      ["Geburtsdatum", "01.01.1980"],
      ["Gesetzlich oder privat?", "Privat"],
    ]);
    expect(d.einwilligung).toEqual({ text: "Ich willige in die Weitergabe ein.", zitat: true, am: "16.11.2026, 11:00" });
    expect(d.badge).toBe("TEST");
    expect(d.fuss).toContain("Lorenzstraße 58");
  });

  it("Abzeichen nur bei SMS-Bestätigung; ohne Einwilligungstext kein erfundenes Zitat; Source bleibt intern", () => {
    const base = { id: "cm1", product: "PKV-Tarifoptimierung", name: "Erika Muster", phone: "4915112345678", email: null, date: now, consentAt: null };
    const answers = [{ label: "Source", value: "facebook" }, { label: "Situation", value: "Selbstständig" }];
    expect(leadPdfData({ ...base, answers }).badge).toBeNull();
    expect(leadPdfData({ ...base, answers, smsVerified: true }).badge).toBe("SMS-verifiziert");
    const d = leadPdfData({ ...base, answers });
    expect(d.einwilligung.zitat).toBe(false);
    expect(d.einwilligung.am).toBeNull();
    expect(d.angaben.map((c) => c.k)).toEqual(["Situation"]);
  });

  it("Angaben je Kategorie mit den Bezeichnungen des alten PDFs", () => {
    const tier = leadPdfData(testLead("hunde-op-versicherung", now));
    expect(tier.angabenLabel).toBe("Angaben zum Tier");
    expect(tier.angaben.slice(0, 5).map((c) => [c.k, c.v])).toEqual([
      ["Tierart", "Hund"],
      ["Name", "Testi"],
      ["Geschlecht", "Männlich"],
      ["Rasse", "Mischling"],
      ["Geboren", "Mai 2020"],
    ]);
    expect(leadPdfData(testLead("hundefutter", now)).angaben.find((c) => c.k === "Gewicht")?.v).toBe("20 kg");
    expect(leadPdfData(testLead("sterbegeldversicherung", now)).angabenLabel).toBe("Angaben zur Sterbegeldvorsorge");
    expect(leadPdfData(testLead("kindersparplaene", now)).angaben[2]).toEqual({ k: "Zielbetrag zum 18.", v: "10.000 bis 20.000 €", big: true });
    const zahn = leadPdfData(testLead("zahnzusatz", now));
    expect(zahn.angabenLabel).toBe("Angaben zur Zahnzusatzversicherung");
    expect(zahn.angaben[0]).toEqual({ k: "Geburtsdatum", v: "01.01.1980", big: true });
  });

  it("HTML: Kopf „Lead-Übermittlung“, alles escaped, keine Gedankenstriche", () => {
    const t = testLead("PKV-Tarifoptimierung", now);
    const html = leadPdfHtml(leadPdfData({ ...t, name: "<b>Max</b>", consentText: "Ja – gern" }));
    expect(html).toContain("Lead-Übermittlung");
    expect(html).toContain("Übermittelt am <strong>16.11.2026, 11:00</strong>");
    expect(html).toContain("Referenz <strong>TEST-20261116100000</strong>");
    expect(html).toContain("&lt;b&gt;Max&lt;/b&gt;");
    expect(html).not.toContain("<b>Max</b>");
    expect(html).toContain("Angaben zum Interessenten");
    expect(html).toContain("Erteilt am 16.11.2026, 11:00");
    expect(hatGedankenstrich(html.replace(/<style>[\s\S]*<\/style>/, ""))).toBe(false);
  });

  it("Ersatz-PDF ohne Browser: eine A4-Seite, Titel; Dateiname ohne Sonderzeichen", async () => {
    const t = testLead("PKV-Tarifoptimierung", now);
    const doc = await PDFDocument.load(await leadPdfFallback(leadPdfData(t)));
    expect(doc.getPageCount()).toBe(1);
    expect(Math.round(doc.getPage(0).getWidth())).toBe(595);
    expect(doc.getTitle()).toBe("TEST Lead-Übermittlung PKV-Tarifoptimierung (TEST-20261116100000)");
    expect(leadPdfName({ id: "cm1", name: "Jürgen Müller-Lüdenscheidt" })).toBe("Lead_Jurgen_Muller-Ludenscheidt_cm1.pdf");
    expect(leadPdfName({ id: "cm1", name: null })).toBe("Lead_Interessent_cm1.pdf");
  });

  it("Ersatz-PDF: lange Antworten und Emojis ohne Absturz, notfalls zweite Seite", async () => {
    const answers = Array.from({ length: 40 }, (_, i) => ({ label: `Frage ${i + 1}`, value: `Antwort 🙂 ${"sehr lang ".repeat(i % 5 ? 1 : 20)}` }));
    const bytes = await leadPdfFallback(leadPdfData({ id: "cm2", product: "Pflege", name: "Erika", phone: null, email: null, answers, date: now }));
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1);
  });

  it("Begleitmail wie früher, ohne Gedankenstriche, mit Punkt nach „zugestimmt“", () => {
    const m = leadPdfMail({ id: "cm1", product: "PKV-Tarifoptimierung", name: "Erika Muster", phone: "4915112345678" });
    expect(m.subject).toBe("Neuer Lead: PKV-Tarifoptimierung: Erika Muster");
    expect(m.greeting).toBe("Guten Tag,");
    expect(m.paragraphs).toEqual(["anbei erhalten Sie exklusiv einen neuen qualifizierten Lead aus dem Bereich PKV-Tarifoptimierung."]);
    expect(m.list).toEqual(["Interessent: Erika Muster", "Telefon: +49 151 12345678", "Referenz: cm1"]);
    expect(m.textBlocks[0]).toContain("ausdrücklich zugestimmt. Für eine hohe Abschlussquote");
    for (const s of [m.subject, ...m.paragraphs, ...m.list, ...m.textBlocks]) expect(hatGedankenstrich(s)).toBe(false);
    const t = leadPdfMail({ ...testLead("PKV-Tarifoptimierung", now) });
    expect(t.subject).toBe("[TEST] Neuer Lead: PKV-Tarifoptimierung: TEST Lead");
    expect(t.paragraphs[0]).toContain("Testdatensatz");
    expect(t.textBlocks[1]).toContain("nicht in Ihrem Kundenbereich");
  });
});

describe("Slack: Lieferweg Kundenbereich + PDF per Mail", () => {
  const base = { product: "PKV", status: "delivered" as const, customer: "Makler A" };
  it("Kundenbereich nicht als Adresse, Mails als Domain", () => {
    const t = pplSlackText({
      ...base,
      delivery: { label: "Kundenbereich + PDF per Mail", ok: true, targets: [{ target: "Kundenbereich", ok: true }, { target: "a@novus.de", ok: true }] },
    });
    expect(t).toContain("Lieferweg: Kundenbereich + PDF per Mail an novus.de: zugestellt");
  });
  it("Mailfehler: Kundenbereich ok, Fehler mit Domain", () => {
    const t = pplSlackText({
      ...base,
      delivery: {
        label: "Kundenbereich + PDF per Mail",
        ok: false,
        error: "PDF-Mail: a@novus.de: rejected",
        targets: [{ target: "Kundenbereich", ok: true }, { target: "a@novus.de", ok: false, error: "rejected" }],
      },
    });
    expect(t).toContain("FEHLER: novus.de: rejected");
    expect(t).not.toContain("a@novus.de");
  });
  it("nur Kundenbereich: ohne „an kundenbereich“", () => {
    const t = pplSlackText({ ...base, delivery: { label: "Kundenbereich", ok: true, targets: [{ target: "Kundenbereich", ok: true }] } });
    expect(t).toContain("Lieferweg: Kundenbereich: zugestellt");
  });
});
