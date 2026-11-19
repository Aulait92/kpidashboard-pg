// „Nie kontaktieren“ (Ole, 19.11.2026): Erkennung von Austragungswunsch, Widerspruch und Datenschutzfragen in
// Antworten auf Kalt-Mails. Zitate der eigenen Mail und Signaturen dürfen keinen Fehlalarm auslösen.
import { describe, expect, it } from "vitest";
import { auskunftsAufgabe, auskunftsFrist, sperrGrundAusAntwort } from "@/lib/vertrieb/nie-kontaktieren";
import { classifyReply } from "@/lib/vertrieb/sentiment";

describe("Austragungswunsch", () => {
  it.each([
    "Bitte tragen Sie mich aus Ihrem Verteiler aus.",
    "Bitte austragen.",
    "Abmelden",
    "Ich möchte keine weiteren E-Mails von Ihnen erhalten.",
    "Bitte keine Mails mehr.",
    "Bitte nicht mehr anschreiben!",
    "Schreiben Sie mich bitte nicht mehr an.",
    "Entfernen Sie mich bitte aus Ihrer Liste.",
    "lösch mich bitte aus deinem Verteiler",
    "Nehmen Sie uns bitte aus Ihrer Datenbank.",
    "Kontaktieren Sie uns bitte nicht mehr.",
    "Unsubscribe",
    "Please remove me from your list.",
    "Sehen Sie bitte künftig von weiteren E-Mails ab.",
  ])("%s", (t) => {
    expect(sperrGrundAusAntwort(t)).toBe("austragen");
  });
});

describe("Widerspruch", () => {
  it.each([
    "Ich widerspreche der Nutzung meiner Daten zu Werbezwecken.",
    "Werbung verbitte ich mir.",
    "Ich verbitte mir solche Mails.",
    "Unerwünschte Werbung, bitte unterlassen.",
    "Bitte keine Werbung.",
    "Ihre Mail ist ein Verstoß gegen § 7 UWG.",
    "Löschen Sie bitte umgehend meine Daten.",
    "Ich untersage Ihnen jede weitere Kontaktaufnahme.",
  ])("%s", (t) => {
    expect(sperrGrundAusAntwort(t)).toBe("widerspruch");
  });
});

describe("Datenschutz- und Herkunftsfragen", () => {
  it.each([
    "Woher haben Sie meine E-Mail-Adresse?",
    "Woher haben Sie meine Daten?",
    "Woher stammen meine Kontaktdaten?",
    "Wie sind Sie an meine Adresse gekommen?",
    "Ich verlange Auskunft nach Art. 15 DSGVO.",
    "Bitte um Auskunft gemäß Artikel 15.",
    "Welche Daten speichern Sie über mich?",
    "Nach DSGVO bitte ich um Auskunft über meine gespeicherten Daten.",
    "Ihre Mail ist nach DSGVO unzulässig.",
    "Woher kennen Sie mich?",
  ])("%s", (t) => {
    expect(sperrGrundAusAntwort(t)).toBe("datenschutz");
  });

  it("Datenschutz hat Vorrang vor Austragen", () => {
    expect(sperrGrundAusAntwort("Woher haben Sie meine Adresse? Bitte austragen.")).toBe("datenschutz");
  });

  it("Betreff zählt mit (ohne Re:)", () => {
    expect(sperrGrundAusAntwort("", "AW: Auskunftsersuchen")).toBe("datenschutz");
    expect(sperrGrundAusAntwort("Danke", "Re: Abmelden")).toBe("austragen");
  });
});

describe("keine Fehlalarme", () => {
  it.each([
    "Kein Interesse, danke.",
    "Wir haben schon einen Anbieter.",
    "Gerne, rufen Sie mich morgen an.",
    "Aktuell nicht, aber im Frühjahr gerne.",
    "Sind Ihre Leads DSGVO-konform?",
    "Wie läuft das mit der DSGVO bei den Leads?",
    "Woher kommen die Leads? Welche Daten bekomme ich?",
    "Woher stammen die Daten der Interessenten?",
    "Wir können derzeit keine weiteren Anfragen bearbeiten, wir sind ausgelastet.",
    "Ich bekomme keine Anfragen mehr über die Allianz.",
    "Die Vorgaben der Allianz untersagen uns das leider.",
    "Wir machen keine Werbung auf Facebook.",
    "Nehmen Sie uns gerne als Kunden auf.",
    "Ich muss mich nicht abmelden, ich bin schon Kunde.",
    "Das landete bei mir im Spam-Ordner, klingt aber interessant.",
  ])("%s", (t) => {
    expect(sperrGrundAusAntwort(t)).toBeNull();
  });

  it("ignoriert den zitierten Abmeldehinweis unserer Cold-Mail", () => {
    const antwort =
      "Klingt interessant, rufen Sie mich gerne an.\n\nAm 12.11.2026 um 10:02 schrieb Ole Muster <ole@performancegrowth.de>:\n> Guten Tag Herr Meier,\n> ... Wenn Sie keine weiteren E-Mails wünschen, antworten Sie mit „abmelden“. Datenschutz: Art. 15 DSGVO";
    expect(sperrGrundAusAntwort(antwort)).toBeNull();
    // auch ohne Zeilenumbrüche (Mails kommen oft als eine Zeile an)
    expect(sperrGrundAusAntwort(antwort.replace(/\n/g, " "))).toBeNull();
    // eigener Text mit Wunsch über dem Zitat zählt
    expect(sperrGrundAusAntwort(`Bitte austragen.\n\n${antwort.split("\n\n")[1]}`)).toBe("austragen");
  });

  it("ignoriert Datenschutzhinweise in der Signatur", () => {
    const t = "Kein Bedarf, danke.\n\nMit freundlichen Grüßen\nMax Muster\nGeneralvertretung\nDatenschutz: www.beispiel.de/dsgvo Auskunft nach Art. 15 DSGVO unter datenschutz@beispiel.de";
    expect(sperrGrundAusAntwort(t)).toBeNull();
  });

  it("leere Antwort", () => {
    expect(sperrGrundAusAntwort(null)).toBeNull();
    expect(sperrGrundAusAntwort("   ")).toBeNull();
  });
});

describe("Einstufung bleibt eine Absage", () => {
  it("klassische Austragung ist auch für die Stimmung negativ", () => {
    expect(classifyReply("Bitte austragen.")).toBe("NEGATIV");
  });
});

describe("Frist für die Auskunft (ein Monat)", () => {
  it("gleicher Kalendertag im Folgemonat, am Monatsende gekürzt", () => {
    expect(auskunftsFrist(new Date("2026-11-19T10:00:00Z")).toISOString().slice(0, 10)).toBe("2026-12-19");
    expect(auskunftsFrist(new Date("2027-01-31T10:00:00Z")).toISOString().slice(0, 10)).toBe("2027-02-28");
    expect(auskunftsFrist(new Date("2026-12-15T10:00:00Z")).toISOString().slice(0, 10)).toBe("2027-01-15");
  });

  it("Titel der Aufgabe", () => {
    expect(auskunftsAufgabe(new Date("2026-11-19T10:00:00Z"))).toBe("Auskunft nach Art. 15 beantworten, Frist 19.12.2026");
  });
});
