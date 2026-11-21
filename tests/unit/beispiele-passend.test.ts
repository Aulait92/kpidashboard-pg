import { describe, expect, it } from "vitest";
import { komplettcheckBeispiele, komplettcheckFrage } from "@/lib/whatsapp/gespraech";
import { policenBitte } from "@/lib/policen/bitte";

// Ole, 21.11.2026: Bei Privatschutz nicht „Haftpflicht, Hausrat“ als „andere Versicherungen“; Policen-Bitte mit den
// Verträgen, die der Lead genannt hat
const P = { nom: "Herr Lohmann", dat: "Herrn Lohmann" };
describe("Beispiele passend zum Lead", () => {
  it("Komplettcheck ohne die angefragten Sparten", () => {
    expect(komplettcheckBeispiele("Privatschutz")).toBe("Kfz, Rechtsschutz oder Unfall");
    expect(komplettcheckBeispiele("Katzenkrankenversicherung")).toBe("Haftpflicht, Hausrat oder Kfz");
    expect(komplettcheckFrage("sie", P as never, true, "b", "Privatschutz")).toContain("etwa Kfz, Rechtsschutz oder Unfall?");
    expect(komplettcheckFrage("sie", P as never, false, "b")).toContain("etwa Haftpflicht, Hausrat oder Kfz?");
  });
  it("Policen-Bitte nennt die eigenen Verträge", () => {
    const b = policenBitte({ an: "sie", vermittler: { nom: "Herr Lohmann", dat: "Herrn Lohmann", anrede: "Herr" }, vertraege: ["Kfz", "Berufsunfähigkeit"] });
    expect(b.text).toContain("egal ob Kfz oder Berufsunfähigkeit.");
    const ohne = policenBitte({ an: "sie", vermittler: { nom: "Herr Lohmann", dat: "Herrn Lohmann", anrede: "Herr" } });
    expect(ohne.text).toContain("egal ob Haftpflicht, Hausrat oder Kfz.");
  });
});
