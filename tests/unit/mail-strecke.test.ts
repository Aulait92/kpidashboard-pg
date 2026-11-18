// Mail-Strecke für Leads ohne WhatsApp (Ole, 18.11.2026): Token, Öffnungsfrage, Texte der Mails und SMS, Takt über
// 10 Tage mit Ruhezeit (lib/mail-strecke/token.ts, texte.ts). Rein, ohne Datenbank.
import { describe, expect, it } from "vitest";
import { pruefeStreckenToken, streckenToken, streckenUrl } from "@/lib/mail-strecke/token";
import {
  erstmailInhalt,
  faelligerSchritt,
  MAX_SMS,
  oeffnungsfrage,
  schliessenSatz,
  sendeFenster,
  smsAbsenderFuer,
  smsStreckeAn,
  smsText,
  TAKT,
  type ErstmailInput,
} from "@/lib/mail-strecke/texte";

const berlin = (s: string) => new Date(`${s}+01:00`); // November: MEZ

describe("Token der Antwortseite", () => {
  it("prüft die Signatur", () => {
    const t = streckenToken("cmabc1234567890xyz");
    expect(pruefeStreckenToken(t)).toBe("cmabc1234567890xyz");
    expect(pruefeStreckenToken(t.replace(/.$/, (c) => (c === "A" ? "B" : "A")))).toBeNull();
    expect(pruefeStreckenToken("cmabc1234567890xyz")).toBeNull();
    expect(pruefeStreckenToken(null)).toBeNull();
    expect(streckenUrl("cmabc1234567890xyz", { a: 1 })).toMatch(/\/t\/cmabc1234567890xyz\.[\w-]{22}\?a=1$/);
  });
});

describe("Öffnungsfrage", () => {
  it("nimmt die erste offene Frage mit 2 bis 3 Knöpfen", () => {
    const z = oeffnungsfrage("Zahnzusatzversicherung", [], "sie");
    expect(z.text).toBe("Welcher Tarifbaustein ist Ihnen am wichtigsten?");
    expect(z.knoepfe).toEqual(["Starker Zahnersatz", "Mit Zahnreinigung", "Beides vergleichen"]);
    const p = oeffnungsfrage("Privatschutz", [], "du");
    expect(p.knoepfe.length).toBeGreaterThanOrEqual(2);
    expect(p.text).toMatch(/versichert/);
  });
  it("fragt nichts, was das Formular schon beantwortet", () => {
    const f = oeffnungsfrage("PKV", [{ label: "Situation", value: "Angestellt" }], "sie");
    expect(f.text).not.toMatch(/beruflich/);
    expect(f.knoepfe.length).toBeGreaterThanOrEqual(2);
  });
  it("ohne Produkt: Video oder Telefon", () => {
    expect(oeffnungsfrage(null, [], "sie")).toMatchObject({ feld: "wunsch", knoepfe: ["Per Video", "Per Telefon"] });
  });
});

const basis = (o: Partial<ErstmailInput> = {}): ErstmailInput => ({
  an: "sie",
  anrede: "Guten Tag Frau Becker",
  betreffName: "Frau Becker",
  person: { nom: "Herr Kannapinn", dat: "Herrn Kannapinn" },
  source: "Zahnzusatzversicherung",
  ausloeser: "kein_whatsapp",
  frage: oeffnungsfrage("Zahnzusatzversicherung", [], "sie"),
  antwortLinks: ["https://x/t/a?a=0", "https://x/t/a?a=1", "https://x/t/a?a=2"],
  zeiten: [
    { label: "Do., 19.11. um 10:00 Uhr", url: "https://x/t/a?z=0" },
    { label: "Fr., 20.11. um 14:00 Uhr", url: "https://x/t/a?z=1" },
  ],
  andereZeit: "https://x/book/k?t=a",
  seite: "https://x/t/a",
  erstinfoPdf: true,
  erstinfoUrl: "https://x/erstinformation/1",
  impressumUrl: "https://makler.de/impressum",
  datenschutzUrl: "https://makler.de/datenschutz",
  abmeldeUrl: "https://x/abmelden/l1",
  signatur: { text: "Viele Grüße\nAnna Berater", html: "<p>Viele Grüße<br>Anna Berater</p>" },
  ...o,
});

