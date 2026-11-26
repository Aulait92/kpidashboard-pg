// Anrede aus eindeutigem Vornamen (Ole, 16.11.2026)
import { describe, expect, it } from "vitest";
import { anredeAusVorname } from "@/lib/vorname-anrede";
import { anredeName, anredeRohAusForm, anredeZeile } from "@/lib/ansprache";
import { currentStammdaten } from "@/lib/lead-stammdaten";

describe("anredeAusVorname", () => {
  it("eindeutige Vornamen, Doppelnamen nur bei Übereinstimmung", () => {
    expect(anredeAusVorname("Julia")).toBe("Frau");
    expect(anredeAusVorname("thomas")).toBe("Herr");
    expect(anredeAusVorname("Hans-Peter")).toBe("Herr");
    expect(anredeAusVorname("Anna-Lena")).toBe("Frau");
    expect(anredeAusVorname("Klaus Maria")).toBeNull();
    expect(anredeAusVorname("Hans-Xyz")).toBeNull();
    expect(anredeAusVorname("Rachid")).toBe("Herr");
    expect(anredeZeile("sie", { fullName: "Rachid El Oufy" })).toBe("Guten Tag Herr El Oufy,");
  });
  it("zweideutige oder unbekannte Vornamen bleiben ohne Anrede", () => {
    for (const n of ["Andrea", "Kim", "Kai", "Luca", "Toni", "Sascha", "Alex", "Robin", "Nicola", "Simone", "Gabriele", "Deniz", "", null]) {
      expect(anredeAusVorname(n)).toBeNull();
    }
  });
});

describe("Anrede in Texten an Leads", () => {
  it("aus eindeutigem Vornamen (Ole, 18.11.2026), sonst der volle Name", () => {
    expect(anredeName("sie", { fullName: "Julia Schneider" })).toBe("Frau Schneider");
    expect(anredeName("sie", { firstName: "Thomas", lastName: "Weber" })).toBe("Herr Weber");
    expect(anredeName("sie", { fullName: "Kim Weber" })).toBe("Kim Weber");
  });
  it("Formular-Anrede hat Vorrang, Divers oder Keine Angabe bleibt neutral", () => {
    expect(anredeName("sie", { fullName: "Julia Schneider", salutation: "Herr" })).toBe("Herr Schneider");
    const divers = anredeRohAusForm([{ label: "Anrede", value: "Divers" }]);
    expect(divers).toBe("keine");
    expect(anredeName("sie", { fullName: "Julia Schneider", salutation: divers })).toBe("Julia Schneider");
    expect(anredeZeile("sie", { fullName: "Julia Schneider", salutation: "keine" })).not.toMatch(/Frau/);
  });
});

describe("Kontakt: Anrede vorausgefüllt", () => {
  const lead = (x: { name?: string; formData?: unknown; contactOverrides?: unknown }) => ({ name: x.name ?? "Julia Schneider", phone: null, email: null, formData: x.formData ?? [], contactOverrides: x.contactOverrides ?? null });
  it("aus eindeutigem Vornamen (Ole, 18.11.2026); Formular oder Korrektur im Kontakt gehen vor", () => {
    expect(currentStammdaten(lead({})).salutation).toBe("Frau");
    expect(currentStammdaten(lead({ formData: [{ label: "Anrede", value: "Herr" }] })).salutation).toBe("Herr");
    expect(currentStammdaten(lead({ formData: [{ label: "Anrede", value: "Frau" }] })).salutation).toBe("Frau");
    expect(currentStammdaten(lead({ contactOverrides: { salutation: "keine" } })).salutation).toBeNull();
    expect(currentStammdaten(lead({ formData: [{ label: "Anrede", value: "Divers" }] })).salutation).toBeNull();
    expect(currentStammdaten(lead({ name: "Kim Weber" })).salutation).toBeNull();
  });
});
