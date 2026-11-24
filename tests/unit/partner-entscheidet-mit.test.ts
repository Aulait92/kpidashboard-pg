// Wer entscheidet mit? (Ole, 21.11.2026: „Wenn Partner mit entscheidet wird Termin mit Partner gemacht, damit eine
// Entscheidung getroffen werden kann. Geld … müssen wir nicht qualifizieren.“) Frage direkt nach dem Komplettcheck mit
// Knöpfen, Antwort in qualificationData.entscheidung, sichtbar in der Terminvorbereitung; kein Budget.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

type Msg = { conversationId: string; direction: string; kind: string; body: string; createdAt: Date };
const db = {
  messages: [] as Msg[],
  qualificationData: null as unknown,
  komplettcheck: null as boolean | null,
  leadAddress: "sie" as string,
};
const sent: { body: string; buttons: { id: string; title: string }[] | null }[] = [];
const history: string[] = [];
let tick = 0;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    conversation: {
      findUnique: async () => ({ id: "conv", customerId: "cust", contactPhone: "+49170", contactName: "Julia", contactEmail: "julia@example.com", leadId: "lead", qualificationData: db.qualificationData }),
      update: async ({ data }: { data: { qualificationData?: unknown } }) => {
        if (data.qualificationData !== undefined) db.qualificationData = data.qualificationData;
        return {};
      },
    },
    lead: { findUnique: async () => ({ source: null, formData: [], email: "julia@example.com", name: "Julia Schneider" }) },
    customer: { findUnique: async () => ({ name: "Max Kannapinn", leadAddress: db.leadAddress }) },
    appointment: {
      findFirst: async () => ({ id: "appt1", startsAt: new Date("2026-11-25T10:00:00Z"), confirmedAt: null, komplettcheck: db.komplettcheck }),
      update: async ({ data }: { data: { komplettcheck?: boolean } }) => {
        if (data.komplettcheck !== undefined) db.komplettcheck = data.komplettcheck;
        return {};
      },
    },
    message: {
      create: async ({ data }: { data: Omit<Msg, "createdAt"> }) => {
        db.messages.push({ ...data, createdAt: new Date(Date.UTC(2026, 10, 21, 10, 0, tick++)) });
        return {};
      },
      findMany: async ({ where }: { where: { kind?: { in: string[] }; body?: { contains: string } } }) =>
        db.messages.filter((m) => m.direction === "internal" && (!where.kind || where.kind.in.includes(m.kind)) && (!where.body || m.body.includes(where.body.contains))),
      findFirst: async () => null,
    },
  },
}));
vi.mock("@/lib/lead-anrede", () => ({ ansprechpartner: async () => ({ advisor: "Max Kannapinn", vermittler: { name: "Max Kannapinn", anrede: "Herr" } }) }));
vi.mock("@/lib/whatsapp/gateway", () => ({
  sendWhatsAppMessage: async (o: { body: string; buttons: { id: string; title: string }[] | null }) => {
    sent.push({ body: o.body, buttons: o.buttons });
    return {};
  },
}));
vi.mock("@/lib/lead-history", () => ({ logLeadHistory: async (_l: string, _k: string, text: string) => void history.push(text) }));
vi.mock("@/lib/experimente", () => ({ variante: async () => "b", ereignis: async () => null, zielErreicht: async () => null }));
vi.mock("@/lib/komplettcheck-dauer", () => ({ komplettcheckVerlaengern: async () => "verlaengert", komplettcheckHinweis: async () => null }));
vi.mock("@/lib/calendar/einladung", () => ({ einladungWennFertig: async () => "warten" }));
vi.mock("@/lib/policen/server", () => ({ policenBitteFuerChat: async () => null }));

const g = await import("@/lib/whatsapp/gespraech");
const strecke = await import("@/lib/whatsapp/termin-strecke");
const { knopfAktion } = await import("@/lib/whatsapp/knopf");
const { cleanQualificationData, qualificationPoints } = await import("@/lib/whatsapp/qualification");
const { kundeWill } = await import("@/lib/terminvorbereitung-neu");

const STRICH = /[–—]/;