describe("Erstmail", () => {
  it("wie v8 mit KI-Hinweis, Frage, zwei Zeiten, Andere Zeit, Erstinformation, Impressum, Abmeldelink", () => {
    const m = erstmailInhalt(basis());
    expect(m.subject).toBe("Frau Becker, Ihre Anfrage zur Zahnzusatzversicherung");
    expect(m.text).toMatch(/^Guten Tag Frau Becker,\n\ndanke für Ihre Anfrage zur Zahnzusatzversicherung! Hier schreibt der digitale KI-Assistent von Herrn Kannapinn\./);
    expect(m.text).toContain("Per WhatsApp kam meine Nachricht leider nicht an");
    expect(m.text).toContain("Starker Zahnersatz: https://x/t/a?a=0");
    expect(m.text).toContain("Do., 19.11. um 10:00 Uhr: https://x/t/a?z=0");
    expect(m.text).toContain("Andere Zeit: https://x/book/k?t=a");
    expect(m.text).toContain("Im Anhang finden Sie die Erstinformation");
    expect(m.text).toContain("Impressum: https://makler.de/impressum");
    expect(m.text).toContain("abmelden: https://x/abmelden/l1");
    expect(m.html).toContain('href="https://x/t/a?z=1"');
    for (const t of [m.subject, m.text, m.html]) expect(t).not.toMatch(/[–—]/);
    expect(m.text).not.toMatch(/\d+ Minuten/);
  });
  it("Du-Fassung", () => {
    const m = erstmailInhalt(basis({ an: "du", anrede: "Hallo Julia", betreffName: "Julia", frage: oeffnungsfrage("Zahnzusatzversicherung", [], "du"), person: { nom: "Anna", dat: "Anna" } }));
    expect(m.text).toContain("danke für deine Anfrage");
    expect(m.text).toContain("Welcher Tarifbaustein ist dir am wichtigsten?");
    expect(m.text).toContain("Im Anhang findest du");
    expect(m.text).not.toMatch(/\bSie\b|\bIhnen\b/);
  });
  it("ohne Kalender: Knopf „Termin wünschen“ auf die Seite", () => {
    const m = erstmailInhalt(basis({ zeiten: [], andereZeit: null, ausloeser: "keine_nummer" }));
    expect(m.text).toContain("Termin wünschen: https://x/t/a");
    expect(m.text).not.toContain("WhatsApp");
  });
  it("Takt: Tag 2 neue Zeiten, Tag 6 Nutzen, Tag 10 schließen (beide Fassungen)", () => {
    const z = erstmailInhalt(basis({ art: "zeiten" }));
    expect(z.subject).toBe("Zwei neue Zeiten für Ihr Gespräch mit Herrn Kannapinn");
    expect(z.text).not.toContain("Tarifbaustein");
    expect(z.text).toContain("KI-Assistent");
    const n = erstmailInhalt(basis({ art: "nutzen", nutzen: "In einem kurzen Videotermin zeigt Ihnen Herr Kannapinn, was eine Zahnzusatzversicherung für Sie kostet." }));
    expect(n.text).toContain("zeigt Ihnen Herr Kannapinn");
    expect(n.text).toContain("https://x/t/a?z=0");
    const s = erstmailInhalt(basis({ art: "schliessen" }));
    expect(s.subject).toBe("Soll ich Ihre Anfrage schließen?");
    expect(s.text).toContain("Soll ich Ihre Anfrage schließen? Ein Klick genügt, wenn Sie doch noch einen Termin möchten.");
    expect(s.text).toContain("Doch noch einen Termin: https://x/t/a");
    expect(s.text).not.toContain("?z=0");
    expect(schliessenSatz("du")).toBe("Soll ich deine Anfrage schließen? Ein Klick genügt, wenn du doch noch einen Termin möchtest.");
    for (const m of [z, n, s]) expect(`${m.subject}${m.text}`).not.toMatch(/[–—]/);
  });
});

