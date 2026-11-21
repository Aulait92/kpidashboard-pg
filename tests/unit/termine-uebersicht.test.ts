// Termin-Übersicht (Verkaufen → Termine, Ole 18.11.2026): Art, Ergebnis, Stand, nächster Schritt und
// „Braucht Aufmerksamkeit“ als reine Funktionen (lib/vertrieb/termine-uebersicht.ts).
import { describe, expect, it } from "vitest";
import {
  FILTER,
  artLabel,
  baueUebersicht,
  ergebnisFehltPunkte,
  ersteZeile,
  hatErgebnis,
  istHandnotiz,
  naechsterSchritt,
  terminArt,
  terminErgebnis,
  terminKennzahlen,
  termineAusAufgaben,
  wocheVon,
  zeilenDerAnsicht,
  type UAngebot,
  type UAktivitaet,
  type UAufgabe,
  type UKontakt,
  type UTermin,
} from "@/lib/vertrieb/termine-uebersicht";

const NOW = new Date("2026-11-18T14:00:00Z");
const H = 3600_000;
const T = 24 * H;
const vor = (ms: number) => new Date(NOW.getTime() - ms);
const in_ = (ms: number) => new Date(NOW.getTime() + ms);

const termin = (o: Partial<UTermin> = {}): UTermin => ({
  id: "m1", contactId: "k1", title: "Meta-Leads-Call mit Ole Kannapinn", startAt: vor(2 * T), endAt: null, status: "GEPLANT", cancelReason: null,
  reviewTaskId: null, bookingSlug: "meta-leads-call", joinUrl: null, location: null, manageToken: null, bookingTypeId: null, inviteeName: null, waConfirmStatus: null,
  ...o,
});
const kontakt = (o: Partial<UKontakt> = {}): UKontakt => ({ id: "k1", name: "Allianz Versicherung Max Muster HAUPTVERTRETUNG", firstName: null, lastName: null, city: "Köln", stage: "TERMIN", customerId: null, ...o });
const akt = (o: Partial<UAktivitaet> = {}): UAktivitaet => ({ contactId: "k1", type: "TERMIN", outcome: null, note: null, occurredAt: vor(T), ...o });
const aufgabe = (o: Partial<UAufgabe> = {}): UAufgabe => ({ id: "a1", contactId: "k1", title: "Nachfassen: Angebot", dueAt: in_(T), doneAt: null, ...o });
const angebot = (o: Partial<UAngebot> = {}): UAngebot => ({
  id: "o1", salesContactId: "k1", number: "PG-2026-0001", company: "Agentur Muster", contactName: "Max Muster", status: "sent", sentAt: vor(5 * T), viewedAt: null,
  acceptedAt: null, validUntil: in_(10 * T), createdAt: vor(5 * T), setupFee: 1000, abschlussBonus: null, abschlussBonusBis: null, abschlussBonusGewaehrt: null,
  allowPayLater: false, paymentStatus: "none", ...o,
});
const daten = (o: Partial<Parameters<typeof baueUebersicht>[0]> = {}) => ({ termine: [termin()], kontakte: [kontakt()], aufgaben: [], aktivitaeten: [], angebote: [], ...o });

describe("Art des Termins", () => {
  it("erkennt Erstgespräch, Entscheidungs-Call und sonstige (auch Calendly-Titel)", () => {
    expect(terminArt({ title: "x", bookingSlug: "entscheidung" })).toBe("entscheidung");
    expect(terminArt({ title: "Entscheidungsgespräch", bookingSlug: null })).toBe("entscheidung");
    expect(terminArt({ title: "Meta Leads Call", bookingSlug: null })).toBe("erst");
    expect(terminArt({ title: "Onboarding mit Ole", bookingSlug: null })).toBe("sonstig");
    expect(artLabel({ title: "Onboarding mit Ole Kannapinn", bookingSlug: null })).toBe("Onboarding");
    expect(artLabel({ title: "x", bookingSlug: "meta-leads-call" })).toBe("Erstgespräch");
  });
});

