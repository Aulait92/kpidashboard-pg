// Einrichtung (Ole, 18.11.2026): „Versicherer“ statt „Gesellschaft“, ein Vertreter wählt genau einen; Terminarten.
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/buyer/einrichtung/actions", () => ({ gesellschaftenEinrichtungAction: async () => ({}), testleadSelbstAction: async () => ({}) }));
vi.mock("@/app/buyer/einstellungen/branding/actions", () => ({ logoBestaetigenAction: async () => ({ ok: true }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ show: () => {} }) }));

import { GesellschaftenWahl } from "@/app/buyer/einrichtung/selbst";
import { TerminFormateFelder } from "@/components/termin-formate";

const alle = [
  { key: "allianz", name: "Allianz" },
  { key: "axa", name: "AXA" },
];
const html = (vermittlerTyp: string, gewaehlt: string[]) => renderToStaticMarkup(createElement(GesellschaftenWahl, { alle, gewaehlt, readOnly: false, vermittlerTyp }));

describe("Versicherer wählen", () => {
  it("Vertreter: eine Frage im Singular, nach der Wahl kein Hinzufügen mehr", () => {
    const leer = html("vertreter", []);
    expect(leer).toContain("Für welchen Versicherer sind Sie tätig?");
    expect(leer).toContain("+ Versicherer hinzufügen");
    expect(leer).toContain("Deren Tarife schlägt Ihnen die App in der Terminvorbereitung zuerst vor.");
    const einer = html("vertreter", ["allianz"]);
    expect(einer).toContain("Allianz");
    expect(einer).not.toContain("+ Versicherer hinzufügen");
  });

  it("Makler und Mehrfachvertreter: mehrere Versicherer", () => {
    for (const typ of ["makler", "mehrfachvertreter"]) {
      const h = html(typ, ["allianz"]);
      expect(h).toContain("Mit welchen Versicherern arbeiten Sie?");
      expect(h).toContain("+ Versicherer hinzufügen");
    }
  });

  it("kein „Gesellschaft“ und keine Gedankenstriche", () => {
    for (const typ of ["vertreter", "makler"]) expect(html(typ, [])).not.toMatch(/Gesellschaft|[–—]/);
  });
});

describe("Terminarten in der Einrichtung", () => {
  it("Text und zwei Kästchen, beide aus, keine Pflichtauswahl", () => {
    const h = renderToStaticMarkup(createElement(TerminFormateFelder, { defaultValue: { telefon: false, vorOrt: false } }));
    expect(h).toContain("Ihre Termine finden per Video statt.");
    expect(h).toContain("Telefon");
    expect(h).toContain("Termin vor Ort in der Agentur");
    expect(h).not.toMatch(/checked|required/);
    expect(h).toContain('name="format_telefon"');
    expect(h).toContain('name="format_vorOrt"');
  });
});
