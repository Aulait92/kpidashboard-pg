// Datenschutz und Recht im Vertrieb (Ole, 19.11.2026): Unterart, Frist, Domain-Sperre nur für eigene Domains und die drei
// Antwortvorlagen (Sie-Form, ohne Gedankenstriche, ohne „Garantie“). Nur Platzhalterdaten.
import { describe, expect, it } from "vitest";
import { dsgvoAusAntwort } from "@/lib/vertrieb/nie-kontaktieren";
import {
  ABMAHNUNG_HINWEIS,
  KONZERN_AB_KONTAKTEN,
  herkunftVollstaendig,
  istKonzernDomainFest,
  rechtsArtAusBefund,
  rechtsAufgabeNotiz,
  rechtsAufgabeTitel,
  rechtsFrist,
  sperrDomainVon,
  vorlageAuskunft,
  vorlageLoeschung,
  vorlageWiderspruch,
  type AuskunftAkte,
} from "@/lib/vertrieb/datenschutz-recht";
import { PROVIDER } from "@/lib/legal-texts";

const art = (t: string, betreff?: string) => rechtsArtAusBefund(dsgvoAusAntwort(t, betreff));

describe("Unterart", () => {
  it.each([
    ["Bitte erteilen Sie mir Auskunft nach Art. 15 DSGVO.", "auskunft"],
    ["Woher haben Sie meine E-Mail-Adresse?", "auskunft"],
    ["Weisen Sie mir bitte meine Einwilligung nach.", "auskunft"],
    ["Löschen Sie bitte umgehend meine Daten.", "loeschung"],
    ["Ich verlange die Löschung meiner Daten nach Art. 17 DSGVO.", "loeschung"],
    ["Ich widerspreche der Nutzung meiner Daten für Werbung.", "widerspruch"],
    ["Bitte keine Werbung mehr.", "widerspruch"],
    ["Unterlassen Sie künftig solche Mails.", "widerspruch"],
    ["Das ist ein Datenschutzverstoß.", "widerspruch"],
    ["Sie schreiben mich ohne meine Einwilligung an.", "widerspruch"],
    ["Das ist ein Verstoß gegen § 7 UWG. Ich mahne Sie hiermit ab.", "abmahnung"],
    ["Bitte geben Sie eine strafbewehrte Unterlassungserklärung ab.", "abmahnung"],
    ["Ich habe die Mail an meine Kanzlei weitergeleitet.", "abmahnung"],
    ["Unsere Kanzlei wird sich bei Ihnen melden.", "abmahnung"],
    ["Namens und in Vollmacht unserer Mandantin fordern wir Sie auf.", "abmahnung"],
    ["Ich gebe das an meinen Anwalt weiter.", "abmahnung"],
    ["Ich behalte mir Schadensersatz vor.", "abmahnung"],
    ["Ich werde mich bei der Aufsichtsbehörde beschweren.", "abmahnung"],
    // Abmahnung hat Vorrang vor Auskunft
    ["Auskunft nach Art. 15 DSGVO, sonst schalte ich meinen Anwalt ein.", "abmahnung"],
    // „§ 7 UWG“ allein ist eine Rüge, keine Abmahnung (Ole, 24.11.2026; Fall einer Agentur, gekürzt)
    [
      "Unzulässige Werbung (§ 7 UWG) und Auskunftsersuchen nach Art. 15 DSGVO\nDa weder eine Geschäftsbeziehung noch eine ausdrückliche Einwilligung vorliegt, stellt dies eine unzumutbare Belästigung nach § 7 Abs. 2 Nr. 2 UWG dar. Ich fordere Sie auf, jegliche weitere Kontaktaufnahme zu Werbezwecken zu unterlassen, mir gemäß Art. 15 DSGVO mitzuteilen, aus welcher Quelle meine Daten stammen, und meine Daten im Anschluss gemäß Art. 17 DSGVO zu löschen.",
      "auskunft",
    ],
    ["Ihre Mail verstößt gegen das UWG. Bitte keine Werbung mehr.", "widerspruch"],
  ] as const)("%s → %s", (t, erwartet) => {
    expect(art(t)).toBe(erwartet);
  });

  it.each([
    "Bitte austragen.",
    "Kein Interesse, danke.",
    "Wir sind eine Maklerkanzlei mit 5 Mitarbeitern.",
    "Unsere Kanzlei arbeitet schon mit einem Anbieter.",
    "Sind die Leads DSGVO-konform?",
    "Ihr Anwalt für Versicherungsrecht? Nein danke.",
  ])("kein Rechtsfall: %s", (t) => {
    expect(art(t)).toBeNull();
  });

  it("Frist: 7 Tage, Abmahnung sofort", () => {
    const eingang = new Date("2026-11-19T10:00:00Z");
    expect(rechtsFrist("auskunft", eingang).toISOString()).toBe("2026-11-26T10:00:00.000Z");
    expect(rechtsFrist("loeschung", eingang).toISOString()).toBe("2026-11-26T10:00:00.000Z");
    expect(rechtsFrist("widerspruch", eingang).toISOString()).toBe("2026-11-26T10:00:00.000Z");
    expect(rechtsFrist("abmahnung", eingang).toISOString()).toBe(eingang.toISOString());
    expect(rechtsAufgabeTitel("auskunft", eingang)).toBe("Auskunft nach Art. 15 beantworten, Frist 26.11.2026");
    expect(rechtsAufgabeTitel("widerspruch", eingang)).toBe("Widerspruch bestätigen, Frist 26.11.2026");
    expect(rechtsAufgabeTitel("abmahnung", eingang)).toBe("Abmahnung bzw. rechtliche Drohung: sofort prüfen");
    expect(rechtsAufgabeNotiz("abmahnung")).toContain("Keine Unterlassungserklärung unterschreiben. Zur Prüfung an Claude geben.");
    expect(rechtsAufgabeNotiz("abmahnung")).toContain("Löschung erst nach Prüfung per Knopf (Belege sichern).");
    expect(ABMAHNUNG_HINWEIS).toBe("Keine Unterlassungserklärung unterschreiben. Zur Prüfung an Claude geben.");
  });
});

