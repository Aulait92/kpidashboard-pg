// Absender der Systemmails heißt immer „performancegrowth“, Adresse bleibt (Ole, 15.11.2026).
import { describe, expect, it } from "vitest";
import { brandFrom } from "@/lib/email";

describe("brandFrom", () => {
  it("ersetzt den Namen und behält die Adresse", () => {
    expect(brandFrom("Ole Kannapinn <ole@performancegrowth.de>")).toBe("performancegrowth <ole@performancegrowth.de>");
    expect(brandFrom("hallo@performancegrowth.de")).toBe("performancegrowth <hallo@performancegrowth.de>");
  });
});
