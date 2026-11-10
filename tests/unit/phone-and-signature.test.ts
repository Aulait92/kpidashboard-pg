import crypto from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { normalizePhone } from "@/lib/whatsapp/phone";
import { verifyMetaSignature } from "@/lib/meta-leads";

describe("normalizePhone", () => {
  it.each([
    ["0171 1234567", "491711234567"],
    ["+49 171 1234567", "491711234567"],
    ["0049 171 1234567", "491711234567"],
    ["+43 660 1234567", "436601234567"],
  ])("%s → %s", (input, out) => expect(normalizePhone(input)).toBe(out));

  it("Unsinn → null", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("abc")).toBeNull();
    expect(normalizePhone("123")).toBeNull();
  });
});

describe("verifyMetaSignature", () => {
  const body = JSON.stringify({ object: "page", entry: [] });
  afterEach(() => {
    delete process.env.META_APP_SECRET;
  });

  it("akzeptiert eine korrekte Signatur", () => {
    process.env.META_APP_SECRET = "geheim";
    const sig = crypto.createHmac("sha256", "geheim").update(body, "utf8").digest("hex");
    expect(verifyMetaSignature(body, `sha256=${sig}`)).toBe(true);
  });

  it("lehnt falsche, fehlende oder unsignierte Anfragen ab", () => {
    process.env.META_APP_SECRET = "geheim";
    const wrong = crypto.createHmac("sha256", "anders").update(body, "utf8").digest("hex");
    expect(verifyMetaSignature(body, `sha256=${wrong}`)).toBe(false);
    expect(verifyMetaSignature(body, null)).toBe(false);
    expect(verifyMetaSignature(body, "sha1=abc")).toBe(false);
  });

  it("ohne App-Secret wird nichts akzeptiert", () => {
    const sig = crypto.createHmac("sha256", "").update(body, "utf8").digest("hex");
    expect(verifyMetaSignature(body, `sha256=${sig}`)).toBe(false);
  });
});
