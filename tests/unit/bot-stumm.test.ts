// Sicherheitsnetz „Assistent stumm“ (lib/whatsapp/bot-stumm.ts): welche Lead-Nachrichten als unbeantwortet gelten,
// Text an den Lead in Sie und Du ohne Gedankenstriche, Aufgabentext.
import { describe, expect, it } from "vitest";
import { stummAntwort, stummAufgabe, unbeantwortete } from "@/lib/whatsapp/bot-stumm";

const t0 = new Date("2026-11-19T18:00:00Z");
const at = (sek: number) => new Date(t0.getTime() + sek * 1000);
let n = 0;
const z = (direction: string, sek: number, o: { kind?: string; sentBy?: string | null } = {}) => ({
  id: `m${++n}`,
  direction,
  kind: o.kind ?? "text",
  sentBy: o.sentBy ?? (direction === "outbound" ? "bot" : null),
  createdAt: at(sek),
});

describe("unbeantwortete", () => {
  const now = at(3600);
  it("Antwort binnen 2 Minuten: nichts; ohne Antwort: gemeldet, bis heute offen", () => {
    expect(unbeantwortete([z("inbound", 0), z("outbound", 30)], { now })).toEqual([]);
    const r = unbeantwortete([z("inbound", 0)], { now });
    expect(r).toHaveLength(1);
    expect(r[0].spaeterBeantwortet).toBe(false);
  });
  it("Antwort erst nach 5 Minuten: gemeldet, aber später beantwortet", () => {
    const r = unbeantwortete([z("inbound", 0), z("outbound", 300)], { now });
    expect(r).toHaveLength(1);
    expect(r[0].spaeterBeantwortet).toBe(true);
  });
  it("mehrere Nachrichten kurz hintereinander: nur die letzte zählt", () => {
    const zeilen = [z("inbound", 0), z("inbound", 60), z("outbound", 100)];
    expect(unbeantwortete(zeilen, { now })).toEqual([]);
    const ohne = [z("inbound", 0), z("inbound", 60)];
    expect(unbeantwortete(ohne, { now }).map((x) => x.id)).toEqual([ohne[1].id]);
  });
  it("jünger als die Grenze, Reaktionen, nach Übergabe bzw. Antwort des Vermittlers: nicht gemeldet", () => {
    expect(unbeantwortete([z("inbound", 3550)], { now })).toEqual([]);
    expect(unbeantwortete([z("inbound", 0, { kind: "reaction" })], { now })).toEqual([]);
    expect(unbeantwortete([z("internal", -10, { kind: "ki_handover", sentBy: "bot" }), z("inbound", 0)], { now })).toEqual([]);
    expect(unbeantwortete([z("outbound", -10, { sentBy: "agent" }), z("inbound", 0)], { now })).toEqual([]);
  });
  it("nach „Kalender voll“ übernimmt der Mensch: spätere Höflichkeit gilt nicht als unbeantwortet (Ole, 24.11.2026)", () => {
    // Lead „Dankeschön“ nach der Übergabe (Kalender voll): der Assistent ist pausiert, kein „bot stumm“-Fall
    expect(unbeantwortete([z("internal", -10, { kind: "kalender_voll", sentBy: "system" }), z("inbound", 0)], { now })).toEqual([]);
  });
});

describe("Texte", () => {
  it("Sie und Du, ohne Gedankenstriche", () => {
    expect(stummAntwort("sie", { nom: "Herr Kannapinn" })).toBe("Danke, ich habe es notiert. Herr Kannapinn meldet sich dazu.");
    expect(stummAntwort("du", { nom: "Ole" })).toBe("Danke, ich hab's notiert. Ole meldet sich dazu.");
    for (const t of [stummAntwort("sie", { nom: "Frau Meier" }), stummAntwort("du", { nom: "Susanne" })]) expect(t).not.toMatch(/[–—]/);
    expect(stummAufgabe("Julia Schneider")).toBe("Assistent hat nicht geantwortet: bitte Julia Schneider selbst antworten");
  });
});
