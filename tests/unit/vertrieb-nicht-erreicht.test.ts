import { describe, expect, it } from "vitest";
import {
  istWarm,
  nichtErreichtMail,
  nichtErreichtStopp,
  NE_TEMPLATE_BODY,
  NE_TEMPLATE_BODY_B,
  NE_TEMPLATE_EXAMPLES,
  NE_TEMPLATE_NAME,
  NE_TEMPLATE_NAME_B,
  neFassung,
  neFassungAusNotiz,
  neFassungVermerk,
  neZuteilung,
  nichtErreichtAbStand,
  NE_TEMPLATE_BODY_B_DU,
  NE_TEMPLATE_BODY_DU,
  NE_TEMPLATE_EXAMPLES_DU,
  NE_TEMPLATE_NAME_B_DU,
  NE_TEMPLATE_NAME_DU,
  neBearbeitet,
  neBearbeitetAusNotiz,
  neMailAusText,
  neMailText,
  neVorlage,
  type NeEinheit,
} from "@/lib/vertrieb/nicht-erreicht";
import { SUPPORT_TEMPLATES } from "@/lib/vertrieb/termin-whatsapp";
import { metaTemplateProblems } from "@/lib/whatsapp/template-plan";

const now = new Date("2026-11-23T10:00:00Z");
const kalt = { inbound: false, termin: false, angebot: false, antwort: false, whatsappErlaubt: false, source: null };

describe("Nicht erreicht im Vertrieb", () => {
  it("nur warme Kontakte", () => {
    expect(istWarm(kalt)).toBe(false);
    expect(istWarm({ ...kalt, source: "COLD_CALL" })).toBe(false);
    expect(istWarm({ ...kalt, inbound: true })).toBe(true);
    expect(istWarm({ ...kalt, source: "META_ADS" })).toBe(true);
    expect(istWarm({ ...kalt, antwort: true })).toBe(true);
    expect(istWarm({ ...kalt, whatsappErlaubt: true })).toBe(true);
  });

  it("Stopp: gesperrt, kalt, höchstens einmal je 7 Tage", () => {
    expect(nichtErreichtStopp({ gesperrt: true, warm: true, letzteNachricht: null }, now)).toBe("gesperrt");
    expect(nichtErreichtStopp({ gesperrt: false, warm: false, letzteNachricht: null }, now)).toBe("Kaltkontakt");
    expect(nichtErreichtStopp({ gesperrt: false, warm: true, letzteNachricht: new Date("2026-11-20T10:00:00Z") }, now)).toBe("schon gesendet");
    expect(nichtErreichtStopp({ gesperrt: false, warm: true, letzteNachricht: new Date("2026-11-15T10:00:00Z") }, now)).toBeNull();
    expect(nichtErreichtStopp({ gesperrt: false, warm: true, letzteNachricht: null }, now)).toBeNull();
  });

  it("Mail mit und ohne Buchungslink, ohne Gedankenstriche", () => {
    const m = nichtErreichtMail({ buchungslink: "https://app.example/termin/x" });
    expect(m.button?.url).toBe("https://app.example/termin/x");
    expect(nichtErreichtMail({ buchungslink: null }).button).toBeNull();
    for (const t of [m.subject, ...m.paragraphs, NE_TEMPLATE_BODY]) expect(t).not.toMatch(/[–—]/);
  });

  it("WhatsApp-Vorlage wird mit der Support-Nummer eingereicht und erfüllt Metas Regeln", () => {
    expect(SUPPORT_TEMPLATES.map((t) => t.name)).toContain(NE_TEMPLATE_NAME);
    expect(metaTemplateProblems(NE_TEMPLATE_BODY, NE_TEMPLATE_EXAMPLES)).toEqual([]);
    expect(NE_TEMPLATE_BODY).not.toMatch(/\b(du|dein|dich|dir)\b/i);
  });
});

