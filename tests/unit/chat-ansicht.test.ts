// Chat-Ansicht neu (Ole, 17.11.2026): Verlauf, Avatare, Ereignisse, Sparten, nächster Schritt
import { describe, expect, it } from "vitest";
import {
  absenderVon,
  avatarFarbe,
  ereignisVon,
  initialen,
  kalenderblatt,
  sparten,
  tagLabel,
  terminKurz,
  verlaufAufbauen,
  type VerlaufNachricht,
} from "@/lib/chat-ansicht";
import { chatNaechsterSchritt, type ChatSchrittFakten } from "@/lib/chat-naechster-schritt";
import { hatGedankenstrich } from "@/lib/gedankenstriche";

// Di., 17.11.2026, 20:00 Uhr in Berlin
const NOW = Date.parse("2026-11-17T19:00:00Z");
const H = 3_600_000;

describe("Avatar", () => {
  it("zwei Initialen aus Vor- und Nachname", () => {
    expect(initialen("Ole Kannapinn")).toBe("OK");
    expect(initialen("Anna-Lena  von Müller")).toBe("AM");
    expect(initialen("Kai")).toBe("KA");
    expect(initialen("4915112345678")).toBe("49");
    expect(initialen("")).toBe("··");
  });
  it("Farbe stabil aus dem Namen", () => {
    expect(avatarFarbe("Ole Kannapinn")).toEqual(avatarFarbe("ole kannapinn "));
    const farben = new Set(["Ole Kannapinn", "Dominik Schmid", "Sarah Scholz", "Eva Pohl", "Nina Winter", "Max Muster"].map((n) => avatarFarbe(n).bg));
    expect(farben.size).toBeGreaterThan(2);
  });
});

describe("Zeiten", () => {
  it("Tagestrenner Heute, Gestern, Datum", () => {
    expect(tagLabel(new Date(NOW - H), NOW)).toBe("Heute");
    expect(tagLabel(new Date(NOW - 24 * H), NOW)).toBe("Gestern");
    expect(tagLabel(new Date(NOW - 4 * 24 * H), NOW)).toBe("Fr., 13.11.");
    expect(tagLabel(new Date("2025-12-30T10:00:00Z"), NOW)).toContain("2025");
  });
  it("Termin kurz und Kalenderblatt", () => {
    const morgen = new Date("2026-11-18T15:00:00Z");
    expect(terminKurz(morgen, NOW)).toBe("Morgen 16:00");
    expect(kalenderblatt(morgen)).toMatchObject({ wochentag: "MI", tag: "18" });
  });
});

describe("Absender", () => {
  it("Lead, Assistent, Vermittler", () => {
    expect(absenderVon("inbound", null)).toBe("lead");
    expect(absenderVon("outbound", "bot")).toBe("assistent");
    expect(absenderVon("outbound", "system")).toBe("assistent");
    expect(absenderVon("outbound", "agent")).toBe("ich");
    expect(absenderVon("outbound", "app")).toBe("ich");
  });
});

describe("Ereignisse", () => {
  const termine = new Map([["t1", new Date("2026-11-18T15:00:00Z")]]);
  it("Termin zugesagt nennt die Zeit über die Termin-ID", () => {
    const e = ereignisVon("appointment_confirmed", JSON.stringify({ appointmentId: "t1" }), termine);
    expect(e?.label).toBe("Termin zugesagt");
    expect(e?.detail).toBe("Mi., 18.11. um 16:00");
    expect(e?.ton).toBe("gut");
  });
  it("gebucht und verschoben aus dem Inhalt", () => {
    expect(ereignisVon("appointment_booked", JSON.stringify({ start: "2026-11-18T15:00:00Z" }))?.detail).toBe("Mi., 18.11. um 16:00");
    expect(ereignisVon("appointment_rescheduled", JSON.stringify({ auf: "2026-11-18T15:00:00Z" }))?.detail).toBe("auf Mi., 18.11. um 16:00");
    expect(ereignisVon("appointment_booked", "kein json")?.detail).toBeNull();
  });
  it("Sicht: an Sie bzw. an den Berater; Unbekanntes null", () => {
    expect(ereignisVon("handover", "{}")?.label).toBe("An Sie übergeben");
    expect(ereignisVon("handover", "{}", undefined, "admin")?.label).toBe("An den Berater übergeben");
    expect(ereignisVon("komplettcheck_frage", "{}")).toBeNull();
  });
  it("keine Gedankenstriche in den Texten", () => {
    for (const k of ["qualification", "appointment_booked", "appointment_confirmed", "handover", "ki_handover", "advice_blocked", "opt_out", "lead_lost", "followup_scheduled"]) {
      expect(hatGedankenstrich(ereignisVon(k, "{}")!.label)).toBe(false);
    }
  });
});

