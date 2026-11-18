import { describe, expect, it, vi } from "vitest";
import { GRUENDE_ERGAENZEN, gruendeEinsetzen, gruendeOffen, gruendePlatzhalter, hatBedarf, vorschlagGrund, type AuswahlZeile } from "@/lib/mail/beratung";
import { gruendeVorschlagen, vorschlagEingabe, vorschlagInfo, vorschlagLesen, vorschlagPruefen, vorschlagStrikt } from "@/lib/mail/gruende-ki";
import { bdFrageOffen } from "@/lib/beratungsdoku-server";
import type { BedrockEu } from "@/lib/ki-eu-konfig";

// „Vorschlag erstellen“ für Rat und Gründe und die Frage „Beratungsdokumentation vorbereiten?“ (Ole, 18.11.2026).
// Keine echten KI-Aufrufe: der Client ist gemockt.

const EU: BedrockEu = { art: "bedrock", region: "eu-central-1", accessKey: "a", secretKey: "b", model: "m" };
const haftpflicht: AuswahlZeile = { sparte: "Privathaftpflicht", gesellschaft: "Allianz", tarif: "Komfort", beitrag: 6.12, leistungen: ["Schlüsselverlust", "Mietsachschäden"] };
const bu: AuswahlZeile = { sparte: "Berufsunfähigkeit", gesellschaft: "Allianz", tarif: "Plus", beitrag: 78.4, leistungen: ["Verzicht auf abstrakte Verweisung"] };
const wuensche = "• Interesse an: Privathaftpflicht\n• Lebenssituation: Familie\n• Vorerkrankungen: Asthma\n\nAus dem Gespräch:\n• Fahrrad soll mit rein";

const antwort = (text: string) => vi.fn(async () => ({ content: [{ type: "text", text }] }));

describe("Gründe vorschlagen: wann möglich", () => {
  it("ohne EU-KI kein Knopf, sonst Tarif, Leistungen und strikt aus der Auswahl", () => {
    expect(vorschlagInfo({ konfig: null, themen: ["Privathaftpflicht"], auswahl: [haftpflicht] })).toBeNull();
    expect(vorschlagInfo({ konfig: EU, themen: ["Privathaftpflicht"], auswahl: [haftpflicht] })).toEqual({ tarif: true, leistungen: true, strikt: false });
    expect(vorschlagInfo({ konfig: EU, themen: ["Privathaftpflicht"], auswahl: [] })).toEqual({ tarif: false, leistungen: false, strikt: false });
  });

  it("strikt bei Gesundheitssparten, Unfall und unklarem Thema, nicht bei Sach und Tier", () => {
    expect(vorschlagStrikt(["Privathaftpflicht", "Haftpflicht und Hausrat"], [haftpflicht])).toBe(false);
    expect(vorschlagStrikt(["Katze OP"], [{ sparte: "Katzen-OP", tarif: "Basis" }])).toBe(false);
    expect(vorschlagStrikt(["Privatschutz"], [haftpflicht, bu])).toBe(true);
    expect(vorschlagStrikt(["Unfallversicherung"], [{ sparte: "Unfall", tarif: "Top" }])).toBe(true);
    expect(vorschlagStrikt(["PKV"], [])).toBe(true);
    expect(vorschlagStrikt(["Beratung"], [{ sparte: "Sonstiges", tarif: null }])).toBe(true);
    expect(vorschlagStrikt(["Hausrat"], [{ sparte: "Hausrat", tarif: "Pflegefall Plus" }])).toBe(true);
  });

  it("Grund in einem Satz: erst Tarif wählen, dann Bedarf; strikt reicht der Tarif", () => {
    expect(vorschlagGrund({ tarif: false, leistungen: false, strikt: false }, wuensche)).toMatch(/Tarif wählen/);
    expect(vorschlagGrund({ tarif: true, leistungen: false, strikt: false }, "• Interesse an: Hausrat")).toMatch(/Bedarf/);
    expect(vorschlagGrund({ tarif: true, leistungen: true, strikt: false }, "")).toBeNull();
    expect(vorschlagGrund({ tarif: true, leistungen: false, strikt: false }, wuensche)).toBeNull();
    expect(vorschlagGrund({ tarif: true, leistungen: false, strikt: true }, "")).toBeNull();
    expect(hatBedarf(`Ihre Absicherung heute:\n• Hausrat: noch kein Vertrag`)).toBe(true);
    expect(hatBedarf(`• Interesse an: Hausrat\nNoch zu klären:\nBesprochen: ${GRUENDE_ERGAENZEN}`)).toBe(false);
  });
});

