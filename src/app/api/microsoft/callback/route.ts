import { isMailState } from "@/lib/mail/postfach";
import { mailCallback } from "@/lib/mail/oauth-routes";
import { callbackRoute } from "@/lib/calendar/oauth-routes";
import { microsoftExchangeCode } from "@/lib/calendar/microsoft";

// Microsoft-OAuth-Callback: Code gegen Tokens tauschen (verschlüsselt speichern).
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  // Eigenes Postfach (state „mail:…“) nutzt dieselbe Rücksprung-Adresse wie der Kalender
  if (isMailState(new URL(req.url).searchParams.get("state"))) return mailCallback(req, "microsoft");
  return callbackRoute(req, microsoftExchangeCode, "microsoft");
}
