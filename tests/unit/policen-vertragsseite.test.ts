// Vertragsseite (Policen auslesen, Paket 2): Reihenfolge der Karten, Fragen je Karte, sichtbare Zeilen, die eine
// Hauptaktion, und die Sammelaktionen im Server (nie ungeprüft übernehmen, nur mit Bestandsmodul, nicht bei „ohne KI“).
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Felder } from "@/lib/policen/auslesen/felder";
import type { Frage } from "@/lib/policen/auslesen/zusammenfassung";
import { fragenJeKarte, hauptaktion, hauptaktionText, kartenZeilen, pruefbar, sortiereKarten, uebernehmbar, type KarteDaten } from "@/lib/policen/auslesen/vertragsseite";

// ─── Speicher für die Server-Tests (prisma und Nachbarmodule gemockt) ───────
type Auszug = { id: string; leadId: string; customerId: string; status: string; sparte: string; felder: Felder; geprueftAt: Date | null; geprueftVonId: string | null; uebernommenAt: Date | null; existingContractId: string | null; createdAt: Date };
const db = vi.hoisted(() => ({ auszuege: [] as Auszug[], vertraege: [] as { id: string }[], audits: [] as string[], bestand: true, ohneKi: false }));

const passt = (a: Auszug, w: Record<string, unknown>) =>
  Object.entries(w).every(([k, v]) => {
    const x = (a as unknown as Record<string, unknown>)[k];
    if (v && typeof v === "object" && "in" in v) return (v.in as unknown[]).includes(x);
    if (v && typeof v === "object" && "not" in v) return x !== v.not;
    return x === v;
  });

vi.mock("@/lib/prisma", () => ({
  prisma: {
    policenAuszug: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => db.auszuege.filter((a) => passt(a, where)).map((a) => ({ id: a.id })),
      findFirst: async ({ where }: { where: Record<string, unknown> }) => db.auszuege.find((a) => passt(a, where)) ?? null,
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<Auszug> }) => {
        const l = db.auszuege.filter((a) => passt(a, where));
        l.forEach((a) => Object.assign(a, data));
        return { count: l.length };
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Auszug> }) => Object.assign(db.auszuege.find((a) => a.id === where.id)!, data),
    },
    lead: { findFirst: async () => ({ id: "l1", customerId: "c1", name: "Test", phone: null, email: null }) },
    existingContract: {
      findUnique: async () => null,
      create: async () => {
        const v = { id: `ec${db.vertraege.length + 1}` };
        db.vertraege.push(v);
        return v;
      },
    },
  },
}));
vi.mock("@/lib/audit", () => ({ audit: async (a: string) => void db.audits.push(a) }));
vi.mock("@/lib/lead-history", () => ({ logLeadHistory: async () => {} }));
vi.mock("@/lib/policen/ohne-ki", () => ({ kiAbgelehnt: async () => db.ohneKi }));
vi.mock("@/lib/bestand/sichtbar-server", () => ({ loadBestandVisible: async () => db.bestand }));
vi.mock("@/lib/vertraege", () => ({ bestandskundeZuLead: async () => ({ id: "kunde1" }), refreshBestandSummary: async () => {} }));

const ok = (o: Record<string, string | number | boolean>, pruefen: string[] = []): Felder =>
  Object.fromEntries(Object.entries(o).map(([k, w]) => [k, { w, s: pruefen.includes(k) ? "pruefen" : "ok" }])) as Felder;
const karte = (id: string, x: Partial<KarteDaten> = {}): KarteDaten => ({ id, sparte: "haftpflicht", felder: ok({ versicherer: "HUK" }), status: "ausgelesen", geprueft: false, uebernommen: false, ...x });
const frage = (ids: string[], typ: Frage["typ"] = "kuendigung"): Frage => ({ typ, text: `Frage ${ids.join("+")}`, ids, tage: null, jahresbetrag: null });

describe("Fragen und Reihenfolge der Karten", () => {
  it("nummeriert Fragen je Karte in der Reihenfolge der Fragen", () => {
    const m = fragenJeKarte([frage(["a"]), frage(["b", "c"], "doppelt"), frage([], "nicht_geschickt"), frage(["a"], "baustein")]);
    expect(m.get("a")).toEqual([1, 4]);
    expect(m.get("b")).toEqual([2]);
    expect(m.get("c")).toEqual([2]);
    expect(m.has("")).toBe(false);
  });

  it("sortiert: mit Frage zuerst (nach Frage), dann bitte prüfen mit unsicheren Feldern, dann ungeprüft, dann Rest", () => {
    const k = [
      karte("geprueft", { geprueft: true }),
      karte("ungeprueft"),
      karte("unsicher", { felder: ok({ beitrag: 5 }, ["beitrag"]) }),
      karte("frage2"),
      karte("frage1"),
    ];
    expect(sortiereKarten(k, [frage(["frage1"]), frage(["frage2"])]).map((x) => x.id)).toEqual(["frage1", "frage2", "unsicher", "ungeprueft", "geprueft"]);
  });
});

