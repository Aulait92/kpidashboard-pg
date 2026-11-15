import { NextResponse } from "next/server";
import { getAppUrl } from "@/lib/email";

/**
 * Weiterleitung auf einen Pfad der App. Hinter Railway sieht req.url die interne Adresse (localhost:8080),
 * deshalb die öffentliche Basis aus APP_URL nehmen (Ole, 15.11.2026: Bestätigungslink landete auf localhost).
 */
export function appRedirect(path: string, req: Request, status?: number): NextResponse {
  let base: string;
  try {
    base = getAppUrl();
  } catch {
    base = req.url;
  }
  return NextResponse.redirect(new URL(path, base), status);
}
