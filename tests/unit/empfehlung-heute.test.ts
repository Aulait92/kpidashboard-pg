// Paket 2 (19.11.2026): Liste „Heute fragen“ und „Zustimmung fehlt“ (pickReferralCandidates), Wert-Zeile.
import { describe, expect, it } from "vitest";
import {
  CANDIDATE_ASK_GAP_DAYS,
  DAY_MS,
  FEEDBACK_CONSENT_TEXT,
  FEEDBACK_CONSENT_TEXT_V1,
  MODULE_COST_90,
  NO_CONSENT_ERROR,
  UNHAPPY_TASK,
  candidateReason,
  costMultiple,
  funnelHint,
  pickReferralCandidates,
  relDays,
  type CandidateInput,
} from "@/lib/empfehlung/shared";

// Dienstag 11 Uhr in Berlin
const NOW = new Date("2026-11-17T10:00:00Z");
const ago = (d: number) => new Date(NOW.getTime() - d * DAY_MS);

function row(extra: Partial<CandidateInput> = {}): CandidateInput {
  return {
    id: "l1",
    name: "Julia Schneider",
    phone: "491555000001",
    source: "Kfz",
    status: "Abschluss",
    closedAt: ago(30),
    followUpNote: null,
    feedbackConsentAt: ago(29),
    feedbackConsentText: FEEDBACK_CONSENT_TEXT,
    feedbackOptOutAt: null,
    bestandBlocked: false,
    review: null,
    lastAppointmentAt: null,
    asks: [],
    lastLinkAt: null,
    ...extra,
  };
}
const ids = (rows: CandidateInput[]) => pickReferralCandidates(rows, NOW).ready.map((c) => c.id);

describe("Heute fragen: Gründe", () => {
  it("Lob vor Google-Klick vor Termin vor Abschluss", () => {
    expect(candidateReason(row({ review: { status: "answered", sentiment: "positive", googleClicks: 1, googleClickAt: ago(1), answeredAt: ago(2) } }), NOW)).toMatchObject({ reason: "lob", text: "Hat vor 2 Tagen gelobt" });
    expect(candidateReason(row({ review: { status: "sent", sentiment: null, googleClicks: 1, googleClickAt: ago(1), answeredAt: null } }), NOW)).toMatchObject({ reason: "google", text: "Wollte gestern bei Google bewerten" });
    expect(candidateReason(row({ closedAt: ago(200), lastAppointmentAt: ago(1) }), NOW)).toMatchObject({ reason: "termin", text: "Termin gestern" });
    expect(candidateReason(row({ closedAt: ago(24) }), NOW)).toMatchObject({ reason: "abschluss", text: "Abschluss vor 24 Tagen" });
  });

  it("kein Grund: Abschluss jünger als 21 oder älter als 365 Tage, Termin vor mehr als 14 Tagen", () => {
    expect(candidateReason(row({ closedAt: ago(10) }), NOW)).toBeNull();
    expect(candidateReason(row({ closedAt: ago(400) }), NOW)).toBeNull();
    expect(candidateReason(row({ closedAt: ago(10), lastAppointmentAt: ago(20) }), NOW)).toBeNull();
  });

  it("relDays zählt Kalendertage", () => {
    expect(relDays(new Date("2026-11-17T06:00:00Z"), NOW)).toBe("heute");
    expect(relDays(new Date("2026-11-16T23:30:00Z"), NOW)).toBe("heute"); // 0:30 Uhr am 17. in Berlin
    expect(relDays(new Date("2026-11-16T22:30:00Z"), NOW)).toBe("gestern"); // 23:30 Uhr am 16. in Berlin
    expect(relDays(new Date("2026-11-16T12:00:00Z"), NOW)).toBe("gestern");
  });
});

