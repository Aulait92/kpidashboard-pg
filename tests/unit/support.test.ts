import { describe, expect, it } from "vitest";
import { detectEscalation, mailtoUrl, redact, shortSummary, supportConfig, supportMessage, supportRef, whatsappUrl } from "@/lib/support";

// Hilfe-Chat: wann ein Mensch übernimmt und wie der Kontakt zu unserem Team aussieht.
describe("Weitergabe an das Team (Regeln)", () => {
  it.each([
    ["Warum wurde mir im November zweimal abgebucht?", "billing"],
    ["Wo finde ich meine Rechnung?", "billing"],
    ["Ich möchte kündigen", "contract"],
    ["Wie lange läuft mein Vertrag noch?", "contract"],
    ["Die Seite lädt nicht, nur eine weiße Seite", "bug"],
    ["Der Knopf funktioniert einfach nicht", "bug"],
    ["Meine Leads von gestern sind verschwunden", "missing_data"],
    ["Seit Montag keine Leads mehr bekommen", "missing_data"],
    ["Das ist echt ärgerlich", "frustrated"],
    ["Schon wieder kein Termin drin!!!", "frustrated"],
    ["Kann ich mit einem Menschen sprechen?", "user_request"],
    ["Bitte Rückruf", "user_request"],
  ])("„%s“ → %s", (q, reason) => {
    expect(detectEscalation(q)).toBe(reason);
  });

  it.each([
    "Wie reklamiere ich einen Lead?",
    "Wie trage ich einen Abschluss mit Vertrag über 30 € ein?",
    "Wie verschiebe ich einen Termin?",
    "Was heißt „Ohne nächsten Schritt“?",
  ])("normale Bedienfrage „%s“ → keine Weitergabe", (q) => {
    expect(detectEscalation(q)).toBeNull();
  });

  it("erkennt Großbuchstaben als Frust und gibt nach zwei schlechten Bewertungen weiter", () => {
    expect(detectEscalation("WARUM GEHT DAS NICHT ENDLICH")).toBe("bug");
    expect(detectEscalation("DAS IST NICHT GUT SO")).toBe("frustrated");
    expect(detectEscalation("Wie finde ich einen Lead?", { thumbsDown: 1 })).toBeNull();
    expect(detectEscalation("Wie finde ich einen Lead?", { thumbsDown: 2 })).toBe("unresolved");
  });
});

describe("Support-Kontakt", () => {
  it("liest Nummer und E-Mail aus den Variablen, sonst ausgeblendet", () => {
    expect(supportConfig({})).toEqual({ whatsapp: null, email: null, responseTime: "Wir antworten werktags in der Regel innerhalb weniger Stunden." });
    expect(supportConfig({ SUPPORT_WHATSAPP_NUMBER: "+49 151 2345 6789", SUPPORT_EMAIL: "support@example.test" })).toMatchObject({ whatsapp: "4915123456789", email: "support@example.test" });
    expect(supportConfig({ SUPPORT_WHATSAPP_NUMBER: "0151 23456789" }).whatsapp).toBe("4915123456789");
    expect(supportConfig({ SUPPORT_WHATSAPP_NUMBER: "0049 151 23456789" }).whatsapp).toBe("4915123456789");
    expect(supportConfig({ SUPPORT_WHATSAPP_NUMBER: "123", SUPPORT_EMAIL: "kein-mail" })).toMatchObject({ whatsapp: null, email: null });
    expect(supportConfig({ SUPPORT_RESPONSE_TIME: "Wir melden uns am selben Tag." }).responseTime).toBe("Wir melden uns am selben Tag.");
  });

  it("entfernt Kontaktdaten aus der Zusammenfassung", () => {
    const t = redact("Lead max@beispiel.de, Tel. +49 170 1234567, IBAN DE89 3704 0044 0532 0130 00 fehlt");
    expect(t).not.toMatch(/beispiel|1234567|3704/);
    expect(t).toContain("[E-Mail]");
    expect(t).toContain("[Nummer]");
    expect(shortSummary("a".repeat(400)).length).toBeLessThanOrEqual(280);
  });

  it("baut WhatsApp- und Mail-Link mit Name, Anliegen und Referenz", () => {
    expect(supportRef("cmabc123xyz9")).toBe("PG-23XYZ9");
    const text = supportMessage({ name: "Anna", company: "Agentur Muster", summary: "Doppelte Abbuchung", ref: "PG-ABC123" });
    expect(text).toContain("Anna (Agentur Muster)");
    expect(text).toContain("Referenz: PG-ABC123");
    const wa = whatsappUrl("4915123456789", text);
    expect(wa.startsWith("https://wa.me/4915123456789?text=")).toBe(true);
    expect(decodeURIComponent(wa.split("text=")[1])).toBe(text);
    const mail = mailtoUrl("support@example.test", { ref: "PG-ABC123", text });
    expect(mail).toContain("mailto:support@example.test?subject=Hilfe-Anfrage%20PG-ABC123");
  });
});
