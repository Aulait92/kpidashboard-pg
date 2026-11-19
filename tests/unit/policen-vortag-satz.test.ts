// Policen-Satz in der Vortags-Terminerinnerung (A8 a, Rechtsprüfung 19.11.2026): auch ohne Opt-in, genau ein Satz,
// höchstens einmal je Lead, nur nach gestellter Bitte, ohne Police, nicht nach „habe keine“, STOP oder Minderjährigkeit.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = { kind?: string; body: string | null; createdAt?: Date };
const db = {
  internal: [] as Row[],
  inbound: [] as Row[],
  optedOutAt: null as Date | null,
  docs: 0,
};
const darfPolicenVortagSatz = vi.fn(async () => true);
const minderjaehrig = { ja: false };

vi.mock("@/lib/prisma", () => ({
  prisma: {
    message: {
      findMany: async ({ where }: { where: { direction: string; kind?: unknown } }) => (where.direction === "inbound" ? db.inbound : db.internal),
    },
    conversation: { findUnique: async () => ({ optedOutAt: db.optedOutAt }) },
    leadDocument: { count: async () => db.docs },
  },
}));
vi.mock("@/lib/policen/server", () => ({
  darfPolicenVortagSatz: () => darfPolicenVortagSatz(),
  policenSprecherFuerChat: async () => ({ chat: { minderjaehrig: minderjaehrig.ja }, sp: {} }),
}));

const { policenVortagSatz, policenVortagSatzErlaubt, STRECKE } = await import("@/lib/whatsapp/termin-strecke");
const { vortagParams } = await import("@/lib/showup");

const stand = (o: Partial<{ policenBitteAt: Date | null; policenKeine: boolean }> = {}) =>
  ({ policenBitteAt: new Date("2026-11-19T10:00:00Z"), policenKeine: false, ...o }) as unknown as Parameters<typeof policenVortagSatzErlaubt>[2];
const erinnerung = (art: string, gesendet = true) => ({ kind: STRECKE.policenErinnerung, body: JSON.stringify({ appointmentId: "alt", art, ...(gesendet ? {} : { gesendet: false }) }) });

describe("Wortlaut", () => {
  it("Sie und Du, mit Vermittler, ohne Zeilenumbruch, ohne Gedankenstriche, ohne Sparte", () => {
    const sie = policenVortagSatz("sie", { nom: "Herr Kannapinn" });
    const du = policenVortagSatz("du", { nom: "Ole" });
    expect(sie).toBe("Wenn Sie mögen, schicken Sie vorab Ihre Policen hier in den Chat (ein Foto reicht), dann kann sich Herr Kannapinn schon vorbereiten. Geht aber auch ohne.");
    expect(du).toBe("Wenn du magst, schick vorab deine Policen hier in den Chat (ein Foto reicht), dann kann sich Ole schon vorbereiten. Geht aber auch ohne.");
    for (const t of [sie, du]) {
      expect(t).not.toMatch(/[\n–—]/);
      expect(t).not.toMatch(/Garantie|Kranken|Hausrat|Haftpflicht/i);
    }
  });
  it("ohne Namen: Ihr bzw. dein Berater", () => {
    expect(policenVortagSatz("sie", null)).toContain("dann kann sich Ihr Berater schon vorbereiten");
    expect(policenVortagSatz("du")).toContain("dann kann sich dein Berater schon vorbereiten");
  });
  it("mit Policen-Satz entfällt „Verträge bereitlegen“", () => {
    const basis = { an: "sie" as const, hi: "Guten Tag,", wann: "morgen um 10 Uhr", nutzen: "Nutzen.", komplettcheck: true, mode: "phone", meetUrl: null, person: { nom: "Herr K" } as never };
    expect(vortagParams(basis)[1]).toContain("bestehenden Verträge bereit");
    const mit = vortagParams({ ...basis, policen: policenVortagSatz("sie", null) })[1];
    expect(mit).not.toContain("bestehenden Verträge bereit");
    expect(mit).toContain("Policen");
  });
});

describe("Bedingungen", () => {
  beforeEach(() => {
    db.internal = [];
    db.inbound = [];
    db.optedOutAt = null;
    db.docs = 0;
    minderjaehrig.ja = false;
    darfPolicenVortagSatz.mockResolvedValue(true);
  });
  const erlaubt = (s = stand()) => policenVortagSatzErlaubt("conv", "lead", s);

  it("auch ohne Opt-in erlaubt, wenn gebeten und nichts dagegen spricht", async () => {
    expect(await erlaubt()).toBe(true);
  });
  it("nicht ohne Policen-Bitte, nicht nach „habe keine“, nicht ohne Lead", async () => {
    expect(await erlaubt(stand({ policenBitteAt: null }))).toBe(false);
    expect(await erlaubt(stand({ policenKeine: true }))).toBe(false);
    expect(await policenVortagSatzErlaubt("conv", null, stand())).toBe(false);
  });
  it("höchstens einmal je Lead, auch nach einer Verschiebung (anderer Termin)", async () => {
    db.internal = [erinnerung("vortag")];
    expect(await erlaubt()).toBe(false);
  });
  it("zählt zum Höchstwert 2", async () => {
    db.internal = [erinnerung("tag"), erinnerung("tag")];
    expect(await erlaubt()).toBe(false);
    db.internal = [erinnerung("tag"), erinnerung("tag", false)];
    expect(await erlaubt()).toBe(true);
  });
  it("nicht nach STOP, Widerruf oder Ablehnung (Policen-Modul) und nicht bei Abmeldung", async () => {
    darfPolicenVortagSatz.mockResolvedValue(false);
    expect(await erlaubt()).toBe(false);
    darfPolicenVortagSatz.mockResolvedValue(true);
    db.optedOutAt = new Date();
    expect(await erlaubt()).toBe(false);
  });
  it("nicht bei Minderjährigen und nicht, wenn schon eine Police da ist", async () => {
    minderjaehrig.ja = true;
    expect(await erlaubt()).toBe(false);
    minderjaehrig.ja = false;
    db.docs = 1;
    expect(await erlaubt()).toBe(false);
  });
  it("nicht, wenn der Lead nach der Bitte „Lieber nicht“ schreibt", async () => {
    db.inbound = [{ body: "Lieber nicht" }];
    expect(await erlaubt()).toBe(false);
  });
});
