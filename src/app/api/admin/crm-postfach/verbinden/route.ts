import { crmPostfachVerbinden } from "@/lib/vertrieb/crm-postfach-routes";

// Eigenes Postfach eines Admins verbinden (E-Mails aus der Kontaktakte): weiter zur Anmeldung bei Microsoft oder Google.
export const dynamic = "force-dynamic";

export function GET(req: Request): Promise<Response> {
  return crmPostfachVerbinden(req);
}
