// Später-Erkennung (Ole, 18.11.2026: Norbert Tetenborg wollte später Leads, landete aber nicht im Später-Follow-up):
// breitere Regeln als Absicherung ohne KI, klare Absagen nie, KI nur mit Hinweis auf später (gemockt, keine echten Aufrufe).
import { describe, expect, it, vi } from "vitest";
import { classifyReply } from "@/lib/vertrieb/sentiment";
import { hasLaterHint, isClearDecline, isLaterInterest } from "@/lib/vertrieb/spaeter";
import { kiEinstufen, spaeterPerKi } from "@/lib/vertrieb/spaeter-ki";
import { dayKey } from "@/lib/vertrieb/dates";
import type { LlmCall } from "@/lib/kampagnen/llm";

const NOV = new Date("2026-11-12T10:00:00Z");

const fakeLlm = (antwort: Record<string, unknown>) =>
  vi.fn<LlmCall>(async () => ({ text: JSON.stringify(antwort), usage: { tokensIn: 1, tokensOut: 1, costCents: 0 } }));

describe("Regeln: mehr Später-Antworten erkennen", () => {
  it.each([
    "Momentan nicht, später vielleicht.",
    "Ich hätte später Interesse an Leads.",
    "Aktuell haben wir genug zu tun, aber später gerne.",
    "Aktuell nicht, aber gerne wieder melden.",
    "Derzeit kein Bedarf, aber im neuen Jahr sehr gerne.",
    "Nächstes Jahr gerne.",
    "Im Frühjahr vielleicht.",
    "Melden Sie sich im Januar.",
  ])("Später: %s", (t) => {
    expect(isLaterInterest(t, NOV)).toBe(true);
    expect(classifyReply(t, null, NOV)).toBe("SPAETER");
  });

  it.each([
    "Kein Interesse.",
    "Kein Interesse, bitte nicht mehr schreiben.",
    "Aktuell nicht, aber danke.",
    "Rufen Sie mich später an.",
    "Ja gerne, ich bin später am Tag erreichbar.",
    "Können wir am 15. Januar telefonieren?",
    "Bitte nehmen Sie mich aus dem Verteiler, auch später nicht.",
    "Danke, wir sind versorgt.",
  ])("kein Später: %s", (t) => expect(isLaterInterest(t, NOV)).toBe(false));

  it("klare Absage nur ohne Hinweis auf später", () => {
    expect(isClearDecline("Kein Interesse.")).toBe(true);
    expect(isClearDecline("Bitte nicht mehr schreiben.")).toBe(true);
    expect(isClearDecline("Ich gehe in Rente.")).toBe(true);
    expect(isClearDecline("Aktuell kein Interesse, aber im Frühjahr gerne.")).toBe(false);
    expect(isClearDecline("Gerne später nochmal.")).toBe(false);
  });

  it("Vorfilter für die KI", () => {
    expect(hasLaterHint("Wir sind gut aufgestellt. Im Frühjahr sieht das anders aus.")).toBe(true);
    expect(hasLaterHint("Ja, rufen Sie an.")).toBe(false);
  });
});

describe("KI-Einstufung (gemockt)", () => {
  const TEXT = "Wir sind gut aufgestellt. Im Frühjahr sieht das bestimmt anders aus.";

  it("Regel greift hier nicht, die KI erkennt „später“ mit Datum", async () => {
    expect(isLaterInterest(TEXT, NOV)).toBe(false);
    const llm = fakeLlm({ kategorie: "spaeter", datum: "2027-03-01", zeitpunkt: "im Frühjahr", grund: "Im Frühjahr wieder interessant." });
    const hit = await spaeterPerKi(TEXT, NOV, { llm, seed: "x" });
    expect(llm).toHaveBeenCalledTimes(1);
    expect(hit && dayKey(hit.dueAt)).toBe("2027-03-01");
    expect(hit?.timing).toBe("im Frühjahr");
    const req = llm.mock.calls[0][0];
    expect(req.user).toContain("2026-11-12");
    expect(req.system).not.toMatch(/[–—]/);
  });

  it("ohne Datum: Zeitpunkt aus den Regeln bzw. 3 Monate", async () => {
    const llm = fakeLlm({ kategorie: "spaeter", datum: null, zeitpunkt: null, grund: "später" });
    const hit = await spaeterPerKi("Wir melden uns, wenn es wieder passt. Aktuell zu viel los.", NOV, { llm });
    expect(hit && dayKey(hit.dueAt)).toBe("2027-02-12");
  });

  it("unplausibles Datum (vor der Antwort) wird verworfen", async () => {
    const llm = fakeLlm({ kategorie: "spaeter", datum: "2026-11-13", zeitpunkt: null, grund: "x" });
    expect((await kiEinstufen(TEXT, NOV, llm)).datum).toBeNull();
  });

  it("Absage oder Interesse laut KI: kein Später", async () => {
    expect(await spaeterPerKi(TEXT, NOV, { llm: fakeLlm({ kategorie: "absage", datum: null, zeitpunkt: null, grund: "nein" }) })).toBeNull();
    expect(await spaeterPerKi(TEXT, NOV, { llm: fakeLlm({ kategorie: "interesse", datum: null, zeitpunkt: null, grund: "ja" }) })).toBeNull();
  });

  it("klare Absage und Text ohne Hinweis: KI wird gar nicht gefragt", async () => {
    const llm = fakeLlm({ kategorie: "spaeter", datum: "2027-03-01", zeitpunkt: null, grund: "x" });
    expect(await spaeterPerKi("Kein Interesse, bitte nicht mehr schreiben.", NOV, { llm })).toBeNull();
    expect(await spaeterPerKi("Ja, rufen Sie an.", NOV, { llm })).toBeNull();
    expect(llm).not.toHaveBeenCalled();
  });

  it("ohne Schlüssel keine KI", async () => {
    expect(await spaeterPerKi(TEXT, NOV, { llm: null })).toBeNull();
  });
});
