// Bildmodell-Fallback (Ole, 14.11.2026): „gpt-image-1 does not exist“ → nächstes Modell probieren.
import { beforeEach, describe, expect, it } from "vitest";
import { imageModelCandidates, isModelUnavailable, resetWorkingModel, withImageModel } from "@/lib/openai-image-models";

describe("OpenAI-Bildmodelle", () => {
  beforeEach(() => {
    resetWorkingModel();
    delete process.env.OPENAI_IMAGE_MODEL;
  });

  it("erkennt „Modell gibt es nicht“", () => {
    expect(isModelUnavailable(400, '{"error":{"message":"The model \'gpt-image-1\' does not exist.","type":"image_generation_user_error"}}')).toBe(true);
    expect(isModelUnavailable(404, "")).toBe(true);
    expect(isModelUnavailable(400, '{"error":{"message":"Invalid value for quality"}}')).toBe(false);
    expect(isModelUnavailable(429, "quota")).toBe(false);
  });

  it("probiert der Reihe nach und merkt sich das funktionierende Modell", async () => {
    const tried: string[] = [];
    const ok = "gpt-image-2";
    const res = await withImageModel(async (m) => {
      tried.push(m);
      return m === ok ? { status: 200, body: '{"data":[{"b64_json":"aGk="}]}' } : { status: 400, body: `{"error":{"message":"The model '${m}' does not exist."}}` };
    });
    expect(res.ok && res.model).toBe(ok);
    expect(tried[tried.length - 1]).toBe(ok);
    expect(imageModelCandidates()[0]).toBe(ok);
  });

  it("bricht bei anderen Fehlern sofort ab; festes Modell per Env zuerst", async () => {
    process.env.OPENAI_IMAGE_MODEL = "mein-modell";
    expect(imageModelCandidates()[0]).toBe("mein-modell");
    let n = 0;
    const res = await withImageModel(async () => (n++, { status: 500, body: "boom" }));
    expect(res.ok).toBe(false);
    expect(n).toBe(1);
  });
});
