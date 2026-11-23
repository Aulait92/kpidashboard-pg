// Nachfassen nach einer Absage durch den Lead (Ole, 23.11.2026, lib/absage-nachfassen.ts, lib/absage-nachfassen-server.ts):
// Ausschlüsse, Zeitpunkt, Texte Sie/Du ohne Gedankenstriche, Splittest-Zuteilung, Abfolgen „absage“ und „absage_b“.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  appt: null as null | Record<string, unknown>,
  lead: null as null | Record<string, unknown>,
  customer: null as null | Record<string, unknown>,
  account: { status: "connected" } as null | { status: string },
  weitere: 0,
  stopp: 0,
  sperrliste: 0,
  sperre: null as null | string,
  variante: "a" as "a" | "b",
  startSequence: vi.fn(),
  seqUpdate: vi.fn(async () => ({})),
  history: vi.fn(async () => undefined),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appointment: { findUnique: async () => h.appt, count: async () => h.weitere },
    lead: { findUnique: async () => h.lead },
    customer: { findUnique: async () => h.customer },
    whatsAppAccount: { findUnique: async () => h.account },
    conversation: { count: async () => h.stopp },
    bestandOptOut: { count: async () => h.sperrliste },
    leadSequence: { update: h.seqUpdate },
  },
}));
vi.mock("@/lib/bestand/links", () => ({ optOutHash: (_k: string, v: string) => `hash:${v}` }));
vi.mock("@/lib/dsgvo/server", () => ({ sperreFuer: async () => h.sperre }));
vi.mock("@/lib/whatsapp/buchungsnummer", () => ({ waNummerFuerLead: async (l: { phone: string | null }) => l.phone }));
vi.mock("@/lib/experimente", () => ({ variante: async () => h.variante }));
vi.mock("@/lib/lead-sequences", () => ({ startSequence: h.startSequence }));
vi.mock("@/lib/lead-history", () => ({ logLeadHistory: h.history }));

import {
  ABSAGE_EXPERIMENT,
  ABSAGE_IM_CHAT_VERZOEGERUNG_MIN,
  ABSAGE_VERZOEGERUNG_MIN,
  absageNachfassenAusschluss,
  absageText,
  absageZeitenText,
  type AbsageLage,
} from "@/lib/absage-nachfassen";
import { startAbsageNachfassen } from "@/lib/absage-nachfassen-server";

const GEDANKENSTRICH = /[–—]/;
const person = { sie: { nom: "Herr Kannapinn", dat: "Herrn Kannapinn" }, du: { nom: "Ole", dat: "Ole" } };

const lage = (o: Partial<Omit<AbsageLage, "lead" | "kunde">> & { lead?: Partial<NonNullable<AbsageLage["lead"]>> | null; kunde?: Partial<AbsageLage["kunde"]> } = {}): AbsageLage => ({
  vomLead: true,
  weitererTermin: false,
  abgemeldet: false,
  ...o,
  lead:
    o.lead === null
      ? null
      : { erased: false, status: "Termin vereinbart", storniert: false, abschlussGemeldet: false, ohneAutoNachrichten: false, waUnavailable: false, waConsentNein: false, phone: "4917612345678", ...o.lead },
  kunde: { ruhend: false, nurPayPerLead: false, assistentAktiv: true, outreachAn: true, nachfassenAn: true, whatsappVerbunden: true, ...o.kunde },
});