describe("Texte", () => {
  it("Frage in Sie und Du, mit bekanntem Partner direkt, ohne Gedankenstriche, ohne Geld", () => {
    expect(g.partnerFrage("sie", false)).toBe("Entscheidet bei der Versicherung noch jemand mit, zum Beispiel Ihr Partner?");
    expect(g.partnerFrage("du", false)).toBe("Entscheidet bei der Versicherung noch jemand mit, zum Beispiel dein Partner?");
    expect(g.partnerFrage("sie", false, "Kindersparplan")).toBe("Entscheidet noch jemand mit, zum Beispiel Ihr Partner?");
    expect(g.PARTNER_FRAGE_RE.test("Entscheidet noch jemand mit, zum Beispiel Ihr Partner?")).toBe(true);
    expect(g.partnerFrage("sie", true)).toBe("Entscheiden Sie bei der Versicherung gemeinsam mit Ihrem Partner?");
    expect(g.partnerFrage("du", true)).toBe("Entscheidest du bei der Versicherung gemeinsam mit deinem Partner?");
    const alle = [true, false].flatMap((b) => [g.partnerFrage("sie", b), g.partnerFrage("du", b), g.partnerDank("sie", b), g.partnerDank("du", b)]);
    for (const t of alle) {
      expect(t).not.toMatch(STRICH);
      expect(t).not.toMatch(/budget|geld|euro|€|kosten|beitrag/i);
      expect(g.PARTNER_FRAGE_RE.test(t)).toBe(/^Entscheide/.test(t));
    }
  });
  it("Dank bei „gemeinsam“: beide zum Termin, Zeit leicht änderbar; sonst kurz", () => {
    expect(g.partnerDank("sie", true)).toBe(
      "Prima, dann kommen Sie am besten zu zweit zum Termin, so können Sie direkt gemeinsam entscheiden. Passt die Zeit nicht für Sie beide, schreiben Sie mir einfach.",
    );
    expect(g.partnerDank("du", true)).toBe("Prima, dann kommt am besten zu zweit zum Termin, so könnt ihr direkt gemeinsam entscheiden. Passt die Zeit nicht für euch beide, schreib mir einfach.");
    expect(g.partnerDank("sie", false)).toBe("Alles klar.");
  });
  it("Knöpfe höchstens 20 Zeichen, Payload partner:ja|nein, an der Frage erkannt", () => {
    expect(g.PARTNER_KNOEPFE.map((k) => k.id)).toEqual(["partner:ja", "partner:nein"]);
    for (const k of g.PARTNER_KNOEPFE) expect(k.title.length).toBeLessThanOrEqual(20);
    expect(g.knoepfeFuerText(`Super! ${g.partnerFrage("sie", false)}`)).toEqual(g.PARTNER_KNOEPFE);
    expect(knopfAktion("interactive", "Ja, gemeinsam", "partner:ja")).toEqual({ aktion: "partner", ja: true });
    expect(knopfAktion("interactive", "Nein, ich allein", "partner:nein")).toEqual({ aktion: "partner", ja: false });
    // getippt zählt nicht als Knopf
    expect(knopfAktion("text", "Ja, gemeinsam", null)).toBeNull();
  });
});

describe("Wann fragen", () => {
  const f = (label: string, value: string) => [{ label, value }];
  it("nicht bei Alleinstehenden bzw. Alleinerziehenden und nicht, wenn die Antwort bekannt ist", () => {
    expect(g.partnerFrageNoetig([], null)).toBe(true);
    expect(g.partnerFrageNoetig(f("Lebenssituation", "Single"), null)).toBe(false);
    expect(g.partnerFrageNoetig([], { lebenssituation: "Alleinerziehend, 2 Kinder" })).toBe(false);
    expect(g.partnerFrageNoetig([], { entscheidung: "Entscheidet allein" })).toBe(false);
    expect(g.partnerFrageNoetig(f("Für wen soll der Schutz gelten?", "Nur für mich"), null)).toBe(true);
  });
  it("Partner bekannt aus „Mit Partner“, „Familie“, verheiratet", () => {
    expect(g.partnerBekannt(f("Für wen soll der Schutz gelten?", "Mit Partner"), null)).toBe(true);
    expect(g.partnerBekannt([], { versichern: "Familie" })).toBe(true);
    expect(g.partnerBekannt(f("Familienstand", "verheiratet"), null)).toBe(true);
    expect(g.partnerBekannt(f("Für wen soll der Schutz gelten?", "Nur für mich"), null)).toBe(false);
  });
});

