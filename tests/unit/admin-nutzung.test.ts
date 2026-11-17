// Nutzungsmessung im Admin (Ole, 18.11.2026): Pfade normalisieren, Funktions-IDs lesen, Dedupe (lib/admin-nutzung.ts).
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bereinige, ereignisseFuerKlick, funktionsIds, MAX_IDS_JE_GRUPPE, normalisiereAdminPfad, oberflaecheFuer } from "@/lib/admin-nutzung";

const CUID = "cmh3x9k2a0001qz8y7v6u5t4s";

/** Alle Seiten unter src/app/admin als Adressmuster (Route-Gruppen wie „(liste)“ entfernt). */
function adminSeiten(dir = join(process.cwd(), "src/app/admin"), basis = "/admin"): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      const teil = /^\(.*\)$/.test(name) ? "" : `/${name}`;
      out.push(...adminSeiten(p, basis + teil));
    } else if (name === "page.tsx") out.push(basis);
  }
  return out;
}

describe("Admin-Nutzung: Pfade", () => {
  it("entfernt Query, Hash und Schrägstrich am Ende, IDs werden :id", () => {
    expect(normalisiereAdminPfad(`/admin/neu/kunden/${CUID}/leads?q=Müller&lead=123#x`)).toBe("/admin/neu/kunden/:id/leads");
    expect(normalisiereAdminPfad("/admin/kunden/cust_google_review_demo/")).toBe("/admin/kunden/:id");
    expect(normalisiereAdminPfad("/admin/neu/leads/werbekonten/act_123456789")).toBe("/admin/neu/leads/werbekonten/:id");
    expect(normalisiereAdminPfad("/admin/monatsberichte/42")).toBe("/admin/monatsberichte/:id");
    expect(normalisiereAdminPfad("/admin/vertrieb/kontakte/Max%20Mustermann")).toBe("/admin/vertrieb/kontakte/:id");
    expect(normalisiereAdminPfad("/admin/neu/marketing/unterlagen/praesentation/makler")).toBe("/admin/neu/marketing/unterlagen/praesentation/makler");
    expect(normalisiereAdminPfad("/")).toBe("/");
    expect(normalisiereAdminPfad("/admin")).toBe("/admin");
  });

  it("zählt nichts außerhalb des Admins (Vorschau „Als Kunde ansehen“ läuft unter /buyer)", () => {
    expect(normalisiereAdminPfad("/buyer")).toBeNull();
    expect(normalisiereAdminPfad("/buyer/leads/abc")).toBeNull();
    expect(normalisiereAdminPfad("/administrator")).toBeNull();
    expect(normalisiereAdminPfad("https://x.test/admin")).toBeNull();
    expect(normalisiereAdminPfad("")).toBeNull();
    expect(normalisiereAdminPfad(undefined)).toBeNull();
  });

  it("alt/neu nach Pfad", () => {
    expect(oberflaecheFuer("/admin/neu")).toBe("neu");
    expect(oberflaecheFuer("/admin/neu/zahlen")).toBe("neu");
    expect(oberflaecheFuer("/admin/heute")).toBe("alt");
    expect(oberflaecheFuer("/")).toBe("alt");
  });

  it("jede Admin-Seite: feste Abschnitte bleiben, dynamische [id] werden :id", () => {
    const seiten = adminSeiten();
    expect(seiten.length).toBeGreaterThan(50);
    for (const muster of seiten) {
      // Feste Abschnitte müssen die Wort-Regel erfüllen, sonst würden sie in der Messung zu :id
      const fest = muster.replace(/\[[^\]]+\]/g, "x");
      expect(normalisiereAdminPfad(fest), muster).toBe(fest);
      if (!muster.includes("[id]")) continue;
      for (const id of [CUID, "cust_google_review_demo", "123"]) {
        expect(normalisiereAdminPfad(muster.replaceAll("[id]", id)), muster).toBe(muster.replaceAll("[id]", ":id"));
      }
    }
  });
});

describe("Admin-Nutzung: Funktionen und Dedupe", () => {
  it("liest eine oder mehrere IDs (Leerzeichen oder Komma), Ungültiges fällt weg", () => {
    expect(funktionsIds("page--seitenleiste")).toEqual(["page--seitenleiste"]);
    expect(funktionsIds("a--b c--d,e--f  a--b")).toEqual(["a--b", "c--d", "e--f"]);
    expect(funktionsIds("<script> Max Mustermann ok--1")).toEqual(["ok--1"]);
    expect(funktionsIds(Array.from({ length: 30 }, (_, i) => `f--${i}`).join(" "))).toHaveLength(MAX_IDS_JE_GRUPPE);
    expect(funktionsIds(null)).toEqual([]);
  });

  it("Klick: eine ID = funktion, mehrere = gruppe je ID", () => {
    expect(ereignisseFuerKlick("x--y", "neu", 1)).toEqual([{ a: "funktion", k: "x--y", o: "neu", t: 1 }]);
    expect(ereignisseFuerKlick("x--y z--w", "alt", 1).map((e) => [e.a, e.k])).toEqual([
      ["gruppe", "x--y"],
      ["gruppe", "z--w"],
    ]);
    expect(ereignisseFuerKlick("", "neu", 1)).toEqual([]);
  });

  it("gleicher Schlüssel innerhalb 1 s zählt einmal, danach wieder", () => {
    const e = (k: string, t: number) => ({ a: "funktion", k, o: "neu", t });
    const r = bereinige([e("a--b", 1000), e("a--b", 1500), e("c--d", 1600), e("a--b", 2100)]);
    expect(r.map((x) => [x.k, x.t])).toEqual([
      ["a--b", 1000],
      ["c--d", 1600],
      ["a--b", 2100],
    ]);
    // Über Sendungen hinweg (Map mit dem letzten Zeitpunkt)
    const zuletzt = new Map([["funktion|a--b", 5000]]);
    expect(bereinige([e("a--b", 5400)], zuletzt)).toEqual([]);
  });

  it("Seiten werden auf dem Server neu normalisiert, Oberfläche kommt aus dem Pfad", () => {
    const r = bereinige([
      { a: "seite", k: `/admin/neu/kunden/${CUID}?tab=1`, o: "alt", t: 1 },
      { a: "seite", k: "/buyer/leads", o: "alt", t: 2 },
      { a: "klick", k: "x--y", o: "neu", t: 3 },
      { a: "funktion", k: "x--y", o: "anders", t: 4 },
      { a: "funktion", k: "x--y", o: "neu" },
    ]);
    expect(r).toEqual([{ a: "seite", k: "/admin/neu/kunden/:id", o: "neu", t: 1 }]);
  });
});
