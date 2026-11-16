// KI-Kennzeichnung des WhatsApp-Assistenten (KI-VO Art. 50) und harte Sperre gegen Beratung (Vermittlerrecht).
import { describe, expect, it } from "vitest";
import {
  ERSTINFO_KOPF,
  erstinfoZeile,
  hasErstinfoPdf,
  hasErstinfoLink,
  hasKiHinweis,
  humanHandoverReply,
  kiHinweis,
  kiHinweisErneut,
  kiHinweisNoetig,
  KI_HINWEIS_KERN,
  KI_HINWEIS_KURZ,
  wantsHuman,
} from "@/lib/whatsapp/ki-hinweis";
import { beratungsTreffer, sichereAntwort } from "@/lib/whatsapp/beratungs-sperre";
import { buildSystemPrompt } from "@/lib/whatsapp/bot";
import { NAECHSTE_FASSUNG, noticeText, OUTREACH_PURPOSES, TEMPLATE_BODY, TEMPLATE_BODY_B, TEMPLATE_HEADER } from "@/lib/whatsapp/templates";
import { buildTemplateRequest, templateNameFor } from "@/lib/whatsapp/template-plan";
import { isStopMessage } from "@/lib/whatsapp/stopp";

const names = { firm: "Agentur Susanne Meier", advisor: "Susanne Meier" };
const FRAU = { fullName: "Julia Schneider", salutation: "Frau" };
const DAY = 24 * 60 * 60 * 1000;