describe("Ausschlüsse (rein)", () => {
  it("Absage durch den Lead mit WhatsApp: nachfassen", () => {
    expect(absageNachfassenAusschluss(lage())).toBeNull();
  });

  it("nicht bei Absage durch Vermittler oder Team und nicht beim Verschieben", () => {
    expect(absageNachfassenAusschluss(lage({ vomLead: false }))).toBe("nicht vom Lead abgesagt");
    expect(absageNachfassenAusschluss(lage({ verschoben: true }))).toBe("verschoben");
  });

  it("nicht mit weiterem gebuchtem Termin", () => {
    expect(absageNachfassenAusschluss(lage({ weitererTermin: true }))).toBe("weiterer Termin gebucht");
  });

  it("nicht bei verlorenen bzw. abgeschlossenen Leads, Reklamation, gemeldetem Abschluss", () => {
    for (const status of ["Kein Interesse", "Abschluss", "disqualifiziert"]) expect(absageNachfassenAusschluss(lage({ lead: { status } }))).toMatch(/^Phase/);
    expect(absageNachfassenAusschluss(lage({ lead: { storniert: true } }))).toBe("Lead reklamiert");
    expect(absageNachfassenAusschluss(lage({ lead: { abschlussGemeldet: true } }))).toMatch(/abgeschlossen/);
    expect(absageNachfassenAusschluss(lage({ lead: { erased: true } }))).toBe("Lead nicht gefunden");
    expect(absageNachfassenAusschluss(lage({ lead: null }))).toBe("Lead nicht gefunden");
  });

  it("nicht ohne WhatsApp, ohne Einwilligung, ohne Nummer, bei Produkten ohne automatische Nachrichten, abgemeldet", () => {
    expect(absageNachfassenAusschluss(lage({ lead: { waUnavailable: true } }))).toBe("kein WhatsApp");
    expect(absageNachfassenAusschluss(lage({ lead: { waConsentNein: true } }))).toBe("keine WhatsApp-Einwilligung");
    expect(absageNachfassenAusschluss(lage({ lead: { phone: null } }))).toBe("keine Handynummer");
    expect(absageNachfassenAusschluss(lage({ lead: { ohneAutoNachrichten: true } }))).toBe("Produkt ohne automatische Nachrichten");
    expect(absageNachfassenAusschluss(lage({ abgemeldet: true }))).toBe("abgemeldet");
  });

  it("nicht bei Pay-per-Lead, ruhendem Konto, Assistent oder Nachfassen aus, WhatsApp nicht verbunden", () => {
    expect(absageNachfassenAusschluss(lage({ kunde: { nurPayPerLead: true } }))).toBe("Pay-per-Lead");
    expect(absageNachfassenAusschluss(lage({ kunde: { ruhend: true } }))).toBe("Konto ruht");
    expect(absageNachfassenAusschluss(lage({ kunde: { assistentAktiv: false } }))).toBe("Assistent aus");
    expect(absageNachfassenAusschluss(lage({ kunde: { outreachAn: false } }))).toBe("Assistent aus");
    expect(absageNachfassenAusschluss(lage({ kunde: { nachfassenAn: false } }))).toBe("Automatisches Nachfassen aus");
    expect(absageNachfassenAusschluss(lage({ kunde: { whatsappVerbunden: false } }))).toBe("WhatsApp nicht verbunden");
  });
});

describe("Texte", () => {
  it("Fassung A gesiezt und geduzt, ohne Gedankenstriche", () => {
    const sie = absageText({ an: "sie", hi: "Guten Tag Frau Schneider,", person: person.sie });
    const du = absageText({ an: "du", hi: "Hallo Julia,", person: person.du });
    expect(sie).toBe("Guten Tag Frau Schneider, schade, dass es mit dem Termin nicht geklappt hat. Sollen wir einen neuen Termin mit Herrn Kannapinn finden?");
    expect(du).toBe("Hallo Julia, schade, dass es mit dem Termin nicht geklappt hat. Sollen wir einen neuen Termin mit Ole finden?");
    expect(sie + du).not.toMatch(GEDANKENSTRICH);
  });

  it("Fassung B mit zwei Zeiten, Sie und Du, ohne Gedankenstriche", () => {
    const sie = absageZeitenText({ an: "sie", hi: "Guten Tag Frau Schneider,", person: person.sie }, ["Di 10 Uhr", "Mi 16 Uhr"]);
    const du = absageZeitenText({ an: "du", hi: "Hallo Julia,", person: person.du }, ["Di 10 Uhr", "Mi 16 Uhr"]);
    expect(sie).toContain("Passt Ihnen Di 10 Uhr oder Mi 16 Uhr für einen neuen Termin mit Herrn Kannapinn?");
    expect(du).toContain("Passt dir Di 10 Uhr oder Mi 16 Uhr für einen neuen Termin mit Ole?");
    expect(sie + du).not.toMatch(GEDANKENSTRICH);
  });
});

