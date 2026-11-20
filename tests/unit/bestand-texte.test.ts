// Paket 2 (20.11.2026): neue Texte an Bestandskunden mit Terminlink, beide Ansprachen, ohne Gedankenstriche, ohne
// „Garantie“, ohne Lücken-Behauptung, neutraler Betreff bei Personenversicherungen; Platzhalter im Editor; Terminlink
// mit signierter Zuordnung; Balkenbreite im Ergebnis.

import { describe, expect, it } from "vitest";
import { campaignText, vertragWort, vorlagenThema, type Occasion } from "@/lib/bestand/campaigns";
import {
  defaultCampaignMail,
  fillCampaignMail,
  istPersonenversicherung,
  platzhalterAusAnzeige,
  platzhalterFuer,
  platzhalterZuAnzeige,
} from "@/lib/bestand/kampagnen-mail";
import { pruefeTerminToken, terminlinkFuer, terminToken } from "@/lib/bestand/terminlink";
import { barWidth } from "@/components/bestand/funnel-table";

const OCC: Occasion[] = ["cross_sell", "review", "birthday", "renewal", "empfehlung"];
const KONTAKT = { firstName: "Erika", lastName: "Muster", salutation: "Frau" };
const LINK = "https://app.test/book/agentur-meier?bk=abc";
const DASH = /[–—]/;
const VERBOTEN = /garantie|viele meiner kunden|lücke|€|provision|schätzung/i;
const SIE_WORTE = /\b(Sie|Ihr|Ihre|Ihrem|Ihren|Ihnen|Ihrer)\b/;

const fill = (o: Occasion, an: "sie" | "du", w: Partial<Parameters<typeof fillCampaignMail>[1]> = {}) =>
  fillCampaignMail(defaultCampaignMail(o, an), { ansprache: an, kontakt: KONTAKT, meinname: "Max Meier", thema: "Hausrat", ...w });

