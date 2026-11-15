// Pflichtangaben je Produkt vor der Terminbuchung (Ole, 15.11.2026)
import { describe, expect, it } from "vitest";
import { produktCheckliste } from "@/lib/whatsapp/produkt-fragen";
import { buildSystemPrompt } from "@/lib/whatsapp/bot";
import { cleanQualificationData } from "@/lib/whatsapp/qualification";

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

describe("Privatschutz: Angaben fürs Angebot", () => {
  it("greift bei Privatschutz und Sach-Sparten, nicht bei Tier-Produkten oder PKV", () => {
    expect(produktCheckliste("Privatschutz")?.key).toBe("privatschutz");
    expect(produktCheckliste("Hausrat")?.key).toBe("privatschutz");
    expect(produktCheckliste("Wohngebäude")?.key).toBe("privatschutz");
    expect(produktCheckliste("TKV-Katze")).toBeNull();
    expect(produktCheckliste("Hundehalterhaftpflicht")).toBeNull();
    expect(produktCheckliste("PKV-Tarifoptimierung")).toBeNull();
    expect(produktCheckliste(null)).toBeNull();
  });

  it("deckt alle Sparten aus dem Leadformular ab und nennt Unterlagen", () => {
    const c = produktCheckliste("Privatschutz")!;
    for (const s of ["Haftpflicht", "Hausrat", "Rechtsschutz", "Wohngebäude", "Tierhalterhaftpflicht", "Unfall"]) expect(c.fragen).toContain(s);
    for (const s of ["Postleitzahl", "Geburtsdatum", "letzten 5 Jahren", "Fahrraddiebstahl", "Wohneinheiten", "24 Monaten", "Tarif", "Wohnfläche", "Baujahr", "Tierart"]) expect(c.fragen).toContain(s);
    expect(c.unterlagen.join(" ")).toContain("IBAN");
    expect(c.fragen + c.unterlagen.join("")).not.toMatch(/[–—]/);
  });

  it("steht im Prompt, ersetzt die 2-3-Antworten-Regel, nach Buchung weiter abfragen", () => {
    const p = buildSystemPrompt(agent, "Privatschutz", base);
    expect(p).toContain("Pflichtangaben für das Angebot");
    expect(p).toContain("Nach der Buchung");
    expect(p).not.toContain("meist nach 2-3 Antworten");
    const booked = buildSystemPrompt(agent, "Privatschutz", { ...base, upcoming: { startsAt: new Date("2026-11-20T10:00:00Z"), mode: "phone", meetUrl: null } });
    // nach der Buchung: fehlende Angaben weiter abfragen, keine zweite Buchung, Unterlagen-Regel nicht erneut
    expect(booked).toContain("Pflichtangaben für das Angebot");
    expect(booked).toContain("frag sie jetzt weiter ab");
    expect(booked).not.toContain("Nach der Buchung: Nenne");
    expect(p).toContain("buche ihn sofort und frag die fehlenden Angaben danach weiter ab");
    expect(p).toContain("Damit Susanne Meier das Angebot vorbereiten kann");
    const tkv = buildSystemPrompt(agent, "TKV-Katze", base);
    expect(tkv).toContain("meist nach 2-3 Antworten");
  });

  it("neue Angaben werden gespeichert", () => {
    expect(cleanQualificationData({ plz: "80797", wohnflaeche: "75 m²", gebaeude: "EFH 1995", tier: "Hund", unbekannt: "x" })).toEqual({
      plz: "80797",
      wohnflaeche: "75 m²",
      gebaeude: "EFH 1995",
      tier: "Hund",
    });
  });
});

describe("Wiedervorlage vom Assistenten", () => {
  it("Prompt kennt schedule_followup und eine geplante Wiedervorlage", async () => {
    const p = buildSystemPrompt(agent, "Privatschutz", base);
    expect(p).toContain("schedule_followup");
    const r = buildSystemPrompt(agent, "Privatschutz", { ...base, recallAt: new Date("2026-11-18T09:00:00Z") });
    expect(r).toContain("Geplante Wiedervorlage");
  });

  it("Zeit ohne Zeitzone gilt als deutsche Zeit", async () => {
    const { parseBerlinTime } = await import("@/lib/whatsapp/bot");
    expect(parseBerlinTime("2026-11-16T10:00:00")?.toISOString()).toBe("2026-11-16T09:00:00.000Z");
    expect(parseBerlinTime("2026-07-16T10:00")?.toISOString()).toBe("2026-07-16T08:00:00.000Z");
    expect(parseBerlinTime("2026-11-16T10:00:00+01:00")?.toISOString()).toBe("2026-11-16T09:00:00.000Z");
    expect(parseBerlinTime("2026-11-16")?.toISOString()).toBe("2026-11-16T09:00:00.000Z");
    expect(parseBerlinTime("morgen")).toBeNull();
  });
});

describe("Termin schon gebucht (Buchungsseite/Leadformular)", () => {
  it("bestätigt den Termin und fragt die Angaben weiter ab", () => {
    const p = buildSystemPrompt(agent, "Privatschutz", { ...base, upcoming: { startsAt: new Date("2026-11-20T10:00:00Z"), mode: "phone", meetUrl: null } });
    expect(p).toContain("selbst über die Buchungsseite bzw. das Leadformular gebucht");
    expect(p).toContain("bestätige ihn in deiner nächsten Nachricht kurz mit Datum und Uhrzeit");
    expect(p).toContain("Pflichtangaben für das Angebot");
  });
});
