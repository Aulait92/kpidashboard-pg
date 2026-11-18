// P4 „Abschluss erkennen und melden“ (Ole, 17.11.2026): Regeln ohne Datenbank.
import { describe, expect, it } from "vitest";
import {
  abschlussFrage,
  abschlussZeile,
  beitragsChips,
  beitragText,
  blattUrl,
  glueckwunschText,
  glueckwunschVorausgewaehlt,
  kalenderTage,
  premiumAusAngebot,
  premiumYearFor,
  standardPremium,
  vorabendPush,
} from "@/lib/abschluss";
import { effectiveRates } from "@/lib/provision";
import { metaTemplateProblems, purposesFor, VORBEREITETE_PURPOSES } from "@/lib/whatsapp/template-plan";
import { REST_PARAMS, templateTextFor, templateVersionFor } from "@/lib/whatsapp/templates";

const vertreter = effectiveRates("vertreter");
const at = (s: string) => new Date(s);

describe("Abschluss mit einem Tipp: Beitrag", () => {
  it("Jahresbeitrag einheitlich: Sach und Leben wie gespeichert, PKV/Kranken Monatsbeitrag × 12, Tarifoptimierung ohne", () => {
    expect(premiumYearFor("privatschutz", 612)).toBe(612);
    expect(premiumYearFor("bu", 960)).toBe(960);
    expect(premiumYearFor("pkv", 450)).toBe(5400);
    expect(premiumYearFor("zahnzusatz", 30)).toBe(360);
    expect(premiumYearFor("pkv_tarif", 120)).toBeNull();
    expect(premiumYearFor("hausrat", null)).toBeNull();
  });

  it("Beitrag aus dem Angebot (Monatsbeitrag): Sach/Leben als Jahresbeitrag, PKV/Kranken als Monatsbeitrag", () => {
    expect(premiumAusAngebot("privatschutz", 51)).toBe(612);
    expect(premiumAusAngebot("bu", 80)).toBe(960);
    expect(premiumAusAngebot("zahnzusatz", 25.5)).toBe(25.5);
    expect(premiumAusAngebot("pkv_tarif", 100)).toBeNull();
    expect(premiumAusAngebot("hausrat", null)).toBeNull();
  });

  it("Typischer Beitrag aus „Meine Provisionen“ und drei Chips in der Eingabe-Einheit", () => {
    expect(standardPremium("privatschutz", vertreter)).toBe(600);
    expect(standardPremium("bu", vertreter)).toBe(960);
    expect(standardPremium("pkv", vertreter)).toBeNull();
    expect(standardPremium("pkv_tarif", vertreter)).toBeNull();
    expect(beitragsChips("privatschutz", vertreter)).toEqual([350, 600, 900]);
    expect(beitragsChips("hausrat", vertreter)).toEqual([70, 120, 180]);
    // Leben/BU: Monatsbeitrag
    expect(beitragsChips("bu", vertreter)).toEqual([50, 80, 120]);
    expect(beitragsChips("pkv", vertreter)).toEqual([]);
    // eigener Standard des Kunden
    const own = effectiveRates("vertreter", { privatschutz: { kind: "percent", rate: 0.5, defaultPremium: 400 } });
    expect(beitragsChips("privatschutz", own)).toEqual([240, 400, 600]);
  });

  it("Zeile nach dem Tipp: Beitrag aus dem Angebot, typisch mit ≈, Provision im 1. Jahr", () => {
    expect(abschlussZeile({ sparte: "privatschutz", premium: 612, premiumSource: "angebot" }, vertreter)).toBe("Privatschutz/Haftpflicht · 612 €/Jahr aus Ihrem Angebot · Provision ≈ 337 €");
    expect(abschlussZeile({ sparte: "hausrat", premium: 120, premiumSource: "standard" }, vertreter)).toBe("Hausrat · ≈ 120 €/Jahr (typisch) · Provision ≈ 66 €");
    expect(abschlussZeile({ sparte: "bu", premium: 960, premiumSource: "vermittler" }, vertreter)).toBe("BU · 80 €/Monat · Provision ≈ 734 €");
    expect(beitragText({ sparte: "zahnzusatz", premium: 30, premiumSource: "standard" })).toBe("≈ 30 €/Monat");
  });
});