describe("Was passiert ist", () => {
  it("geplant, läuft, abgesagt", () => {
    expect(terminErgebnis(termin({ startAt: in_(H) }), [], null, null, NOW).art).toBe("geplant");
    expect(terminErgebnis(termin({ startAt: vor(10 * 60_000) }), [], null, null, NOW).art).toBe("laeuft");
    expect(terminErgebnis(termin({ status: "ABGESAGT", cancelReason: "Krank\nmehr" }), [], null, null, NOW)).toEqual({ art: "abgesagt", notiz: "Krank" });
  });

  it("Ergebnis aus „Wie lief der Termin?“ mit erster Zeile der Notiz", () => {
    const e = terminErgebnis(termin(), [akt({ outcome: "Termin gehabt, Bedenkzeit", note: "\nWill mit Frau sprechen\nRuft Freitag an" })], null, null, NOW);
    expect(e).toEqual({ art: "eingetragen", id: "bedenkzeit", label: "Bedenkzeit", notiz: "Will mit Frau sprechen" });
  });

  it("Notiz aus „Aktivität erfassen“ ergänzt ein Ergebnis ohne eigene Notiz", () => {
    const e = terminErgebnis(termin(), [akt({ outcome: "Gewonnen / Zusage", occurredAt: vor(T) }), akt({ type: "NOTIZ", note: "Startet im Januar", occurredAt: vor(T - H) })], null, null, NOW);
    expect(e).toMatchObject({ art: "eingetragen", label: "Abschluss", notiz: "Startet im Januar" });
  });

  it("ignoriert Einträge vor dem Termin, nach dem nächsten Termin, Anruf-Ergebnisse und automatische Notizen", () => {
    const acts = [
      akt({ outcome: "Termin gehabt, Bedenkzeit", occurredAt: vor(3 * T) }),
      akt({ type: "ANRUF", outcome: "Nicht erreicht (Mailbox etc.)" }),
      akt({ type: "NOTIZ", note: "Automatisch ergänzt: Öffnungszeiten." }),
      akt({ outcome: "Termin über Calendly gebucht: Call am 20.11." }),
      akt({ outcome: "Kein Interesse / Verloren", occurredAt: vor(H) }),
    ];
    expect(terminErgebnis(termin(), acts, vor(2 * H), null, NOW)).toEqual({ art: "fehlt", reviewOffen: false });
  });

  it("abgehakte Nachfrage zählt als erledigt, offene Nachfrage zeigt dorthin", () => {
    expect(terminErgebnis(termin(), [], null, { doneAt: vor(H) }, NOW)).toEqual({ art: "erledigt", notiz: null });
    expect(terminErgebnis(termin(), [], null, { doneAt: null }, NOW)).toEqual({ art: "fehlt", reviewOffen: true });
  });

  it("Handnotiz und erste Zeile", () => {
    expect(istHandnotiz(akt({ type: "NOTIZ", note: "Guter Call" }))).toBe(true);
    expect(istHandnotiz(akt({ type: "COLD_MAIL", note: "x" }))).toBe(false);
    expect(istHandnotiz(akt({ type: "NOTIZ", note: "Zusammengeführt mit „X“" }))).toBe(false);
    expect(ersteZeile("a".repeat(200), 10)).toBe(`${"a".repeat(9)}…`);
    expect(ersteZeile("  \n ")).toBeNull();
  });
});

describe("Nächster Schritt", () => {
  it("frühester aus Aufgabe, kommendem Termin und offenem Angebot; Nachfrage zählt nicht", () => {
    const s = naechsterSchritt(
      kontakt(),
      {
        aufgaben: [aufgabe({ title: "Wie lief der Termin mit Max Muster?", dueAt: vor(T) }), aufgabe({ dueAt: in_(3 * T) })],
        termine: [termin({ id: "m2", title: "Entscheidungs-Call", bookingSlug: "entscheidung", startAt: in_(2 * T) })],
        angebot: angebot(),
      },
      NOW,
    );
    expect(s).toMatchObject({ art: "schritt", text: "Entscheidungs-Call", ueberfaellig: false });
  });

  it("überfällige Aufgabe, keiner, abgeschlossen", () => {
    expect(naechsterSchritt(kontakt(), { aufgaben: [aufgabe({ dueAt: vor(2 * T) })], termine: [], angebot: null }, NOW)).toMatchObject({ ueberfaellig: true });
    expect(naechsterSchritt(kontakt(), { aufgaben: [], termine: [termin()], angebot: angebot({ status: "draft", sentAt: null }) }, NOW)).toEqual({ art: "keiner" });
    expect(naechsterSchritt(kontakt({ stage: "VERLOREN" }), { aufgaben: [], termine: [], angebot: null }, NOW)).toEqual({ art: "abgeschlossen" });
  });
});