describe("Getippte Antwort", () => {
  it.each([
    ["Ja", "mit"],
    ["ja, meine Frau", "mit"],
    ["Meine Frau entscheidet mit", "mit"],
    ["wir entscheiden zusammen", "mit"],
    ["nicht allein", "mit"],
    ["Nein", "allein"],
    ["nee, mach ich allein", "allein"],
    ["Ich entscheide das", "allein"],
    ["Was kostet das?", null],
    ["", null],
  ])("%s → %s", (t, erwartet) => {
    expect(g.partnerAusText(t)).toBe(erwartet);
  });
});

describe("Korrektur nach der Antwort", () => {
  it.each([
    ["Nein.... In so fern ich alleine", "mit", "allein"],
    ["nee, ich entscheide allein", "mit", "allein"],
    ["doch, mit meiner Frau zusammen", "allein", "mit"],
    ["Nein", "mit", null],
    ["Ja", "allein", null],
    ["Nein, Donnerstag passt nicht", "mit", null],
    ["alleine", "allein", null],
    ["meine Frau ist auch dabei", "mit", null],
    ["alleine", null, null],
  ] as const)("%s (bisher %s) → %s", (t, bisher, erwartet) => {
    expect(g.partnerKorrektur(t, bisher)).toBe(erwartet);
  });
  it("Hinweis passt zur neuen Angabe", () => {
    expect(g.partnerKorrekturHinweis("allein")).toContain("allein");
    expect(g.partnerKorrekturHinweis("allein")).toContain("„Sie beide“");
    expect(g.partnerKorrekturHinweis("mit")).toContain("gemeinsam zum Termin");
  });
  it("Bot wertet die Korrektur aus", () => {
    const bot = readFileSync("src/lib/whatsapp/bot.ts", "utf8");
    expect(bot).toContain("partnerKorrektur(latest.body, partnerVor.antwortArt)");
    expect(bot).toContain("partnerHinweis = partnerKorrekturHinweis(neu)");
  });
});

