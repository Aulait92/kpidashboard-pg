import { isMailState } from "@/lib/mail/postfach";
import { mailCallback } from "@/lib/mail/oauth-routes";
import { googleExchangeCode } from "@/lib/calendar/google";
import { callbackRoute } from "@/lib/calendar/oauth-routes";

// Google-OAuth-Callback: Code gegen Tokens tauschen (verschlüsselt speichern).
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  // Eigenes Postfach (state „mail:…“) nutzt dieselbe Rücksprung-Adresse wie der Kalender
  if (isMailState(new URL(req.url).searchParams.get("state"))) return mailCallback(req, "google");
  return callbackRoute(req, googleExchangeCode, "google");
}
