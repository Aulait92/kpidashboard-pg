// A/B-Tests der Vertriebs-Nachrichten (A/B-Test-Labor, Auftrag Ole 22.11.2026, lib/vertrieb/ab-tests.ts): Experimente
// eingetragen mit Hypothese, Ziel und Mindestmenge; B-Texte in Sie und Du ohne Gedankenstriche und ohne Versprechen;
// genau eine Änderung je Fassung in Angebotsmail, Bonus-, Zahlungs- und Terminerinnerung und Follow-up; Vorlagen-Katalog
// zeigt A und B.
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.APP_URL = "https://app.performancegrowth.de";
});
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { EXPERIMENTE, zuteilen } from "@/lib/experimente";
import { SPLITTEST_HYPOTHESE } from "@/lib/ab-hypothesen";
import {
  AB_ANGEBOT,
  AB_FOLLOWUP,
  AB_TERMIN,
  abHinweis,
  janeinAnweisung,
  janeinFrage,
  naechsteSchritteAngebot,
  naechsteSchritteZahlung,
  VERTRIEB_AB_TESTS,
  vorabFrageTermin,
} from "@/lib/vertrieb/ab-tests";
import { baueAngebotsMail } from "@/lib/email";
import { bonusMail } from "@/lib/vertrieb/bonus-erinnerung";
import { erinnerungsMail } from "@/lib/angebot-zahlungserinnerung";
import { inviteeMailContent } from "@/lib/vertrieb/buchung";
import { templateTexts } from "@/lib/vertrieb/followup";
import { vorlagenKatalog } from "@/lib/vertrieb/nachricht-vorschau";

const GEDANKENSTRICH = /[–—]/;
const now = new Date("2026-11-22T10:00:00Z");

describe("Experimente der Vertriebs-Nachrichten", () => {
  it("alle drei eingetragen, mit Hypothese, Ziel und Mindestmenge 50, starten angehalten bis zur Freigabe der B-Texte", () => {
    for (const key of VERTRIEB_AB_TESTS) {
      const d = EXPERIMENTE[key];
      expect(d, key).toBeTruthy();
      expect(d.min, key).toBe(50);
      expect((d as { aktiv?: false }).aktiv, key).toBe(false);
      expect(SPLITTEST_HYPOTHESE[key], key).toBeTruthy();
      expect(GEDANKENSTRICH.test(d.a + d.b + SPLITTEST_HYPOTHESE[key]), key).toBe(false);
    }
  });

  it("Ziele und Reife: Zahlung nach 21 Tagen, erschienen nur ausgewertet, Antwort erst 14 Tage nach Mail 1", () => {
    expect(EXPERIMENTE[AB_ANGEBOT].ziel).toBe("zahlung_eingerichtet");
    expect(EXPERIMENTE[AB_ANGEBOT].reifTage).toBe(21);
    expect(EXPERIMENTE[AB_ANGEBOT].anzeigeZiele).toContain("angebot_angenommen");
    expect(EXPERIMENTE[AB_TERMIN].ziel).toBe("erschienen");
    expect(EXPERIMENTE[AB_TERMIN].nurMitEreignis).toBe("termin_ausgewertet");
    expect(EXPERIMENTE[AB_FOLLOWUP].ziel).toBe("antwort");
    expect(EXPERIMENTE[AB_FOLLOWUP].nurMitEreignis).toBe("followup_reif");
  });

  it("Zuteilung fest je Einheit (Angebots-, Termin- bzw. Follow-up-ID)", () => {
    expect(zuteilen(AB_ANGEBOT, "offer_1")).toBe(zuteilen(AB_ANGEBOT, "offer_1"));
    const b = Array.from({ length: 1000 }, (_, i) => zuteilen(AB_TERMIN, `meeting_${i}`)).filter((v) => v === "b").length;
    expect(b).toBeGreaterThan(430);
    expect(b).toBeLessThan(570);
  });
});

describe("B-Texte", () => {
  it("Sie und Du, ohne Gedankenstriche, ohne Garantie", () => {
    const texte = [naechsteSchritteAngebot(false), naechsteSchritteAngebot(true), naechsteSchritteZahlung(false), naechsteSchritteZahlung(true), vorabFrageTermin(), vorabFrageTermin(true), janeinFrage(null), janeinFrage("https://x.de/t"), janeinAnweisung(true)];
    for (const t of texte) {
      expect(GEDANKENSTRICH.test(t), t).toBe(false);
      expect(t).not.toMatch(/garantie/i);
    }
    expect(naechsteSchritteAngebot(false)).toContain("Ihrer Annahme");
    expect(naechsteSchritteAngebot(true)).toContain("deiner Annahme");
    expect(naechsteSchritteAngebot(true)).not.toMatch(/\b(Sie|Ihr\w*)\b/);
    expect(naechsteSchritteZahlung(true)).toContain("deinen Zugang");
    expect(janeinFrage("https://x.de/t")).toContain("\nhttps://x.de/t");
  });

  it("Hinweis in der Vorschau nennt die Fassung", () => {
    expect(abHinweis(AB_TERMIN, "b")).toBe("A/B-Test: Dieser Kontakt bekommt Fassung B (mit Vorab-Frage nach der wichtigsten Frage fürs Gespräch).");
    expect(abHinweis(AB_ANGEBOT, "a", false)).toMatch(/^A\/B-Test: Fassung A/);
  });
});

