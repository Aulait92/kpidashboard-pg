import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fundstellen, stand } from "../../tools/admin-neu/inventar-stand.mjs";
import { BEREICHE, SEITEN, bereichFuer, reiterFuer, seiteFuer, NEU_EINTRAEGE } from "@/lib/admin-neu/navigation";
import { BLEIBT, OFFEN } from "@/lib/admin-neu/offen";
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
const ids = new Set(inventar.map((e) => e.id));

describe("Funktionsinventar neuer Admin", () => {
  it("jede Funktion hat eine eindeutige id", () => {
    expect(inventar.every((e) => typeof e.id === "string" && e.id.includes("--"))).toBe(true);
    expect(ids.size).toBe(inventar.length);
  });

  it("keine Funktion geht verloren: vorhanden, offen oder bleibt", () => {
    const verloren = inventar.filter((e) => !fund.has(e.id) && !offen.has(e.id) && !bleibt.has(e.id));
    expect(
      verloren.map((e) => `${e.id} (${e.heute}: ${e.funktion})`),
      "Funktion weder im neuen UI (data-funktion) noch in src/lib/admin-neu/offen/*.ts",
    ).toEqual([]);
  });

  it("gebaute Funktionen stehen nicht mehr in der Liste „offen“", () => {
    const doppelt = offenListe.filter((o) => fund.has(o.id)).map((o) => `${o.id} → aus offen/${o.bereich}.ts streichen`);
    expect(doppelt).toEqual([]);
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

  it("Bereich und Seite werden aus der Adresse erkannt", () => {
    expect(bereichFuer("/admin/neu")?.id).toBe("heute");
    expect(bereichFuer("/admin/neu/vertrieb/kontakte/abc")?.id).toBe("vertrieb");
    expect(bereichFuer("/admin/neu/kunden/abc/team")?.id).toBe("kunden");
    expect(seiteFuer("/admin/neu/kunden/abc/team")?.view).toBe("kunde-team");
    expect(seiteFuer("/admin/neu/vertrieb/kontakte/neu")?.view).toBe("kontakt-neu");
    expect(reiterFuer("kundenakte", { id: "k1" })[0]).toEqual({ href: "/admin/neu/kunden/k1", label: "Übersicht", exact: true });
  });

  it("„+ Neu“ enthält alle vereinbarten Einträge", () => {
    expect(NEU_EINTRAEGE.map((e) => e.id)).toEqual(["kontakt", "aufgabe", "angebot", "termin", "zuordnung", "ppl-bezug", "linkedin", "neuigkeit", "kosten"]);
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
