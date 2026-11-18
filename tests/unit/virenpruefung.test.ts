// Virenprüfung (Ole, 18.11.2026): clamd INSTREAM über TCP gegen eine Attrappe (tests/fixtures/clamd.ts), EICAR-Test,
// Auswertung der Antworten, Entscheidung mit und ohne VIRENPRUEFUNG_PFLICHT, ohne Konfiguration und bei Ausfall.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { entscheide, pruefeAufViren, virenKonfig, virenPflicht, virenpruefungErreichbar, werteAntwortAus } from "@/lib/sicherheit/virenpruefung";
import { EICAR, starteClamd, type ClamdAttrappe } from "../fixtures/clamd";

describe("Virenprüfung (clamd INSTREAM)", () => {
  let clamd: ClamdAttrappe;
  beforeAll(async () => {
    clamd = await starteClamd();
  });
  afterAll(async () => {
    await clamd.stop();
  });
  const k = () => ({ host: "127.0.0.1", port: clamd.port, timeoutMs: 5000 });

  it("Konfiguration aus CLAMAV_HOST/CLAMAV_PORT, Pflicht-Schalter", () => {
    expect(virenKonfig({})).toBeNull();
    expect(virenKonfig({ CLAMAV_HOST: "clamav.railway.internal" })).toEqual({ host: "clamav.railway.internal", port: 3310, timeoutMs: 30000 });
    expect(virenKonfig({ CLAMAV_HOST: "x", CLAMAV_PORT: "4000", CLAMAV_TIMEOUT_MS: "1000" })).toEqual({ host: "x", port: 4000, timeoutMs: 1000 });
    expect(virenKonfig({ CLAMAV_HOST: "x", CLAMAV_PORT: "abc" })?.port).toBe(3310);
    expect(virenPflicht({})).toBe(false);
    expect(virenPflicht({ VIRENPRUEFUNG_PFLICHT: "1" })).toBe(true);
    expect(virenPflicht({ VIRENPRUEFUNG_PFLICHT: "ja" })).toBe(true);
  });

  it("Antworten von clamd", () => {
    expect(werteAntwortAus("stream: OK\0")).toEqual({ status: "sauber" });
    expect(werteAntwortAus("stream: Eicar-Test-Signature FOUND\0")).toEqual({ status: "befund", signatur: "Eicar-Test-Signature" });
    expect(werteAntwortAus("INSTREAM size limit exceeded. ERROR\0")).toMatchObject({ status: "ungeprueft", grund: "zu_gross" });
    expect(werteAntwortAus("")).toMatchObject({ status: "ungeprueft", grund: "fehler" });
  });

  it("Entscheidung: sauber annehmen, Befund verwerfen, ungeprüft annehmen bzw. mit Pflicht ablehnen", () => {
    expect(entscheide({ status: "sauber" }, false)).toBe("annehmen");
    expect(entscheide({ status: "befund", signatur: "x" }, false)).toBe("verwerfen");
    expect(entscheide({ status: "befund", signatur: "x" }, true)).toBe("verwerfen");
    expect(entscheide({ status: "ungeprueft", grund: "nicht_eingerichtet" }, false)).toBe("ungeprueft");
    expect(entscheide({ status: "ungeprueft", grund: "fehler" }, true)).toBe("ablehnen");
  });

  it("saubere Datei: OK; EICAR-Teststring: Fund mit Signatur", async () => {
    expect(await pruefeAufViren(Buffer.from("%PDF-1.4 Police Haftpflicht"), k())).toEqual({ status: "sauber" });
    expect(await pruefeAufViren(EICAR, k())).toEqual({ status: "befund", signatur: "Eicar-Test-Signature" });
    expect(clamd.befehle.filter((b) => b === "zINSTREAM").length).toBeGreaterThanOrEqual(2);
  });

  it("große Datei in Stücken (64 KB), EICAR am Ende wird gefunden", async () => {
    const gross = Buffer.concat([Buffer.alloc(300 * 1024, 0x41), EICAR]);
    expect((await pruefeAufViren(gross, k())).status).toBe("befund");
    expect(clamd.geprueftBytes.at(-1)).toBe(gross.length);
  });

  it("ohne Konfiguration bzw. nicht erreichbar: ungeprüft, keine Ausnahme", async () => {
    expect(await pruefeAufViren(EICAR, null)).toEqual({ status: "ungeprueft", grund: "nicht_eingerichtet" });
    const r = await pruefeAufViren(EICAR, { host: "127.0.0.1", port: 1, timeoutMs: 2000 });
    expect(r).toMatchObject({ status: "ungeprueft", grund: "fehler" });
  });

  it("PING: erreichbar bzw. nicht", async () => {
    expect(await virenpruefungErreichbar(k())).toBe(true);
    expect(await virenpruefungErreichbar(null)).toBe(false);
    expect(await virenpruefungErreichbar({ host: "127.0.0.1", port: 1, timeoutMs: 1000 })).toBe(false);
  });
});
