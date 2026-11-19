// P8 „So arbeitet Ihr Assistent“ (Ole, 17.11.2026): Zeitleiste mit drei Spuren und Beispielchat aus denselben
// Textfunktionen wie der Assistent; M7: Vorschläge im Nachrichtenplan und Antwortweg der Service-Mails.
import { describe, expect, it } from "vitest";
import { assistentMomente, beispielVerlauf, nachfassTage, type BeispielEingabe, type ChatZeile } from "@/lib/so-arbeitet";
import { erstanschreibenText } from "@/lib/whatsapp/erstanschreiben";
import { buchungsText, eingetragenFrage, einladungUnterwegs, komplettcheckFrage } from "@/lib/whatsapp/gespraech";
import { policenBitte } from "@/lib/policen/bitte";
import { BEISPIEL_KONTAKT } from "@/lib/ablauf";
import { vermittlerName } from "@/lib/vermittler-nennung";
import { anLead, planeNachrichten, zaehleAutomatische, type PlanEingabe } from "@/lib/nachrichtenplan";
import { antwortwegFuer } from "@/lib/mail/service-mails-daten";

const now = new Date("2026-11-18T08:00:00.000Z");
const PRIVATSCHUTZ = [
  { label: "Lebenssituation", value: "Familie mit Kindern" },
  { label: "Versicherungsinteresse", value: "Haftpflicht, Hausrat" },
  { label: "Postleitzahl", value: "80331" },
];
const eingabe = (an: "sie" | "du", extra: Partial<BeispielEingabe> = {}): BeispielEingabe => ({
  an,
  person: vermittlerName(an, { name: "Ole Kannapinn", anrede: "Herr", fallback: "Ihr Berater" }),
  vermittler: { name: "Ole Kannapinn", anrede: "Herr" },
  produkt: "Privatschutz",
  formular: PRIVATSCHUTZ,
  firma: "Kannapinn Versicherungen",
  policen: true,
  now,
  ...extra,
});
const nachrichten = (z: ChatZeile[]) => z.flatMap((x) => (x.art === "nachricht" ? [x] : []));
const vomAssistenten = (z: ChatZeile[]) => nachrichten(z).filter((x) => x.von === "assistent").map((x) => x.text);