describe("Abfolgen und Splittest", () => {
  it("absage (A): ein Schritt nach 20 Minuten, Vorlage followup_noshow; absage_b (B): followup mit zwei Zeiten", async () => {
    const { SEQUENCES } = await vi.importActual<typeof import("@/lib/lead-sequences")>("@/lib/lead-sequences");
    const ctx = { firstName: "Julia", hi: "Guten Tag Frau Schneider,", kontakt: { fullName: "Julia Schneider" }, topic: "Hausrat", an: "sie" as const, person: person.sie };
    for (const kind of ["absage", "absage_b"] as const) {
      const def = SEQUENCES[kind];
      expect(def.label).toBe("Termin abgesagt");
      expect(def.steps).toHaveLength(1);
      const step = def.steps[0];
      expect(step.day * 24 * 60).toBeCloseTo(ABSAGE_VERZOEGERUNG_MIN);
      if (step.action !== "whatsapp") throw new Error("WhatsApp erwartet");
      expect(step.text(ctx)).toContain("schade, dass es mit dem Termin nicht geklappt hat");
      expect(step.params(ctx)).toEqual(["Julia"]);
    }
    const a = SEQUENCES.absage.steps[0];
    const b = SEQUENCES.absage_b.steps[0];
    if (a.action !== "whatsapp" || b.action !== "whatsapp") throw new Error("WhatsApp erwartet");
    expect(a.purpose).toBe("followup_noshow");
    expect(a.slotText).toBeUndefined();
    expect(b.purpose).toBe("followup");
    expect(b.slotText!(ctx, ["Di 10 Uhr", "Mi 16 Uhr"])).toContain("Passt Ihnen Di 10 Uhr oder Mi 16 Uhr");
    expect(JSON.stringify(SEQUENCES)).not.toMatch(GEDANKENSTRICH);
  });

  it("Splittest eingetragen, mit Hypothese, Ziel Terminbuchung, Zuteilung verteilt auf A und B", async () => {
    const { EXPERIMENTE, zuteilen } = await vi.importActual<typeof import("@/lib/experimente")>("@/lib/experimente");
    const { SPLITTEST_HYPOTHESE } = await import("@/lib/ab-hypothesen");
    const d = EXPERIMENTE[ABSAGE_EXPERIMENT as keyof typeof EXPERIMENTE];
    expect(d.ziel).toBe("termin_gebucht");
    expect(SPLITTEST_HYPOTHESE[ABSAGE_EXPERIMENT]).toBeTruthy();
    expect(d.a + d.b + SPLITTEST_HYPOTHESE[ABSAGE_EXPERIMENT]).not.toMatch(GEDANKENSTRICH);
    const v = Array.from({ length: 200 }, (_, i) => zuteilen(ABSAGE_EXPERIMENT, `lead${i}`));
    expect(v.filter((x) => x === "a").length).toBeGreaterThan(60);
    expect(v.filter((x) => x === "b").length).toBeGreaterThan(60);
    // fest je Lead
    expect(zuteilen(ABSAGE_EXPERIMENT, "lead7")).toBe(zuteilen(ABSAGE_EXPERIMENT, "lead7"));
  });
});

