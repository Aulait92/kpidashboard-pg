// Frage nach der Vorbereitung (Ole, 26.11.2026), Bestätigung v5 und Video als Standard bei Online-Buchungen
// (lib/termin-formate.ts buchungsModus). Die Fragen-Engine selbst: tests/unit/vorbereitung-sparten.test.ts. Rein, ohne Datenbank.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buchungsModus } from "@/lib/termin-formate";
import { anredeZeile } from "@/lib/ansprache";
import { metaTemplateProblems, exampleValuesFor, templateBodyFor, templateNamesOf } from "@/lib/whatsapp/template-plan";
import { vorbereitungAusText } from "@/lib/vorbereitung/fragen";

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
    expect(anredeZeile("sie", { fullName: "Rachid El Oufy", salutation: "Herr" })).toBe("Guten Tag Herr El Oufy,");
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