describe("Beispielverlauf (WhatsApp-Optik)", () => {
  it("Sie: dieselben Texte wie der Assistent, in der Reihenfolge der Strecke", () => {
    const e = eingabe("sie");
    const z = beispielVerlauf(e);
    const texte = vomAssistenten(z);
    // Erstanschreiben v10 (ohne die Lebenssituation, damit die Zwischenfrage kommt); KI-Kennzeichnung als Fußzeile der Vorlage
    expect(texte[0]).toBe(
      erstanschreibenText({ an: "sie", kontakt: BEISPIEL_KONTAKT, name: e.person.nom, vermittler: e.person.dat, vermittlerNom: e.person.nom, source: "Privatschutz", formular: PRIVATSCHUTZ.slice(1) }, { ohneFuss: true }),
    );
    expect(texte[0]).toContain("Hallo Frau Becker");
    expect(texte[0]).toBe("Hallo Frau Becker, danke für Ihre Anfrage zum Privatschutz! *Ist davon schon etwas versichert?*");
    expect(nachrichten(z)[0].knoepfe).toEqual(["Alles neu", "Schon versichert", "Teils, teils"]);
    expect(nachrichten(z)[0].fusszeile).toBe("KI-Assistent");
    expect(texte[1]).toBe("Danke! Damit Herr Kannapinn Ihnen im Termin gleich passende Beiträge zeigen kann: Wer soll mitversichert sein?");
    expect(texte[2]).toMatch(/^Danke! In einem kurzen Videotermin zeigt Ihnen Herr Kannapinn, was Haftpflicht und Hausrat für Sie kosten/);
    expect(texte[3]).toBe(buchungsText({ an: "sie", start: new Date("2026-11-20T15:00:00.000Z"), mode: "video", meetUrl: "https://meet.google.com/abc-defg-hij", person: e.person }));
    expect(texte[4]).toBe(komplettcheckFrage("sie", e.person, false));
    // Nutzen stand schon in der Zwischenfrage: knapp, ohne zweites „Damit … zeigen kann:“ (Ole, 19.11.2026)
    expect(texte[5]).toBe("Super! Und Ihr Geburtsdatum?");
    expect(texte[6]).toMatch(/^Danke! Damit Herr Kannapinn sieht, ob Sie irgendwo doppelt zahlen: Welche Versicherungen haben Sie heute schon\?/);
    expect(texte[7]).toBe(`Danke! ${policenBitte({ an: "sie", vermittler: { ...e.person, anrede: "Herr", name: "Ole Kannapinn" }, firma: e.firma }).text}`);
    expect(texte[8]).toMatch(/^Kurz zum Datenschutz: Ich bin einverstanden, dass Ole Kannapinn \(Kannapinn Versicherungen\)/);
    expect(texte.at(-3)).toContain("Zum Schluss: Die Einladung mit Kalendereintrag geht an julia.becker@example.com. Stimmt die Adresse?");
    expect(texte.at(-2)).toBe(einladungUnterwegs("sie"));
    expect(texte.at(-1)).toBe(eingetragenFrage("sie"));
    // Knöpfe wie im echten Chat
    const knoepfe = nachrichten(z).flatMap((x) => x.knoepfe ?? []);
    expect(knoepfe).toEqual(expect.arrayContaining(["Nur ich", "Andere Zeit", "Ja, gern", "Nein, danke", "Einverstanden", "Lieber nicht", "Ja, stimmt", "Andere Adresse", "Ja, eingetragen", "Nein, bitte nochmal"]));
    // Erstinformation im Kopf der Vorlage
    expect(nachrichten(z)[0].anhang).toBe("Erstinformation.pdf");
  });

  it("Du: Vorname des Vermittlers und Du-Form, keine Gedankenstriche", () => {
    const z = beispielVerlauf(eingabe("du"));
    const alle = vomAssistenten(z).join("\n");
    expect(alle).toContain("Hallo Julia");
    expect(alle).toContain("Damit Ole dir im Termin gleich passende Beiträge zeigen kann");
    expect(alle).toContain("Super! Und dein Geburtsdatum?");
    expect(alle.match(/gleich passende Beiträge zeigen kann/g)).toHaveLength(1);
    expect(alle).not.toMatch(/Herr Kannapinn|Herrn Kannapinn|\bSie\b|\bIhnen\b/);
    expect(alle).not.toMatch(/[–—]/);
    expect(vomAssistenten(beispielVerlauf(eingabe("sie"))).join("\n")).not.toMatch(/[–—]/);
  });

  it("Ohne Policen-Modul: keine Bitte, Schluss nach den Verträgen", () => {
    const texte = vomAssistenten(beispielVerlauf(eingabe("sie", { policen: false })));
    expect(texte.join("\n")).not.toContain("Policen hier in den Chat");
    expect(texte.at(-3)).toMatch(/^Danke, das schaut sich Herr Kannapinn im Termin mit an\./);
  });

  it("Anderes Produkt: Erstanschreiben und Terminvorschlag passen zum Produkt, keine Zwischenfrage", () => {
    const z = beispielVerlauf(eingabe("sie", { produkt: "Katzenversicherung", formular: [{ label: "Tierart", value: "Katze" }, { label: "Tiername", value: "Minka" }, { label: "Geburtsjahr (Tier)", value: "2022" }] }));
    const texte = vomAssistenten(z);
    // v9: Tierkrankenversicherung emotional mit dem Tiernamen
    expect(texte[0]).toMatch(/^Hallo Frau Becker, schön, dass Sie Minka gut absichern möchten 🐾 \*.+\?\*$/);
    expect(texte.join("\n")).not.toContain("Wer soll mitversichert sein?");
    expect(texte[1]).toContain("Minka");
  });
});

