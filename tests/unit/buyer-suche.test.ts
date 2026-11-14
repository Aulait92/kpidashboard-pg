import { describe, expect, it } from "vitest";
import { phoneSearchCore } from "@/lib/buyer-search";

describe("phoneSearchCore", () => {
  it("entfernt Ländervorwahl und führende Null", () => {
    expect(phoneSearchCore("0151 1234 5678")).toBe("15112345678");
    expect(phoneSearchCore("+49 151 1234-5678")).toBe("15112345678");
    expect(phoneSearchCore("0049 151 12345678")).toBe("15112345678");
    expect(phoneSearchCore("4915112345678")).toBe("15112345678");
    expect(phoneSearchCore("(0151) 123")).toBe("151123");
  });

  it("andere Länder und Teilnummern bleiben", () => {
    expect(phoneSearchCore("+43 660 1234567")).toBe("436601234567");
    expect(phoneSearchCore("5678 90")).toBe("567890");
  });

  it("keine Telefonsuche bei Text oder zu wenigen Ziffern", () => {
    expect(phoneSearchCore("Müller")).toBeNull();
    expect(phoneSearchCore("max@web.de")).toBeNull();
    expect(phoneSearchCore("123")).toBeNull();
    expect(phoneSearchCore("")).toBeNull();
  });
});
