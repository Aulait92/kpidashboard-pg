import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bereichFuer as bereichFuerView, fundstellen, stand } from "../../tools/admin-neu/inventar-stand.mjs";
import { BEREICHE, SEITEN, bereichFuer, reiterFuer, seiteFuer, NEU_EINTRAEGE, SUCH_SEITEN } from "@/lib/admin-neu/navigation";
import { BLEIBT, ENTFERNT, OFFEN } from "@/lib/admin-neu/offen";
import { UMZUG, neuerPfad } from "@/lib/admin-neu/umzug";

// Abnahme des neuen Admins (docs/ux/admin-neu/README.md): Keine Funktion aus dem Inventar darf verloren gehen.
// Jede Funktion ist entweder im neuen UI vorhanden (data-funktion="<id>" unter src/app/admin/neu bzw.
// src/components/admin-neu) oder steht in src/lib/admin-neu/offen/<bereich>.ts (bzw. BLEIBT).

type Eintrag = { id: string; funktion: string; demo_view: string; bereich: string; status_neu: string; ort_neu: string; heute: string };

const ROOT = join(__dirname, "../..");
const inventar: Eintrag[] = JSON.parse(readFileSync(join(ROOT, "docs/ux/admin-neu/funktionsinventar.json"), "utf8"));
const fund: Map<string, Set<string>> = fundstellen(ROOT);
const offenListe = Object.entries(OFFEN).flatMap(([bereich, ids]) => ids.map((id) => ({ bereich, id })));
const offen = new Set(offenListe.map((o) => o.id));
const bleibt = new Set(BLEIBT);
const entfernt = new Set(ENTFERNT);
const ids = new Set(inventar.map((e) => e.id));

describe("Funktionsinventar neuer Admin", () => {
  it("jede Funktion hat eine eindeutige id", () => {
    expect(inventar.every((e) => typeof e.id === "string" && e.id.includes("--"))).toBe(true);
    expect(ids.size).toBe(inventar.length);
  });

  it("keine Funktion geht verloren: vorhanden, offen, bleibt oder bewusst entfernt", () => {
    const verloren = inventar.filter((e) => !fund.has(e.id) && !offen.has(e.id) && !bleibt.has(e.id) && !entfernt.has(e.id));
    expect(
      verloren.map((e) => `${e.id} (${e.heute}: ${e.funktion})`),
      "Funktion weder im neuen UI (data-funktion) noch in src/lib/admin-neu/offen/*.ts",
    ).toEqual([]);
  });

  it("gebaute Funktionen stehen nicht mehr in der Liste „offen“", () => {
    const doppelt = offenListe.filter((o) => fund.has(o.id)).map((o) => `${o.id} → aus offen/${o.bereich}.ts streichen`);
    expect(doppelt).toEqual([]);
  });

  it("entfernte Funktionen (Admin v2 A4) stehen nirgends mehr im neuen Admin", () => {
    expect(ENTFERNT.filter((id) => fund.has(id)).map((id) => `${id} in ${[...fund.get(id)!].join(", ")}`)).toEqual([]);
    expect(ENTFERNT.filter((id) => !ids.has(id) || bleibt.has(id) || offen.has(id))).toEqual([]);
    expect(new Set(ENTFERNT).size).toBe(ENTFERNT.length);
    expect(inventar.filter((e) => e.status_neu === "entfernt").length).toBe(ENTFERNT.length);
  });

  it("offen und BLEIBT enthalten nur bekannte ids, jede nur einmal", () => {
    expect(offenListe.filter((o) => !ids.has(o.id)).map((o) => o.id)).toEqual([]);
    expect(offenListe.length).toBe(offen.size);
    expect(BLEIBT.filter((id) => !ids.has(id) || offen.has(id))).toEqual([]);
  });

  it("data-funktion im neuen UI nennt nur ids aus dem Inventar (Tippfehler)", () => {
    const unbekannt = [...fund.entries()].filter(([w]) => /^[a-z0-9-]+--[a-z0-9-]+$/.test(w) && !ids.has(w)).map(([w, f]) => `${w} in ${[...f].join(", ")}`);
    expect(unbekannt).toEqual([]);
  });

  it("Inventar-Stand (status_neu, ort_neu) ist fortgeschrieben", () => {
    const soll = stand(inventar, ROOT) as Eintrag[];
    const abweichend = soll.filter((s, i) => s.status_neu !== inventar[i].status_neu || s.ort_neu !== inventar[i].ort_neu || s.bereich !== inventar[i].bereich);
    expect(abweichend.map((e) => e.id), "node tools/admin-neu/inventar-stand.mjs ausführen").toEqual([]);
  });
});