describe("A/B-Test Nicht erreicht", () => {
  it("Fassung B: Vorlage erfüllt Metas Regeln, Sie-Form, endet nicht mit der Variablen, ohne Gedankenstriche", () => {
    expect(SUPPORT_TEMPLATES.map((t) => t.name)).toContain(NE_TEMPLATE_NAME_B);
    expect(metaTemplateProblems(NE_TEMPLATE_BODY_B, NE_TEMPLATE_EXAMPLES)).toEqual([]);
    expect(NE_TEMPLATE_BODY_B).not.toMatch(/\b(du|dein|dich|dir)\b/i);
    expect(NE_TEMPLATE_BODY_B).not.toMatch(/[–—]|Garantie/);
    expect(NE_TEMPLATE_BODY_B).toMatch(/\?$/);
    // genau eine Änderung gegenüber A: nur der Schluss nach dem Link
    expect(NE_TEMPLATE_BODY_B.split("{{2}}")[0]).toBe(NE_TEMPLATE_BODY.split("{{2}}")[0]);
    for (const link of ["https://x.example/t", null]) {
      const m = nichtErreichtMail({ buchungslink: link, fassung: "b" });
      expect(m.paragraphs.join(" ")).toContain("vormittags oder nachmittags?");
      expect(m.subject).toBe(nichtErreichtMail({ buchungslink: link }).subject);
      for (const t of m.paragraphs) expect(t).not.toMatch(/[–—]/);
    }
  });

  it("Zuteilung fest je Kontakt, etwa hälftig, Rückfall auf A solange nur Vorlage A freigegeben ist", () => {
    const ids = Array.from({ length: 400 }, (_, i) => `c${i}`);
    const b = ids.filter((id) => neZuteilung(id) === "b").length;
    expect(b).toBeGreaterThan(160);
    expect(b).toBeLessThan(240);
    const idB = ids.find((id) => neZuteilung(id) === "b")!;
    expect(neZuteilung(idB)).toBe("b");
    expect(neFassung(idB, { a: true, b: true })).toBe("b");
    expect(neFassung(idB, { a: true, b: false })).toBe("a");
    expect(neFassung(idB, { a: false, b: false })).toBe("b"); // nur Mail: Test läuft trotzdem
  });

  it("Vermerk im Verlauf wird wieder gelesen", () => {
    expect(neFassungAusNotiz(`An x@y.de, Betreff: Test, ${neFassungVermerk("b")}`)).toBe("b");
    expect(neFassungAusNotiz("Vorlage pg_vertrieb_nicht_erreicht_v1, Fassung A")).toBe("a");
    expect(neFassungAusNotiz("An x@y.de, Betreff: Test")).toBeNull();
    expect(neFassungAusNotiz(null)).toBeNull();
  });

  it("Auswertung: Antwort oder Termin binnen 72 h, unreife zählen nicht, Entscheidung erst ab Mindestmenge", () => {
    const t0 = new Date("2026-12-01T10:00:00Z");
    const h = (n: number) => new Date(t0.getTime() + n * 3_600_000);
    const e = (fassung: "a" | "b", antworten: Date[] = [], termine: Date[] = [], gesendet = t0): NeEinheit => ({ fassung, gesendet, antworten, termine });
    const s = nichtErreichtAbStand(
      [e("a", [h(2)]), e("a", [h(80)]), e("a", [], [h(10)]), e("b", [h(-5)]), e("b"), e("b", [h(1)], [h(3)]), e("b", [], [], h(100))],
      h(120),
    );
    expect(s.a).toEqual({ n: 3, treffer: 2, termin: 1 });
    expect(s.b).toEqual({ n: 3, treffer: 1, termin: 1 });
    expect(s.unreif).toBe(1);
    expect(s.entscheidung.reason).toBe("zu_wenig");

    // 50 je Fassung, 10 % gegen 50 %: entschieden für B
    const viele = [
      ...Array.from({ length: 50 }, (_, i) => e("a", i < 5 ? [h(1)] : [])),
      ...Array.from({ length: 50 }, (_, i) => e("b", i < 25 ? [h(1)] : [])),
    ];
    const d = nichtErreichtAbStand(viele, h(100));
    expect(d.entscheidung).toMatchObject({ reason: "zu_wenig" }); // A hat nur 5 Treffer (< 10)
    const viele2 = [
      ...Array.from({ length: 50 }, (_, i) => e("a", i < 10 ? [h(1)] : [])),
      ...Array.from({ length: 50 }, (_, i) => e("b", i < 30 ? [h(1)] : [])),
    ];
    expect(nichtErreichtAbStand(viele2, h(100)).entscheidung).toMatchObject({ reason: "entschieden", winner: "b" });
    // unter der Mindestmenge keine Entscheidung, auch bei großem Unterschied
    const wenige = [...Array.from({ length: 40 }, (_, i) => e("a", i < 10 ? [h(1)] : [])), ...Array.from({ length: 40 }, (_, i) => e("b", i < 30 ? [h(1)] : []))];
    expect(nichtErreichtAbStand(wenige, h(100)).entscheidung.reason).toBe("zu_wenig");
  });
});

