import { describe, expect, it } from "vitest";
import {
  CODE_RE,
  benefitSentence,
  defaultShareText,
  isSelfReferral,
  newReferralCode,
  nudgeCandidates,
  pickNudge,
  NUDGE_TEXT,
  referralStage,
  rewardAmount,
  rewardSentence,
  type NudgeState,
} from "@/lib/kollegen-shared";

// „Kollegen empfehlen“: reine Regeln (Code, Selbstempfehlung, Prämie, Status, Hinweise).
const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-12-01T10:00:00Z");
const ago = (d: number) => new Date(now.getTime() - d * DAY);

describe("Empfehlungscode", () => {
  it("ist kurz, nur Kleinbuchstaben/Ziffern ohne verwechselbare Zeichen", () => {
    for (let i = 0; i < 50; i++) {
      const c = newReferralCode();
      expect(c).toMatch(CODE_RE);
      expect(c).not.toMatch(/[01ilo]/);
    }
  });
});

describe("Selbstempfehlung", () => {
  it("gleiche E-Mail oder gleiche eigene Firmen-Domain wird erkannt", () => {
    expect(isSelfReferral("Max@Agentur-Muster.de", ["max@agentur-muster.de"])).toBe(true);
    expect(isSelfReferral("kollegin@agentur-muster.de", ["max@agentur-muster.de"])).toBe(true);
  });
  it("Freemail und Versicherer-Domains zählen nicht als gleiche Agentur", () => {
    expect(isSelfReferral("kollege@gmail.com", ["max@gmail.com"])).toBe(false);
    expect(isSelfReferral("kollege@allianz.de", ["max@allianz.de"])).toBe(false);
    expect(isSelfReferral("kollege@signal-iduna.net", ["max@signal-iduna.net"])).toBe(false);
    expect(isSelfReferral("kollege@andere-agentur.de", ["max@agentur-muster.de"])).toBe(false);
  });
});

describe("Prämie", () => {
  const base = { enabled: true, rewardKind: "month", rewardFixed: null, benefitKind: "none", benefitText: null };
  it("1 Monat Betreuung = aktueller Monatspreis des Empfehlers", () => {
    expect(rewardAmount(base, 1400)).toBe(1400);
    expect(rewardAmount(base, null)).toBeNull();
    expect(rewardSentence(base, 1000)).toContain("einen Monat Betreuung");
  });
  it("fester Betrag", () => {
    const s = { ...base, rewardKind: "fixed", rewardFixed: 500 };
    expect(rewardAmount(s, 1400)).toBe(500);
    expect(rewardSentence(s, 1400)).toContain("500");
  });
  it("Neukunden-Vorteil nur wenn eingestellt", () => {
    expect(benefitSentence(base)).toBeNull();
    expect(benefitSentence({ ...base, benefitKind: "setup_free" })).toContain("Einrichtungsgebühr");
    expect(benefitSentence({ ...base, benefitKind: "custom", benefitText: " 200 € Rabatt " })).toBe("200 € Rabatt");
    expect(benefitSentence({ ...base, benefitKind: "custom", benefitText: "" })).toBeNull();
  });
});

describe("Stand einer Empfehlung", () => {
  const r = { status: "open", rewardStatus: "none", wonAt: null, hasMeeting: false, hasAcceptedOffer: false };
  it("eingegangen → Termin → Kunde → Prämie", () => {
    expect(referralStage(r)).toBe("eingegangen");
    expect(referralStage({ ...r, hasMeeting: true })).toBe("termin");
    expect(referralStage({ ...r, hasMeeting: true, hasAcceptedOffer: true })).toBe("kunde");
    expect(referralStage({ ...r, rewardStatus: "manual", wonAt: now })).toBe("kunde");
    expect(referralStage({ ...r, rewardStatus: "credited", wonAt: now })).toBe("praemie");
    expect(referralStage({ ...r, rewardStatus: "done_manual", wonAt: now })).toBe("praemie");
    expect(referralStage({ ...r, status: "blocked" })).toBe("abgelehnt");
  });
});

describe("Hinweise „Kollegen empfehlen“", () => {
  it("Anlässe: gutes Feedback, 5./10. Abschluss (kein Anlass „Garantie erreicht“)", () => {
    expect(nudgeCandidates({ closedDeals: 4, goodFeedback: [] })).toEqual([]);
    expect(nudgeCandidates({ closedDeals: 5, goodFeedback: [] })).toEqual(["abschluss5"]);
    expect(nudgeCandidates({ closedDeals: 12, goodFeedback: ["day30"] })).toEqual(["feedback-day30", "abschluss10"]);
    expect(Object.keys(NUDGE_TEXT)).not.toContain("garantie");
  });
  it("ein noch offener alter Hinweis „garantie“ wird nicht mehr gezeigt", () => {
    const states: NudgeState[] = [{ key: "garantie", firstShownAt: ago(2), closedAt: null }];
    expect(pickNudge(["abschluss5"], states, now).show).not.toBe("garantie");
  });
  it("jeder Anlass höchstens einmal", () => {
    const states: NudgeState[] = [{ key: "abschluss5", firstShownAt: ago(60), closedAt: ago(59) }];
    expect(pickNudge(["abschluss5"], states, now).show).toBeNull();
  });
  it("offener Hinweis bleibt, bis er weggeklickt wird oder nach 14 Tagen abläuft", () => {
    const open: NudgeState[] = [{ key: "abschluss5", firstShownAt: ago(3), closedAt: null }];
    expect(pickNudge(["abschluss5"], open, now)).toEqual({ show: "abschluss5", expire: [] });
    const old: NudgeState[] = [{ key: "abschluss5", firstShownAt: ago(20), closedAt: null }];
    const r = pickNudge(["abschluss5", "abschluss10"], old, now);
    expect(r.expire).toEqual(["abschluss5"]);
    // abgelaufen vor 6 Tagen → Abstand von 30 Tagen gilt auch hier
    expect(r.show).toBeNull();
  });
  it("mindestens 30 Tage zwischen zwei Hinweisen", () => {
    const states: NudgeState[] = [{ key: "abschluss5", firstShownAt: ago(25), closedAt: ago(20) }];
    expect(pickNudge(["abschluss10"], states, now).show).toBeNull();
    const later: NudgeState[] = [{ key: "abschluss5", firstShownAt: ago(40), closedAt: ago(31) }];
    expect(pickNudge(["abschluss10"], later, now).show).toBe("abschluss10");
  });
});

describe("Teilen-Text", () => {
  it("enthält Link und Namen, keine feste Du/Sie-Anrede", () => {
    const t = defaultShareText("Max Muster", "https://app.example/empfehlen/abc2345");
    expect(t).toContain("https://app.example/empfehlen/abc2345");
    expect(t).toContain("Max Muster");
    expect(t).toContain("deine/Ihre");
  });
});