describe("Zeilen und Stand", () => {
  it("Person aus der Buchung, Agentur mit Ort, Angebotsstand, Link zum Ergebnis", () => {
    const { zeilen } = baueUebersicht(daten({ termine: [termin({ inviteeName: "Max Muster", reviewTaskId: "r1" })], aufgaben: [aufgabe({ id: "r1", title: "Wie lief der Termin?" })], angebote: [angebot({ viewedAt: vor(T) })] }), NOW);
    expect(zeilen[0]).toMatchObject({ person: "Max Muster", agentur: "Allianz Versicherung Max Muster HAUPTVERTRETUNG, Köln", artLabel: "Erstgespräch", angebot: { stand: "geoeffnet" } });
    expect(zeilen[0].ergebnisHref).toBe("/admin/neu/vertrieb/kontakte/k1#ergebnis");
  });

  it("aktuelles Angebot ist das zuletzt erstellte", () => {
    const { zeilen } = baueUebersicht(daten({ angebote: [angebot({ id: "alt", status: "declined", createdAt: vor(9 * T) }), angebot({ id: "neu", status: "accepted", acceptedAt: vor(T) })] }), NOW);
    expect(zeilen[0].angebot.stand).toBe("angenommen");
  });

  it("Ansichten und Filter", () => {
    const { zeilen } = baueUebersicht(
      daten({
        termine: [termin({ id: "alt", startAt: vor(40 * T) }), termin({ id: "jung", startAt: vor(2 * T) }), termin({ id: "bald", startAt: in_(T) })],
        aktivitaeten: [akt({ outcome: "Termin gehabt, Angebot geschickt", occurredAt: vor(30 * T) })],
      }),
      NOW,
    );
    expect(zeilenDerAnsicht(zeilen, "30", NOW).map((z) => z.termin.id)).toEqual(["jung"]);
    expect(zeilenDerAnsicht(zeilen, "kommend", NOW).map((z) => z.termin.id)).toEqual(["bald"]);
    expect(zeilenDerAnsicht(zeilen, "alle", NOW).map((z) => z.termin.id)).toEqual(["bald", "jung", "alt"]);
    const ohne = FILTER.find((f) => f.key === "ohne")!;
    expect(zeilen.filter(ohne.match)).toHaveLength(0); // kommender Termin ist ein nächster Schritt
  });
});

