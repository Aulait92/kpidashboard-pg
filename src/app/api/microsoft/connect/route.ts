import { connectRoute } from "@/lib/calendar/oauth-routes";
import { microsoftAuthUrl } from "@/lib/calendar/microsoft";

// Admin verbindet den Outlook-/Microsoft-365-Kalender eines Kunden.
export const dynamic = "force-dynamic";

export function GET(req: Request): Promise<Response> {
  return connectRoute(req, microsoftAuthUrl);
}