describe("Gründe vorschlagen: was an die KI geht", () => {
  it("normal: Tarif, Leistungen und Wünsche, ohne Gesundheitsangaben", () => {
    const e = vorschlagEingabe({ auswahl: [haftpflicht], wuensche, strikt: false });
    expect(e).toContain("• Privathaftpflicht: Allianz Komfort, 6,12 € im Monat");
    expect(e).toContain("Leistungen: Schlüsselverlust, Mietsachschäden");
    expect(e).toContain("Fahrrad soll mit rein");
    expect(e).not.toMatch(/Asthma|Vorerkrankung/i);
  });

  it("strikt: nur Sparte, Versicherer, Tarif und Beitrag (keine Wünsche, keine Leistungen)", () => {
    const e = vorschlagEingabe({ auswahl: [bu], wuensche, strikt: true });
    expect(e).toContain("• Berufsunfähigkeit: Allianz Plus, 78,40 € im Monat");
    expect(e).not.toMatch(/Familie|Fahrrad|Asthma|Verweisung|Leistungen/);
  });

  it("Aufruf: strikt bekommt die KI keinen Wunschtext, Ausgabe ohne Gedankenstriche und Gesundheitsangaben", async () => {
    const create = antwort("GRÜNDE:\n• Der Tarif Plus deckt den gewünschten Schutz ab – der Beitrag von 78,40 € ist besprochen.\n• Ihre Diagnose Asthma ist berücksichtigt.");
    const r = await gruendeVorschlagen({ an: "sie", themen: ["Berufsunfähigkeit"], auswahl: [bu], wuensche }, { konfig: EU, client: { messages: { create } } });
    expect(create).toHaveBeenCalledTimes(1);
    const body = (create.mock.calls[0] as unknown[])[0] as { messages: { content: string }[]; system: string };
    expect(body.messages[0].content).not.toMatch(/Familie|Fahrrad|Asthma/);
    expect(body.system).toContain("Es gibt nur Sparte, Versicherer, Tarif und Beitrag");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.strikt).toBe(true);
    expect(r.gruende).not.toMatch(/[–—]/);
    expect(r.gruende).not.toMatch(/Asthma|Diagnose/);
    expect(r.gruende).toContain("78,40 €");
  });

  it("Du-Form folgt der Ansprache", async () => {
    const create = antwort("• Passt zu deinem Fahrrad.");
    await gruendeVorschlagen({ an: "du", themen: ["Privathaftpflicht"], auswahl: [haftpflicht], wuensche }, { konfig: EU, client: { messages: { create } } });
    expect(((create.mock.calls[0] as unknown[])[0] as { system: string }).system).toContain("Du-Form");
  });
});