describe("Ablauf nach dem Komplettcheck", () => {
  beforeEach(() => {
    db.messages = [];
    db.qualificationData = null;
    db.komplettcheck = null;
    db.leadAddress = "sie";
    sent.length = 0;
    history.length = 0;
  });

  it("„Ja, gern“ → Frage in derselben Nachricht wie „Super!“, mit Knöpfen; „Ja, gemeinsam“ → gespeichert, Vermerk, dann Vertragsfrage mit Dank", async () => {
    await strecke.komplettcheckAntwort("conv", true);
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toBe("Super! Entscheidet bei der Versicherung noch jemand mit, zum Beispiel Ihr Partner?");
    expect(sent[0].buttons).toEqual(g.PARTNER_KNOEPFE);
    const s = await strecke.streckenStand("conv", "appt1");
    expect(strecke.partnerFrageOffen(s)).toBe(true);

    expect(await strecke.partnerAntwort("conv", "mit")).toBe(true);
    expect(cleanQualificationData(db.qualificationData)).toEqual({ entscheidung: "Partner entscheidet mit, soll beim Termin dabei sein" });
    expect(history).toEqual(["Komplettcheck gewünscht (per WhatsApp)", "Partner entscheidet mit, soll beim Termin dabei sein (per WhatsApp)"]);
    expect(sent[1].body).toMatch(/^Prima, dann kommen Sie am besten zu zweit zum Termin, .+ schreiben Sie mir einfach\. Damit Herr Kannapinn sieht, ob Sie irgendwo doppelt zahlen: /);
    expect(strecke.partnerFrageOffen(await strecke.streckenStand("conv", "appt1"))).toBe(false);
    // doppelter Klick: nichts mehr
    expect(await strecke.partnerAntwort("conv", "mit")).toBe(true);
    expect(sent).toHaveLength(2);
  });

  it("„Nein, danke“ und „ich allein“: Schluss mit „Alles klar. Damit ist alles Wichtige … notiert.“, kein Vermerk", async () => {
    await strecke.komplettcheckAntwort("conv", false);
    expect(sent[0].body).toBe("Alles klar. Entscheidet bei der Versicherung noch jemand mit, zum Beispiel Ihr Partner?");
    await strecke.partnerAntwort("conv", "allein");
    expect(cleanQualificationData(db.qualificationData)).toEqual({ entscheidung: "Entscheidet allein" });
    expect(history).toEqual([]);
    expect(sent[1].body).toMatch(/^Alles klar\. Damit ist alles Wichtige für Herrn Kannapinn notiert\./);
    expect(sent[1].body).toContain("Stimmt die Adresse?");
  });

  it("Du-Fassung mit bekanntem Partner", async () => {
    db.leadAddress = "du";
    db.qualificationData = { versichern: "Mit Partner" };
    await strecke.komplettcheckAntwort("conv", false);
    expect(sent[0].body).toBe("Alles klar. Entscheidest du bei der Versicherung gemeinsam mit deinem Partner?");
  });

  it("ohne Antwort: weiter ohne Angabe, nichts gespeichert", async () => {
    await strecke.komplettcheckAntwort("conv", false);
    await strecke.partnerAntwort("conv", "ohne_antwort");
    expect(db.qualificationData).toBeNull();
    expect(sent[1].body).toMatch(/^Damit ist alles Wichtige für Herrn Kannapinn notiert\./);
  });

  it("Antwort schon bekannt bzw. Single: keine Frage, direkt weiter wie bisher", async () => {
    db.qualificationData = { lebenssituation: "Single" };
    await strecke.komplettcheckAntwort("conv", true);
    expect(sent).toHaveLength(1);
    expect(sent[0].body).not.toMatch(g.PARTNER_FRAGE_RE);
    expect(sent[0].body).toMatch(/^Super! Damit Herr Kannapinn sieht, ob Sie irgendwo doppelt zahlen:/);
  });
});

describe("Speicher und Anzeige für den Vermittler", () => {
  it("entscheidung ist ein Qualifizierungspunkt („Entscheidung“)", () => {
    expect(qualificationPoints({ entscheidung: "Entscheidet allein" })).toEqual([{ key: "entscheidung", label: "Entscheidung", value: "Entscheidet allein" }]);
  });
  const d = (angaben: unknown) =>
    ({
      lead: { name: "Julia", telefon: null, email: null, adresse: null, produkt: "Privatschutz" },
      termin: { startsAt: new Date(), mode: "video", berater: "Max", meetUrl: null },
      zusammenfassung: null,
      formular: [],
      angaben,
      vorbereitetAm: null,
    }) as Parameters<typeof kundeWill>[0];
  it("Terminvorbereitung: „Partner entscheidet mit“ gleich nach dem Interesse, „allein“ weiter unten", () => {
    const mit = kundeWill(d({ interesse: "Haftpflicht", lebenssituation: "Familie", vorhanden: "keine", anlass: "Umzug", einwaende: "Preis", entscheidung: "Partner entscheidet mit, soll beim Termin dabei sein" }));
    expect(mit.punkte[1]).toBe("Partner entscheidet mit, soll beim Termin dabei sein");
    const allein = kundeWill(d({ interesse: "Haftpflicht", entscheidung: "Entscheidet allein" }));
    expect(allein.punkte).toEqual(["Haftpflicht", "Entscheidet allein"]);
  });
});