describe("KI-Hinweis", () => {
  it("erste Nachricht: Wortlaut laut Memo, Sie und Du, keine Gedankenstriche", () => {
    const sie = kiHinweis("sie", names, FRAU);
    expect(sie).toBe(
      "Guten Tag Frau Schneider, hier schreibt der digitale KI-Assistent von Agentur Susanne Meier. Ich bin kein Mensch und berate nicht zu Tarifen. Ich helfe Ihnen, einen Termin mit Susanne Meier zu vereinbaren. Wenn Sie direkt mit Susanne Meier sprechen möchten, schreiben Sie ‚Mensch‘.",
    );
    const du = kiHinweis("du", names, FRAU);
    expect(du.startsWith("Hallo Julia, hier schreibt der digitale KI-Assistent")).toBe(true);
    expect(du).toContain("Ich helfe dir, einen Termin mit Susanne Meier zu vereinbaren. Wenn du direkt mit Susanne Meier sprechen möchtest, schreib ‚Mensch‘.");
    for (const t of [sie, du, kiHinweisErneut("sie", names), kiHinweisErneut("du", names), humanHandoverReply("sie", names), humanHandoverReply("du", names)]) {
      expect(t).not.toMatch(/[–—]/);
      expect(t).not.toMatch(/Garantie/i);
    }
    expect(hasKiHinweis(sie)).toBe(true);
    expect(hasKiHinweis(du)).toBe(true);
  });

  it("steht fest in jedem Erstanschreiben (Vorlage und Freitext, beide A/B-Fassungen); Erstinformation als PDF im Kopf", () => {
    for (const p of OUTREACH_PURPOSES) {
      for (const b of [TEMPLATE_BODY[p], TEMPLATE_BODY_B[p]]) {
        if (!b) continue;
        expect(hasKiHinweis(b.sie), p).toBe(true);
        expect(hasKiHinweis(b.du), p).toBe(true);
      }
      expect(TEMPLATE_HEADER[p], p).toBe("DOCUMENT");
    }
    const t = noticeText("outreach_zahn", "sie", names, FRAU, ["Zahnzusatzversicherung"]);
    expect(hasKiHinweis(t)).toBe(true);
    // PDF im Kopf zählt als geschickt (kein zweites PDF nach der ersten Antwort), alter Link-Text nicht
    expect(hasErstinfoPdf([{ direction: "outbound", kind: "template", body: `${ERSTINFO_KOPF}\nGuten Tag …` }])).toBe(true);
    expect(hasErstinfoPdf([{ direction: "outbound", kind: "template", body: "Erstinformation zu X als Versicherungsvermittler: https://x.de/erstinformation/abc" }])).toBe(false);
    expect(hasErstinfoPdf([{ direction: "outbound", kind: "document", body: "Hier ist die Erstinformation …" }])).toBe(true);
    // Kein Link mehr im Text des Erstanschreibens (PDF im Kopf)
    expect(hasErstinfoLink(t)).toBe(false);
    expect(erstinfoZeile("Susanne Meier", "https://x.de/erstinformation/abc123")).toBe("Erstinformation zu Susanne Meier als Versicherungsvermittler: https://x.de/erstinformation/abc123");
  });

  it("alte Vorlage („digitale Assistent“) zählt nicht: vollständiger Hinweis in der ersten Antwort", () => {
    const now = new Date("2026-11-15T12:00:00Z");
    expect(kiHinweisNoetig({ outbound: [], previousAt: null, now })).toBe("erst");
    expect(kiHinweisNoetig({ outbound: ["Hallo Julia, danke für deine Anfrage! Hier ist der digitale Assistent von X."], previousAt: now, now })).toBe("erst");
    const full = kiHinweis("sie", names, FRAU);
    expect(kiHinweisNoetig({ outbound: [full], previousAt: new Date(now.getTime() - 2 * DAY), now })).toBeNull();
    // Nach über 30 Tagen Pause: erneut
    expect(kiHinweisNoetig({ outbound: [full], previousAt: new Date(now.getTime() - 31 * DAY), now })).toBe("erneut");
    expect(kiHinweisNoetig({ outbound: [full], previousAt: new Date(now.getTime() - 29 * DAY), now })).toBeNull();
  });

  it("erkennt den Wunsch nach einem Menschen und Fragen nach Bot/KI", () => {
    for (const t of [
      "Mensch",
      "mensch!",
      "‚Mensch‘",
      "Mitarbeiter",
      "Bot?",
      "KI?",
      "Bist du ein Bot?",
      "bist du eine KI",
      "Sind Sie ein echter Mensch?",
      "Bist du echt?",
      "Ist das ein Chatbot?",
      "Schreibe ich hier mit einer KI?",
      "Ich möchte bitte mit einem Menschen sprechen",
      "Kann ich mit einem Mitarbeiter reden?",
      "Ich will einen echten Menschen",
      "Bitte kein Bot",
    ]) {
      expect(wantsHuman(t), t).toBe(true);
    }
    for (const t of [
      "Ja, Dienstag passt",
      "Ich bin Mitarbeiter bei Siemens",
      "Wir sind 3 Menschen im Haushalt",
      "Ich arbeite mit Menschen",
      "Was kostet die Zahnzusatz?",
      "",
      null,
    ]) {
      expect(wantsHuman(t), String(t)).toBe(false);
    }
  });

  it("Antwort bei der Übergabe ist wahrheitsgemäß (KI, kein Mensch), erste Nachricht mit Anrede", () => {
    expect(humanHandoverReply("sie", names)).toBe(
      "Ich bin der digitale KI-Assistent von Agentur Susanne Meier, kein Mensch. Ich habe Susanne Meier Bescheid gegeben, Susanne Meier meldet sich persönlich bei Ihnen.",
    );
    expect(humanHandoverReply("du", names, FRAU, { greet: true })).toBe(
      "Hallo Julia, hier schreibt der digitale KI-Assistent von Agentur Susanne Meier. Ich bin kein Mensch und berate nicht zu Tarifen. Ich habe Susanne Meier Bescheid gegeben, Susanne Meier meldet sich persönlich bei dir.",
    );
  });

  it("Systemregeln: nie als Mensch ausgeben, wahrheitsgemäß antworten, keine Beratung, keine Gesundheitsfragen", () => {
    const p = buildSystemPrompt({ systemPrompt: "Du bist Lisa aus dem Team.", knowledge: "", personality: "" }, "Zahnzusatz", {
      qualified: false,
      summary: null,
      contact: { name: "Julia Schneider", phone: "4917600000001", email: null },
      upcoming: null,
      formAnswers: [],
      advisorName: "Susanne Meier",
      firmName: "Agentur Susanne Meier",
      aiDisclosed: false,
      noticePrefixed: true,
      ansprache: "sie",
    });
    expect(p).toContain("Gib dich nie als Mensch aus");
    expect(p).toContain("antworte immer wahrheitsgemäß, dass du der digitale KI-Assistent von Agentur Susanne Meier bist, kein Mensch, und nicht zu Tarifen berätst");
    expect(p).toContain("Nenne keine Versicherer, Tarife oder Produktnamen, keine Preise");
    expect(p).toContain("„Das klärt Susanne Meier im Termin mit Ihnen.“");
    expect(p).toContain("Frage nie nach Gesundheitsangaben");
    expect(p).toContain("Begrüße deshalb nicht und stell dich nicht vor");
  });
});

