// Erweiterte Erkennung (Ole, 19.11.2026): Datenschutzbeauftragte, Einwilligungsnachweis, Art. 21, Unterlassung, Werbung
// ohne Einwilligung, § 7 UWG, Aufsicht, Schadensersatz, Anwalt sowie ausdrückliches Löschverlangen (Art. 17).
// Lieber etwas zu viel sperren als zu wenig; Fehlalarme nur dort vermeiden, wo sie in Antworten von Vermittlern typisch sind.
import { describe, expect, it } from "vitest";
import { dsgvoAusAntwort, sperrGrundAusAntwort } from "@/lib/vertrieb/nie-kontaktieren";

describe("Datenschutz (Aufgabe „Auskunft beantworten“)", () => {
  it.each([
    "Ich habe die Mail an unseren Datenschutzbeauftragten weitergeleitet.",
    "Bitte nennen Sie mir Ihren Datenschutzbeauftragten.",
    "Weisen Sie mir bitte Ihre Einwilligung nach, sonst gehe ich davon aus, dass es keine gibt.",
    "Bitte legen Sie mir den Nachweis meiner Einwilligung vor.",
    "Ich bitte um Nachweis der Einwilligung zur Zusendung dieser Werbung.",
    "Wann habe ich da bitte eingewilligt?",
    "Wo habe ich jemals zugestimmt, von Ihnen Mails zu bekommen?",
  ])("%s", (t) => {
    expect(sperrGrundAusAntwort(t)).toBe("datenschutz");
  });
});

describe("Widerspruch", () => {
  it.each([
    "Ich widerspreche gemäß Art. 21 DSGVO der Verarbeitung.",
    "Widerspruch nach Artikel 21.",
    "Unterlassen Sie künftig solche Mails.",
    "Ich fordere Sie zur Unterlassung auf.",
    "Bitte geben Sie eine strafbewehrte Unterlassungserklärung ab.",
    "Solche Werbe-Mails sind künftig zu unterlassen.",
    "Bitte zukünftig unterlassen.",
    "Sie schreiben mich ohne meine Einwilligung an.",
    "Werbung ohne Einwilligung ist nicht erlaubt.",
    "Ich habe nie eingewilligt.",
    "Ich habe niemals eine Einwilligung dafür erteilt.",
    "Das ist ein Verstoß gegen § 7 Abs. 2 Nr. 2 UWG.",
    "Ich werde mich bei der Aufsichtsbehörde beschweren.",
    "Ich melde das dem Landesdatenschutzbeauftragten.",
    "Beschwerde bei der Datenschutzbehörde ist raus.",
    "Ich behalte mir Schadensersatz nach Art. 82 vor.",
    "Schadenersatzansprüche behalte ich mir vor.",
    "Ich gebe das an meinen Anwalt weiter.",
    "Unser Rechtsanwalt wird sich bei Ihnen melden.",
    "Ich werde einen Anwalt einschalten.",
    "Die Sache lasse ich anwaltlich prüfen.",
    "Rechtliche Schritte behalte ich mir vor.",
    "Namens und in Vollmacht unseres Mandanten fordern wir Sie auf …",
  ])("%s", (t) => {
    expect(sperrGrundAusAntwort(t)).toBe("widerspruch");
  });

  it("Betreff zählt mit", () => {
    expect(sperrGrundAusAntwort("", "AW: Unterlassung")).toBe("widerspruch");
  });
});

describe("keine Fehlalarme", () => {
  it.each([
    "Wir sind Anwaltskanzlei-Kunden und betreuen viele Anwälte, das passt also.",
    "Ihr Anwalt für Versicherungsrecht? Nein danke, kein Bedarf.",
    "Wir haben viele Anwälte als Kunden, klingt interessant.",
    "Ohne Zustimmung der Allianz darf ich leider keine Leads kaufen.",
    "Ohne Zustimmung meines Partners entscheide ich nichts, rufen Sie nächste Woche an.",
    "Die BaFin als Aufsichtsbehörde sieht das kritisch, daher kein Interesse.",
    "Mein Chef hat dem Budget noch nicht zugestimmt.",
    "Löschen Sie die Daten der Interessenten nach drei Monaten?",
    "Wann erfolgt die Löschung der Daten bei den Leads?",
  ])("%s", (t) => {
    const b = dsgvoAusAntwort(t);
    expect(b.grund === "widerspruch" || b.grund === "datenschutz").toBe(false);
    expect(b.loeschen).toBe(false);
  });
});

describe("Löschverlangen (Art. 17)", () => {
  it.each([
    "Löschen Sie bitte umgehend meine Daten.",
    "Löschen Sie sofort alle meine Daten!",
    "Ich verlange die Löschung meiner Daten.",
    "Ich fordere die Löschung aller meiner personenbezogenen Daten.",
    "Gemäß Art. 17 DSGVO fordere ich Sie auf, meine Daten zu löschen.",
    "Ich mache mein Recht auf Vergessenwerden geltend.",
    "Bitte meine E-Mail-Adresse löschen.",
    "Ich möchte, dass meine Daten gelöscht werden.",
    "Löschen Sie mich bitte aus Ihrer Datenbank.",
    "Bitte löschen Sie sämtliche Daten über mich.",
  ])("%s", (t) => {
    const b = dsgvoAusAntwort(t);
    expect(b.loeschen).toBe(true);
    // reines Löschverlangen: Widerspruch, keine Auskunft
    expect(b.auskunft).toBe(false);
    expect(b.grund).toBe("widerspruch");
  });

  it("Auskunft und Löschung zugleich: Datenschutz mit Auskunft", () => {
    const b = dsgvoAusAntwort("Woher haben Sie meine Adresse? Löschen Sie meine Daten.");
    expect(b).toEqual({ grund: "datenschutz", loeschen: true, auskunft: true });
  });

  it("Austragung ist kein Löschverlangen", () => {
    for (const t of ["Bitte löschen Sie mich aus Ihrem Verteiler.", "lösch mich bitte", "Bitte austragen."]) {
      const b = dsgvoAusAntwort(t);
      expect(b.loeschen).toBe(false);
      expect(b.grund).toBe("austragen");
    }
  });

  it("Widerspruch ohne Löschverlangen bleibt ohne Löschung", () => {
    expect(dsgvoAusAntwort("Ich widerspreche der Nutzung meiner Daten zu Werbezwecken.")).toEqual({ grund: "widerspruch", loeschen: false, auskunft: false });
  });

  it("Datenschutzhinweise in der Signatur lösen nichts aus", () => {
    const t =
      "Kein Bedarf.\n\nMit freundlichen Grüßen\nMax Muster\nDatenschutz: Sie haben das Recht auf Löschung (Art. 17 DSGVO), Datenschutzbeauftragter: dsb@beispiel.de";
    expect(dsgvoAusAntwort(t)).toEqual({ grund: null, loeschen: false, auskunft: false });
  });
});