describe("Braucht Aufmerksamkeit", () => {
  const titel = (d: ReturnType<typeof daten>) => baueUebersicht(d, NOW).aufmerksamkeit.map((p) => p.title);

  it("Termin vorbei ohne Ergebnis, mit Knopf zur Stelle", () => {
    const [p] = baueUebersicht(daten({ termine: [termin({ inviteeName: "Max Muster" })] }), NOW).aufmerksamkeit;
    expect(p).toMatchObject({ title: "Ergebnis fehlt: Max Muster", tone: "bad", action: { label: "Ergebnis eintragen", href: "/admin/neu/vertrieb/kontakte/k1#aktivitaet" } });
  });

  it("Gespräch geführt, aber kein nächster Schritt", () => {
    expect(titel(daten({ aktivitaeten: [akt({ outcome: "Termin gehabt, Bedenkzeit" })] }))).toEqual(["Kein nächster Schritt: Max Muster"]);
    // mit offener Aufgabe, Folgetermin oder offenem Angebot nicht
    expect(titel(daten({ aktivitaeten: [akt({ outcome: "Termin gehabt, Bedenkzeit" })], aufgaben: [aufgabe()] }))).toEqual([]);
    expect(titel(daten({ aktivitaeten: [akt({ outcome: "Termin gehabt, Bedenkzeit" })], angebote: [angebot({ sentAt: vor(H), createdAt: vor(H) })] }))).toEqual([]);
  });

  it("nicht erschienen bzw. abgesagt und kein neuer Termin", () => {
    expect(titel(daten({ aktivitaeten: [akt({ outcome: "Termin: nicht erschienen" })], aufgaben: [aufgabe({ title: "Neuen Termin vereinbaren" })] }))).toEqual([
      "Nicht erschienen: Max Muster",
    ]);
    expect(titel(daten({ termine: [termin({ status: "ABGESAGT", startAt: in_(T) })] }))).toEqual(["Abgesagt: Max Muster"]);
    // neuer Termin gebucht: nichts zu tun
    expect(titel(daten({ termine: [termin(), termin({ id: "m2", startAt: in_(T) })], aktivitaeten: [akt({ outcome: "Termin: nicht erschienen" })] }))).toEqual([]);
  });

  it("nur der letzte Termin je Kontakt zählt; abgeschlossene Kontakte und alte Termine nicht", () => {
    const zwei = [termin({ id: "m0", startAt: vor(10 * T) }), termin()];
    expect(titel(daten({ termine: zwei }))).toEqual(["Ergebnis fehlt: Max Muster"]);
    expect(titel(daten({ kontakte: [kontakt({ stage: "GEWONNEN" })] }))).toEqual([]);
    expect(titel(daten({ termine: [termin({ startAt: vor(100 * T) })] }))).toEqual([]);
  });

  it("Angebot offen, seit mehr als 3 Tagen keine Reaktion bzw. nicht geöffnet", () => {
    const ok = { termine: [], aufgaben: [aufgabe()] };
    const [p] = baueUebersicht(daten({ ...ok, angebote: [angebot()] }), NOW).aufmerksamkeit;
    expect(p).toMatchObject({ title: "Angebot ohne Reaktion: Agentur Muster", detail: expect.stringContaining("noch nicht geöffnet"), action: { href: "/admin/neu/vertrieb/kontakte/k1#angebot" } });
    // geöffnet vor 2 Tagen bzw. nachgefasst vor 1 Tag: noch ruhig
    expect(titel(daten({ ...ok, angebote: [angebot({ viewedAt: vor(2 * T) })] }))).toEqual([]);
    expect(titel(daten({ ...ok, angebote: [angebot()], aktivitaeten: [akt({ type: "ANRUF", outcome: "Rückruf / Wiedervorlage", occurredAt: vor(T) })] }))).toEqual([]);
    // Entscheidungs-Call gebucht: nichts zu tun
    expect(titel(daten({ ...ok, termine: [termin({ startAt: in_(T) })], angebote: [angebot()] }))).toEqual([]);
  });

  it("Abschlussbonus läuft in den nächsten 48 Stunden ab (vor allen anderen Punkten)", () => {
    const bonus = angebot({ abschlussBonus: 500, abschlussBonusBis: in_(20 * H), sentAt: vor(H), createdAt: vor(H) });
    const punkte = baueUebersicht(daten({ angebote: [bonus] }), NOW).aufmerksamkeit;
    expect(punkte.map((p) => p.title)).toEqual(["Bonus läuft ab: Agentur Muster", "Ergebnis fehlt: Max Muster"]);
    expect(punkte[0].detail).toMatch(/^500\s€ bis Do 19\.11\. 11 Uhr · noch nicht geöffnet$/);
    // Frist weiter weg, abgelaufen oder schon bezahlt: kein Hinweis
    expect(titel(daten({ termine: [], angebote: [{ ...bonus, abschlussBonusBis: in_(3 * T) }] }))).toEqual([]);
    expect(titel(daten({ termine: [], angebote: [{ ...bonus, abschlussBonusBis: vor(H) }] }))).toEqual([]);
    expect(titel(daten({ termine: [], angebote: [{ ...bonus, status: "accepted", acceptedAt: vor(H), paymentStatus: "paid" }] }))).toEqual([]);
    expect(titel(daten({ termine: [], angebote: [{ ...bonus, status: "accepted", acceptedAt: vor(H) }] }))).toEqual(["Bonus läuft ab: Agentur Muster"]);
  });
});

// ─── Stufe 2 (Ole, 18.11.2026) ──────────────────────────────────────────

