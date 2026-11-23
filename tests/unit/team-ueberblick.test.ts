import { describe, expect, it } from "vitest";
import {
  baueTeamUeberblick,
  heuteAuswahl,
  heuteSatz,
  statusZeile,
  terminZustaendig,
  type UeberblickEingabe,
} from "@/lib/team-ueberblick";

const NOW = new Date("2026-11-21T10:00:00Z");
const h = (n: number) => new Date(NOW.getTime() + n * 60 * 60 * 1000);
const OWNER = "owner";
const FRANK = "frank";
const LENA = "lena";

function eingabe(extra: Partial<UeberblickEingabe> = {}): UeberblickEingabe {
  return {
    now: NOW,
    memberIds: [OWNER, FRANK, LENA],
    fallbackUserId: OWNER,
    termine: [],
    anrufe: [],
    wiedervorlagen: [],
    ergebnisse: [],
    ohneSchritt: [],
    quoten: new Map(),
    ...extra,
  };
}

describe("Team-Überblick: Zuständigkeit", () => {
  const members = new Set([OWNER, FRANK, LENA]);
  it("Kalender des Beraters vor dem zuständigen Berater des Leads", () => {
    expect(terminZustaendig({ calendarKey: `user:${FRANK}`, leadAssignedUserId: LENA }, members, OWNER)).toBe(FRANK);
  });
  it("Kalender der Agentur: zuständiger Berater des Leads, sonst Inhaber", () => {
    expect(terminZustaendig({ calendarKey: "cust1", leadAssignedUserId: LENA }, members, OWNER)).toBe(LENA);
    expect(terminZustaendig({ calendarKey: null, leadAssignedUserId: null }, members, OWNER)).toBe(OWNER);
  });
  it("unbekannte Person (entfernt): Inhaber", () => {
    expect(terminZustaendig({ calendarKey: "user:weg", leadAssignedUserId: "weg" }, members, OWNER)).toBe(OWNER);
  });
});