describe("Glückwunsch (Ergänzung D)", () => {
  const now = at("2026-11-20T18:00:00+01:00");
  it("vorausgewählt nur, wenn der Termin höchstens 3 Kalendertage zurückliegt", () => {
    expect(glueckwunschVorausgewaehlt(at("2026-11-20T10:00:00+01:00"), now)).toBe(true);
    expect(glueckwunschVorausgewaehlt(at("2026-11-17T23:30:00+01:00"), now)).toBe(true); // genau 3 Tage
    expect(glueckwunschVorausgewaehlt(at("2026-11-16T20:00:00+01:00"), now)).toBe(false); // 4 Tage
    expect(glueckwunschVorausgewaehlt(null, now)).toBe(false);
    expect(glueckwunschVorausgewaehlt(at("2026-11-21T10:00:00+01:00"), now)).toBe(false); // Termin in der Zukunft
    expect(kalenderTage(at("2026-11-17T00:30:00+01:00"), at("2026-11-17T23:30:00+01:00"))).toBe(0);
  });

  it("Text laut Ole in Sie- und Du-Fassung, ohne Gedankenstriche", () => {
    const sie = glueckwunschText({ an: "sie", name: "Frau Becker", vermittler: "Herrn Kannapinn" });
    expect(sie).toBe("Schön, dass Sie sich für Ihren neuen Schutz entschieden haben, Frau Becker! Bei Fragen erreichen Sie Herrn Kannapinn jederzeit hier.");
    const du = glueckwunschText({ an: "du", name: "Julia", vermittler: "Ole" });
    expect(du).toBe("Schön, dass du dich für deinen neuen Schutz entschieden hast, Julia! Bei Fragen erreichst du Ole jederzeit hier.");
    expect(glueckwunschText({ an: "sie", name: null, vermittler: "Herrn Kannapinn" })).toBe("Schön, dass Sie sich für Ihren neuen Schutz entschieden haben! Bei Fragen erreichen Sie Herrn Kannapinn jederzeit hier.");
    for (const t of [sie, du]) expect(t).not.toMatch(/[–—]/);
  });

  it("Vorlage zur Einreichung freigegeben (Ole, 17.11.2026), Text Meta-tauglich", () => {
    expect(VORBEREITETE_PURPOSES).not.toContain("glueckwunsch");
    expect(purposesFor({ bestand: false })).toContain("glueckwunsch");
    expect(templateVersionFor("glueckwunsch")).toBe("v5");
    expect(REST_PARAMS.glueckwunsch).toEqual(["Vermittler (Akkusativ)"]);
    expect(templateTextFor("glueckwunsch", "sie")).toBe("Guten Tag {{1}}, schön, dass Sie sich für Ihren neuen Schutz entschieden haben! Bei Fragen erreichen Sie {{2}} jederzeit hier.");
    expect(templateTextFor("glueckwunsch", "du")).toBe("Hallo {{1}}, schön, dass du dich für deinen neuen Schutz entschieden hast! Bei Fragen erreichst du {{2}} jederzeit hier.");
    expect(metaTemplateProblems(templateTextFor("glueckwunsch", "sie"), ["Frau Schneider", "Herrn Schmidt"])).toEqual([]);
    expect(metaTemplateProblems(templateTextFor("glueckwunsch", "sie_ohne_name"), ["Herrn Schmidt"])).toEqual([]);
  });
});

describe("Vorabend-Push und Blatt", () => {
  it("Frage für einen, zwei und mehr Kontakte", () => {
    expect(abschlussFrage(["Frau Becker"])).toBe("Hat Frau Becker abgeschlossen?");
    expect(abschlussFrage(["Frau Becker", "Herr Kurz"])).toBe("Haben Frau Becker und Herr Kurz abgeschlossen?");
    expect(abschlussFrage(["Frau Becker", "Herr Kurz", "A", "B"])).toBe("Haben Frau Becker, Herr Kurz und 2 weitere Kontakte abgeschlossen?");
  });

  it("Push mit Deep-Link auf das Blatt, Sie-Form, ohne Gedankenstriche", () => {
    const p = vorabendPush([{ leadId: "l1", label: "Frau Becker", grund: "angebot" }], "2026-11-17");
    expect(p).toEqual({
      title: "Hat Frau Becker abgeschlossen?",
      body: "Morgen fasst der Assistent zum Angebot nach. Mit einem Tipp eintragen oder pausieren.",
      url: "/buyer/abschluss?l=l1",
      tag: "abschluss-frage:2026-11-17",
    });
    const t = vorabendPush([{ leadId: "l1", label: "Frau Becker", grund: "termin" }, { leadId: "l2", label: "Herr Kurz", grund: "termin" }], "2026-11-17");
    expect(t.url).toBe(blattUrl(["l1", "l2"]));
    expect(`${p.body} ${t.body}`).not.toMatch(/[–—]/);
  });
});
