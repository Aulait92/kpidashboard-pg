// Paket 1 (19.11.2026): Texte an Kunden, Empfehlende und Empfohlene in Du und Sie, ohne Gedankenstriche,
// ohne „Garantie“, mit STOPP in jeder Bitte; Gesundheitsthemen nie an Dritte; Einwilligungstexte.
import { describe, expect, it } from "vitest";
import { hatGedankenstrich } from "@/lib/gedankenstriche";
import {
  DEFAULT_TEXTS,
  DEFAULT_TEXTS_DU,
  FEEDBACK_CONSENT_LABEL,
  FEEDBACK_CONSENT_TEXT,
  NEUTRAL_THEMA,
  OCCASIONS,
  OFFER_PRESETS,
  STOPP_KEYS,
  TEXT_LABELS,
  THANKS_NO_LINK,
  defaultText,
  empfehlungsThema,
  feedbackConsentQuestion,
  followUpNote,
  occasionText,
  renderText,
  resolveOffer,
  shareText,
  signatureLine,
  statusConsentText,
  statusUpdateText,
  themaFuerDritte,
  validateText,
  type TextKey,
} from "@/lib/empfehlung/shared";

const keys = Object.keys(DEFAULT_TEXTS) as TextKey[];
const offer = resolveOffer({ offerKind: "ordner" }, "Max Muster");
const alle = [
  ...keys.flatMap((k) => [DEFAULT_TEXTS[k], DEFAULT_TEXTS_DU[k]]),
  ...Object.values(OCCASIONS).flatMap((o) => [o.text, o.du]),
  ...Object.values(OFFER_PRESETS).flatMap((o) => [o.text, o.du]),
  THANKS_NO_LINK.sie,
  THANKS_NO_LINK.du,
  shareText("Max Muster", "L", offer, "du"),
  shareText("Max Muster", "L", offer, "sie"),
  shareText("Max Muster", "L", null, "du"),
  shareText("Max Muster", "L", null, "sie"),
  signatureLine("L", offer, "du"),
  signatureLine("L", null, "sie"),
  statusConsentText("Julia", "Max Muster"),
  feedbackConsentQuestion("du"),
  feedbackConsentQuestion("sie"),
  FEEDBACK_CONSENT_TEXT,
  FEEDBACK_CONSENT_LABEL,
];

