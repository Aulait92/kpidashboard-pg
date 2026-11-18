import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BD_ABSCHNITTE, bdFehlt, bdMail, bdPdfInhalt, bdSauber, bdSeitenText, beratungsdokuEntwurf, entscheidungVorschlag } from "@/lib/beratungsdoku";
import { GRUENDE_ERGAENZEN } from "@/lib/mail/beratung";
import { terminKartenAktionen } from "@/lib/termin-karte";

// Paket B (Ole, 18.11.2026): Beratungsdokumentation als Angebot, reine Teile.

const quellen = {
  an: "sie" as const,
  produkt: "Privathaftpflicht",
  formData: [
    { label: "Lebenssituation", value: "Familie" },
    { label: "Vorerkrankungen", value: "Asthma" },
  ],
  notizen: ["Fahrrad soll mit rein"],
  klaeren: { punkte: ["Selbstbeteiligung", "Bestehende Verträge", "Beginn"], erledigt: ["Selbstbeteiligung"] },
  auswahl: [{ sparte: "Privathaftpflicht", gesellschaft: "Allianz", tarif: "Komfort", beitrag: 6.12, leistungen: ["Schlüsselverlust"] }],
  tarife: [
    { sparte: "Privathaftpflicht", gesellschaft: "Allianz", tarif: "Komfort", beitrag: 6.12, gewaehlt: true },
    { sparte: "Privathaftpflicht", gesellschaft: "Allianz", tarif: "Basis", beitrag: 4.5, gewaehlt: false },
  ],
  vertraege: [{ sparte: "Hausrat", versicherer: "HUK", monat: 9.8 }],
  status: "Termin vereinbart",
};

const strich = /[–—]/;

describe("Beratungsdokumentation: Entwurf", () => {
  it("füllt alle Abschnitte aus dem Termin vor, ohne Gesundheitsangaben, Begründung als Stelle zum Ergänzen", () => {
    const e = beratungsdokuEntwurf(quellen);
    expect(e.wuensche).toContain("• Lebenssituation: Familie");
    expect(e.wuensche).toContain("• Fahrrad soll mit rein");
    expect(e.wuensche).not.toContain("Asthma");
    expect(e.beratung).toContain("Besprochen:\n• Selbstbeteiligung");
    expect(e.beratung).toContain("Ihre bestehenden Verträge laut Ihren Unterlagen:\n• Hausrat bei HUK, 9,80 € im Monat");
    expect(e.beratung).toContain("Verglichene Tarife:\n• Privathaftpflicht: Allianz Komfort, 6,12 € im Monat\n• Privathaftpflicht: Allianz Basis, 4,50 € im Monat");
    expect(e.empfehlung).toContain("• Privathaftpflicht: Allianz Komfort, 6,12 € im Monat");
    expect(e.empfehlung).toContain(`Begründung: ${GRUENDE_ERGAENZEN}`);
    expect(e.entscheidung).toBe("Sie möchten das Angebot in Ruhe prüfen.");
    expect(e.hinweise).toBe("Noch zu klären:\n• Bestehende Verträge\n• Beginn");
    expect(bdFehlt(e)).toContain(GRUENDE_ERGAENZEN);
  });

  it("ohne Termindaten: Beratung und Empfehlung als Stellen zum Ergänzen, Hinweise leer", () => {
    const e = beratungsdokuEntwurf({ an: "du", produkt: "Hausrat" });
    expect(e.beratung).toBe(`Besprochen: ${GRUENDE_ERGAENZEN}`);
    expect(e.empfehlung.startsWith(`Empfohlen: ${GRUENDE_ERGAENZEN}`)).toBe(true);
    expect(e.hinweise).toBe("");
  });

  it("Entscheidung aus dem Status, in beiden Ansprachen", () => {
    expect(entscheidungVorschlag("du", "Abschluss")).toBe("Du hast dich für die Empfehlung entschieden.");
    expect(entscheidungVorschlag("sie", "kein Interesse")).toBe("Sie haben sich gegen einen Abschluss entschieden.");
    expect(entscheidungVorschlag("du", null)).toBe("Du möchtest das Angebot in Ruhe prüfen.");
  });

  it("Prüfung: Pflichtabschnitte, Hinweise optional, keine offene Stelle", () => {
    const ok = { wuensche: "a", beratung: "b", empfehlung: "c", entscheidung: "d", hinweise: "" };
    expect(bdFehlt(ok)).toBeNull();
    expect(bdFehlt({ ...ok, entscheidung: " " })).toBe("Bitte „Entscheidung des Kunden“ ausfüllen.");
    expect(bdFehlt({ ...ok, hinweise: `Verzicht auf ${GRUENDE_ERGAENZEN}` })).toContain(GRUENDE_ERGAENZEN);
    expect(bdSauber({ wuensche: "x".repeat(7000), fremd: "y" })).toEqual({ wuensche: "x".repeat(6000), beratung: "", empfehlung: "", entscheidung: "", hinweise: "" });
  });
});