describe("Kampagnentexte mit Terminlink (Paket 2)", () => {
  it("alle Anlässe in Sie und Du, ohne Gedankenstriche, ohne Garantie, ohne Lücken-Satz, ohne Euro", () => {
    for (const o of OCC) {
      for (const an of ["sie", "du"] as const) {
        for (const terminlink of [LINK, null]) {
          const m = fill(o, an, { terminlink, datum: "01.03.2027", anzahl: 3, empfehlungslink: "https://app.test/e/x" });
          const wa = campaignText(o, KONTAKT, "Hausrat", an, { terminlink, datum: "01.03.2027", anzahl: 3, vorhanden: "KFZ" });
          for (const t of [m.subject, m.body, wa]) {
            expect(t, `${o}/${an}: ${t}`).not.toMatch(DASH);
            expect(t, `${o}/${an}: ${t}`).not.toMatch(VERBOTEN);
            expect(t).not.toMatch(/\{[a-z]+\}/);
          }
          if (an === "du") for (const t of [m.subject, m.body, wa]) expect(t, `${o}: ${t}`).not.toMatch(SIE_WORTE);
          if (an === "sie") expect(wa.startsWith("Guten Tag Frau Muster")).toBe(true);
          else expect(wa.startsWith("Hallo Erika")).toBe(true);
        }
      }
    }
  });

  it("Terminlink an: Link steht in Mail und WhatsApp-Text; aus: Satz entfällt, Ende mit „einfach mit Ja“", () => {
    for (const o of ["cross_sell", "review", "renewal"] as const) {
      for (const an of ["sie", "du"] as const) {
        const an1 = fill(o, an, { terminlink: LINK, datum: "01.03.2027", anzahl: 3 });
        expect(an1.body).toContain(`Termin wählen: ${LINK}`);
        expect(an1.body).toMatch(an === "sie" ? /Oder antworten Sie einfach mit Ja/ : /Oder antworte einfach mit Ja/);
        const aus = fill(o, an, { terminlink: null, datum: "01.03.2027", anzahl: 3 });
        expect(aus.body).not.toMatch(/Termin wählen|terminlink|Oder /);
        expect(aus.body).toMatch(an === "sie" ? /\nAntworten Sie einfach mit Ja auf diese E-Mail\./ : /\nAntworte einfach mit Ja auf diese E-Mail\./);
        expect(campaignText(o, KONTAKT, "Hausrat", an, { terminlink: LINK })).toContain(`Termin wählen: ${LINK}`);
        expect(campaignText(o, KONTAKT, "Hausrat", an, {})).toMatch(an === "sie" ? /Antworten Sie einfach mit Ja\.$/ : /Antworte einfach mit Ja\.$/);
      }
    }
  });

  it("Cross-Selling persönlich: vorhandener Vertrag und Thema, keine Behauptung einer fehlenden Versicherung", () => {
    expect(campaignText("cross_sell", KONTAKT, "Privathaftpflicht", "sie", { vorhanden: "KFZ", terminlink: LINK })).toBe(
      `Guten Tag Frau Muster, Ihre Kfz-Versicherung läuft über mich, eine Privathaftpflicht habe ich bei Ihnen noch nicht notiert. Soll ich kurz prüfen, ob Sie dort gut versorgt sind? Termin wählen: ${LINK} oder antworten Sie einfach mit Ja.`,
    );
    expect(campaignText("cross_sell", KONTAKT, "Privathaftpflicht", "du", { vorhanden: "KFZ" })).toBe(
      "Hallo Erika, deine Kfz-Versicherung läuft über mich, eine Privathaftpflicht habe ich bei dir noch nicht notiert. Soll ich kurz prüfen, ob du dort gut versorgt bist? Antworte einfach mit Ja.",
    );
    // Eigenes Thema ohne bekanntes Vertragswort
    expect(campaignText("cross_sell", KONTAKT, "Fahrradschutz", "sie")).toContain("zum Thema Fahrradschutz habe ich bei Ihnen noch keinen Vertrag notiert");
    expect(vertragWort("Hausrat")).toBe("Hausratversicherung");
    expect(vertragWort("KFZ")).toBe("Kfz-Versicherung");
    expect(vertragWort("Fahrradschutz")).toBeNull();
    for (const an of ["sie", "du"] as const) expect(fill("cross_sell", an).body).not.toMatch(/(Sie haben|du hast) keine/);
  });

  it("Ablauf mit {datum}, Jahresgespräch mit {anzahl}, Geburtstag ohne Produkt", () => {
    const r = fill("renewal", "sie", { thema: "Kfz-Versicherung", datum: "01.03.2027", terminlink: LINK });
    expect(r.subject).toBe("Ihr Vertrag Kfz-Versicherung verlängert sich am 01.03.2027");
    expect(r.body).toContain("Ihr Vertrag Kfz-Versicherung verlängert sich am 01.03.2027.");
    expect(fill("renewal", "du", { thema: "Kfz-Versicherung", datum: null }).subject).toBe("Dein Vertrag Kfz-Versicherung verlängert sich bald");
    expect(campaignText("renewal", KONTAKT, "Kfz-Versicherung", "sie", { datum: "01.03.2027" })).toContain("Ihre Kfz-Versicherung verlängert sich am 01.03.2027.");

    expect(fill("review", "sie", { anzahl: 3 }).body).toContain("Sie haben 3 Verträge bei mir.");
    expect(fill("review", "du", { anzahl: 1 }).body).toContain("du hast einen Vertrag bei mir.");
    const ohne = fill("review", "sie", { anzahl: null }).body;
    expect(ohne).not.toMatch(/Verträge bei mir/);
    expect(ohne.startsWith("Guten Tag Frau Muster,\n\nEinmal im Jahr")).toBe(true);
    expect(fill("review", "sie").subject).toBe("Ihr Jahrescheck: 15 Minuten");
    expect(fill("review", "du").subject).toBe("Dein Jahrescheck: 15 Minuten");
    expect(campaignText("review", KONTAKT, null, "sie", { anzahl: 4 })).toContain("Sie haben 4 Verträge bei mir. Einmal im Jahr");

    for (const an of ["sie", "du"] as const) {
      const b = fill("birthday", an, { terminlink: LINK });
      expect(b.body).not.toContain(LINK);
      expect(b.body).not.toMatch(/versicherung|vorsorge|jahre alt|\d+\. Geburtstag/i);
      expect(campaignText("birthday", KONTAKT, null, an, { terminlink: LINK })).not.toContain(LINK);
    }
  });

  it("Personenversicherung: Betreff neutral „Ihr Vertrag“, WhatsApp-Platzhalter ohne Sparte", () => {
    for (const thema of ["Berufsunfähigkeit", "Krankenzusatzversicherung", "Unfallversicherung", "Pflegevorsorge", "Risikolebensversicherung"]) {
      expect(istPersonenversicherung(thema)).toBe(true);
      const s = fill("cross_sell", "sie", { thema }).subject;
      expect(s).toBe("Ihr Vertrag: Sind Sie schon versorgt?");
      expect(fill("cross_sell", "du", { thema }).subject).toBe("Dein Vertrag: Bist du schon versorgt?");
      expect(fill("renewal", "sie", { thema, datum: "01.03.2027" }).subject).toBe("Ihr Vertrag verlängert sich am 01.03.2027");
      expect(vorlagenThema("cross_sell", thema)).toBe("Absicherung");
      expect(vorlagenThema("renewal", thema)).toBe("Versicherung");
    }
    expect(istPersonenversicherung("Hausrat")).toBe(false);
    expect(fill("cross_sell", "sie", { thema: "Hausrat" }).subject).toBe("Hausrat: Sind Sie schon versorgt?");
    expect(vorlagenThema("cross_sell", "Hausrat")).toBe("Hausrat");
  });
});