describe("Zeilen einer Karte", () => {
  const heute = "2026-11-19";
  it("zeigt Gesprächsfelder und unsichere Felder, seltene Felder nur unter „Alle Angaben“", () => {
    const k = karte("h", {
      sparte: "hausrat",
      felder: ok({ versicherer: "R+V", beitrag: 120, zahlweise: "jaehrlich", versicherungssumme: 65000, wohnflaeche: 80, elementar: false, fahrrad: true, tarifname: "Comfort", selbstbeteiligung: 150 }, ["selbstbeteiligung"]),
    });
    const { sichtbar, mehr } = kartenZeilen(k, heute, 10);
    expect(sichtbar.map((z) => z.key)).toEqual(["beitrag", "selbstbeteiligung", "versicherungssumme", "elementar"]);
    expect(sichtbar.find((z) => z.key === "selbstbeteiligung")?.pruefen).toBe(true);
    expect(mehr.map((z) => z.key)).toEqual(expect.arrayContaining(["tarifname", "wohnflaeche", "fahrrad"]));
    expect(sichtbar[0].wert).toBe("10,00\u00a0€ im Monat");
    expect(mehr.find((z) => z.key === "beitrag_laut")?.wert).toBe("120,00\u00a0€ jährlich");
  });

  it("nach der Prüfung ist kein Feld mehr unsicher, das seltene Feld wandert nach „Alle Angaben“", () => {
    const k = karte("h", { sparte: "hausrat", geprueft: true, felder: ok({ selbstbeteiligung: 150 }, ["selbstbeteiligung"]) });
    const { sichtbar, mehr } = kartenZeilen(k, heute, null);
    expect(sichtbar).toEqual([]);
    expect(mehr[0]).toMatchObject({ key: "selbstbeteiligung", pruefen: false });
  });

  it("Sach: Kündigung bis (vorsichtig minus 1 Tag) statt Laufzeit; Laufzeit unter „Alle Angaben“", () => {
    const k = karte("k", { sparte: "kfz", felder: ok({ beginn: "2024-01-01", ablauf: "2027-01-01", kuendigungsfrist_monate: 1 }) });
    const { sichtbar, mehr } = kartenZeilen(k, heute, null);
    expect(sichtbar.find((z) => z.key === "kuendigung")?.wert).toBe("30.11.2026");
    expect(mehr.find((z) => z.key === "kuendigung_zum")?.wert).toBe("01.01.2027");
    expect(mehr.find((z) => z.key === "laufzeit")).toBeTruthy();
  });

  it("ohne Frist im Dokument: kein angenommenes Datum, Hinweis aufs Original", () => {
    const k = karte("k", { sparte: "hausrat", felder: ok({ ablauf: "2027-03-01" }) });
    expect(kartenZeilen(k, heute, null).sichtbar.find((z) => z.key === "kuendigung")?.wert).toBe("01.03.2027, Frist im Original prüfen");
  });

  it("PKV, BU, Leben: keine Kündigungsangabe (K8), nur Laufzeit", () => {
    for (const sparte of ["pkv", "bu", "leben"] as const) {
      const k = karte("x", { sparte, felder: ok({ beginn: "2020-01-01", ablauf: "2027-01-01", kuendigungsfrist_monate: 3 }) });
      const z = kartenZeilen(k, heute, null);
      expect(z.sichtbar.map((x) => x.key)).toEqual(["laufzeit"]);
    }
  });
});

