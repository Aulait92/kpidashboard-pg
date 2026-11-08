import { callbackRoute } from "@/lib/calendar/oauth-routes";
import { microsoftExchangeCode } from "@/lib/calendar/microsoft";

// Microsoft-OAuth-Callback: Code gegen Tokens tauschen (verschlüsselt speichern).
export const dynamic = "force-dynamic";

export function GET(req: Request): Promise<Response> {
  return callbackRoute(req, microsoftExchangeCode, "microsoft");
}
