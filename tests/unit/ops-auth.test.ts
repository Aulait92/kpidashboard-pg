// Ops-Schlüssel (lib/ops-auth.ts, Ole 19.11.2026): mehrere Schlüssel in einem Header, jede Schnittstelle prüft nur ihren eigenen.
import { describe, expect, it } from "vitest";
import { opsTokenOk } from "@/lib/ops-auth";
import { uploadAuthorized } from "@/lib/ops-upload";

const LESEN = "l".repeat(40);
const UPLOAD = "u".repeat(40);
const h = (o: Record<string, string>) => new Headers(o);

describe("Ops-Schlüssel", () => {
  it("Bearer wie bisher", () => {
    expect(opsTokenOk(h({ authorization: `Bearer ${LESEN}` }), LESEN)).toBe(true);
    expect(opsTokenOk(h({ authorization: "Bearer falsch" }), LESEN)).toBe(false);
  });
  it("beide Schlüssel in X-Ops-Token: Diagnose und Upload gehen, jeder nur mit seinem Schlüssel", () => {
    const beide = h({ "x-ops-token": `${LESEN},${UPLOAD}` });
    expect(opsTokenOk(beide, LESEN)).toBe(true);
    expect(uploadAuthorized(new Request("https://x", { headers: beide }), { OPS_UPLOAD_TOKEN: UPLOAD })).toBe(true);
    // Nur der Upload-Schlüssel öffnet die Diagnose nicht
    expect(opsTokenOk(h({ "x-ops-token": UPLOAD }), LESEN)).toBe(false);
    expect(uploadAuthorized(new Request("https://x", { headers: h({ authorization: `Bearer ${LESEN}` }) }), { OPS_UPLOAD_TOKEN: UPLOAD })).toBe(false);
  });
  it("bisheriger Upload-Header, Leerzeichen als Trenner, zu kurzer erwarteter Schlüssel", () => {
    expect(uploadAuthorized(new Request("https://x", { headers: h({ "x-ops-upload-token": UPLOAD }) }), { OPS_UPLOAD_TOKEN: UPLOAD })).toBe(true);
    expect(opsTokenOk(h({ "x-ops-token": `${UPLOAD} ${LESEN}` }), LESEN)).toBe(true);
    expect(opsTokenOk(h({ "x-ops-token": "kurz" }), "kurz")).toBe(false);
  });
});
