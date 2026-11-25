// Banner „KI-Hilfe und gemeinsames Anzeigenlernen“ auf „Heute“ (Usability-Check 25.11.2026, U2): nur hier, in der
// Seitenspalte unter der Überschrift. Regeln und Stand: lib/datennutzung-server.ts ladeStand.

import { DatennutzungBanner } from "@/components/datennutzung-banner";
import { ladeStand } from "@/lib/datennutzung-server";

type Ctx = Parameters<typeof ladeStand>[0];

export async function DatennutzungHeute({ ctx }: { ctx: Ctx }) {
  const stand = await ladeStand(ctx).catch(() => null);
  if (!stand?.banner) return null;
  return <DatennutzungBanner angezeigt={!!stand.angezeigtAm} />;
}