describe("KI-Hinweis nach Anwalts-Memo (Rechtsvorprüfung 16.11.2026)", () => {
  const MEMO = "Hier schreibt der digitale KI-Assistent von Agentur Susanne Meier. Ich bin kein Mensch und berate nicht zu Tarifen.";

  it("Kern und Kurzfassung stimmen überein: Firma statt Berater, „berate nicht zu Tarifen“", () => {
    expect(KI_HINWEIS_KURZ).toBe("Hier schreibt der digitale KI-Assistent von [Firma]. Ich bin kein Mensch und berate nicht zu Tarifen.");
    for (const an of ["du", "sie"] as const) expect(KI_HINWEIS_KERN[an].startsWith("hier schreibt der digitale KI-Assistent von [Firma]. Ich bin kein Mensch und berate nicht zu Tarifen.")).toBe(true);
    for (const an of ["du", "sie"] as const) expect(kiHinweisErneut(an, names)).toContain("Ich bin kein Mensch und berate nicht zu Tarifen.");
  });

  it("freigegebene Vorlagen v4 bleiben unverändert, v5 ist für jedes Erstanschreiben (a und b) vorgemerkt", () => {
    for (const p of OUTREACH_PURPOSES) {
      // gesendet bzw. eingereicht wird weiter v4 mit dem freigegebenen Text
      expect(templateNameFor(p, undefined, "sie"), p).toBe(`pg_${p}_v4_sie`);
      expect(TEMPLATE_BODY[p].sie, p).not.toContain("berate nicht zu Tarifen");
      expect(buildTemplateRequest(p, names, undefined, "sie").name, p).toBe(`pg_${p}_v4_sie`);
      const n = NAECHSTE_FASSUNG[p]!;
      expect(n.version, p).toBe("v5");
      const texte = [n.du!, n.sie, ...(TEMPLATE_BODY_B[p] ? [n.b!.du!, n.b!.sie] : [])];
      for (const t of texte) {
        expect(t, p).toContain(KI_HINWEIS_KURZ);
        expect(t, p).not.toMatch(/KI-Assistent von \[Berater\]/);
        expect(t, p).not.toMatch(/[–—]/);
        expect(hasKiHinweis(t), p).toBe(true);
      }
    }
  });

  it("Freitext im offenen Fenster folgt schon jetzt dem Memo (a und b, Du und Sie)", () => {
    for (const p of OUTREACH_PURPOSES) {
      for (const variant of ["a", "b"] as const) {
        if (variant === "b" && !TEMPLATE_BODY_B[p]) continue;
        expect(noticeText(p, "sie", names, FRAU, ["Zahnzusatzversicherung"], variant), `${p} ${variant}`).toContain(MEMO);
        expect(noticeText(p, "du", names, FRAU, ["Zahnzusatzversicherung"], variant), `${p} ${variant}`).toContain(MEMO);
      }
    }
    expect(noticeText("outreach_tkv", "sie", names, FRAU, ["Katzenversicherung"])).toBe(
      `Guten Tag Frau Schneider, vielen Dank für Ihre Anfrage zur Katzenversicherung! ${MEMO} Damit Sie ein passendes Angebot bekommen, stelle ich Ihnen zwei kurze Fragen. Für welches Tier suchen Sie den Schutz?`,
    );
  });

  it("Bot-Prompt: Pflichthinweis im Memo-Wortlaut, solange noch nicht offengelegt", () => {
    const p = buildSystemPrompt({ systemPrompt: "", knowledge: "", personality: "" }, "Zahnzusatz", {
      qualified: false,
      summary: null,
      contact: { name: "Julia Schneider", phone: "4917600000001", email: null },
      upcoming: null,
      formAnswers: [],
      advisorName: "Susanne Meier",
      firmName: "Agentur Susanne Meier",
      aiDisclosed: false,
      noticePrefixed: false,
      ansprache: "sie",
    });
    expect(p).toContain(`„${MEMO}“`);
  });
});

