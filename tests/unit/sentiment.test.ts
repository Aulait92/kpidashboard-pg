import { describe, expect, it } from "vitest";
import { classifyReply } from "@/lib/vertrieb/sentiment";

describe("Cold-Mail-Antworten einordnen", () => {
  it.each([
    "Vielen Dank, aber wir haben uns dagegen entschieden.",
    "Das passt aktuell leider nicht.",
    "Ich möchte keinen Termin, danke.",
    "Bitte kein weiteres Gespräch, wir sind versorgt.",
    "Hallo, ich sage hiermit ab.",
    "Wir möchten das derzeit nicht.",
    "Kein Interesse.",
    "Wir arbeiten bereits mit einer Agentur zusammen.",
    "Ich verzichte, danke.",
  ])("Absage: %s", (t) => expect(classifyReply(t)).toBe("NEGATIV"));

  it.each([
    "Klingt interessant, rufen Sie mich gerne an.",
    "Gerne einen Termin nächste Woche.",
    "Schicken Sie mir gerne Unterlagen.",
    "Was kostet das?",
  ])("Interesse: %s", (t) => expect(classifyReply(t)).toBe("POSITIV"));

  it("neutral bleibt neutral", () => expect(classifyReply("Danke für Ihre Nachricht.")).toBe("NEUTRAL"));
});