describe("Stufe 2: Kennzahlen", () => {
  it("Woche von Montag bis Sonntag (Berlin)", () => {
    expect(wocheVon(NOW)).toEqual({ von: "2026-11-16", bis: "2026-11-22" });
    // Sonntag 23:00 Berlin gehört noch zur Woche, Montag 00:30 Berlin schon zur nächsten
    expect(wocheVon(new Date("2026-11-22T22:00:00Z")).von).toBe("2026-11-16");
    expect(wocheVon(new Date("2026-11-22T23:30:00Z"))).toEqual({ von: "2026-11-23", bis: "2026-11-29" });
  });

  it("Termine diese Woche, erschienen, mit Angebot, gewonnen", () => {
    const kontakte = ["k1", "k2", "k3", "k5", "k6"].map((id) => kontakt({ id })).concat(kontakt({ id: "k4", stage: "GEWONNEN" }));
    const termine = [
      termin({ id: "w1", contactId: "k1", startAt: in_(T) }), // Do, kommt noch
      termin({ id: "w2", contactId: "k2", startAt: vor(T) }), // Di, Angebot geschickt
      termin({ id: "w3", contactId: "k3", startAt: vor(2 * T), status: "ABGESAGT" }), // Mo, abgesagt: zählt nirgends
      termin({ id: "a1", contactId: "k3", startAt: vor(10 * T) }), // nicht erschienen
      termin({ id: "a2", contactId: "k4", startAt: vor(12 * T) }), // Abschluss
      termin({ id: "a3", contactId: "k5", startAt: vor(5 * T) }), // ohne Ergebnis, Angebot danach verschickt
      termin({ id: "alt", contactId: "k6", startAt: vor(40 * T) }), // älter als 30 Tage
    ];
    const aktivitaeten = [
      akt({ contactId: "k2", outcome: "Termin gehabt, Angebot geschickt", occurredAt: vor(T - H) }),
      akt({ contactId: "k3", outcome: "Termin: nicht erschienen", occurredAt: vor(10 * T - H) }),
      akt({ contactId: "k4", outcome: "Gewonnen / Zusage", occurredAt: vor(12 * T - H) }),
    ];
    const angebote = [angebot({ salesContactId: "k5", sentAt: vor(4 * T), createdAt: vor(4 * T) })];
    const { zeilen } = baueUebersicht(daten({ termine, kontakte, aktivitaeten, angebote }), NOW);
    expect(terminKennzahlen(zeilen, angebote, NOW)).toEqual({
      woche: { anzahl: 2, kommend: 1 },
      erschienen: { quote: 2 / 3, erschienen: 2, basis: 3 },
      angebot: { anzahl: 2, gehalten: 3 },
      gewonnen: { anzahl: 1, kontakte: 4 },
    });
  });

  it("Angebot vor dem Termin oder nach dem nächsten Termin zählt nicht; ohne Ergebnis keine Quote", () => {
    const termine = [termin({ id: "t1", startAt: vor(10 * T) }), termin({ id: "t2", startAt: vor(5 * T) })];
    const angebote = [angebot({ sentAt: vor(4 * T) }), angebot({ id: "o2", sentAt: vor(20 * T) })];
    const { zeilen } = baueUebersicht(daten({ termine, angebote }), NOW);
    const k = terminKennzahlen(zeilen, angebote, NOW);
    // Angebot nach t2 gehört zu t2, nicht zu t1
    expect(k.angebot).toEqual({ anzahl: 1, gehalten: 2 });
    expect(k.erschienen).toEqual({ quote: null, erschienen: 0, basis: 0 });
  });
});

describe("Stufe 2: Termine nur als Aufgabe", () => {
  it("Aufgabe „Termin“ wird ein Termin der Liste (Art „Termin (Aufgabe)“) mit ihrer Nachfrage", () => {
    const review = aufgabe({ id: "r1", title: "Wie lief der Termin mit Max Muster?", dueAt: vor(2 * T - H), createdAt: vor(2 * T - H) });
    const t = termineAusAufgaben(
      [
        { id: "ta", contactId: "k1", title: "Termin", dueAt: vor(2 * T) },
        { id: "tv", contactId: "k1", title: "Termin aus Cold Mail vorbereiten", dueAt: vor(2 * T) },
        { id: "tm", contactId: "k2", title: "Termin mit Erika", dueAt: in_(2 * T) },
      ],
      [],
      [review],
    );
    expect(t.map((x) => [x.id, x.reviewTaskId, x.aufgabe])).toEqual([
      ["ta", "r1", true],
      ["tm", null, true],
    ]);
    const { zeilen } = baueUebersicht(daten({ termine: t, kontakte: [kontakt(), kontakt({ id: "k2" })], aufgaben: [review] }), NOW);
    const z = zeilen.find((x) => x.termin.id === "ta")!;
    expect(z).toMatchObject({ artLabel: "Termin (Aufgabe)", ergebnis: { art: "fehlt", reviewOffen: true }, ergebnisHref: "/admin/neu/vertrieb/kontakte/k1#ergebnis" });
    expect(zeilen.find((x) => x.termin.id === "tm")).toMatchObject({ artLabel: "Termin (Aufgabe)", kommend: true, ergebnis: { art: "geplant" } });
  });

  it("Aufgabe nah an einer Buchung desselben Kontakts fällt weg; Nachfrage eines gebuchten Termins wird nicht übernommen", () => {
    const gebucht = termin({ startAt: vor(2 * T + 2 * H), reviewTaskId: "r1" });
    const review = aufgabe({ id: "r1", title: "Wie lief der Termin?", createdAt: vor(T) });
    expect(termineAusAufgaben([{ id: "ta", contactId: "k1", title: "Termin", dueAt: vor(2 * T) }], [gebucht], [review])).toEqual([]);
    const weit = termineAusAufgaben([{ id: "ta", contactId: "k1", title: "Termin", dueAt: vor(10 * T) }], [gebucht], [review]);
    expect(weit.map((x) => [x.id, x.reviewTaskId])).toEqual([["ta", null]]);
  });
});

