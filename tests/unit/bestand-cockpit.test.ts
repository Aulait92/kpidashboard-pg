import { describe, expect, it } from "vitest";
import { consentChip, heroPlan, lockedHeadline, reachSummary, RECHT_HREF, type HeroInput } from "@/lib/bestand/cockpit";
import { campaignText } from "@/lib/bestand/campaigns";
import { defaultCampaignMail } from "@/lib/bestand/kampagnen-mail";

// Nachbesserung 20.11.2026 (Persona-Abnahme, docs/ux/2026-11-19-bestand-champions.md)

const base: HeroInput = {
  count: 12,
  whatsapp: 12,
  email: 0,
  waState: "freigegeben",
  mailFix: null,
  href: "/buyer/bestand/kampagne?anlass=review",
  label: "12 Kunden anschreiben",
};
const POSTFACH = { label: "Postfach verbinden", href: "/buyer/postfach" };

describe("Heute zuerst: Hauptknopf verspricht nur, was jetzt geht", () => {
  it("Vorlage freigegeben: normaler Knopf, Kanalzeile, kein Statussatz", () => {
    const h = heroPlan(base);
    expect(h.primary).toEqual({ label: "12 Kunden anschreiben", href: base.href });
    expect(h.status).toBeNull();
    expect(h.showChannels).toBe(true);
  });

  it("Vorlage nicht freigegeben, E-Mail möglich: auf E-Mail umgestellt, ein Satz dazu", () => {
    const h = heroPlan({ ...base, whatsapp: 0, email: 9, count: 9, label: "9 Kunden anschreiben", channelMode: "email", waState: "eingereicht" });
    expect(h.primary.label).toBe("9 Kunden anschreiben");
    expect(h.status).toMatch(/Per E-Mail, weil Meta die WhatsApp-Vorlage noch nicht freigegeben hat/);
  });

  it("Vorlage wartet, E-Mail fehlt ein Schritt und hilft: genau dieser Schritt als Hauptknopf, vormerken als Nebenlink", () => {
    const h = heroPlan({ ...base, waWaiting: true, emailIfFixed: 7, waState: "eingereicht", mailFix: POSTFACH });
    expect(h.primary).toEqual(POSTFACH);
    expect(h.status).toContain("7 Kunden sofort");
    expect(h.secondary?.href).toBe(base.href);
    expect(h.showChannels).toBe(false);
  });

  it("Vorlage wartet und E-Mail hilft nicht: ehrlich vormerken statt toter Knopf", () => {
    const h = heroPlan({ ...base, waWaiting: true, emailIfFixed: 0, waState: "eingereicht", mailFix: POSTFACH });
    expect(h.primary).toEqual({ label: "12 Kunden vormerken", href: base.href });
    expect(h.status).toMatch(/sobald Meta die Vorlage freigegeben hat/);
    const r = heroPlan({ ...base, waWaiting: true, waState: "abgelehnt", mailFix: null });
    expect(r.status).toMatch(/abgelehnt, wir kümmern uns darum/);
  });

  it("Nur E-Mail-Empfänger ohne Postfach: Schritt statt Knopf, der erst auf der nächsten Seite scheitert", () => {
    const h = heroPlan({ ...base, whatsapp: 0, email: 5, count: 5, mailFix: POSTFACH });
    expect(h.primary).toEqual(POSTFACH);
    expect(h.status).toMatch(/^5 Kunden schreiben Sie per E-Mail an/);
  });

  it("Statussätze ohne Gedankenstriche", () => {
    const all = [
      heroPlan({ ...base, channelMode: "email" }),
      heroPlan({ ...base, waWaiting: true, emailIfFixed: 3, mailFix: POSTFACH }),
      heroPlan({ ...base, waWaiting: true }),
      heroPlan({ ...base, waWaiting: true, waState: "abgelehnt" }),
    ];
    for (const h of all) expect(h.status ?? "").not.toMatch(/[–—]/);
  });
});

