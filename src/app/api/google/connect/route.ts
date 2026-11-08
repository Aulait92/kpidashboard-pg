import { googleAuthUrl } from "@/lib/calendar/google";
import { connectRoute } from "@/lib/calendar/oauth-routes";

// Admin verbindet den Google-Kalender eines Kunden: ?customerId=<id>
export const dynamic = "force-dynamic";

export function GET(req: Request): Promise<Response> {
  return connectRoute(req, googleAuthUrl);
}