describe("Team-Überblick: Termine und Offenes je Mitglied", () => {
  it("Termine der nächsten 7 Tage, sortiert, nach Zuständigkeit", () => {
    const u = baueTeamUeberblick(
      eingabe({
        termine: [
          { id: "t2", startsAt: h(30), mode: "video", calendarKey: `user:${FRANK}`, leadId: "l2", leadName: "Becker", leadAssignedUserId: FRANK },
          { id: "t1", startsAt: h(2), mode: "phone", calendarKey: null, leadId: "l1", leadName: "Arndt", leadAssignedUserId: FRANK },
          { id: "t3", startsAt: h(24 * 8), mode: "phone", calendarKey: null, leadId: "l3", leadName: "Zu spät", leadAssignedUserId: FRANK },
          { id: "t4", startsAt: h(5), mode: "onsite", calendarKey: null, leadId: null, leadName: null, leadAssignedUserId: null },
        ],
      }),
    );
    expect(u.get(FRANK)!.termine.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(u.get(OWNER)!.termine.map((t) => t.name)).toEqual(["Termin"]);
    expect(statusZeile(u.get(FRANK)!)).toBe("2 Termine in 7 Tagen · alles erledigt");
    expect(statusZeile(u.get(LENA)!)).toBe("Keine Termine in 7 Tagen · alles erledigt");
  });

  it("jeder Lead nur einmal; nicht Zugeteiltes beim Inhaber", () => {
    const u = baueTeamUeberblick(
      eingabe({
        anrufe: [
          { leadId: "a", name: "Neu A", createdAt: h(-3), urgent: true, assignedUserId: FRANK },
          { leadId: "w", name: "Mit Wiedervorlage", createdAt: h(-30), urgent: false, assignedUserId: FRANK },
          { leadId: "x", name: null, createdAt: h(-1), urgent: true, assignedUserId: null },
        ],
        wiedervorlagen: [{ leadId: "w", name: "Mit Wiedervorlage", followUpAt: h(-2), assignedUserId: FRANK }],
        ergebnisse: [
          { leadId: "e", name: "Ergebnis", startsAt: h(-26), calendarKey: `user:${FRANK}`, leadAssignedUserId: FRANK },
          { leadId: "e", name: "Ergebnis", startsAt: h(-50), calendarKey: `user:${FRANK}`, leadAssignedUserId: FRANK },
        ],
        ohneSchritt: [
          { leadId: "e", name: "Ergebnis", statusChangedAt: h(-60), assignedUserId: FRANK },
          { leadId: "o", name: "Ohne", statusChangedAt: h(-60), assignedUserId: FRANK },
        ],
      }),
    );
    const f = u.get(FRANK)!;
    expect(f.offen.anruf.map((l) => l.leadId)).toEqual(["a"]);
    expect(f.offen.wiedervorlage.map((l) => l.leadId)).toEqual(["w"]);
    expect(f.offen.ergebnis).toHaveLength(1);
    expect(f.offen.ergebnis[0].at).toBe(h(-26).toISOString());
    expect(f.offen.ohneSchritt.map((l) => l.leadId)).toEqual(["o"]);
    expect(f.anzahlOffen).toBe(4);
    expect(u.get(OWNER)!.offen.anruf.map((l) => l.name)).toEqual(["Lead"]);
  });
});

describe("Team-Überblick: Schwellen", () => {
  it("neuer Lead wartet über 2 Std.: gelb; unter 2 Std.: nicht", () => {
    const u = baueTeamUeberblick(
      eingabe({
        anrufe: [
          { leadId: "a", name: "A", createdAt: h(-2.5), urgent: true, assignedUserId: FRANK },
          { leadId: "b", name: "B", createdAt: h(-1), urgent: true, assignedUserId: LENA },
        ],
      }),
    );
    expect(u.get(FRANK)!.warn).toEqual(["anruf"]);
    expect(u.get(LENA)!.warn).toEqual([]);
  });

  it("Rückruf (nicht neu) wartet über 24 Std.: gelb, schon bei einem (Ole, 21.11.2026)", () => {
    const u = baueTeamUeberblick(
      eingabe({
        anrufe: [
          { leadId: "a", name: "A", createdAt: h(-25), urgent: false, assignedUserId: FRANK },
          { leadId: "b", name: "B", createdAt: h(-5), urgent: false, assignedUserId: LENA },
        ],
      }),
    );
    expect(u.get(FRANK)!.warn).toEqual(["anruf"]);
    expect(u.get(LENA)!.warn).toEqual([]);
  });

  it("Wiedervorlagen: ab 3 oder eine älter als 24 Std.", () => {
    const zwei = baueTeamUeberblick(
      eingabe({
        wiedervorlagen: [
          { leadId: "1", name: "1", followUpAt: h(-3), assignedUserId: FRANK },
          { leadId: "2", name: "2", followUpAt: h(-5), assignedUserId: FRANK },
        ],
      }),
    );
    expect(zwei.get(FRANK)!.warn).toEqual([]);
    const alt = baueTeamUeberblick(eingabe({ wiedervorlagen: [{ leadId: "1", name: "1", followUpAt: h(-25), assignedUserId: FRANK }] }));
    expect(alt.get(FRANK)!.warn).toEqual(["wiedervorlage"]);
    const drei = baueTeamUeberblick(
      eingabe({ wiedervorlagen: ["1", "2", "3"].map((id) => ({ leadId: id, name: id, followUpAt: h(-1), assignedUserId: FRANK })) }),
    );
    expect(drei.get(FRANK)!.warn).toEqual(["wiedervorlage"]);
    expect(heuteSatz(drei.get(FRANK)!)).toBe("3 Wiedervorlagen überfällig");
  });

  it("Ohne nächsten Schritt: Quote unter 80 % wie auf Zahlen", () => {
    const ohne = [{ leadId: "o", name: "O", statusChangedAt: h(-5), assignedUserId: FRANK }];
    const gut = baueTeamUeberblick(eingabe({ ohneSchritt: ohne, quoten: new Map([[FRANK, { open: 10, withoutNextStep: 1 }]]) }));
    expect(gut.get(FRANK)!.quote).toBeCloseTo(0.9);
    expect(gut.get(FRANK)!.warn).toEqual([]);
    const schlecht = baueTeamUeberblick(eingabe({ ohneSchritt: ohne, quoten: new Map([[FRANK, { open: 4, withoutNextStep: 1 }]]) }));
    expect(schlecht.get(FRANK)!.warn).toEqual(["ohneSchritt"]);
    // nicht Zugeteilte zählen beim Inhaber
    const inhaber = baueTeamUeberblick(eingabe({ quoten: new Map([[null, { open: 2, withoutNextStep: 1 }], [OWNER, { open: 2, withoutNextStep: 0 }]]) }));
    expect(inhaber.get(OWNER)!.quote).toBeCloseTo(0.75);
  });

  it("Heute: nur über der Schwelle, nicht man selbst, höchstens 3, mehrere Gründe als Summe", () => {
    const u = baueTeamUeberblick(
      eingabe({
        memberIds: [OWNER, FRANK, LENA, "d", "e"],
        anrufe: [OWNER, FRANK, LENA, "d", "e"].map((id) => ({ leadId: `n-${id}`, name: id, createdAt: h(-3), urgent: true, assignedUserId: id })),
        ergebnisse: [{ leadId: "r", name: "R", startsAt: h(-30), calendarKey: `user:${FRANK}`, leadAssignedUserId: FRANK }],
      }),
    );
    const auswahl = heuteAuswahl([...u.values()], OWNER);
    expect(auswahl).toHaveLength(3);
    expect(auswahl.map((m) => m.userId)).not.toContain(OWNER);
    expect(auswahl[0].userId).toBe(FRANK);
    expect(heuteSatz(auswahl[0])).toBe("1 Lead wartet auf Anruf, 1 weitere offen");
    expect(heuteSatz(u.get(LENA)!)).toBe("1 Lead wartet auf Anruf");
    expect(heuteAuswahl([...baueTeamUeberblick(eingabe()).values()], OWNER)).toEqual([]);
  });
});