describe("Gründe vorschlagen: Prüfung der Antwort", () => {
  const ein = vorschlagEingabe({ auswahl: [haftpflicht], wuensche, strikt: false });
  it("neue Beträge, Versicherer, Vergleiche, Garantie und Lücken werden verworfen", () => {
    expect(vorschlagPruefen(ein, "• Deckt Schlüsselverlust ab, Beitrag 6,12 €.")).toBeNull();
    expect(vorschlagPruefen(ein, "• Nur 5,00 € im Monat.")).toMatch(/Beträge/);
    expect(vorschlagPruefen(ein, "• Wie bei der HUK.")).toMatch(/Versicherer/);
    expect(vorschlagPruefen(ein, "• Günstiger als Ihr alter Vertrag.")).toMatch(/Vergleich/);
    expect(vorschlagPruefen(ein, "• Mit Garantie abgesichert.")).toMatch(/Versprechen/);
    expect(vorschlagPruefen(ein, `• ${GRUENDE_ERGAENZEN}`)).toMatch(/unvollständig/);
  });

  it("verworfene Antwort, Fehler der KI, fehlende Angaben: freundlicher Hinweis, nichts übernommen", async () => {
    const neu = await gruendeVorschlagen({ an: "sie", themen: ["Privathaftpflicht"], auswahl: [haftpflicht], wuensche }, { konfig: EU, client: { messages: { create: antwort("• Nur 3,99 € im Monat.") } } });
    expect(neu).toEqual({ ok: false, error: expect.stringMatching(/selbst ergänzen/) });
    const kaputt = vi.fn(async () => {
      throw new Error("down");
    });
    const fehler = await gruendeVorschlagen({ an: "sie", themen: ["Privathaftpflicht"], auswahl: [haftpflicht], wuensche }, { konfig: EU, client: { messages: { create: kaputt } } });
    expect(fehler).toEqual({ ok: false, error: expect.stringMatching(/nicht erreichbar/) });
    const nie = vi.fn();
    expect((await gruendeVorschlagen({ an: "sie", themen: ["Hausrat"], auswahl: [], wuensche }, { konfig: EU, client: { messages: { create: nie } } })).ok).toBe(false);
    expect((await gruendeVorschlagen({ an: "sie", themen: ["Hausrat"], auswahl: [haftpflicht], wuensche }, { konfig: null, client: { messages: { create: nie } } })).ok).toBe(false);
    expect(nie).not.toHaveBeenCalled();
  });

  it("liest Punkte mit und ohne Markierung", () => {
    expect(vorschlagLesen("GRÜNDE:\n- Erster Grund\n2. Zweiter Grund")).toBe("• Erster Grund\n• Zweiter Grund");
    expect(vorschlagLesen("• Nur ein Grund")).toBe("• Nur ein Grund");
    expect(vorschlagLesen("   ")).toBeNull();
  });
});

describe("Gründe einsetzen", () => {
  it("ersetzt die Stelle zum Ergänzen, der Rat bleibt, sonst angehängt", () => {
    const rat = `• Privathaftpflicht: Allianz Komfort, 6,12 € im Monat\n\nGründe: ${GRUENDE_ERGAENZEN}`;
    expect(gruendePlatzhalter(rat)).toBe(true);
    expect(gruendeOffen(rat)).toBe(true);
    const neu = gruendeEinsetzen(rat, "• Fahrrad ist mitversichert ($&)", "Gründe");
    expect(neu).toBe("• Privathaftpflicht: Allianz Komfort, 6,12 € im Monat\n\nGründe:\n• Fahrrad ist mitversichert ($&)");
    expect(gruendeOffen(neu)).toBe(false);
    const bd = `Empfohlen: x\nBegründung: ${GRUENDE_ERGAENZEN}`;
    expect(gruendeEinsetzen(bd, "• A", "Begründung")).toBe("Empfohlen: x\nBegründung:\n• A");
    expect(gruendeEinsetzen("• Hausrat", "• A", "Gründe")).toBe("• Hausrat\n\nGründe:\n• A");
    expect(gruendeEinsetzen("", "• A", "Gründe")).toBe("Gründe:\n• A");
  });
});

describe("Beratungsdokumentation vorbereiten? (Frage)", () => {
  it("nur mit Software, Schalter aus und nie beantwortet", () => {
    expect(bdFrageOffen({ plan: "software", beratungsdokuAn: false, beratungsdokuGefragtAt: null })).toBe(true);
    expect(bdFrageOffen({ plan: "software", beratungsdokuAn: false, beratungsdokuGefragtAt: new Date() })).toBe(false);
    expect(bdFrageOffen({ plan: "software", beratungsdokuAn: true, beratungsdokuGefragtAt: null })).toBe(false);
    expect(bdFrageOffen({ plan: "service", beratungsdokuAn: false, beratungsdokuGefragtAt: null })).toBe(false);
    expect(bdFrageOffen(null)).toBe(false);
  });
});
