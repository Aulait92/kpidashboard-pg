import { afterEach, describe, expect, it } from "vitest";
import { emailGesperrt } from "@/lib/vertrieb/sperrliste";

describe("Feste Sperrliste im Vertrieb", () => {
  afterEach(() => {
    delete process.env.VERTRIEB_SPERRLISTE;
  });

  it("sperrt die Domains der Kanzlei und der Plattform samt Subdomains", () => {
    expect(emailGesperrt("legal@minimi-kanzlei.de")).toBe(true);
    expect(emailGesperrt(" Info@GetMinimi.de ")).toBe(true);
    expect(emailGesperrt("x@mail.getminimi.com")).toBe(true);
    expect(emailGesperrt("max@minimi-kanzlei.de.example.com")).toBe(false);
    expect(emailGesperrt("max@beispiel.de")).toBe(false);
    expect(emailGesperrt(null)).toBe(false);
  });

  it("weitere Adressen und Domains über VERTRIEB_SPERRLISTE", () => {
    process.env.VERTRIEB_SPERRLISTE = "person@beispiel.de, @andere.example";
    expect(emailGesperrt("Person@Beispiel.de")).toBe(true);
    expect(emailGesperrt("wer@andere.example")).toBe(true);
    expect(emailGesperrt("jemand@beispiel.de")).toBe(false);
  });
});

describe("Einzeladresse aus dem Unterlassungsvertrag", () => {
  it("ist gesperrt, die Domain aber nicht", () => {
    expect(emailGesperrt("Wild.Stanislav@allianz.de")).toBe(true);
    expect(emailGesperrt("andere.person@allianz.de")).toBe(false);
  });
});