describe("Editor: Platzhalter lesbar statt roher {…}", () => {
  it("hin und zurück verlustfrei, Chips je Anlass", () => {
    for (const o of OCC) {
      for (const an of ["sie", "du"] as const) {
        const d = defaultCampaignMail(o, an);
        const anzeige = platzhalterZuAnzeige(d.body);
        expect(anzeige).not.toMatch(/\{[a-z]+\}/);
        expect(platzhalterAusAnzeige(anzeige)).toBe(d.body);
        expect(platzhalterAusAnzeige(platzhalterZuAnzeige(d.subject))).toBe(d.subject);
      }
    }
    expect(platzhalterZuAnzeige("{anrede} {terminlink}")).toBe("[Anrede] [Terminlink]");
    expect(platzhalterFuer("renewal")).toEqual(["anrede", "thema", "datum", "terminlink", "meinname"]);
    expect(platzhalterFuer("birthday")).not.toContain("terminlink");
  });
});

describe("Terminlink mit signierter Zuordnung", () => {
  it("Token prüfbar, gefälscht oder kaputt → null; ohne Buchungsseite kein Link", () => {
    const t = terminToken("cmrecipient123");
    expect(pruefeTerminToken(t)).toBe("cmrecipient123");
    expect(pruefeTerminToken(`cmrecipient124.${t.split(".")[1]}`)).toBeNull();
    expect(pruefeTerminToken("kaputt")).toBeNull();
    expect(pruefeTerminToken(null)).toBeNull();
    expect(terminlinkFuer(null, "cmrecipient123")).toBeNull();
    const prev = process.env.APP_URL;
    process.env.APP_URL = "https://app.test";
    try {
      expect(terminlinkFuer("agentur-meier")).toBe("https://app.test/book/agentur-meier");
      expect(terminlinkFuer("agentur-meier", "cmrecipient123")).toBe(`https://app.test/book/agentur-meier?bk=${t}`);
    } finally {
      if (prev === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = prev;
    }
  });
});

describe("Ergebnis als Balken", () => {
  it("Breite relativ zu angeschrieben, kleine Werte sichtbar, nie über 100", () => {
    expect(barWidth(0, 100)).toBe(0);
    expect(barWidth(50, 100)).toBe(50);
    expect(barWidth(1, 1000)).toBe(4);
    expect(barWidth(5, 0)).toBe(0);
    expect(barWidth(120, 100)).toBe(100);
  });
});