describe("Verlauf", () => {
  const m = (id: string, agoH: number, direction: string, sentBy: string | null, kind = "text"): VerlaufNachricht => ({
    id,
    direction,
    kind,
    body: id,
    sentBy,
    createdAt: new Date(NOW - agoH * H),
  });
  it("Tagestrenner, Absenderwechsel, Ereignisse beginnen neue Gruppe, unbekannte intern weg", () => {
    const v = verlaufAufbauen(
      [
        m("a", 26, "outbound", "bot"),
        m("b", 5, "outbound", "bot"),
        m("c", 4.9, "outbound", "bot"),
        m("d", 4.8, "inbound", null),
        m("e", 4.7, "internal", "system", "appointment_confirmed"),
        m("f", 4.6, "inbound", null),
        m("g", 4.5, "outbound", "agent"),
        m("h", 4.4, "internal", "bot", "komplettcheck_frage"),
      ],
      NOW,
    );
    expect(v.map((e) => (e.art === "tag" ? e.label : e.art === "nachricht" ? `${e.m.id}${e.wechsel ? "!" : ""}` : `[${e.m.id}]`))).toEqual([
      "Gestern",
      "a!",
      "Heute",
      "b!",
      "c",
      "d!",
      "[e]",
      "f!",
      "g!",
    ]);
  });
  it("Admin zeigt unbekannte interne Nachrichten", () => {
    const v = verlaufAufbauen([m("h", 1, "internal", "bot", "komplettcheck_frage")], NOW, { unbekannteZeigen: true });
    expect(v.some((e) => e.art === "ereignis" && e.ereignis === null)).toBe(true);
  });
});

describe("Sparten", () => {
  it("aus dem Interesse, ohne Produkt und Dopplungen", () => {
    expect(sparten("Haftpflicht, Hausrat und Unfall; haftpflicht", "Privatschutz")).toEqual(["Haftpflicht", "Hausrat", "Unfall"]);
    expect(sparten("Privatschutz", "Privatschutz")).toEqual([]);
    expect(sparten(null, "PKV")).toEqual([]);
  });
});

describe("Nächster Schritt im Chat", () => {
  const basis: ChatSchrittFakten = {
    leadId: "l1",
    status: "Im Gespräch",
    stepState: "ok",
    botActive: true,
    wartet: null,
    fensterOffen: true,
    optOut: false,
    termin: null,
    ergebnisTerminId: null,
    wiedervorlage: null,
    nachfassenBereit: false,
    now: NOW,
  };
  const termin = { id: "t1", startsAt: new Date(NOW + 20 * H), endsAt: null, mode: "video", meetUrl: "https://meet", preparedAt: null, komplettcheck: true };
  it("ohne Lead: als Lead übernehmen", () => {
    expect(chatNaechsterSchritt({ ...basis, leadId: null }).art).toBe("lead_uebernehmen");
  });
  it("Ergebnis fehlt geht vor allem anderen", () => {
    expect(chatNaechsterSchritt({ ...basis, stepState: "result_missing", ergebnisTerminId: "t0", wartet: { grund: "x" } }).art).toBe("ergebnis");
  });
  it("wartet: antworten bzw. anrufen bei geschlossenem Fenster", () => {
    const s = chatNaechsterSchritt({ ...basis, wartet: { grund: "Fragt nach dem Preis" } });
    expect(s).toMatchObject({ art: "antworten", dringend: true, text: "Fragt nach dem Preis" });
    expect(chatNaechsterSchritt({ ...basis, wartet: { grund: null }, fensterOffen: false }).art).toBe("anrufen");
  });
  it("Termin: vorbereiten, dann Präsentation, kurz vorher Videocall", () => {
    const s = chatNaechsterSchritt({ ...basis, termin });
    expect(s).toMatchObject({ art: "termin_vorbereiten", titel: "Termin vorbereiten", text: "Morgen 16:00 · Komplettcheck gewünscht" });
    expect(s.href).toBe("/buyer/termine/t1/vorbereitung?von=kontakt");
    expect(chatNaechsterSchritt({ ...basis, termin: { ...termin, preparedAt: new Date(NOW) } }).art).toBe("praesentation");
    expect(chatNaechsterSchritt({ ...basis, termin: { ...termin, startsAt: new Date(NOW + 10 * 60_000) } })).toMatchObject({ art: "videocall", href: "https://meet" });
    expect(chatNaechsterSchritt({ ...basis, termin: { ...termin, mode: "phone", startsAt: new Date(NOW - 10 * 60_000) } })).toMatchObject({ art: "anrufen", titel: "Termin läuft" });
  });
  it("Angebot und Wiedervorlage: nachfassen", () => {
    const s = chatNaechsterSchritt({ ...basis, status: "Angebot gesendet", botActive: false, wiedervorlage: { at: new Date(NOW - H), note: "Angebot nachfassen" } });
    expect(s).toMatchObject({ art: "anrufen", titel: "Angebot nachfassen", text: "Heute 19:00" });
    expect(chatNaechsterSchritt({ ...basis, status: "Angebot gesendet", fensterOffen: false, nachfassenBereit: true }).art).toBe("nachfassen_senden");
  });
  it("Abschluss, verloren, fehlender Schritt, Assistent", () => {
    expect(chatNaechsterSchritt({ ...basis, status: "Abschluss" })).toMatchObject({ art: "kontakt", href: "/buyer/leads/l1" });
    expect(chatNaechsterSchritt({ ...basis, status: "Disqualifiziert" }).knopf).toBeNull();
    expect(chatNaechsterSchritt({ ...basis, stepState: "missing", botActive: false }).art).toBe("festlegen");
    expect(chatNaechsterSchritt(basis)).toMatchObject({ art: "termin_buchen", knopf: "Termin selbst buchen" });
  });
});