describe("Beratungsdokumentation: Texte an den Kunden", () => {
  const inhalt = { wuensche: "a", beratung: "b", empfehlung: "c", entscheidung: "d", hinweise: "" };
  const now = new Date("2026-11-18T10:00:00Z");

  it("PDF: Abschnitte in fester Reihenfolge, leere Hinweise fehlen, Verantwortung beim Vermittler, Bestätigung mit Zeit", () => {
    const p = bdPdfInhalt({ an: "sie", kunde: "Anna Becker", produkt: "Haftpflicht", berater: "Ole Kannapinn", termin: now, inhalt, now });
    expect(p.bloecke.map((b) => b.ueberschrift)).toEqual(["Wünsche und Bedürfnisse", "Beratung", "Empfehlung mit Begründung", "Entscheidung des Kunden"]);
    expect(p.kopf).toContain("Gespräch am: 18.11.2026");
    expect(p.fuss).toContain("Die Inhalte verantwortet Ole Kannapinn.");
    const b = bdPdfInhalt({ an: "du", kunde: "", produkt: "Haftpflicht", berater: "", termin: null, inhalt: { ...inhalt, hinweise: "Verzicht" }, now, bestaetigtAt: now });
    expect(b.bloecke).toHaveLength(5);
    expect(b.fuss).toContain("Bitte prüfe die Angaben");
    expect(b.fuss).toContain("Erhalt bestätigt am 18.11.2026 um 11:00 Uhr per Klick.");
  });

  it("Mail und Seite in beiden Ansprachen, ohne Gedankenstriche, ohne „Garantie“", () => {
    for (const an of ["du", "sie"] as const) {
      const m = bdMail(an, { produkt: "Haftpflicht", termin: now });
      const s = bdSeitenText(an);
      const p = bdPdfInhalt({ an, kunde: "A", produkt: "H", berater: "B", termin: now, inhalt, now, bestaetigtAt: now });
      const alles = [m.subject, m.body, m.knopf, ...Object.values(s), p.fuss, ...p.kopf].join("\n");
      expect(alles).not.toMatch(strich);
      expect(alles.toLowerCase()).not.toContain("garantie");
      expect(m.body).toContain("{anrede}");
      expect(m.body).toContain("am 18.11.2026");
    }
    expect(bdMail("du", { produkt: "Haftpflicht", termin: null }).body).toContain("bestätige den Erhalt");
    expect(bdMail("sie", { produkt: "Haftpflicht", termin: null }).body).toContain("bestätigen Sie den Erhalt");
  });

  it("Seite speichert nur per POST: Bestätigen nur in der Server-Aktion, die Seite ruft sie nur als Formular-Aktion", () => {
    const seite = readFileSync("src/app/dokumentation/[token]/page.tsx", "utf8");
    const aktion = readFileSync("src/app/dokumentation/[token]/actions.ts", "utf8");
    const pdf = readFileSync("src/app/dokumentation/[token]/pdf/route.ts", "utf8");
    expect(aktion.startsWith('"use server";')).toBe(true);
    expect(aktion).toContain("bdBestaetigen(");
    expect(seite).not.toContain("bdBestaetigen(");
    expect(seite).toContain("<form action={aktion}");
    expect(seite).toContain("index: false");
    expect(pdf).not.toMatch(/bdBestaetigen|update|create/);
  });

  it("Abschnitte vollständig und stabil", () => {
    expect([...BD_ABSCHNITTE]).toEqual(["wuensche", "beratung", "empfehlung", "entscheidung", "hinweise"]);
  });
});

describe("Terminkarte mit Beratungsdokumentation", () => {
  const start = new Date("2026-11-18T09:00:00Z");
  const t = { startsAt: start, endsAt: null, mode: "video", meetUrl: "https://meet", attendance: "erschienen" };
  const nachher = new Date("2026-11-18T10:00:00Z");

  it("Schalter aus: unverändert (nichts von der Dokumentation sichtbar)", () => {
    const ohne = terminKartenAktionen(t, { now: nachher, telefon: true, angebotOffen: true });
    const aus = terminKartenAktionen(t, { now: nachher, telefon: true, angebotOffen: true, beratungsdoku: null });
    expect(aus).toEqual(ohne);
    expect([aus.haupt, ...aus.zweit, ...aus.mehr]).not.toContain("beratungsdoku");
  });

  it("offen: erster Zweitknopf nach dem Ergebnis; erledigt: unter „Mehr“", () => {
    const offen = terminKartenAktionen(t, { now: nachher, telefon: true, angebotOffen: true, beratungsdoku: "offen" });
    expect(offen.haupt).toBe("angebot");
    expect(offen.zweit).toEqual(["ergebnis", "beratungsdoku"]);
    const ohneAngebot = terminKartenAktionen({ ...t, attendance: null }, { now: nachher, telefon: true, angebotOffen: true, beratungsdoku: "offen" });
    expect(ohneAngebot.haupt).toBe("ergebnis");
    expect(ohneAngebot.zweit).toEqual(["beratungsdoku", "praesentation"]);
    const erledigt = terminKartenAktionen(t, { now: nachher, telefon: true, angebotOffen: true, beratungsdoku: "erledigt" });
    expect(erledigt.zweit).not.toContain("beratungsdoku");
    expect(erledigt.mehr.at(-1)).toBe("beratungsdoku");
  });

  it("Ergebnis steht schon: Hauptknopf „Beratungsdokumentation erstellen“", () => {
    const a = terminKartenAktionen(t, { now: nachher, telefon: true, angebotOffen: false, beratungsdoku: "offen", ergebnisFehlt: false });
    expect(a.haupt).toBe("beratungsdoku");
    expect(a.zweit).toEqual(["praesentation", "vorbereiten"]);
    // vor dem Termin nie
    const vorher = terminKartenAktionen(t, { now: new Date("2026-11-18T08:00:00Z"), telefon: true, angebotOffen: true, beratungsdoku: "offen" });
    expect([vorher.haupt, ...vorher.zweit, ...vorher.mehr]).not.toContain("beratungsdoku");
  });
});
