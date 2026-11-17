import { describe, expect, it } from "vitest";
import { bedrockEu, KI_EU_STANDARD_MODELL } from "@/lib/ki-eu-konfig";
import { policenKiEu } from "@/lib/policen/regeln";

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

  it("Policen: Bedrock vor Gateway, nur mit POLICEN_KI_REGION=eu", () => {
    expect(policenKiEu(keys)).toBeNull();
    expect(policenKiEu({ ...keys, POLICEN_KI_REGION: "eu" })).toMatchObject({ art: "bedrock", region: "eu-central-1" });
    expect(policenKiEu({ ...keys, POLICEN_KI_REGION: "eu", POLICEN_KI_EU_MODEL: "anthropic.claude-sonnet-5-5" })?.model).toBe("anthropic.claude-sonnet-5-5");
    expect(policenKiEu({ POLICEN_KI_REGION: "eu", POLICEN_KI_EU_URL: "https://gw.example.eu", POLICEN_KI_EU_KEY: "k" })).toMatchObject({ art: "anthropic", baseURL: "https://gw.example.eu" });
  });
});
