// Rückmeldung des Pay-per-Lead-Käufers mit einem Tipp (Ole, 25.11.2026): signierter Link, Wiedervorlage am nächsten
// Werktag 9 Uhr, Mail-Block, Texte ohne Gedankenstriche, Morgen-Erinnerung „Heute fällig“.
import { describe, expect, it } from "vitest";
import {
  berlinUhr,
  kurzName,
  naechsterWerktag9,
  RUECKMELDUNG_LABEL,
  rueckmeldungMailBlock,
  wiedervorlageText,
} from "@/lib/ppl/rueckmeldung";
import { pruefeRueckmeldungToken, rueckmeldungToken, rueckmeldungTokenTeile } from "@/lib/ppl/rueckmeldung-token";
import { morgenText, reminderText } from "@/lib/next-step-reminder";

const SECRET = "localtestsecret_localtestsecret_0123456789";
const LEAD = "cmabcdefghijklmnopqrstuvw";
const KUNDE = "cmkunde00000000000000000a";

describe("Rückmelde-Link", () => {
  const now = new Date("2026-11-25T10:00:00Z");
  const token = rueckmeldungToken(LEAD, KUNDE, now, SECRET);

  it("enthält nur Lead-ID, Ablauf und Signatur (keine Personendaten, kein Käufer)", () => {
    const teile = token.split(".");
    expect(teile).toHaveLength(3);
    expect(teile[0]).toBe(LEAD);
    expect(token).not.toContain(KUNDE);
    expect(rueckmeldungTokenTeile(token)?.ablauf).toBe(Math.floor(now.getTime() / 1000) + 30 * 86_400);
  });

  it("gilt für diesen Käufer 30 Tage, sonst nicht", () => {
    expect(pruefeRueckmeldungToken(token, KUNDE, now, SECRET)).toEqual({ ok: true, leadId: LEAD });
    expect(pruefeRueckmeldungToken(token, "cmanderer0000000000000000", now, SECRET)).toEqual({ ok: false, grund: "ungueltig" });
    expect(pruefeRueckmeldungToken(token, KUNDE, new Date(now.getTime() + 31 * 86_400_000), SECRET)).toEqual({ ok: false, grund: "abgelaufen" });
    expect(pruefeRueckmeldungToken(token, KUNDE, now, "anderes_geheimnis_anderes_geheimnis")).toEqual({ ok: false, grund: "ungueltig" });
  });

  it("verändert: Lead-ID, Ablauf oder Signatur", () => {
    const [l, e, s] = token.split(".");
    expect(pruefeRueckmeldungToken(`cmxbcdefghijklmnopqrstuvw.${e}.${s}`, KUNDE, now, SECRET).ok).toBe(false);
    expect(pruefeRueckmeldungToken(`${l}.${Number(e) + 86_400}.${s}`, KUNDE, now, SECRET).ok).toBe(false);
    expect(pruefeRueckmeldungToken(`${l}.${e}.${s.slice(0, -1)}A`, KUNDE, now, SECRET).ok).toBe(false);
    expect(pruefeRueckmeldungToken("kaputt", KUNDE, now, SECRET).ok).toBe(false);
    expect(() => rueckmeldungToken(LEAD, KUNDE, now, "kurz")).toThrow();
  });
});

describe("Wiedervorlage am nächsten Werktag 9 Uhr (Berlin)", () => {
  it("Mittwoch → Donnerstag 9 Uhr (Winterzeit)", () => {
    expect(naechsterWerktag9(new Date("2026-11-25T15:00:00Z")).toISOString()).toBe("2026-11-26T08:00:00.000Z");
  });
  it("Freitag und Samstag → Montag", () => {
    expect(naechsterWerktag9(new Date("2026-11-27T15:00:00Z")).toISOString()).toBe("2026-11-30T08:00:00.000Z");
    expect(naechsterWerktag9(new Date("2026-11-28T09:00:00Z")).toISOString()).toBe("2026-11-30T08:00:00.000Z");
  });
  it("kurz vor Mitternacht Berlin zählt der Berliner Tag; Sommerzeit 9 Uhr = 7 Uhr UTC", () => {
    // Do 23:30 Berlin = Do 22:30 UTC → Freitag
    expect(naechsterWerktag9(new Date("2026-11-26T22:30:00Z")).toISOString()).toBe("2026-11-27T08:00:00.000Z");
    expect(berlinUhr("2026-07-01", 9).toISOString()).toBe("2026-07-01T07:00:00.000Z");
  });
  it("Text für Toast und Seite", () => {
    expect(wiedervorlageText(new Date("2026-11-26T08:00:00Z"))).toBe("Do., 26.11., 9 Uhr");
  });
});

describe("Liefer-E-Mail: drei Knöpfe", () => {
  const b = rueckmeldungMailBlock("https://app.example.test", "TOKEN");
  it("je Antwort ein Link auf die Bestätigungsseite", () => {
    expect(b.html).toContain('href="https://app.example.test/rueckmeldung/TOKEN?a=erreicht"');
    expect(b.html).toContain('href="https://app.example.test/rueckmeldung/TOKEN?a=nicht_erreicht"');
    expect(b.html).toContain('href="https://app.example.test/rueckmeldung/TOKEN?a=termin"');
    for (const l of Object.values(RUECKMELDUNG_LABEL)) expect(b.html).toContain(`>${l}</a>`);
    expect(b.text).toEqual([
      "Wie lief Ihr Anruf? Ein Klick genügt:",
      "Erreicht: https://app.example.test/rueckmeldung/TOKEN?a=erreicht",
      "Nicht erreicht: https://app.example.test/rueckmeldung/TOKEN?a=nicht_erreicht",
      "Termin vereinbart: https://app.example.test/rueckmeldung/TOKEN?a=termin",
    ]);
  });
  it("ohne Gedankenstriche", () => {
    expect(`${b.html}${b.text.join("")}`).not.toMatch(/[–—]/);
  });
  it("Name auf der Seite ohne Login gekürzt", () => {
    expect(kurzName("Max Mustermann")).toBe("Max M.");
    expect(kurzName("Anna Maria Beispiel")).toBe("Anna B.");
    expect(kurzName("Cher")).toBe("Cher");
    expect(kurzName(null)).toBe("Ihr Lead");
  });
});

describe("Morgen-Erinnerung „Heute fällig“", () => {
  it("ohne fällige Wiedervorlage wie bisher", () => {
    expect(morgenText({ ohneSchritt: 5, resultMissing: 2, faellig: 0, ueberfaellig: 0 })).toEqual(reminderText(5, 2));
  });
  it("fällige Wiedervorlagen zuerst, überfällige genannt", () => {
    expect(morgenText({ ohneSchritt: 0, resultMissing: 0, faellig: 3, ueberfaellig: 2 })).toEqual({
      title: "Heute fällig: 3 Wiedervorlagen",
      body: "Davon 2 überfällig. Auf „Heute“ mit einem Tipp erledigen oder auf morgen schieben.",
    });
    expect(morgenText({ ohneSchritt: 1, resultMissing: 0, faellig: 1, ueberfaellig: 1 })).toEqual({
      title: "Heute fällig: 1 Wiedervorlage",
      body: "Sie ist überfällig. Dazu braucht 1 Lead einen nächsten Schritt.",
    });
    const t = morgenText({ ohneSchritt: 4, resultMissing: 1, faellig: 2, ueberfaellig: 0 });
    expect(t.body).toBe("Dazu brauchen 4 Leads einen nächsten Schritt.");
    expect(`${t.title}${t.body}`).not.toMatch(/[–—]/);
  });
});