describe("startAbsageNachfassen", () => {
  const now = new Date("2026-11-24T10:00:00Z");
  beforeEach(() => {
    vi.clearAllMocks();
    h.appt = { id: "t1", leadId: "l1", customerId: "c1", status: "cancelled", cancelledBy: "lead" };
    h.lead = { id: "l1", customerId: "c1", erasedAt: null, status: "Termin vereinbart", stornoState: null, abschlussGemeldetAt: null, source: "hausrat", phone: "4917612345678", email: null, waUnavailableAt: null, waConsent: null };
    h.customer = { dormantSince: null, dataDeletedAt: null, plan: "software", retainerMonthly: 99, onboarding: null, agentConfig: { active: true, outreachEnabled: true, followUpSequencesEnabled: true } };
    h.account = { status: "connected" };
    h.weitere = 0;
    h.stopp = 0;
    h.sperrliste = 0;
    h.sperre = null;
    h.variante = "a";
    h.startSequence.mockImplementation(async (_l: string, kind: string, at: Date) => ({ id: "s1", kind, startedAt: at, nextAt: new Date(at.getTime() + ABSAGE_VERZOEGERUNG_MIN * 60000) }));
  });

  it("Fassung A: Abfolge „absage“, 20 Minuten später, Eintrag im Verlauf", async () => {
    const r = await startAbsageNachfassen("t1", { now });
    expect(r).toEqual({ gestartet: true, sequenceId: "s1", variante: "a", nextAt: new Date(now.getTime() + 20 * 60000) });
    expect(h.startSequence).toHaveBeenCalledWith("l1", "absage", now);
    expect(h.seqUpdate).not.toHaveBeenCalled();
    expect(h.history).toHaveBeenCalledTimes(1);
    const text = (h.history.mock.calls[0] as unknown[])[2] as string;
    expect(text).toMatch(/Nächste Nachrichten/);
    expect(text).not.toMatch(GEDANKENSTRICH);
  });

  it("Fassung B: Abfolge „absage_b“", async () => {
    h.variante = "b";
    const r = await startAbsageNachfassen("t1", { now });
    expect(r).toMatchObject({ gestartet: true, variante: "b" });
    expect(h.startSequence).toHaveBeenCalledWith("l1", "absage_b", now);
  });

  it("Absage im Chat: erst nach 2 Stunden", async () => {
    const r = await startAbsageNachfassen("t1", { now, verzoegerungMin: ABSAGE_IM_CHAT_VERZOEGERUNG_MIN });
    expect(r).toMatchObject({ gestartet: true, nextAt: new Date(now.getTime() + 120 * 60000) });
    expect(h.seqUpdate).toHaveBeenCalledWith({ where: { id: "s1" }, data: { nextAt: new Date(now.getTime() + 120 * 60000) } });
  });

  it("höchstens ein Nachfassen: läuft schon eins, kein zweites und kein zweiter Verlaufseintrag", async () => {
    h.startSequence.mockResolvedValue({ id: "s0", kind: "absage", startedAt: new Date(now.getTime() - 5 * 60000), nextAt: now });
    expect(await startAbsageNachfassen("t1", { now })).toEqual({ gestartet: false, grund: "Nachfassen nach Absage läuft schon" });
    expect(h.history).not.toHaveBeenCalled();
  });

  it("nicht bei Absage durch den Vermittler", async () => {
    h.appt = { ...h.appt!, cancelledBy: "advisor" };
    expect(await startAbsageNachfassen("t1", { now })).toEqual({ gestartet: false, grund: "nicht vom Lead abgesagt" });
    expect(h.startSequence).not.toHaveBeenCalled();
  });

  it("nicht mit weiterem Termin, ohne WhatsApp, bei Pay-per-Lead, Stopp, Sperrliste oder Sperre", async () => {
    const faelle: [() => void, string][] = [
      [() => (h.weitere = 1), "weiterer Termin gebucht"],
      [() => (h.lead = { ...h.lead!, waUnavailableAt: new Date() }), "kein WhatsApp"],
      [() => (h.customer = { ...h.customer!, retainerMonthly: null, onboarding: null }), "Pay-per-Lead"],
      [() => (h.customer = { ...h.customer!, dormantSince: new Date() }), "Konto ruht"],
      [() => (h.customer = { ...h.customer!, agentConfig: { active: true, outreachEnabled: false, followUpSequencesEnabled: true } }), "Assistent aus"],
      [() => (h.lead = { ...h.lead!, status: "Kein Interesse" }), "Phase: Kein Interesse"],
      [() => (h.stopp = 1), "abgemeldet"],
      [() => (h.sperrliste = 1), "abgemeldet"],
      [() => (h.sperre = "werbung"), "abgemeldet"],
    ];
    for (const [setze, grund] of faelle) {
      const alt = { lead: h.lead, customer: h.customer };
      setze();
      expect(await startAbsageNachfassen("t1", { now }), grund).toEqual({ gestartet: false, grund });
      Object.assign(h, alt, { weitere: 0, stopp: 0, sperrliste: 0, sperre: null });
    }
    expect(h.startSequence).not.toHaveBeenCalled();
  });
});
