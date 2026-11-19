// Kontakte für Kalt-Mails mischen (Ole, 19.11.2026): Reißverschluss nach Gesellschaft, darin nach Mail-Domain,
// Tagesportion mit Obergrenze je Ziel-Domain. Synthetische Daten.
import { describe, expect, it } from "vitest";
import { mailDomain, mischen, reissverschluss, tagesPortion, verteilenNachGroesse } from "@/lib/vertrieb/mischen";
import { istVermittlerListe, kopfSpalten } from "@/lib/vertrieb/vermittler-format";

type K = { g: string; email: string };

function liste(spec: Record<string, number>, domain: (g: string, i: number) => string): K[] {
  // blockweise je Gesellschaft, wie die Quelle sie liefert
  return Object.entries(spec).flatMap(([g, n]) => Array.from({ length: n }, (_, i) => ({ g, email: `p${i}@${domain(g, i)}` })));
}

/** Nie zweimal hintereinander dieselbe Gruppe, solange (ab dieser Stelle) noch eine andere übrig ist. */
function keineNachbarn<T>(out: T[], key: (t: T) => string) {
  for (let i = 1; i < out.length; i++) {
    if (key(out[i]) !== key(out[i - 1])) continue;
    const andereUebrig = out.slice(i).some((t) => key(t) !== key(out[i]));
    expect(andereUebrig, `Stelle ${i}: zweimal ${key(out[i])}, obwohl andere übrig`).toBe(false);
  }
}

describe("mailDomain", () => {
  it("nimmt die letzten zwei Teile (Konzern-Gateway)", () => {
    expect(mailDomain("info@a-baum.lvm.de")).toBe("lvm.de");
    expect(mailDomain("X@GS.Provinzial.com")).toBe("provinzial.com");
    expect(mailDomain("max@ergo.de")).toBe("ergo.de");
    expect(mailDomain("")).toBe("");
  });
});

describe("reissverschluss", () => {
  it("keine zwei derselben Gesellschaft hintereinander, solange andere übrig sind", () => {
    const items = liste({ DVAG: 40, ERGO: 20, LVM: 10, AXA: 3 }, (g) => `${g.toLowerCase()}.test`);
    const out = reissverschluss(items, (k) => k.g);
    expect(out).toHaveLength(items.length);
    expect(new Set(out)).toEqual(new Set(items));
    keineNachbarn(out, (k) => k.g);
  });

  it("verteilt im Verhältnis: jede Gesellschaft schon im ersten Zehntel, große nicht zuerst aufgebraucht", () => {
    const items = liste({ DVAG: 400, ERGO: 200, SIGNAL: 150, LVM: 100, Provinzial: 50, HDI: 20 }, (g) => `${g.toLowerCase()}.test`);
    const out = reissverschluss(items, (k) => k.g);
    const erstesZehntel = new Set(out.slice(0, 92).map((k) => k.g));
    expect(erstesZehntel.size).toBe(6);
    // DVAG (43 %) liegt in jedem Viertel zwischen 30 und 55 %
    for (let v = 0; v < 4; v++) {
      const teil = out.slice(v * 230, (v + 1) * 230);
      const anteil = teil.filter((k) => k.g === "DVAG").length / teil.length;
      expect(anteil).toBeGreaterThan(0.3);
      expect(anteil).toBeLessThan(0.55);
    }
  });

  it("überwiegt eine Gruppe, kommt ihr Rest am Ende (unvermeidbar), vorher aber nie doppelt", () => {
    const items = liste({ A: 10, B: 2 }, () => "x.test");
    const out = reissverschluss(items, (k) => k.g);
    keineNachbarn(out, (k) => k.g);
    expect(out.map((k) => k.g).join("").endsWith("AAAA")).toBe(true);
  });
});

