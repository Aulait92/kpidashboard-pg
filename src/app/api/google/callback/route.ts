import { googleExchangeCode } from "@/lib/calendar/google";
import { callbackRoute } from "@/lib/calendar/oauth-routes";

// Google-OAuth-Callback: Code gegen Tokens tauschen (verschlüsselt speichern).
export const dynamic = "force-dynamic";

export function GET(req: Request): Promise<Response> {
  return callbackRoute(req, googleExchangeCode, "google");
}