describe("Harte Sperre gegen Beratung", () => {
  const erlaubt = ["Allianz Agentur Meier", "Agentur Meier", "Susanne Meier"];
  it("typische unzulässige Antworten werden erkannt", () => {
    // „Was kostet die Zahnzusatz bei der Allianz?“
    expect(beratungsTreffer("Bei der Allianz kostet die Zahnzusatz etwa 25 € im Monat.", erlaubt)).toEqual(expect.arrayContaining(["versicherer", "preis"]));
    // „Welche BU ist die beste?“
    expect(beratungsTreffer("Die beste BU hat aktuell die Alte Leipziger, die ist Testsieger.", erlaubt)).toEqual(expect.arrayContaining(["versicherer", "vergleich"]));
    expect(beratungsTreffer("Ich empfehle Ihnen eine Zahnzusatz mit hoher Erstattung.", erlaubt)).toContain("eignung");
    expect(beratungsTreffer("Der Tarif ZahnPremium erstattet 90 % beim Zahnersatz.", erlaubt)).toEqual(expect.arrayContaining(["tarif", "preis"]));
    expect(beratungsTreffer("Die HUK ist meist günstiger als die DEVK.", erlaubt)).toEqual(expect.arrayContaining(["versicherer", "vergleich"]));
    expect(beratungsTreffer("Eine Hausratversicherung ist für Sie sinnvoll.", erlaubt)).toContain("eignung");
    expect(beratungsTreffer("Sie brauchen unbedingt eine Haftpflicht.", erlaubt)).toContain("eignung");
    expect(beratungsTreffer("Der Beitrag liegt bei 12,50 im Monat.", erlaubt)).toContain("preis");
    expect(beratungsTreffer("Bei Check24 finden Sie das billiger.", erlaubt)).toEqual(expect.arrayContaining(["versicherer", "vergleich"]));
  });

  it("normale Antworten bleiben unverändert (auch mit eigenem Firmennamen)", () => {
    for (const t of [
      "Gern! Wann passt es Ihnen am besten, Dienstag oder Mittwoch?",
      "Das Gespräch ist kostenlos und dauert etwa 30 Minuten.",
      "Für welche Leistungen interessieren Sie sich besonders?",
      "Ihr Termin ist am Dienstag, 17.11., um 10:00 Uhr bestätigt. Hier der Link: https://meet.google.com/abc-defg-hij",
      "Das klärt Susanne Meier im Termin mit Ihnen.",
      "Ich bin der digitale KI-Assistent von Allianz Agentur Meier, kein Mensch.",
      "Möchten Sie lieber telefonieren oder einen Videocall machen?",
      "Ja, das ist richtig, der Termin bleibt so.",
      "Wer soll denn mitversichert sein, nur Sie oder auch Ihre Familie?",
      "Gemeinsam mit Susanne Meier finden Sie im Termin eine Lösung, die zu Ihnen passt.",
    ]) {
      expect(beratungsTreffer(t, erlaubt), t).toEqual([]);
    }
  });

  it("sichere Antwort in beiden Fassungen, ohne Gedankenstriche", () => {
    expect(sichereAntwort("sie", "Susanne Meier", true)).toBe("Das klärt Susanne Meier im Termin mit Ihnen.");
    expect(sichereAntwort("du", "Susanne Meier", true)).toBe("Das klärt Susanne Meier im Termin mit dir.");
    expect(sichereAntwort("sie", "Susanne Meier", false)).toBe("Das klärt Susanne Meier im Termin mit Ihnen. Soll ich Ihnen dafür ein paar freie Zeiten vorschlagen?");
    expect(sichereAntwort("du", "Susanne Meier", false)).not.toMatch(/[–—]|Sie|Ihnen/);
  });
});

describe("STOPP", () => {
  it("Stopp-Wörter und Knopf „Keine Nachrichten mehr“", () => {
    for (const t of ["STOPP", "Stop", "stopp bitte", "Abmelden", "Keine Nachrichten mehr", "keine weiteren Nachrichten", "Bitte nicht mehr schreiben"]) expect(isStopMessage(t), t).toBe(true);
    for (const t of ["Ja gern", "Ich möchte stoppen, dass ...", "Hallo", null]) expect(isStopMessage(t), String(t)).toBe(false);
  });
});
