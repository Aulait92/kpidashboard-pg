// PKV-Tarifoptimierung: keine automatischen Nachrichten an Leads (Ole, 20.11.2026)
import { describe, expect, it } from "vitest";
import { ohneAutoNachrichten } from "@/lib/lead-kontakt-sperre";

describe("Produkte ohne automatische Nachrichten", () => {
  it("PKV-Tarifoptimierung in allen Schreibweisen, § 204", () => {
    for (const s of ["PKV-Tarifoptimierung", "pkv tarifoptimierung", "Tarif-Optimierung PKV", "Tarifwechsel nach § 204 VVG"]) expect(ohneAutoNachrichten(s), s).toBe(true);
  });
  it("andere Produkte nicht, auch PKV-Neugeschäft und leere Quelle", () => {
    for (const s of ["Privatschutz", "PKV Neugeschäft", "Private Krankenversicherung", "Zahnzusatz", "", null, undefined]) expect(ohneAutoNachrichten(s), String(s)).toBe(false);
  });
});
