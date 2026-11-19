// Schlüssel für den geschützten Upload der Vertriebsunterlagen (/api/ops/unterlagen, Ole, 15.11.2026).
// Eigener Schlüssel OPS_UPLOAD_TOKEN (≥ 32 Zeichen) im Header X-Ops-Upload-Token, getrennt vom
// Lese-Schlüssel der Diagnose-API. Ohne gesetzten Schlüssel ist der Upload aus.
import { opsTokenOk } from "@/lib/ops-auth";

export const UPLOAD_HEADER = "x-ops-upload-token";

/** Upload-Schlüssel in X-Ops-Upload-Token, X-Ops-Token oder Bearer, auch zusammen mit dem Lese-Schlüssel (lib/ops-auth.ts). */
export function uploadAuthorized(req: Request, env: Record<string, string | undefined> = process.env): boolean {
  return opsTokenOk(req.headers, env.OPS_UPLOAD_TOKEN);
}
