import { describe, expect, it } from "vitest";
import { bedrockEu, KI_EU_STANDARD_MODELL } from "@/lib/ki-eu-konfig";

describe("EU-Zugang (Bedrock Frankfurt)", () => {
  const keys = { KI_EU_AWS_ACCESS_KEY_ID: "AKIA_TEST", KI_EU_AWS_SECRET_ACCESS_KEY: "geheim" };

  it("nur mit beiden Schlüsseln, Standard Frankfurt und Opus", () => {
    expect(bedrockEu({})).toBeNull();
    expect(bedrockEu({ KI_EU_AWS_ACCESS_KEY_ID: "x" })).toBeNull();
    expect(bedrockEu(keys)).toMatchObject({ art: "bedrock", region: "eu-central-1", model: KI_EU_STANDARD_MODELL });
  });

  it("nur EU-Regionen", () => {
    expect(bedrockEu({ ...keys, KI_EU_AWS_REGION: "eu-west-1" })?.region).toBe("eu-west-1");
    expect(bedrockEu({ ...keys, KI_EU_AWS_REGION: "us-east-1" })).toBeNull();
  });
});
