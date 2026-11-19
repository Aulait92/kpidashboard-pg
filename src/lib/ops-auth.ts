// Schlüssel für die Ops-Schnittstellen (Diagnose OPS_READ_TOKEN, Upload OPS_UPLOAD_TOKEN), Ole 19.11.2026.
// Anlass: In der Cloud-Umgebung kann je Adresse nur EIN Schlüssel automatisch mitgesendet werden; der Upload-Schlüssel
// hatte den Lese-Schlüssel der Diagnose ersetzt. Darum nehmen beide Schnittstellen jetzt mehrere Schlüssel in einem
// Header an (durch Komma, Semikolon oder Leerzeichen getrennt), z. B. „X-Ops-Token: <Lese-Schlüssel>,<Upload-Schlüssel>“.
// Jede Schnittstelle prüft nur ihren eigenen Schlüssel: Der Upload-Schlüssel öffnet die Diagnose nicht und umgekehrt.
// Gelesen werden Authorization (Bearer), X-Ops-Token und der bisherige X-Ops-Upload-Token.
import crypto from "node:crypto";

export const OPS_TOKEN_HEADER = "x-ops-token";
const HEADER = ["authorization", OPS_TOKEN_HEADER, "x-ops-upload-token"] as const;

/** Alle mitgesendeten Schlüssel-Kandidaten (rein). */
export function opsTokens(headers: Headers): string[] {
  return HEADER.flatMap((h) =>
    (headers.get(h) ?? "")
      .replace(/^Bearer\s+/i, "")
      .split(/[\s,;]+/)
      .map((t) => t.trim())
      .filter(Boolean),
  );
}

/** Ist der erwartete Schlüssel (mindestens 32 Zeichen) unter den mitgesendeten? Vergleich in konstanter Zeit. */
export function opsTokenOk(headers: Headers, expectedRaw: string | undefined): boolean {
  const expected = (expectedRaw ?? "").trim();
  if (expected.length < 32) return false;
  const b = Buffer.from(expected);
  let ok = false;
  for (const t of opsTokens(headers)) {
    const a = Buffer.from(t);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) ok = true;
  }
  return ok;
}