describe("Du/Sie und bearbeiteter Text (Ole, 23.11.2026)", () => {
  it("Du-Fassungen aller Texte: gleiche Fassungslogik, ohne Gedankenstriche, ohne Sie", () => {
    for (const link of ["https://x.example/t", null])
      for (const fassung of ["a", "b"] as const) {
        const du = nichtErreichtMail({ buchungslink: link, fassung, du: true });
        const sie = nichtErreichtMail({ buchungslink: link, fassung });
        expect(du.paragraphs).toHaveLength(sie.paragraphs.length);
        expect(du.button).toEqual(sie.button);
        for (const t of [du.subject, ...du.paragraphs]) {
          expect(t).not.toMatch(/[–—]/);
          expect(t).not.toMatch(/\b(Sie|Ihnen|Ihr)\b/);
        }
        expect(du.paragraphs.join(" ").includes("vormittags oder nachmittags?")).toBe(fassung === "b");
      }
    for (const [name, body] of [
      [NE_TEMPLATE_NAME_DU, NE_TEMPLATE_BODY_DU],
      [NE_TEMPLATE_NAME_B_DU, NE_TEMPLATE_BODY_B_DU],
    ]) {
      expect(SUPPORT_TEMPLATES.map((t) => t.name)).toContain(name);
      expect(metaTemplateProblems(body, NE_TEMPLATE_EXAMPLES_DU)).toEqual([]);
      expect(body).not.toMatch(/[–—]|\b(Sie|Ihnen)\b/);
    }
    // Du-Fassungen unterscheiden sich wie A und B nur im Schluss nach dem Link
    expect(NE_TEMPLATE_BODY_B_DU.split("{{2}}")[0]).toBe(NE_TEMPLATE_BODY_DU.split("{{2}}")[0]);
    expect(neVorlage("b", true).name).toBe(NE_TEMPLATE_NAME_B_DU);
    expect(neVorlage("a", false).name).toBe(NE_TEMPLATE_NAME);
  });

  it("Mailtext: Anrede und Absätze hin und zurück, bearbeitet erkennt nur echte Änderungen", () => {
    const text = neMailText("Hallo Max,", ["eins.", "zwei."]);
    expect(text).toBe("Hallo Max,\n\neins.\n\nzwei.");
    expect(neMailAusText("Hallo Max,\r\n\r\neins.\n\n\n\nzwei.  \n")).toEqual({ greeting: "Hallo Max,", paragraphs: ["eins.", "zwei."] });
    const v = { betreff: "Betreff", text };
    expect(neBearbeitet(v, {})).toBe(false);
    expect(neBearbeitet(v, { betreff: " Betreff ", text: `${text}\n\n` })).toBe(false);
    expect(neBearbeitet(v, { betreff: "Anders" })).toBe(true);
    expect(neBearbeitet(v, { text: text.replace("eins", "drei") })).toBe(true);
  });

  it("Vermerk mit Du und bearbeitet, bearbeitete Einheiten zählen nicht im A/B-Test", () => {
    expect(neFassungVermerk("a", { du: true, bearbeitet: true })).toBe("Fassung A, Du, bearbeitet");
    expect(neFassungAusNotiz("An x@y.de, Betreff: Test, Fassung B, Du, bearbeitet")).toBe("b");
    expect(neBearbeitetAusNotiz("An x@y.de, Betreff: Test, Fassung B, Du, bearbeitet")).toBe(true);
    expect(neBearbeitetAusNotiz("An x@y.de, Betreff: bearbeitet, Fassung A")).toBe(false);
    expect(neBearbeitetAusNotiz("An x@y.de, Fassung A, Du")).toBe(false);

    const t0 = new Date("2026-12-01T10:00:00Z");
    const h1 = new Date(t0.getTime() + 3_600_000);
    const s = nichtErreichtAbStand(
      [
        { fassung: "a", gesendet: t0, antworten: [h1], termine: [] },
        { fassung: "a", gesendet: t0, antworten: [h1], termine: [], bearbeitet: true },
        { fassung: "b", gesendet: t0, antworten: [], termine: [h1], bearbeitet: true },
      ],
      new Date(t0.getTime() + 100 * 3_600_000),
    );
    expect(s.a).toEqual({ n: 1, treffer: 1, termin: 0 });
    expect(s.b).toEqual({ n: 0, treffer: 0, termin: 0 });
    expect(s.bearbeitet).toBe(2);
  });
});