describe("Genau eine Änderung je Nachricht", () => {
  const angebot = (naechsteSchritte: boolean, du = false) =>
    baueAngebotsMail({ greeting: "Hallo Herr Weber,", number: "PG-1", offerUrl: "https://app.performancegrowth.de/angebot/t", validUntil: now, du, naechsteSchritte });

  it("Angebotsmail: B hat den Absatz in Text und HTML, sonst gleich", () => {
    const a = angebot(false);
    const b = angebot(true);
    expect(a.text).not.toContain("So geht es nach");
    expect(b.text).toContain(naechsteSchritteAngebot(false));
    expect(b.html).toContain("So geht es nach Ihrer Annahme weiter");
    expect(b.subject).toBe(a.subject);
    expect(b.text.replace(`${naechsteSchritteAngebot(false)}\n\n`, "")).toBe(a.text);
    expect(angebot(true, true).text).toContain(naechsteSchritteAngebot(true));
  });

  it("Bonus-Erinnerung: B fügt den Absatz vor „Wenn noch etwas offen ist“ ein", () => {
    const o = { betrag: 300, fristIso: "2026-11-25", number: "PG-1", du: false, spaeterZahlen: false };
    const a = bonusMail("letzter", o);
    const b = bonusMail("letzter", { ...o, naechsteSchritte: true });
    expect(b.paragraphs).toHaveLength(a.paragraphs.length + 1);
    expect(b.paragraphs[2]).toBe(naechsteSchritteAngebot(false));
    expect(b.paragraphs.at(-1)).toBe(a.paragraphs.at(-1));
    expect(b.subject).toBe(a.subject);
  });

  it("Zahlungserinnerung: B nennt, was nach der Zahlung passiert, „Fragen?“ bleibt am Ende", () => {
    for (const du of [false, true]) {
      const a = erinnerungsMail({ number: "PG-1", startIso: "2026-12-01", stufe: 1, du });
      const b = erinnerungsMail({ number: "PG-1", startIso: "2026-12-01", stufe: 1, du, naechsteSchritte: true });
      expect(b.paragraphs).toEqual([...a.paragraphs.slice(0, 2), naechsteSchritteZahlung(du), ...a.paragraphs.slice(2)]);
    }
  });

  it("Terminerinnerung 24 Stunden vorher: B mit Vorab-Frage, Link zum Verschieben bleibt; 1 Stunde vorher unverändert", () => {
    const m = { title: "Kennenlerngespräch", startAt: now, joinUrl: "https://meet.example/x", inviteeName: "Max Muster", manageToken: "tok" };
    const a = inviteeMailContent("reminder", m);
    const b = inviteeMailContent("reminder", { ...m, vorabFrage: true });
    expect(b.paragraphs).toEqual([...a.paragraphs, vorabFrageTermin()]);
    expect(b.button).toEqual(a.button);
    expect(inviteeMailContent("soon", { ...m, vorabFrage: true }).paragraphs).toEqual(inviteeMailContent("soon", m).paragraphs);
  });

  it("Später-Follow-up: B ändert nur den Schluss von Mail 1, Mail 2 bleibt", () => {
    const c = { greeting: "Guten Tag Herr Weber,", replyMonth: "im August", hasLaterReply: true, timing: null, pitch: "Wir bringen Anfragen.", bookingUrl: "https://x.de/termin?k=1" };
    const a = templateTexts(c);
    const b = templateTexts({ ...c, janein: true });
    expect(b.body2).toBe(a.body2);
    expect(b.body1).toContain("Ist das Thema bei Ihnen noch aktuell?");
    expect(b.body1).toContain(c.bookingUrl);
    expect(a.body1).toContain("Hätten Sie in den nächsten Tagen Zeit");
    expect(b.body1.startsWith(a.body1.split("Hätten Sie")[0])).toBe(true);
  });
});

describe("Vorlagen-Katalog zeigt Fassung A und B", () => {
  it("jede Nachricht im Test hat zwei Teile mit Hinweis, B enthält die Änderung", () => {
    for (const an of ["sie", "du"] as const) {
      const eintraege = vorlagenKatalog(an, now).flatMap((g) => g.eintraege);
      const imTest = eintraege.filter((e) => e.abTest).map((e) => e.key);
      expect(imTest).toEqual(["termin-24h", "angebot-mail", "bonus-vorab", "bonus-letzter", "zahlung-1", "zahlung-2", "followup-1"]);
      for (const e of eintraege.filter((x) => x.abTest)) {
        expect(e.teile, e.key).toHaveLength(2);
        const [a, b] = e.teile;
        expect(a.hinweis, e.key).toMatch(/Fassung A/);
        expect(b.hinweis, e.key).toMatch(/Fassung B/);
        if (a.kanal === "email" && b.kanal === "email") {
          expect(b.html, e.key).not.toBe(a.html);
          expect(GEDANKENSTRICH.test(b.html.replace(/<[^>]+>/g, "")), e.key).toBe(false);
        }
      }
    }
  });
});