describe("SMS", () => {
  it("Schalter Standard aus", () => {
    expect(smsStreckeAn({})).toBe(false);
    expect(smsStreckeAn({ MAIL_STRECKE_SMS: "an" })).toBe(true);
    expect(MAX_SMS).toBe(2);
  });
  it("Absender: Name nur mit höchstens 11 Zeichen, Buchstaben und Ziffern", () => {
    expect(smsAbsenderFuer("Anna Berg")).toBe("Anna Berg");
    expect(smsAbsenderFuer("Christian Kannapinn")).toBeNull();
    expect(smsAbsenderFuer("Jörg Möller")).toBeNull();
    expect(smsAbsenderFuer("")).toBeNull();
  });
  it("kurz, mit Link und Abmeldelink, ohne Gedankenstriche", () => {
    const t = smsText({ an: "sie", anredeName: "Frau Becker", person: { nom: "Herr Kannapinn", dat: "Herrn Kannapinn" }, source: "Zahnzusatzversicherung", link: "https://x/t/abc", abmelden: "https://x/t/abc?ab=1", art: "erst" });
    expect(t).toContain("https://x/t/abc");
    expect(t).toContain("Keine SMS mehr: https://x/t/abc?ab=1");
    expect(t).toContain("KI-Assistent");
    expect(t).not.toMatch(/[–—]/);
    expect(t.length).toBeLessThan(230);
  });
});

describe("Takt über 10 Tage", () => {
  const start = berlin("2026-11-18T10:00:00");
  it("Ruhezeit: nichts zwischen 20 und 8 Uhr", () => {
    expect(sendeFenster(berlin("2026-11-19T07:59:00"))).toBe(false);
    expect(sendeFenster(berlin("2026-11-19T08:00:00"))).toBe(true);
    expect(sendeFenster(berlin("2026-11-19T19:59:00"))).toBe(true);
    expect(sendeFenster(berlin("2026-11-19T20:00:00"))).toBe(false);
  });
  it("Tag 2 vormittags Mail, Tag 4 nachmittags SMS, Tag 6 abends Mail, Tag 10 letzte Mail", () => {
    expect(TAKT.map((t) => [t.tag, t.kanal])).toEqual([
      [2, "email"],
      [4, "sms"],
      [6, "email"],
      [10, "email"],
    ]);
    expect(faelligerSchritt({ start, stufe: 0, now: berlin("2026-11-18T18:00:00") })).toBeNull();
    expect(faelligerSchritt({ start, stufe: 0, now: berlin("2026-11-19T08:30:00") })).toBeNull();
    expect(faelligerSchritt({ start, stufe: 0, now: berlin("2026-11-19T09:05:00") })?.art).toBe("zeiten");
    expect(faelligerSchritt({ start, stufe: 1, now: berlin("2026-11-20T15:00:00") })).toBeNull();
    expect(faelligerSchritt({ start, stufe: 1, now: berlin("2026-11-21T13:59:00") })).toBeNull();
    expect(faelligerSchritt({ start, stufe: 1, now: berlin("2026-11-21T14:01:00") })?.kanal).toBe("sms");
    expect(faelligerSchritt({ start, stufe: 2, now: berlin("2026-11-23T17:00:00") })).toBeNull();
    expect(faelligerSchritt({ start, stufe: 2, now: berlin("2026-11-23T18:30:00") })?.art).toBe("nutzen");
    expect(faelligerSchritt({ start, stufe: 2, now: berlin("2026-11-23T20:30:00") })).toBeNull();
    expect(faelligerSchritt({ start, stufe: 3, now: berlin("2026-11-27T10:00:00") })?.art).toBe("schliessen");
    expect(faelligerSchritt({ start, stufe: 4, now: berlin("2026-12-01T10:00:00") })).toBeNull();
  });
  it("Lead nachts: Erstmail sofort, Tag 2 ist der nächste Kalendertag", () => {
    const nacht = berlin("2026-11-18T23:30:00");
    expect(faelligerSchritt({ start: nacht, stufe: 0, now: berlin("2026-11-19T09:30:00") })?.art).toBe("zeiten");
  });
});

describe("Antwortseite auf der Buchungsadresse", () => {
  it("/t/<token> ist eine Seite für Endkunden (auch POST), kein Kurzlink", async () => {
    const { decidePublicHost, END_CUSTOMER_PREFIXES, RESERVED_SEGMENTS } = await import("@/lib/public-booking-host");
    expect(END_CUSTOMER_PREFIXES).toContain("/t");
    expect(RESERVED_SEGMENTS.has("t")).toBe(true);
    const host = "termin.example.org";
    expect(decidePublicHost({ host, pathname: "/t/abc.def", bookingUrl: `https://${host}` }).kind).toBe("serve");
    expect(decidePublicHost({ host, pathname: "/t/abc.def", method: "POST", bookingUrl: `https://${host}` }).kind).toBe("serve");
  });
});