describe("Einbindung", () => {
  const strSrc = readFileSync("src/lib/whatsapp/termin-strecke.ts", "utf8");
  const bot = readFileSync("src/lib/whatsapp/bot.ts", "utf8");
  it("Frage kommt nach dem Komplettcheck (auch nach dem Zeitangebot und von der Buchungsseite), vor der ersten Angebotsfrage", () => {
    expect(strSrc).toMatch(/async function weiterNachKomplettcheck[\s\S]*?if \(await sendePartnerFrage\(k, prefix\)\) return;[\s\S]*?weiterZumAngebot\(k, prefix, schlussEinleitung\)/);
  });
  it("ohne Antwort nach 1 Std. weiter (auch nach einer Rückfrage), getippte Antwort ohne Assistent, keine Angebotsfragen solange offen", () => {
    expect(strSrc).toMatch(/if \(partnerFrageOffen\(stand\)\) \{[\s\S]*?partnerAntwort\(m\.conversationId, "ohne_antwort", now\)/);
    expect(bot).toContain("const art = partnerAusText(latest.body);");
    expect(bot).toContain("strecke.komplettcheckErledigt(stand) && !partnerWartet");
    const regel = g.nachBuchungRegel({ an: "sie", person: { nom: "Herr K", dat: "Herrn K" } as never, fragen: [{ text: "x", feld: "geburt" }], partnerOffen: true, abschlussGesendet: false, zugesagt: false });
    expect(regel).toContain("ob noch jemand mitentscheidet");
    expect(regel).not.toContain("Angebotsfragen, nur für die Beitragsberechnung");
  });
});

// Ole, 21.11.2026 spät: „als eigene Frage VOR dem Terminvorschlag, damit der Termin nicht verlegt werden muss“.
// Splittest partner_vor_termin: a = eigene Frage (Standard), b = Halbsatz im Terminvorschlag plus Frage nach der Buchung.
describe("Vor dem Terminvorschlag", () => {
  const person = { nom: "Herr Kannapinn", dat: "Herrn Kannapinn" } as never;
  const vorschlag = (o: Partial<Parameters<typeof g.terminVorschlagText>[0]> = {}) =>
    g.terminVorschlagText({ an: "sie", source: null, formular: [], person, zeiten: ["Mo 10 Uhr", "Di 14 Uhr"], video: true, ...o });

  beforeEach(() => {
    db.messages = [];
    db.qualificationData = null;
    db.komplettcheck = null;
    db.leadAddress = "sie";
    sent.length = 0;
    history.length = 0;
  });

  it("Frage als eigene Nachricht mit „Danke!“ (bzw. kurzer Antwort des Assistenten), Sie und Du, bekannter Partner", () => {
    expect(g.partnerVorFrageText("sie", false)).toBe("Danke! Entscheidet bei der Versicherung noch jemand mit, zum Beispiel Ihr Partner?");
    expect(g.partnerVorFrageText("du", false)).toBe("Danke! Entscheidet bei der Versicherung noch jemand mit, zum Beispiel dein Partner?");
    expect(g.partnerVorFrageText("sie", true)).toBe("Danke! Entscheiden Sie bei der Versicherung gemeinsam mit Ihrem Partner?");
    expect(g.partnerVorFrageText("du", true)).toBe("Danke! Entscheidest du bei der Versicherung gemeinsam mit deinem Partner?");
    expect(g.partnerVorFrageText("sie", false, "Gern, das ist kostenlos.")).toBe("Gern, das ist kostenlos. Entscheidet bei der Versicherung noch jemand mit, zum Beispiel Ihr Partner?");
    // gleiche Knöpfe wie nach der Buchung
    expect(g.knoepfeFuerText(g.partnerVorFrageText("sie", false))).toEqual(g.PARTNER_KNOEPFE);
  });

  it("nach „gemeinsam“ beginnt der Terminvorschlag mit „Zeiten, die für Sie beide passen“; sonst „Danke!“; ohne Antwort ohne Einleitung", () => {
    expect(g.partnerVorschlagEinleitung("sie")).toBe("Prima, dann schlage ich Zeiten vor, die für Sie beide passen.");
    expect(g.partnerVorschlagEinleitung("du")).toBe("Prima, dann schlage ich Zeiten vor, die für euch beide passen.");
    expect(vorschlag({ einleitung: g.partnerVorschlagEinleitung("sie") })).toMatch(/^Prima, dann schlage ich Zeiten vor, die für Sie beide passen\. In einem kurzen Videotermin .+ Passt Ihnen Mo 10 Uhr oder Di 14 Uhr\?$/);
    expect(vorschlag()).toMatch(/^Danke! In einem kurzen Videotermin/);
    expect(vorschlag({ dank: false })).toMatch(/^In einem kurzen Videotermin/);
  });

  it("Fassung b: Halbsatz am Ende des Terminvorschlags (nicht beim erneuten Vorschlag)", () => {
    expect(g.partnerSatzImVorschlag("sie", true)).toBe("Entscheiden Sie bei der Versicherung gemeinsam mit Ihrem Partner? Dann wählen Sie gern eine Zeit, die für Sie beide passt.");
    expect(g.partnerSatzImVorschlag("du", true)).toBe("Entscheidest du bei der Versicherung gemeinsam mit deinem Partner? Dann wähl gern eine Zeit, die für euch beide passt.");
    expect(g.partnerSatzImVorschlag("sie", false)).toBe("Entscheidet bei der Versicherung noch jemand mit, zum Beispiel Ihr Partner? Dann wählen Sie gern eine Zeit, die für Sie beide passt.");
    expect(vorschlag({ partnerSatz: g.partnerSatzImVorschlag("sie", true) })).toMatch(
      /Passt Ihnen Mo 10 Uhr oder Di 14 Uhr\? Entscheiden Sie bei der Versicherung gemeinsam mit Ihrem Partner\? Dann wählen Sie gern eine Zeit, die für Sie beide passt\.$/,
    );
    expect(vorschlag({ partnerSatz: "x", erneut: true })).toBe("Passt Ihnen Mo 10 Uhr oder Di 14 Uhr?");
  });

  it("keine Gedankenstriche, kein Geld; Hinweis für den Assistenten lässt die Buchung vorgehen", () => {
    const alle = (["sie", "du"] as const).flatMap((an) => [true, false].flatMap((b) => [g.partnerVorFrageText(an, b), g.partnerSatzImVorschlag(an, b), g.partnerVorschlagEinleitung(an)]));
    for (const t of alle) {
      expect(t).not.toMatch(STRICH);
      expect(t).not.toMatch(/budget|geld|euro|€|kosten|beitrag/i);
    }
    expect(g.PARTNER_VOR_HINWEIS).toContain("termin_vorschlagen");
    expect(g.PARTNER_VOR_HINWEIS).toContain("Wunschzeit");
    expect(g.PARTNER_VOR_HINWEIS).toContain("angaben.entscheidung");
  });

  it("Terminwunsch erkannt (dann keine Frage vorab, die Buchung geht vor); „zu zweit“ heißt Partner bekannt", async () => {
    const { nenntTerminwunsch } = await import("@/lib/whatsapp/zwischenfrage");
    expect(nenntTerminwunsch("Können wir morgen telefonieren?")).toBe(true);
    expect(nenntTerminwunsch("ja, meine Frau, Montag 10 Uhr")).toBe(true);
    expect(nenntTerminwunsch("Ja, gemeinsam")).toBe(false);
    expect(nenntTerminwunsch("Beides neu")).toBe(false);
    expect(g.PARTNER_AUSDRUECKLICH_RE.test("ja, meine Frau, Montag 10 Uhr")).toBe(true);
    expect(g.PARTNER_AUSDRUECKLICH_RE.test("ja, Montag 10 Uhr")).toBe(false);
    expect(g.partnerBekannt([], { versichern: "Zu zweit" })).toBe(true);
  });

  it("Stand: offen bis Antwort bzw. Terminvorschlag; zählt nicht im Stand je Termin", async () => {
    let s = await strecke.partnerVorStand("conv");
    expect(s).toMatchObject({ frageAt: null, vorschlaege: 0 });
    expect(strecke.partnerVorOffen(s)).toBe(false);
    await strecke.merke("conv", strecke.STRECKE.partnerVorFrage, { bekannt: true });
    s = await strecke.partnerVorStand("conv");
    expect(s.bekannt).toBe(true);
    expect(strecke.partnerVorOffen(s)).toBe(true);
    // Vorschlag vom Assistenten (nach einer Rückfrage): nicht mehr offen fürs Nachholen, eine Antwort zählt aber noch
    await strecke.merke("conv", strecke.STRECKE.vorschlag, { starts: [] });
    s = await strecke.partnerVorStand("conv");
    expect(strecke.partnerVorOffen(s)).toBe(false);
    expect(strecke.partnerVorUnbeantwortet(s)).toBe(true);
    expect(s.vorschlaege).toBe(1);
    await strecke.merke("conv", strecke.STRECKE.partnerVorAntwort, { art: "mit" });
    expect(strecke.partnerVorUnbeantwortet(await strecke.partnerVorStand("conv"))).toBe(false);
    expect(strecke.partnerFrageOffen(await strecke.streckenStand("conv", "appt1"))).toBe(false);
  });

  it("Knopf, wenn inzwischen gebucht: gespeichert, kurzer Dank; danach keine Frage nach der Buchung mehr", async () => {
    await strecke.merke("conv", strecke.STRECKE.partnerVorFrage, { bekannt: false });
    expect(await strecke.partnerVorNachBuchung("conv", "mit")).toBe(true);
    expect(cleanQualificationData(db.qualificationData)).toEqual({ entscheidung: "Partner entscheidet mit, soll beim Termin dabei sein" });
    expect(sent.at(-1)!.body).toBe(g.partnerDank("sie", true));
    expect(history).toEqual(["Partner entscheidet mit, soll beim Termin dabei sein (per WhatsApp)"]);
    expect(await strecke.partnerVorNachBuchung("conv", "mit")).toBe(false);
    sent.length = 0;
    await strecke.komplettcheckAntwort("conv", true);
    expect(sent[0].body).not.toMatch(g.PARTNER_FRAGE_RE);
  });

  it("vorab unbeantwortet: nach der Buchung kommt die Frage noch einmal", async () => {
    await strecke.merke("conv", strecke.STRECKE.partnerVorFrage, { bekannt: false });
    await strecke.merke("conv", strecke.STRECKE.partnerVorAntwort, { art: "ohne_antwort" });
    await strecke.komplettcheckAntwort("conv", true);
    expect(sent[0].body).toBe("Super! Entscheidet bei der Versicherung noch jemand mit, zum Beispiel Ihr Partner?");
  });

  const botSrc = readFileSync("src/lib/whatsapp/bot.ts", "utf8");
  const strSrc = readFileSync("src/lib/whatsapp/termin-strecke.ts", "utf8");
  const cron = readFileSync("src/app/api/whatsapp/cron/route.ts", "utf8");
  it("Einbindung: Frage statt des ersten Terminvorschlags (Splittest), Antwort ohne Assistent, Nachholen nach 30 Min. im Cron", () => {
    expect(botSrc).toContain('const v: "a" | "b" = "a";');
    expect(botSrc).toMatch(/if \(v === "a"\) \{\s*zug\.partnerVor = \{ text: partnerVorFrageText\(/);
    expect(botSrc).toContain("partnerSatz = partnerSatzImVorschlag(ansprache, bekannt, lead?.source ?? null);");
    // nur beim ersten Vorschlag, nie bei Terminwunsch bzw. vom Assistenten gewählten Zeiten
    expect(botSrc).toMatch(/partnerVor\.vorschlaege === 0 &&[\s\S]*?nenntTerminwunsch\(latest\.body\)\) &&\s*partnerFrageNoetig\(form\.normal, angabenJetzt\)/);
    expect(botSrc).toContain("!(Array.isArray(input.starts) && input.starts.length)");
    expect(botSrc).toContain('einleitung: partnerJetzt.art === "mit" ? partnerVorschlagEinleitung(ansprache) : null');
    expect(botSrc).toContain("!zug.gebucht && !appSchreibt()");
    expect(strSrc).toContain("export const PARTNER_VOR_WARTEN = 30 * 60 * 1000;");
    expect(strSrc).toContain("await runBotTurn(conversationId, { partnerNachholen: true });");
    expect(cron).toContain("m.runPartnerVorTerminNachholen(now)");
  });

  it("kein Splittest (Ole, 22.11.2026): immer eigene Frage vor dem Terminvorschlag", async () => {
    const { EXPERIMENTE } = await vi.importActual<typeof import("@/lib/experimente")>("@/lib/experimente");
    expect(Object.keys(EXPERIMENTE)).not.toContain("partner_vor_termin");
    expect(readFileSync("src/lib/whatsapp/bot.ts", "utf8")).toContain('const v: "a" | "b" = "a";');
  });

});