describe("Heute fragen: wer erscheint", () => {
  it("nur mit Einwilligung, Grund und Handynummer", () => {
    expect(ids([row()])).toEqual(["l1"]);
    expect(ids([row({ phone: null })])).toEqual([]);
    expect(ids([row({ closedAt: ago(5) })])).toEqual([]);
  });

  it("nie bei STOPP, Sperre, „Nicht anfragen“, Kritik (auch geklärt) oder offener Aufgabe „unzufrieden“", () => {
    expect(ids([row({ feedbackOptOutAt: ago(1) })])).toEqual([]);
    expect(ids([row({ bestandBlocked: true })])).toEqual([]);
    expect(ids([row({ review: { status: "off", sentiment: null, googleClicks: 0, googleClickAt: null, answeredAt: null } })])).toEqual([]);
    expect(ids([row({ review: { status: "answered", sentiment: "negative", googleClicks: 0, googleClickAt: null, answeredAt: ago(3) } })])).toEqual([]);
    expect(ids([row({ followUpNote: `${UNHAPPY_TASK}: „x“` })])).toEqual([]);
  });

  it("nicht, wenn kürzlich gefragt oder der QR-Code gezeigt wurde", () => {
    expect(ids([row({ asks: [ago(10)] })])).toEqual([]);
    expect(ids([row({ lastLinkAt: ago(CANDIDATE_ASK_GAP_DAYS - 1) })])).toEqual([]);
    expect(ids([row({ asks: [ago(CANDIDATE_ASK_GAP_DAYS + 5)] })])).toEqual(["l1"]);
  });

  it("nicht über der Obergrenze bzw. wenn die alte Einwilligung schon genutzt ist", () => {
    expect(ids([row({ closedAt: ago(300), feedbackConsentAt: ago(299), asks: [ago(100), ago(150), ago(200)] })])).toEqual([]);
    expect(ids([row({ closedAt: ago(300), feedbackConsentAt: ago(299), feedbackConsentText: FEEDBACK_CONSENT_TEXT_V1, asks: [ago(120)] })])).toEqual([]);
  });

  it("ohne Einwilligung nur in „Zustimmung fehlt“, nie in „Heute fragen“", () => {
    const r = pickReferralCandidates([row({ id: "a", feedbackConsentAt: null, feedbackConsentText: null }), row({ id: "b", feedbackConsentAt: null, closedAt: ago(3) })], NOW);
    expect(r.ready).toEqual([]);
    expect(r.noConsent.map((c) => c.id)).toEqual(["b", "a"]);
    expect(r.noConsent[0]).toMatchObject({ consent: false, reasonText: "Abschluss vor 3 Tagen" });
    // STOPP auch dort nicht
    expect(pickReferralCandidates([row({ feedbackConsentAt: null, feedbackOptOutAt: ago(1) })], NOW).noConsent).toEqual([]);
  });

  it("Reihenfolge: Lob, Google, Termin, Abschluss; Termin bekommt den Anlass „Jahresgespräch“", () => {
    const r = pickReferralCandidates(
      [
        row({ id: "abschluss", closedAt: ago(40) }),
        row({ id: "termin", closedAt: ago(200), lastAppointmentAt: ago(2) }),
        row({ id: "lob", review: { status: "answered", sentiment: "positive", googleClicks: 0, googleClickAt: null, answeredAt: ago(1) } }),
        row({ id: "google", review: { status: "sent", sentiment: null, googleClicks: 1, googleClickAt: ago(3), answeredAt: null } }),
      ],
      NOW,
    );
    expect(r.ready.map((c) => c.id)).toEqual(["lob", "google", "termin", "abschluss"]);
    expect(r.ready.find((c) => c.id === "termin")?.occasion).toBe("jahresgespraech");
    expect(r.ready.find((c) => c.id === "abschluss")?.occasion).toBeNull();
    expect(r.ready[0].thema).toBe("Kfz");
  });
});

describe("Wert-Zeile und Texte", () => {
  it("Vielfaches der Modulkosten nur, wenn größer 1", () => {
    expect(MODULE_COST_90).toBe(177);
    expect(costMultiple(640)).toBe("3,6-Fache");
    expect(costMultiple(100)).toBeNull();
    expect(costMultiple(177)).toBeNull();
  });

  it("Tipps und Hinweis ohne Gedankenstriche, Start-Tipp nennt „Heute um Empfehlung bitten“", () => {
    const start = funnelHint({ linksSent: 0, linksOpened: 0, visitors: 0, leads: 0, closings: 0 });
    expect(start.text).toMatch(/Heute um Empfehlung bitten/);
    const abschluss = funnelHint({ linksSent: 20, linksOpened: 12, visitors: 40, leads: 10, closings: 1 });
    expect(abschluss.text).toMatch(/hat mir erzählt/);
    for (const t of [start.text, abschluss.text, NO_CONSENT_ERROR]) expect(t).not.toMatch(/[–—]/);
  });
});
