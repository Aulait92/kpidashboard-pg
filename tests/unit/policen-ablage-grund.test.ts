// Diagnose: warum die Policen-Ablage aus ist, ohne Werte zu zeigen
import { describe, expect, it } from "vitest";
import { ablageGrund } from "@/lib/policen/ablage";

const ok = {
  POLICEN_S3_ENDPOINT: "https://s3.eu-north-1.amazonaws.com",
  POLICEN_S3_BUCKET: "pg-policen-eu",
  POLICEN_S3_ACCESS_KEY_ID: "AKIA",
  POLICEN_S3_SECRET_ACCESS_KEY: "geheim",
  POLICEN_SCHLUESSEL: Buffer.alloc(32, 1).toString("base64"),
};

describe("ablageGrund", () => {
  it("bereit", () => expect(ablageGrund(ok)).toBeNull());
  it("fehlende Variablen", () => expect(ablageGrund({ ...ok, POLICEN_S3_BUCKET: "" })).toBe("fehlt: POLICEN_S3_BUCKET"));
  it("Endpunkt mit Bucket im Host oder außerhalb der EU", () => {
    expect(ablageGrund({ ...ok, POLICEN_S3_ENDPOINT: "https://pg-policen-eu.s3.eu-north-1.amazonaws.com" })).toMatch(/kein erlaubter EU-Endpunkt/);
    expect(ablageGrund({ ...ok, POLICEN_S3_ENDPOINT: "https://s3.us-east-1.amazonaws.com" })).toMatch(/kein erlaubter EU-Endpunkt/);
  });
  it("Schlüssellänge", () => expect(ablageGrund({ ...ok, POLICEN_SCHLUESSEL: "abc" })).toMatch(/statt 32 Byte/));
  it("Grund enthält nie die Werte", () => expect(ablageGrund({ ...ok, POLICEN_SCHLUESSEL: "geheimerwert" }) ?? "").not.toContain("geheimerwert"));
});
