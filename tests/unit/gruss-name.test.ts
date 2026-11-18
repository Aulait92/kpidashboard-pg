// Begrüßung des Vermittlers in der App (Ole 18.11.2026): „Guten Abend, Herr Kannapinn“, kein Firmenname
import { describe, expect, it } from "vitest";
import { grussName } from "@/lib/vermittler-nennung";

describe("grussName", () => {
  it("Sie mit Anrede: Herr/Frau Nachname", () => {
    expect(grussName({ name: "Ole Kannapinn", anrede: "Herr" })).toBe("Herr Kannapinn");
    expect(grussName({ name: "Anna Maria Weber", anrede: "Frau" })).toBe("Frau Weber");
  });
  it("ohne Anrede: Vor- und Nachname; Du: Vorname", () => {
    expect(grussName({ name: "Ole Kannapinn" })).toBe("Ole Kannapinn");
    expect(grussName({ name: "Ole Kannapinn", anrede: "Herr", du: true })).toBe("Ole");
  });
  it("Firmenname oder nur ein Wort: kein Name", () => {
    expect(grussName({ name: "Company", anrede: "Herr" })).toBeNull();
    expect(grussName({ name: "Kannapinn Company" })).toBeNull();
    expect(grussName({ name: "Agentur Meier", anrede: "Herr" })).toBeNull();
    expect(grussName({ name: "Meier Versicherungen GmbH" })).toBeNull();
    expect(grussName({ name: "Ole" })).toBeNull();
    expect(grussName({ name: null })).toBeNull();
  });
});
