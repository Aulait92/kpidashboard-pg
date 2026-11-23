// „Zuerst erledigen“ in der Aufgabenliste (Ole, 23.11.2026): Regeln aus lib/vertrieb/aufgaben-prioritaet.ts.
import { describe, expect, it } from "vitest";
import { aufgabePrioritaet, fristAusTitel, tageBis, wichtigsteAufgaben, zeigeZuerst, type PrioAufgabe } from "@/lib/vertrieb/aufgaben-prioritaet";
import { dayKey } from "@/lib/vertrieb/dates";

// Montag, 23.11.2026, 10:00 Berliner Zeit
const NOW = new Date("2026-11-23T09:00:00Z");
const tag = (n: number) => new Date(NOW.getTime() + n * 86_400_000);
let nr = 0;
const a = (p: Partial<PrioAufgabe> & { title: string }): PrioAufgabe => ({ id: `t${++nr}`, type: "SONSTIGES", dueAt: tag(-1), contact: null, ...p });
const ids = (xs: { task: PrioAufgabe }[]) => xs.map((x) => x.task.title);

describe("fristAusTitel", () => {
  it("liest „Frist TT.MM.JJJJ“ als Kalendertag in Berliner Zeit", () => {
    const f = fristAusTitel("Auskunft nach Art. 15 beantworten, Frist 24.11.2026");
    expect(f && dayKey(f)).toBe("2026-11-24");
    expect(f && tageBis(f, NOW)).toBe(1);
  });
  it("auch einstellige Tage und Monate", () => {
    const f = fristAusTitel("Widerspruch bestätigen, Frist 1.2.2027");
    expect(f && dayKey(f)).toBe("2027-02-01");
  });
  it("ohne oder mit ungültiger Frist: null", () => {
    expect(fristAusTitel("Nachfassen: Angebot")).toBeNull();
    expect(fristAusTitel("Frist 32.13.2026")).toBeNull();
  });
});

describe("aufgabePrioritaet", () => {
  it("Art. 15 mit Frist morgen: Stufe 0, „Frist morgen“, auch bei gesperrtem und verlorenem Kontakt", () => {
    const p = aufgabePrioritaet(a({ title: "Auskunft nach Art. 15 beantworten, Frist 24.11.2026", contact: { stage: "VERLOREN", gesperrt: true } }), NOW);
    expect(p?.stufe).toBe(0);
    expect(p?.grund.label).toBe("Frist morgen");
  });
  it("abgelaufene Frist und Frist heute", () => {
    expect(aufgabePrioritaet(a({ title: "Löschung bestätigen (Art. 17), Frist 20.11.2026" }), NOW)?.grund.label).toBe("Frist abgelaufen");
    expect(aufgabePrioritaet(a({ title: "Widerspruch bestätigen, Frist 23.11.2026" }), NOW)?.grund.label).toBe("Frist heute");
    expect(aufgabePrioritaet(a({ title: "Widerspruch bestätigen, Frist 26.11.2026" }), NOW)?.grund.label).toBe("Frist in 3 Tagen");
  });
  it("Abmahnung ohne Frist im Titel: Fälligkeit zählt, Chip „Abmahnung“", () => {
    const p = aufgabePrioritaet(a({ title: "Abmahnung bzw. rechtliche Drohung: sofort prüfen", dueAt: NOW }), NOW);
    expect(p).toMatchObject({ stufe: 0, unterrang: 0, grund: { label: "Abmahnung" } });
  });
  it("Rechtsaufgabe mit ferner Frist, die noch nicht fällig ist, kommt nicht nach oben", () => {
    expect(aufgabePrioritaet(a({ title: "Widerspruch bestätigen, Frist 30.11.2026", dueAt: tag(2) }), NOW)).toBeNull();
    // schon fällig: bleibt oben, Chip „Gesetzliche Frist“
    expect(aufgabePrioritaet(a({ title: "Widerspruch bestätigen, Frist 30.11.2026", dueAt: NOW }), NOW)?.grund.label).toBe("Gesetzliche Frist");
  });
  it("Geld: Zahlung offen, Kündigung, Einrichtung zahlender Kunden", () => {
    expect(aufgabePrioritaet(a({ title: "Kunde anrufen: Agentur Muster", type: "ANRUF" }), NOW)?.grund.label).toBe("Zahlung offen");
    expect(aufgabePrioritaet(a({ title: "Zahlung offen: Agentur Muster" }), NOW)?.grund.label).toBe("Zahlung offen");
    expect(aufgabePrioritaet(a({ title: "Kündigung prüfen: Agentur Muster" }), NOW)?.grund.label).toBe("Kündigungsgefahr");
    const pw = aufgabePrioritaet(a({ title: "Paketwechsel Agentur Muster: Software einrichten", contact: { stage: "GEWONNEN" } }), NOW);
    expect(pw).toMatchObject({ stufe: 1, unterrang: 2, grund: { label: "Zahlender Kunde" } });
    expect(aufgabePrioritaet(a({ title: "Budget prüfen", contact: { stage: "GEWONNEN", customerStage: "AKTIV" } }), NOW)?.unterrang).toBe(3);
  });
  it("gekündigter Kunde zählt nicht als zahlend", () => {
    expect(aufgabePrioritaet(a({ title: "Budget prüfen", contact: { stage: "GEWONNEN", customerStage: "GEKUENDIGT" } }), NOW)?.stufe).toBe(3);
  });
  it("heißer Vertrieb: Angebot, Termin heute, Interesse", () => {
    expect(aufgabePrioritaet(a({ title: "Nachfassen: Angebot", type: "NACHFASSEN", contact: { stage: "INTERESSE" } }), NOW)?.grund.label).toBe("Angebot offen");
    expect(aufgabePrioritaet(a({ title: "Anrufen", type: "ANRUF", contact: { stage: "WIEDERVORLAGE", angebotOffen: true } }), NOW)?.grund.label).toBe("Angebot offen");
    expect(aufgabePrioritaet(a({ title: "Termin", type: "TERMIN", dueAt: NOW, contact: { stage: "TERMIN" } }), NOW)?.grund.label).toBe("Termin heute");
    expect(aufgabePrioritaet(a({ title: "Nachfassen: Unterlagen gesendet", type: "NACHFASSEN", contact: { stage: "INTERESSE" } }), NOW)?.grund.label).toBe("Hat Interesse");
  });
  it("Rest: überfällig bzw. heute fällig; künftige Aufgaben nicht", () => {
    expect(aufgabePrioritaet(a({ title: "Erneut anrufen", type: "ANRUF", dueAt: tag(-3), contact: { stage: "NICHT_ERREICHT" } }), NOW)?.grund.label).toBe("3 Tage überfällig");
    expect(aufgabePrioritaet(a({ title: "Erneut anrufen", type: "ANRUF", dueAt: tag(-1) }), NOW)?.grund.label).toBe("Seit gestern fällig");
    expect(aufgabePrioritaet(a({ title: "Erneut anrufen", type: "ANRUF", dueAt: NOW }), NOW)?.grund.label).toBe("Heute fällig");
    expect(aufgabePrioritaet(a({ title: "Nachfassen: Angebot", dueAt: tag(1) }), NOW)).toBeNull();
  });
  it("gesperrter Kontakt: Kontaktaufnahme fällt raus, andere Aufgaben bleiben", () => {
    const gesperrt = { stage: "INTERESSE" as const, gesperrt: true };
    expect(aufgabePrioritaet(a({ title: "Nachfassen: Angebot", type: "NACHFASSEN", contact: gesperrt }), NOW)).toBeNull();
    expect(aufgabePrioritaet(a({ title: "Erneut anrufen", type: "SONSTIGES", contact: gesperrt }), NOW)).toBeNull();
    expect(aufgabePrioritaet(a({ title: "Zahlung offen: Agentur Muster", contact: gesperrt }), NOW)?.stufe).toBe(1);
  });
});