describe("Einwilligung: eine Zählweise, Differenz in einem Satz", () => {
  const offer = { total: 115, reachable: 55, share: 55 / 115, withoutConsent: 60, askable: 17 };

  it("Basis, Differenz zur Kundenliste und Rest nach der E-Mail-Anfrage", () => {
    const r = reachSummary(offer, 0.4, 120);
    expect(r.basis).toBe("55 von 115 Kunden mit Kontaktweg");
    expect(r.basisHinweis).toBe("5 Kunden ohne Kontaktweg, abgemeldet oder gesperrt zählen nicht mit.");
    expect(r.ohne).toBe("60 Kunden ohne Einwilligung: 17 per E-Mail fragen, die übrigen 43 per Link oder im Gespräch.");
    // Zahlen gehen auf: fragbar + übrige = ohne Einwilligung, erreichbar + ohne = Basis
    expect(17 + 43).toBe(offer.withoutConsent);
    expect(offer.reachable + offer.withoutConsent).toBe(offer.total);
  });

  it("Ziel erreicht: keine Aufforderung mehr", () => {
    const r = reachSummary(offer, 0.4, 115);
    expect(r.goalReached).toBe(true);
    expect(r.cta).toBe(false);
    expect(r.basisHinweis).toBeNull();
  });

  it("unter dem Ziel mit Kunden ohne Einwilligung: Aufforderung", () => {
    const r = reachSummary({ ...offer, reachable: 30, share: 30 / 115, withoutConsent: 85 }, 0.4, 120);
    expect(r.goalReached).toBe(false);
    expect(r.cta).toBe(true);
  });

  it("niemand per E-Mail fragbar bzw. alle fragbar", () => {
    expect(reachSummary({ ...offer, askable: 0 }, 0.6, 115).ohne).toBe("60 Kunden ohne Einwilligung: per Link oder im Gespräch fragen.");
    expect(reachSummary({ ...offer, askable: 60 }, 0.6, 115).ohne).toBe("60 Kunden ohne Einwilligung, alle per E-Mail fragbar.");
  });
});

describe("Hinweis-Chip als Handlung", () => {
  it("Pauschal-Einwilligungen: „6 Nachweise ergänzen“, direkt zum Aufklapper", () => {
    const c = consentChip({ total: 120, legacy: 6, legacyReviewed: false, uwgConfirmed: true, noProof: 0 });
    expect(c?.chip).toBe("6 Nachweise ergänzen");
    expect(c?.href).toBe(RECHT_HREF);
    expect(RECHT_HREF).toContain("offen=recht");
  });

  it("Reihenfolge und Einzahl, kein Chip ohne Anlass", () => {
    expect(consentChip({ total: 120, legacy: 0, legacyReviewed: false, uwgConfirmed: false, noProof: 3 })?.chip).toBe("Bestätigung für E-Mails ergänzen");
    expect(consentChip({ total: 120, legacy: 0, legacyReviewed: false, uwgConfirmed: true, noProof: 1 })?.chip).toBe("1 Nachweis ergänzen");
    expect(consentChip({ total: 120, legacy: 6, legacyReviewed: true, uwgConfirmed: true, noProof: 0 })).toBeNull();
    expect(consentChip({ total: 0, legacy: 6, legacyReviewed: false, uwgConfirmed: false, noProof: 4 })).toBeNull();
  });
});

describe("Gesperrter Zustand mit eigenen Zahlen", () => {
  it("Kunden mit nur einem Vertrag zuerst, sonst Abschlüsse, sonst allgemeiner Titel", () => {
    expect(lockedHeadline({ einVertrag: 74, abschluesse: 90 }).title).toBe("Sie haben 74 Kunden mit nur einem Vertrag.");
    expect(lockedHeadline({ einVertrag: 0, abschluesse: 12 }).title).toBe("Sie haben 12 Kunden mit Abschluss.");
    expect(lockedHeadline({ einVertrag: 0, abschluesse: 0 }).title).toBe("Geschäft im eigenen Bestand finden");
  });

  it("kein Preis, keine Ergebnisversprechen im Text", () => {
    const t = lockedHeadline({ einVertrag: 74, abschluesse: 90 });
    expect(`${t.title} ${t.text}`).not.toMatch(/€|Garantie|garantiert|mehr Umsatz|sicher/i);
  });
});

describe("Geburtstag: nur gratulieren", () => {
  it("ohne Frage nach Umzug, Familie oder Job, in beiden Ansprachen", () => {
    for (const an of ["sie", "du"] as const) {
      const t = campaignText("birthday", { firstName: "Erika", lastName: "Muster", salutation: "Frau" }, null, an, {});
      const m = defaultCampaignMail("birthday", an).body;
      for (const s of [t, m]) {
        expect(s).toMatch(/herzlichen Glückwunsch zum Geburtstag/i);
        expect(s).not.toMatch(/Umzug|Familie|Job|verändert|schauen wir|\?/);
        expect(s).not.toMatch(/[–—]/);
      }
      expect(t).toContain(an === "du" ? "dir" : "Ihnen");
    }
  });
});
