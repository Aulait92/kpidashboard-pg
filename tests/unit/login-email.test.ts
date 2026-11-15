import { describe, expect, it } from "vitest";
import { normalizeLoginEmail, validLoginEmail } from "@/lib/login-email";

describe("Login-E-Mail normalisieren", () => {
  it("trim und Kleinschreibung, „+“ bleibt", () => {
    expect(normalizeLoginEmail("  Ole.Kannapinn+1@Gmail.com ")).toBe("ole.kannapinn+1@gmail.com");
    expect(normalizeLoginEmail("ole.kannapinn+1@gmail.com")).toBe("ole.kannapinn+1@gmail.com");
  });

  it("URL-Kodierungs-Reste werden wieder zu „+“", () => {
    // ?email=ole.kannapinn+1@gmail.com dekodiert zu einem Leerzeichen
    expect(normalizeLoginEmail("ole.kannapinn 1@gmail.com")).toBe("ole.kannapinn+1@gmail.com");
    expect(normalizeLoginEmail("ole.kannapinn%2B1@gmail.com")).toBe("ole.kannapinn+1@gmail.com");
    expect(normalizeLoginEmail("ole@gmail .com")).toBe("ole@gmail.com");
  });

  it("Prüfung auf gültige Form", () => {
    expect(validLoginEmail(" A+b@x.de ")).toBe("a+b@x.de");
    expect(validLoginEmail("kein-at")).toBeNull();
    expect(validLoginEmail("a@b")).toBeNull();
    expect(validLoginEmail("")).toBeNull();
    expect(validLoginEmail(null)).toBeNull();
  });
});