describe("die eine Hauptaktion", () => {
  it("solange Ungeprüftes da ist: „Alle als geprüft markieren“ nur für ausgelesene, ungeprüfte", () => {
    const k = [karte("a"), karte("b", { geprueft: true }), karte("leer", { status: "leer" }), karte("im", { geprueft: true, uebernommen: true })];
    const a = hauptaktion(k, { bestand: true, readOnly: false });
    expect(a).toEqual({ art: "pruefen", ids: ["a"] });
    expect(hauptaktionText(a as { art: "pruefen"; ids: string[] })).toBe("Alle als geprüft markieren (1)");
  });

  it("danach „n Verträge in Bestand übernehmen“, nur Geprüftes und nur mit Bestandsmodul", () => {
    const k = [karte("a", { geprueft: true }), karte("b", { geprueft: true }), karte("im", { geprueft: true, uebernommen: true })];
    const a = hauptaktion(k, { bestand: true, readOnly: false });
    expect(a).toEqual({ art: "uebernehmen", ids: ["a", "b"] });
    expect(hauptaktionText(a as { art: "uebernehmen"; ids: string[] })).toBe("2 Verträge in Bestand übernehmen");
    expect(hauptaktion(k, { bestand: false, readOnly: false })).toEqual({ art: "fertig", text: "Alle geprüft" });
  });

  it("nie ungeprüft übernehmen, nie in der Vorschau, nichts ohne ausgelesene Verträge", () => {
    expect(uebernehmbar([karte("a"), karte("b", { geprueft: true })])).toEqual(["b"]);
    expect(pruefbar([karte("a", { status: "leer" })])).toEqual([]);
    expect(hauptaktion([karte("a")], { bestand: true, readOnly: true })).toBeNull();
    expect(hauptaktion([karte("a", { status: "leer" })], { bestand: true, readOnly: false })).toBeNull();
    expect(hauptaktion([karte("a", { geprueft: true, uebernommen: true })], { bestand: true, readOnly: false })).toEqual({ art: "fertig", text: "Alle im Bestand" });
  });
});

describe("Sammelaktionen im Server", () => {
  const w = { customerId: "c1", userId: "u1", leadId: "l1" };
  const auszug = (id: string, x: Partial<Auszug> = {}): Auszug => ({
    id,
    leadId: "l1",
    customerId: "c1",
    status: "ausgelesen",
    sparte: "kfz",
    felder: ok({ versicherer: "HUK", ablauf: "2027-01-01", kuendigungsfrist_monate: 1 }),
    geprueftAt: null,
    geprueftVonId: null,
    uebernommenAt: null,
    existingContractId: null,
    createdAt: new Date(),
    ...x,
  });
  beforeEach(() => {
    db.vertraege = [];
    db.audits = [];
    db.bestand = true;
    db.ohneKi = false;
    db.auszuege = [
      auszug("ungeprueft"),
      auszug("geprueft", { geprueftAt: new Date("2026-11-18"), geprueftVonId: "u1" }),
      auszug("leer", { status: "leer" }),
      auszug("fremd", { leadId: "l2", geprueftAt: new Date("2026-11-18") }),
    ];
  });

  it("übernimmt nur geprüfte Auszüge dieses Leads, ungeprüfte bleiben ungeprüft (keine stille Prüfungsfiktion)", async () => {
    const { uebernimmAlle } = await import("@/lib/policen/auslesen/server");
    const r = await uebernimmAlle(w, ["ungeprueft", "geprueft", "leer", "fremd"]);
    expect(r).toEqual({ uebernommen: 1, fehler: 0 });
    const by = (id: string) => db.auszuege.find((a) => a.id === id)!;
    expect(by("geprueft").uebernommenAt).toBeInstanceOf(Date);
    expect(by("ungeprueft")).toMatchObject({ uebernommenAt: null, geprueftAt: null });
    expect(by("fremd").uebernommenAt).toBeNull();
    expect(db.audits).toEqual(["policen.auslesen_bestand", "policen.auslesen_bestand_alle"]);
  });

  it("ohne Bestandsmodul oder bei „ohne KI“ wird nichts übernommen", async () => {
    const { uebernimmAlle } = await import("@/lib/policen/auslesen/server");
    db.bestand = false;
    expect(await uebernimmAlle(w, ["geprueft"])).toBeNull();
    db.bestand = true;
    db.ohneKi = true;
    expect(await uebernimmAlle(w, ["geprueft"])).toBeNull();
    expect(db.vertraege).toEqual([]);
  });

  it("„Alle als geprüft markieren“ betrifft nur angezeigte, ausgelesene, ungeprüfte Auszüge dieses Leads, mit Audit", async () => {
    const { bestaetigeAlle } = await import("@/lib/policen/auslesen/server");
    expect(await bestaetigeAlle(w, ["ungeprueft", "geprueft", "leer", "fremd", 42])).toBe(1);
    const by = (id: string) => db.auszuege.find((a) => a.id === id)!;
    expect(by("ungeprueft")).toMatchObject({ geprueftVonId: "u1" });
    expect(by("leer").geprueftAt).toBeNull();
    expect(db.audits).toEqual(["policen.auslesen_geprueft_alle"]);
    db.ohneKi = true;
    db.auszuege.push(auszug("neu"));
    expect(await bestaetigeAlle(w, ["neu"])).toBe(0);
  });
});