describe("Zeitleiste mit drei Spuren", () => {
  it("fünf Momente für Sie: Anruf (6er-Anrufplan), Termin, „Ist Frau Becker da?“, Angebot, Abschluss", () => {
    const m = assistentMomente("sie");
    const sie = m.filter((x) => x.spur === "sie");
    expect(sie.map((x) => x.key)).toEqual(["anruf", "termin", "da", "angebot", "abschluss"]);
    expect(sie.map((x) => x.nr)).toEqual([1, 2, 3, 4, 5]);
    expect(sie[0].wann).toBe("nach 30 Min.");
    expect(sie[0].text).toContain("Frau Becker hat noch nicht geantwortet. Jetzt anrufen?");
    expect(sie[0].text).toContain("6 Versuche über mindestens 3 Tage");
    expect(sie[2].titel).toBe("„Ist Frau Becker da?“");
    expect(new Set(m.map((x) => x.spur))).toEqual(new Set(["lead", "assistent", "sie"]));
    expect(JSON.stringify(m)).not.toMatch(/[–—]/);
  });
  it("Nachfassen mit den Tagen aus der Angebots-Abfolge", () => {
    expect(nachfassTage()).toMatch(/^Tag \d+(, \d+)* und \d+$/);
    expect(assistentMomente("sie").find((x) => x.key === "nachfassen")?.wann).toBe(nachfassTage());
  });
});

describe("Nachrichtenplan: Vorschläge (M7)", () => {
  const basis = (extra: Partial<PlanEingabe> = {}): PlanEingabe => ({
    now,
    an: "sie",
    hi: "Guten Tag Frau Becker,",
    person: { nom: "Herr Kannapinn", dat: "Herrn Kannapinn" },
    label: "Frau Becker",
    leadId: "l1",
    termine: [],
    email: true,
    whatsapp: true,
    abfolgen: [],
    abfolgeKontext: { firstName: "Julia", hi: "Guten Tag Frau Becker,", kontakt: { fullName: "Julia Becker", salutation: "Frau" }, topic: "Hausrat", an: "sie" },
    anrufplan: { followUpAt: null, followUpNote: null, callAttempts: 0, callPlanStartedAt: null, lastCallAttemptAt: null },
    ...extra,
  });
  it("Willkommens-Mail und Kündigung als Vorschlag, zählen nicht als automatische Nachricht", () => {
    const plan = planeNachrichten(
      basis({
        vorschlaege: [
          { kind: "police", note: "Police da und erste Zahlung erfolgt?", dueAt: new Date(now.getTime() + 14 * 86_400_000) },
          { kind: "kuendigung", note: "Alten Vertrag kündigen: Haftpflicht bei HUK-Coburg", dueAt: new Date(now.getTime() - 3_600_000) },
        ],
      }),
    );
    expect(plan.map((e) => e.titel)).toEqual(["Vorschlag: Kündigung vorbereiten", "Vorschlag: Willkommens-Mail, sobald die Police da ist"]);
    expect(plan.every((e) => e.quelle === "vorschlag" && !e.aktionen)).toBe(true);
    // Fällig: nicht in der Vergangenheit
    expect(plan[0].at).toBe(now.toISOString());
    expect(plan.some(anLead)).toBe(false);
    expect(zaehleAutomatische(plan, now, new Date(now.getTime() + 30 * 86_400_000))).toHaveLength(0);
  });
  it("Vorlage „aus“: Aufgabe ohne Mail-Vorschlag", () => {
    const plan = planeNachrichten(basis({ vorschlaege: [{ kind: "police", note: "Police da und erste Zahlung erfolgt?", dueAt: now }], mailAus: ["willkommen"] }));
    expect(plan[0]).toMatchObject({ kanal: "anruf", titel: "Vorschlag: Police da und erste Zahlung erfolgt?" });
  });
});

describe("Antwortweg der Service-Mails (M7)", () => {
  it("Postfach, Weiterleitungsadresse nur mit Schalter, sonst die eigene Adresse", () => {
    expect(antwortwegFuer({ postfach: true, eingangAn: true, slug: "kannapinn", eigene: "ole@x.de" })).toEqual({ art: "postfach" });
    expect(antwortwegFuer({ postfach: false, eingangAn: true, slug: "Kannapinn", eigene: "ole@x.de" })).toEqual({ art: "eingang", muster: "kannapinn.<Code>@antwort.dein-beratungstermin.de" });
    expect(antwortwegFuer({ postfach: false, eingangAn: false, slug: "kannapinn", eigene: "ole@x.de" })).toEqual({ art: "eigene", adresse: "ole@x.de" });
  });
});