describe("Domain-Sperre nur für eigene Domains", () => {
  it("eigene Agentur-Domain wird gesperrt (Registrierungsdomain)", () => {
    expect(sperrDomainVon("info@agentur-beispiel.de", 1)).toBe("agentur-beispiel.de");
    expect(sperrDomainVon("max@mail.agentur-beispiel.de", 1)).toBe("agentur-beispiel.de");
    expect(sperrDomainVon("max@agentur-beispiel.de", KONZERN_AB_KONTAKTEN - 1)).toBe("agentur-beispiel.de");
  });
  it("nie Freemail, Konzern- oder Portal-Domain", () => {
    for (const e of ["max@gmail.com", "max@web.de", "max@t-online.de", "max.muster@dvag.de", "max@allfinanz.ag", "a@ergo.de", "x@signal-iduna.net", "x@a-baum.lvm.de", "x@tecis.de", "x@telis-finanz.de", "x@gs.provinzial.com", "x@allianz-agentur.de", "x@sv-sachsen.de"]) {
      expect(sperrDomainVon(e, 1), e).toBeNull();
    }
    // mehr als 3 verschiedene Vertriebskontakte: Portal
    expect(sperrDomainVon("max@vertrieb-portal.de", KONZERN_AB_KONTAKTEN)).toBeNull();
    expect(KONZERN_AB_KONTAKTEN).toBe(4);
    expect(sperrDomainVon("geloescht-x@art17.invalid", 0)).toBeNull();
    expect(istKonzernDomainFest("dvag.de")).toBe(true);
    expect(istKonzernDomainFest("agentur-beispiel.de")).toBe(false);
  });
});

const AKTE: AuskunftAkte = {
  felder: { Anrede: "Herr", Nachname: "Muster", "Firma bzw. Name": "Agentur Muster", "E-Mail": "max@agentur-beispiel.de", "angelegt am": "2026-11-02" },
  herkunft: { art: "öffentliche Vermittlerliste", quelle: "vertretersuche", gesellschaft: "Beispiel AG", emailQuelle: "Impressum", quelleUrl: "https://vertretung.example/max", abgerufenAm: "2026-11-01" },
  weitereEmpfaenger: ["google"],
  mailsAnIhn: [{ datum: "2026-11-05", weg: "Instantly" }, { datum: "2026-11-09", weg: "Instantly" }],
  antwortenVonIhm: ["2026-11-19"],
  gesperrtSeit: "2026-11-19",
};

describe("Antwortvorlagen", () => {
  const anrede = "Guten Tag Herr Muster,";
  const alle = [vorlageWiderspruch(anrede), vorlageLoeschung(anrede, new Date("2026-11-19T12:00:00Z")), vorlageAuskunft(anrede, AKTE)];

  it("Sie-Form, ohne Gedankenstriche, ohne „Garantie“, mit Absender laut Impressum", () => {
    for (const v of alle) {
      expect(v.text).not.toMatch(/[–—]/);
      expect(v.betreff).not.toMatch(/[–—]/);
      expect(v.text).not.toMatch(/garantie/i);
      expect(v.text).not.toMatch(/\b(du|dich|dir|dein\w*)\b/i);
      expect(v.text.startsWith(anrede)).toBe(true);
      expect(v.text).toContain(PROVIDER.name);
      expect(v.text).toContain(`${PROVIDER.street}, ${PROVIDER.city}`);
    }
  });

  it("(a) Widerspruch: keine Werbung mehr, Adresse gesperrt", () => {
    expect(alle[0].text).toContain("Ihre E-Mail-Adresse ist bei uns gesperrt, Sie erhalten von uns keine Werbung mehr.");
  });

  it("(b) Löschung: Löschdatum und Sperrvermerk", () => {
    expect(alle[1].text).toContain("Ihre Daten haben wir am 19.11.2026 gelöscht.");
    expect(alle[1].text).toContain("verschlüsselter Abgleichwert");
    expect(alle[1].text).toContain("nie wieder Werbung");
  });

  it("(c) Auskunft: alle Pflichtangaben aus der Akte", () => {
    const t = alle[2].text;
    expect(alle[2].betreff).toBe("Auskunft nach Art. 15 DSGVO");
    for (const teil of [
      "- Nachname: Muster",
      "- E-Mail: max@agentur-beispiel.de",
      "- angelegt am: 02.11.2026",
      "E-Mails von uns an Sie: 2 (05.11.2026, 09.11.2026)",
      "Quell-URL: https://vertretung.example/max",
      "abgerufen am 01.11.2026",
      "eigene Dienstleistung",
      "Art. 6 Abs. 1 lit. f DSGVO",
      "Instantly",
      "Anbieter in den USA",
      "Standardvertragsklauseln",
      "Google",
      "Löschkonzept",
      "Sperrvermerk",
      "Berichtigung",
      "Löschung",
      "Einschränkung",
      "widersprechen",
      "Aufsichtsbehörde",
      "Wir haben keinen Datenschutzbeauftragten bestellt. Ansprechpartner: Ole Kannapinn",
    ]) {
      expect(t, teil).toContain(teil);
    }
    expect(herkunftVollstaendig(AKTE.herkunft)).toBe(true);
    expect(herkunftVollstaendig({ art: "Import Cold CRM bzw. von Hand angelegt", angelegt: "2026-10-01" })).toBe(false);
  });
});
