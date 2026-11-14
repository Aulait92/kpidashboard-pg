// Bot-Fehler (Ole, 14.11.2026): „Videocall mit Agentur“ statt Beratername, Termin in der Vergangenheit angeboten.
import { describe, expect, it } from "vitest";
import { advisorDisplayName } from "@/lib/advisor-name";
import { buildSystemPrompt } from "@/lib/whatsapp/bot";

describe("advisorDisplayName", () => {
  it("entfernt Agentur- und Versicherer-Vorsätze", () => {
    expect(advisorDisplayName("Agentur Susanne Meier")).toBe("Susanne Meier");
    expect(advisorDisplayName("Allianz Agentur Bernd Kraus")).toBe("Bernd Kraus");
    expect(advisorDisplayName("Allianz Generalvertretung Meier e.K.")).toBe("Meier");
    expect(advisorDisplayName("Versicherungsbüro Schulz")).toBe("Schulz");
    expect(advisorDisplayName("Allianz Hans Müller")).toBe("Hans Müller");
    expect(advisorDisplayName("Jana Becker")).toBe("Jana Becker");
    expect(advisorDisplayName("Agentur")).toBeNull();
    expect(advisorDisplayName(null)).toBeNull();
  });
});

describe("Bot-Prompt", () => {
  const agent = { systemPrompt: "", knowledge: "", personality: "" };
  const base = {
    qualified: false,
    summary: null,
    contact: { name: "Dominik Schmid", phone: "491510000053", email: null },
    upcoming: null,
    formAnswers: [],
    advisorName: "Susanne Meier",
    aiDisclosed: true,
  };

  it("kennt das aktuelle Datum und warnt vor veralteten Zeiten", () => {
    const p = buildSystemPrompt(agent, "Privatschutz", { ...base, now: new Date("2026-11-13T15:32:00Z") });
    expect(p).toContain("Jetzt ist Freitag, 13.11.2026, 16:32 Uhr");
    expect(p).toContain("Nenne nie einen Termin, der schon vorbei ist");
  });

  it("nennt den Berater mit vollem Namen", () => {
    const p = buildSystemPrompt(agent, "Privatschutz", base);
    expect(p).toContain("im Namen von Susanne Meier");
    expect(p).toContain("„Susanne Meier“");
  });
});