describe("wichtigsteAufgaben", () => {
  const liste = [
    a({ title: "Erneut anrufen", type: "ANRUF", dueAt: tag(-10) }),
    a({ title: "Nachfassen: Angebot", type: "NACHFASSEN", contact: { stage: "INTERESSE" } }),
    a({ title: "Paketwechsel Agentur Muster: Software einrichten", contact: { stage: "GEWONNEN", customerStage: "AKTIV" } }),
    a({ title: "Widerspruch bestätigen, Frist 25.11.2026", dueAt: tag(-1) }),
    a({ title: "Auskunft nach Art. 15 beantworten, Frist 24.11.2026", dueAt: tag(-6), contact: { stage: "VERLOREN", gesperrt: true } }),
    a({ title: "Zahlung offen: Agentur B" }),
    a({ title: "Später", dueAt: tag(5) }),
  ];

  it("Reihenfolge: Recht nach Frist, dann Geld, dann Vertrieb, dann Rest; höchstens 5", () => {
    expect(ids(wichtigsteAufgaben(liste, NOW))).toEqual([
      "Auskunft nach Art. 15 beantworten, Frist 24.11.2026",
      "Widerspruch bestätigen, Frist 25.11.2026",
      "Zahlung offen: Agentur B",
      "Paketwechsel Agentur Muster: Software einrichten",
      "Nachfassen: Angebot",
    ]);
  });
  it("max begrenzt, Gründe werden mitgegeben", () => {
    const top = wichtigsteAufgaben(liste, NOW, 3);
    expect(top).toHaveLength(3);
    expect(top.map((x) => x.grund.label)).toEqual(["Frist morgen", "Frist in 2 Tagen", "Zahlung offen"]);
  });
  it("Gleichstand: ältere Fälligkeit zuerst, dann Titel, dann id (stabil, unabhängig von der Eingangsreihenfolge)", () => {
    const x = a({ id: "b", title: "Erneut anrufen", dueAt: tag(-2) });
    const y = a({ id: "a", title: "Erneut anrufen", dueAt: tag(-2) });
    const z = a({ title: "Anrufen", dueAt: tag(-2) });
    const w = a({ title: "Zurückrufen", dueAt: tag(-4) });
    const erwartet = [w.id, z.id, "a", "b"];
    expect(wichtigsteAufgaben([x, y, z, w], NOW).map((r) => r.task.id)).toEqual(erwartet);
    expect(wichtigsteAufgaben([w, z, y, x], NOW).map((r) => r.task.id)).toEqual(erwartet);
  });
  it("zwei Rechtsaufgaben mit gleicher Frist: Abmahnung vor Datenschutz", () => {
    const d = a({ title: "Auskunft nach Art. 15 beantworten, Frist 23.11.2026", dueAt: tag(-7) });
    const m = a({ title: "Abmahnung bzw. rechtliche Drohung: sofort prüfen", dueAt: NOW });
    expect(ids(wichtigsteAufgaben([d, m], NOW))).toEqual([m.title, d.title]);
  });
});

describe("zeigeZuerst", () => {
  it("erst ab 6 heute fälligen oder überfälligen Aufgaben", () => {
    const fuenf = Array.from({ length: 5 }, () => ({ dueAt: tag(-1) }));
    expect(zeigeZuerst([...fuenf, { dueAt: tag(3) }], NOW)).toBe(false);
    expect(zeigeZuerst([...fuenf, { dueAt: NOW }], NOW)).toBe(true);
  });
});
