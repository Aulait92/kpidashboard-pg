// Schlüssel für den geschützten Upload der Vertriebsunterlagen (/api/ops/unterlagen, Ole, 15.11.2026).
// Eigener Schlüssel OPS_UPLOAD_TOKEN (≥ 32 Zeichen) im Header X-Ops-Upload-Token, getrennt vom
// Lese-Schlüssel der Diagnose-API. Ohne gesetzten Schlüssel ist der Upload aus.
import crypto from "node:crypto";

export const UPLOAD_HEADER = "x-ops-upload-token";

export function uploadAuthorized(req: Request, env: Record<string, string | undefined> = process.env): boolean {
  const expected = (env.OPS_UPLOAD_TOKEN ?? "").trim();
  if (expected.length < 32) return false;
  const token = (req.headers.get(UPLOAD_HEADER) ?? "").trim();
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
