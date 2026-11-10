import { describe, expect, it } from "vitest";
import { cleanToken, redactTokens } from "@/lib/meta-leads";

describe("Meta-Token", () => {
  it("bereinigt eingefügte Tokens", () => {
    expect(cleanToken(' "EAAB123abc"\n')).toBe("EAAB123abc");
    expect(cleanToken("Bearer EAAB123abc ")).toBe("EAAB123abc");
    expect(cleanToken("EAAB12\n3abc")).toBe("EAAB123abc");
  });
  it("gibt Tokens nie in Fehlertexten aus", () => {
    const msg = redactTokens('Malformed access token EAAB0123456789abcdefXYZ, url ?access_token=EAAsecret&x=1');
    expect(msg).not.toContain("0123456789abcdef");
    expect(msg).not.toContain("EAAsecret");
  });
});
