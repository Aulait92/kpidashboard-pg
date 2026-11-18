// Terminkarte im Kontakt: Hauptknopf je nach Zeit, Grenzen exakt (lib/termin-karte.ts).
import { describe, expect, it } from "vitest";
import { angebotOffen, TERMIN_VORLAUF_MS, terminKartenAktionen, terminPhase } from "@/lib/termin-karte";

const MIN = 60 * 1000;
const start = new Date("2026-11-18T09:00:00.000Z");
const video = { startsAt: start, endsAt: new Date(start.getTime() + 45 * MIN), mode: "video", meetUrl: "https://meet.google.com/x" };
const at = (ms: number) => new Date(start.getTime() + ms);
const f = (now: Date, o: Partial<{ telefon: boolean; angebotOffen: boolean }> = {}) => ({ now, telefon: true, angebotOffen: true, ...o });

describe("terminPhase", () => {
  it("vorher bis 1 ms vor der 10-Minuten-Grenze, genau 10 Minuten vorher schon jetzt", () => {
    expect(TERMIN_VORLAUF_MS).toBe(10 * MIN);
    expect(terminPhase(video, at(-10 * MIN - 1))).toBe("vorher");
    expect(terminPhase(video, at(-10 * MIN))).toBe("jetzt");
  });
  it("jetzt bis 1 ms vor dem Ende, genau zum Ende nachher", () => {
    expect(terminPhase(video, at(45 * MIN - 1))).toBe("jetzt");
    expect(terminPhase(video, at(45 * MIN))).toBe("nachher");
  });
  it("ohne endsAt: Ende nach 30 Minuten (Standarddauer)", () => {
    const t = { startsAt: start, mode: "video" };
    expect(terminPhase(t, at(30 * MIN - 1))).toBe("jetzt");
    expect(terminPhase(t, at(30 * MIN))).toBe("nachher");
  });
});

describe("terminKartenAktionen", () => {
  it("vorher: Vorbereiten, daneben Präsentation und Verschieben, Videocall unter Mehr", () => {
    const a = terminKartenAktionen(video, f(at(-60 * MIN)));
    expect(a).toMatchObject({ phase: "vorher", haupt: "vorbereiten", zweit: ["praesentation", "verschieben"], mehr: ["videocall"] });
    expect(a.naechsterWechsel?.toISOString()).toBe(at(-10 * MIN).toISOString());
  });
  it("vorher, schon vorbereitet: ruhig, kein blauer Hauptknopf; Präsentation zuerst, Vorbereitung daneben (Ole, 18.11.2026)", () => {
    const a = terminKartenAktionen(video, { ...f(at(-24 * 60 * MIN)), vorbereitet: true });
    expect(a).toMatchObject({ phase: "vorher", haupt: "praesentation", ruhig: true, zweit: ["vorbereiten", "verschieben"], mehr: ["videocall"] });
    expect(terminKartenAktionen(video, f(at(-60 * MIN))).ruhig).toBe(false);
    // ab 10 Minuten vorher zählt wieder der Termin selbst
    expect(terminKartenAktionen(video, { ...f(at(-5 * MIN)), vorbereitet: true })).toMatchObject({ haupt: "videocall", ruhig: false });
  });
  it("10 Minuten vorher: Videocall starten, Verschieben nur noch unter Mehr", () => {
    const a = terminKartenAktionen(video, f(at(-10 * MIN)));
    expect(a).toMatchObject({ phase: "jetzt", haupt: "videocall", zweit: ["praesentation", "vorbereiten"] });
    expect(a.mehr).toEqual(["anrufen", "verschieben"]);
    expect(a.naechsterWechsel?.toISOString()).toBe(at(45 * MIN).toISOString());
  });
  it("läuft: kein Verschieben mehr", () => {
    const a = terminKartenAktionen(video, f(at(5 * MIN)));
    expect(a.haupt).toBe("videocall");
    expect(a.mehr).toEqual(["anrufen"]);
  });
  it("Telefontermin: Anrufen", () => {
    const a = terminKartenAktionen({ startsAt: start, mode: "phone" }, f(at(-3 * MIN)));
    expect(a.haupt).toBe("anrufen");
    expect(a.zweit).toEqual(["praesentation", "vorbereiten"]);
  });
  it("Videotermin ohne Link: Anrufen; ohne Telefonnummer Vorbereiten", () => {
    const ohneLink = { startsAt: start, mode: "video", meetUrl: null };
    expect(terminKartenAktionen(ohneLink, f(at(0))).haupt).toBe("anrufen");
    expect(terminKartenAktionen(ohneLink, f(at(0), { telefon: false })).haupt).toBe("vorbereiten");
  });
  it("nachher: Ergebnis eintragen", () => {
    const a = terminKartenAktionen(video, f(at(45 * MIN)));
    expect(a).toMatchObject({ phase: "nachher", haupt: "ergebnis", zweit: ["praesentation", "vorbereiten"], mehr: [], naechsterWechsel: null });
  });
  it("nachher, erschienen und Angebot offen: Angebot senden, Ergebnis daneben", () => {
    const a = terminKartenAktionen({ ...video, attendance: "erschienen" }, f(at(45 * MIN)));
    expect(a).toMatchObject({ haupt: "angebot", zweit: ["ergebnis", "praesentation"], mehr: ["vorbereiten"] });
  });
  it("erschienen, Angebot schon raus: Ergebnis eintragen", () => {
    expect(terminKartenAktionen({ ...video, attendance: "erschienen" }, f(at(50 * MIN), { angebotOffen: false })).haupt).toBe("ergebnis");
  });
  it("erschienen, aber noch während des Termins: weiter Videocall", () => {
    expect(terminKartenAktionen({ ...video, attendance: "erschienen" }, f(at(20 * MIN))).haupt).toBe("videocall");
  });
  it("nie mehr als zwei Zweitknöpfe", () => {
    for (const ms of [-120 * MIN, -10 * MIN, 0, 60 * MIN]) {
      for (const attendance of [null, "erschienen", "fehlt"]) {
        expect(terminKartenAktionen({ ...video, attendance }, f(at(ms))).zweit.length).toBeLessThanOrEqual(2);
      }
    }
  });
});

describe("angebotOffen", () => {
  it("offen bis Angebot gesendet, Abschluss, verloren oder Storno", () => {
    expect(angebotOffen("Termin vereinbart")).toBe(true);
    expect(angebotOffen(null)).toBe(true);
    for (const s of ["Angebot gesendet", "Angebot verschickt", "Abschluss", "Kein Interesse", "Disqualifiziert", "Storniert"]) expect(angebotOffen(s)).toBe(false);
  });
});