describe("Stufe 2: Ergebnis schon da (Push nach dem Termin)", () => {
  it("Ergebnis oder eigene Notiz seit Terminbeginn", () => {
    const ab = vor(2 * H);
    expect(hatErgebnis([akt({ outcome: "Termin gehabt, Bedenkzeit", occurredAt: vor(H) })], ab)).toBe(true);
    expect(hatErgebnis([akt({ type: "NOTIZ", note: "Will überlegen", occurredAt: vor(H) })], ab)).toBe(true);
    expect(hatErgebnis([akt({ outcome: "Termin gehabt, Bedenkzeit", occurredAt: vor(3 * H) })], ab)).toBe(false);
    expect(hatErgebnis([akt({ type: "NOTIZ", note: "Automatisch angereichert", occurredAt: vor(H) })], ab)).toBe(false);
    expect(hatErgebnis([akt({ type: "ANRUF", outcome: "Nicht erreicht (Mailbox etc.)", occurredAt: vor(H) })], ab)).toBe(false);
  });
});

describe("Stufe 2: Mein Tag „Ergebnis fehlt“", () => {
  const punkte = (o: Partial<Parameters<typeof baueUebersicht>[0]> = {}, now = NOW) => ergebnisFehltPunkte(baueUebersicht(daten(o), now).zeilen, now);

  it("ab dem Morgen nach dem Termin, mit Link zum Ergebnis", () => {
    const [p, ...rest] = punkte({ termine: [termin({ startAt: vor(T), inviteeName: "Max Muster" })] });
    expect(rest).toEqual([]);
    expect(p).toMatchObject({
      key: "terminergebnis:m1",
      area: "Vertrieb",
      tone: "bad",
      title: "Ergebnis fehlt: Max Muster",
      detail: "Erstgespräch am Di 17.11. 15 Uhr",
      action: { label: "Ergebnis eintragen", href: "/admin/neu/vertrieb/kontakte/k1#aktivitaet" },
    });
    expect(p.quick).toBeUndefined();
  });

  it("offene Nachfrage: Ergebnis-Knöpfe direkt auf Mein Tag", () => {
    const [p] = punkte({ termine: [termin({ startAt: vor(T), reviewTaskId: "r1" })], aufgaben: [aufgabe({ id: "r1", title: "Wie lief der Termin?" })] });
    expect(p.quick).toEqual({ kind: "termin", taskId: "r1" });
    expect(p.action.href).toBe("/admin/neu/vertrieb/kontakte/k1#ergebnis");
  });

  it("nicht am selben Tag, nicht mit Ergebnis, nicht älter als 14 Tage, nicht bei Abschluss oder späterem Termin", () => {
    expect(punkte({ termine: [termin({ startAt: vor(3 * H) })] })).toEqual([]);
    // am nächsten Morgen (Do 07:00 Berlin) ist der Termin von Mittwoch dran
    expect(punkte({ termine: [termin({ startAt: vor(3 * H) })] }, new Date("2026-11-19T06:00:00Z"))).toHaveLength(1);
    expect(punkte({ termine: [termin()], aktivitaeten: [akt({ outcome: "Termin gehabt, Bedenkzeit" })] })).toEqual([]);
    expect(punkte({ termine: [termin({ startAt: vor(15 * T) })] })).toEqual([]);
    expect(punkte({ kontakte: [kontakt({ stage: "GEWONNEN" })] })).toEqual([]);
    expect(punkte({ termine: [termin(), termin({ id: "m2", startAt: in_(T) })] })).toEqual([]);
    expect(punkte({ termine: [termin({ status: "ABGESAGT" })] })).toEqual([]);
  });
});