describe("Texte an Kunden, Empfehlende und Empfohlene", () => {
  it("ohne Gedankenstriche und ohne „Garantie“", () => {
    for (const t of alle) {
      expect(hatGedankenstrich(t), t).toBe(false);
      expect(t, t).not.toMatch(/garant/i);
    }
  });

  it("jede Standardvorlage ist in beiden Fassungen gültig (Link, STOPP, keine Prämie, kein Gating)", () => {
    for (const k of keys) {
      expect(validateText(k, DEFAULT_TEXTS[k]), k).toBeNull();
      expect(validateText(k, DEFAULT_TEXTS_DU[k]), k).toBeNull();
    }
    for (const k of STOPP_KEYS) {
      expect(DEFAULT_TEXTS[k]).toMatch(/Antworten Sie mit STOPP/);
      expect(DEFAULT_TEXTS_DU[k]).toMatch(/Antworte mit STOPP/);
    }
    expect(TEXT_LABELS.referralThanks.needsLink).toBe(true);
    for (const o of Object.values(OCCASIONS)) {
      expect(o.text).toMatch(/STOPP/);
      expect(o.du).toMatch(/STOPP/);
      expect(o.du.startsWith("{Anrede}, ")).toBe(true);
    }
  });

  it("Du-Fassungen duzen, Sie-Fassungen siezen", () => {
    for (const k of keys) {
      expect(DEFAULT_TEXTS_DU[k], k).not.toMatch(/\b(Sie|Ihnen|Ihr|Ihre|Ihrem|Ihren)\b/);
      expect(DEFAULT_TEXTS[k], k).not.toMatch(/\b(du|dir|dein|deine|deinem|deinen)\b/);
    }
    expect(defaultText("referral", "du")).toBe(DEFAULT_TEXTS_DU.referral);
    expect(defaultText("referral")).toBe(DEFAULT_TEXTS.referral);
    expect(occasionText("schaden", "du")).toBe(OCCASIONS.schaden.du);
  });

  it("renderText folgt der Ansprache: „Hallo Julia“ bzw. „Guten Tag Frau Schneider“, Thema eingesetzt", () => {
    const k = { fullName: "Julia Schneider", salutation: "Frau" };
    const du = renderText(defaultText("referral", "du"), { vertreter: "Max Muster", link: "L", anrede: k, an: "du", thema: "Privatschutz" });
    expect(du.startsWith("Hallo Julia, hier ist Max Muster. Schön, dass das Thema Privatschutz bei dir")).toBe(true);
    const sie = renderText(defaultText("referral"), { vertreter: "Max Muster", link: "L", anrede: k, thema: "Privatschutz" });
    expect(sie.startsWith("Guten Tag Frau Schneider, hier ist Max Muster. Schön, dass das Thema Privatschutz bei Ihnen")).toBe(true);
    // Ohne Thema: neutral
    expect(renderText("{Thema}", { vertreter: "X" })).toBe(empfehlungsThema(null));
    // Rückmeldung an Empfehlende ebenfalls in beiden Fassungen
    expect(statusUpdateText("gemeldet", { vertreter: "Max", referred: "Tom", anrede: { firstName: "Julia" }, an: "du" })).toBe(
      "Hallo Julia, kurze Rückmeldung zu deiner Empfehlung: Tom hat sich über deinen Link bei mir gemeldet. Vielen Dank, dass du an mich gedacht hast! Viele Grüße, Max",
    );
  });

  it("Dank an Empfehlende ohne „Ich konnte weiterhelfen“ und ohne Details der empfohlenen Person", () => {
    for (const t of [DEFAULT_TEXTS.referralThanks, DEFAULT_TEXTS_DU.referralThanks, THANKS_NO_LINK.sie, THANKS_NO_LINK.du]) {
      expect(t).not.toMatch(/weiterhelfen|Kunde geworden|Abschluss|Vertrag/i);
    }
    expect(THANKS_NO_LINK.sie).not.toContain("{Link}");
  });

  it("Gesundheitsthemen gehen nie an Dritte, Teilen-Text nennt kein Thema", () => {
    for (const s of ["Krankenversicherung", "PKV Wechsel", "Zahnzusatz", "BU", "Berufsunfähigkeit", "Pflegezusatz", "Risikoleben", "Sterbegeld"]) {
      expect(themaFuerDritte(empfehlungsThema(s)), s).toBe(NEUTRAL_THEMA);
    }
    expect(themaFuerDritte("Kfz")).toBe("Kfz");
    expect(themaFuerDritte("Tierversicherung")).toBe("Tierversicherung");
    for (const an of ["du", "sie"] as const) {
      expect(shareText("Max Muster", "L", offer, an)).not.toMatch(/kranken|zahn|pflege|berufsunf|leben/i);
    }
    expect(shareText("Max Muster", "L", null, "sie")).toMatch(/^Ich kann Ihnen Max Muster sehr empfehlen/);
    expect(shareText("Max Muster", "L", null)).toMatch(/^Hey, ich bin bei Max Muster/);
  });

  it("Einwilligung: lange Fassung mit „höchstens 3-mal im Jahr“ und STOPP, kurzes Häkchen, Satz zum Vorlesen in beiden Ansprachen", () => {
    expect(FEEDBACK_CONSENT_TEXT).toMatch(/höchstens 3-mal im Jahr/);
    expect(FEEDBACK_CONSENT_TEXT).toMatch(/STOPP/);
    expect(FEEDBACK_CONSENT_LABEL).toBe("Kunde hat zugestimmt: Nachfrage, ehrliche Google-Bewertung, gelegentlich Empfehlungsbitte (STOPP jederzeit)");
    expect(feedbackConsentQuestion("du")).toMatch(/kannst du jederzeit widersprechen/);
    expect(feedbackConsentQuestion("sie")).toMatch(/können Sie jederzeit widersprechen/);
  });

  it("Rückmeldung an Empfehlende: Einwilligung der empfohlenen Person umfasst „und Kunde wurde“, freiwillig, nur Vorname", () => {
    const t = statusConsentText("Julia", "Max Muster");
    expect(t).toMatch(/Kunde wurde/);
    expect(t).toMatch(/Freiwillig/);
    expect(t).toMatch(/nur mein Vorname, keine Details/);
  });

  it("Nachfassen: Aufgabe in Sie, Satz für den Anruf in der Ansprache des Kunden", () => {
    expect(followUpNote("Julia")).toMatch(/Julia anrufen\. Satz: „Haben Sie schon/);
    expect(followUpNote("Julia", "du")).toMatch(/„Hast du schon/);
  });
});