describe("verteilenNachGroesse", () => {
  it("mischt viele Domains, nie zweimal dieselbe hintereinander, solange andere übrig", () => {
    const items = Array.from({ length: 3000 }, (_, i) => ({ g: "x", email: `p${i}@${i % 3 === 0 ? "konzern.test" : `agentur${i % 700}.test`}` }));
    const out = verteilenNachGroesse(items, (k) => mailDomain(k.email));
    expect(out).toHaveLength(3000);
    keineNachbarn(out, (k) => mailDomain(k.email));
  });
});

describe("mischen", () => {
  it("Gesellschaft im Reißverschluss, darin die Domains verteilt; 30.000 Einträge schnell", () => {
    const items = liste({ DVAG: 12000, ERGO: 8000, LVM: 6000, Makler: 4000 }, (g, i) =>
      g === "LVM" ? `agentur${i}.lvm.test` : g === "Makler" ? (i % 2 ? `makler${i % 900}.test` : "gmail.test") : `${g.toLowerCase()}.test`,
    );
    const t = Date.now();
    const out = mischen(items, (k) => k.g, (k) => k.email);
    expect(Date.now() - t).toBeLessThan(3000);
    expect(out).toHaveLength(30000);
    keineNachbarn(out, (k) => k.g);
    // Makler: Freemail-Domain nicht zweimal hintereinander innerhalb der Gesellschaft
    const makler = out.filter((k) => k.g === "Makler");
    keineNachbarn(makler, (k) => mailDomain(k.email));
  });
});

describe("tagesPortion", () => {
  it("höchstens N je Ziel-Domain und Tag, Reihenfolge bleibt, Rest für später", () => {
    const items = mischen(liste({ DVAG: 200, ERGO: 100, LVM: 100 }, (g, i) => (g === "LVM" ? `a${i}.lvm.test` : `${g.toLowerCase()}.test`)), (k) => k.g, (k) => k.email);
    const portion = tagesPortion(items, (k) => k.email, { menge: 500, proDomain: 30 });
    const je = new Map<string, number>();
    for (const k of portion) je.set(mailDomain(k.email), (je.get(mailDomain(k.email)) ?? 0) + 1);
    expect(Math.max(...je.values())).toBeLessThanOrEqual(30);
    expect(portion).toHaveLength(90);
    expect(portion.map((k) => items.indexOf(k))).toEqual([...portion.map((k) => items.indexOf(k))].sort((a, b) => a - b));
  });

  it("zählt schon heute Vergebenes mit und hält die Tagesmenge ein", () => {
    const items = Array.from({ length: 100 }, (_, i) => ({ g: "x", email: `p${i}@d${i % 10}.test` }));
    expect(tagesPortion(items, (k) => k.email, { menge: 15, proDomain: 5 })).toHaveLength(15);
    const schon = new Map([["d0.test", 5]]);
    expect(tagesPortion(items, (k) => k.email, { menge: 100, proDomain: 5, schon }).some((k) => k.email.endsWith("@d0.test"))).toBe(false);
  });
});

describe("Vermittlerliste erkennen", () => {
  const kopf = "quelle;gesellschaft;typ;firma;ansprechpartner;strasse;plz;ort;telefon;website;email;email_quelle;email_muster_vermutet;quelle_url;abgerufen_am";
  it("am Semikolon-Kopf, auch mit BOM und Anführungszeichen", () => {
    expect(istVermittlerListe(`${kopf}\nx;y`)).toBe(true);
    expect(istVermittlerListe(`﻿${kopf.split(";").map((c) => `"${c.toUpperCase()}"`).join(";")}\r\n`)).toBe(true);
    expect(kopfSpalten(`﻿${kopf}`)[0]).toBe("quelle");
  });
  it("bisherige Agenturliste (Komma) bleibt beim alten Import", () => {
    expect(istVermittlerListe("name,email,phone,street,zip,city\nA,a@b.test,1,x,1,y")).toBe(false);
    expect(istVermittlerListe("name;email;phone\nA;a@b.test;1")).toBe(false);
  });
});