describe("Navigation neuer Admin", () => {
  it("jede Ansicht aus dem Inventar hat eine Seite", () => {
    const views = new Set(SEITEN.map((s) => s.view));
    const ohneSeite = [...new Set(inventar.map((e) => e.demo_view))].filter((v) => v !== "mehr" && !views.has(v));
    expect(ohneSeite).toEqual([]);
  });

  it("jede Seite hat eine page.tsx (Platzhalter oder echt)", () => {
    const fehlt = SEITEN.filter((s) => !existsSync(join(ROOT, "src/app", s.pfad.slice(1), "page.tsx"))).map((s) => s.pfad);
    expect(fehlt, "node tools/admin-neu/platzhalter.mjs").toEqual([]);
  });

  it("Pfade sind eindeutig und liegen unter /admin/neu", () => {
    const pfade = SEITEN.map((s) => s.pfad);
    expect(new Set(pfade).size).toBe(pfade.length);
    expect(pfade.every((p) => p === "/admin/neu" || p.startsWith("/admin/neu/"))).toBe(true);
    expect(BEREICHE.every((b) => b.seiten.some((s) => s.pfad === b.pfad))).toBe(true);
  });

  it("Bereich und Seite werden aus der Adresse erkannt (Rollen, Admin v2)", () => {
    expect(bereichFuer("/admin/neu")?.id).toBe("mein-tag");
    expect(bereichFuer("/admin/neu/vertrieb/aufgaben")?.id).toBe("mein-tag");
    expect(bereichFuer("/admin/neu/vertrieb/kontakte/abc")?.id).toBe("verkaufen");
    expect(bereichFuer("/admin/neu/marketing/empfehlungen")?.id).toBe("verkaufen");
    expect(bereichFuer("/admin/neu/kunden/abc/team")?.id).toBe("betreuen");
    expect(bereichFuer("/admin/neu/leads/chats/abc")?.id).toBe("betreuen");
    expect(bereichFuer("/admin/neu/zahlen/qualitaet")?.id).toBe("betreuen");
    expect(bereichFuer("/admin/neu/leads/ppl/bezug/neu")?.id).toBe("liefern");
    expect(bereichFuer("/admin/neu/leads/werbekonten/123")?.id).toBe("liefern");
    expect(bereichFuer("/admin/neu/zahlen/kosten/zuordnen")?.id).toBe("geld");
    expect(bereichFuer("/admin/neu/einstellungen/anbindungen")?.id).toBe("werkzeuge");
    expect(bereichFuer("/admin/neu/einstellungen/produkte")?.id).toBe("einstellungen");
    // Unbekannte Unterseite: Bereich der Seite darüber
    expect(bereichFuer("/admin/neu/leads/ppl/etwas/neues")?.id).toBe("liefern");
    expect(bereichFuer("/admin/neu/unbekannt")).toBeNull();
    expect(seiteFuer("/admin/neu/kunden/abc/team")?.view).toBe("kunde-team");
    expect(seiteFuer("/admin/neu/vertrieb/kontakte/neu")?.view).toBe("kontakt-neu");
    expect(reiterFuer("kundenakte", { id: "k1" })[0]).toEqual({ href: "/admin/neu/kunden/k1", label: "Übersicht", exact: true });
  });

  it("Rahmen (Umbau 20.11.2026): Mein Tag und vier Rollen oben, unten nur Einstellungen; Werkzeuge und Was wo ist im Profilmenü; Handy 5 Punkte ohne Mehr", () => {
    expect(BEREICHE.filter((b) => b.ort === "oben").map((b) => b.label)).toEqual(["Mein Tag", "Verkaufen", "Betreuen", "Liefern", "Geld"]);
    expect(BEREICHE.filter((b) => b.ort === "unten").map((b) => b.label)).toEqual(["Einstellungen"]);
    expect(BEREICHE.filter((b) => b.ort === "profil").map((b) => b.label)).toEqual(["Werkzeuge", "Was wo ist"]);
    expect(BEREICHE.filter((b) => b.handy === "leiste").map((b) => b.id)).toEqual(["mein-tag", "verkaufen", "betreuen", "liefern", "geld"]);
    // Profilmenü-Seiten markieren in der Seitenleiste „Einstellungen“; sie bleiben über die Suche erreichbar
    expect(bereichFuer("/admin/neu/was-wo-ist")?.ort).toBe("profil");
    expect(SUCH_SEITEN.some((s) => s.href === "/admin/neu/was-wo-ist")).toBe(true);
  });

  it("Reiter je Rolle; Start genau, Listen auch auf Unterseiten aktiv", () => {
    const labels = (g: Parameters<typeof reiterFuer>[0]) => reiterFuer(g).map((r) => r.label);
    expect(labels("verkaufen")).toEqual(["Pipeline", "Kontakte", "Termine", "Angebote", "Marketing"]);
    expect(labels("marketing")).toEqual(["LinkedIn", "Empfehlungen", "Unterlagen", "Webseite & Rechner"]);
    expect(labels("betreuen")).toEqual(["Kunden", "Chats", "Monatsberichte", "Qualität & Nutzung"]);
    expect(labels("liefern")).toEqual(["Pay-per-Lead", "Leads", "Lead-Eingang", "Werbekonten"]);
    expect(labels("geld")).toEqual(["Übersicht", "Umsatz & Buchungen", "Offene Posten", "Kosten & Bank", "Kunden-Lebenszyklus", "Auswertung"]);
    const ex = (g: Parameters<typeof reiterFuer>[0], label: string) => reiterFuer(g).find((r) => r.label === label)?.exact;
    expect(ex("verkaufen", "Pipeline")).toBe(true);
    expect(ex("verkaufen", "Kontakte")).toBe(false);
    expect(ex("verkaufen", "Marketing")).toBe(false);
    expect(ex("marketing", "LinkedIn")).toBe(true);
    expect(ex("liefern", "Lead-Eingang")).toBe(true);
    expect(ex("liefern", "Pay-per-Lead")).toBe(false);
    expect(ex("betreuen", "Kunden")).toBe(true);
  });

  it("Bereich im Inventar = Bereich der Seite in navigation.ts (eine Quelle)", () => {
    const abweichend = SEITEN.filter((s) => bereichFuerView(s.view) !== s.bereich).map((s) => `${s.view} → ${s.bereich}`);
    expect(abweichend).toEqual([]);
  });

  it("alte Pfade bleiben: jede Seite hat ihre Adresse aus v1 (Push-Ziele, Umzug)", () => {
    for (const p of ["/admin/neu/vertrieb", "/admin/neu/kunden", "/admin/neu/leads", "/admin/neu/leads/chats", "/admin/neu/zahlen", "/admin/neu/marketing", "/admin/neu/einstellungen/anbindungen"]) {
      expect(seiteFuer(p), p).not.toBeNull();
    }
    expect(SUCH_SEITEN.find((s) => s.href === "/admin/neu/werkzeuge")?.bereich).toBe("Werkzeuge");
  });

  it("„+ Neu“ enthält alle vereinbarten Einträge, nach Rollen geordnet", () => {
    // Umbau 20.11.2026: nur, was man im Alltag schnell anlegt; alle Ziele im neuen Admin
    expect(NEU_EINTRAEGE.map((e) => e.id)).toEqual(["aufgabe", "kontakt", "termin", "angebot", "ppl-bezug"]);
    expect(NEU_EINTRAEGE.every((e) => e.art === "dialog" || e.href.startsWith("/admin/neu/"))).toBe(true);
    const reihe = BEREICHE.map((b) => b.id);
    const idx = NEU_EINTRAEGE.map((e) => reihe.indexOf(e.rolle));
    expect(idx.every((v, i) => v >= 0 && (i === 0 || v >= idx[i - 1]))).toBe(true);
  });
});

describe("Umzug alt → neu (noch nicht aktiv)", () => {
  it("jede heutige Admin-Seite hat ein Ziel", () => {
    const alt = new Set(UMZUG.map((u) => u.alt));
    for (const p of ["/admin/heute", "/admin/vertrieb/pipeline", "/admin/kunden/[id]/logins", "/admin/whatsapp/settings", "/admin/einstellungen/bank/zuordnen", "/admin/buyers"]) {
      expect(alt.has(p), p).toBe(true);
    }
  });

  it("setzt ids ein und behält Suchparameter, nur für fertige Seiten", () => {
    expect(neuerPfad("/admin/heute/aufgaben?view=done")).toBe("/admin/neu/vertrieb/aufgaben?view=done");
    expect(neuerPfad("/admin/kunden/k1/logins", { nurFertige: false })).toBe("/admin/neu/kunden/k1/team");
    expect(neuerPfad("/admin/neu/vertrieb")).toBeNull();
  });
});
