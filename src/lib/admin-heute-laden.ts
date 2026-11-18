import { countNeueBuchungen } from "@/lib/admin-buchungen-neu";
import { loadAdminHeute } from "@/lib/admin-heute";
import { computeMonthlyForecast } from "@/lib/forecast";
import { reportError } from "@/lib/monitoring";

/** Alles für die Seite „Heute“ (alte /admin/heute und neue /admin/neu): Liste, Läuft von allein, Hochrechnung, neue Buchungen. */
export async function ladeHeuteSeite(userId: string, now = new Date(), laden: typeof loadAdminHeute = loadAdminHeute) {
  // `laden`: im neuen Admin die je Anfrage gemerkte Fassung (lib/admin-neu/rollen-server.ts), damit Zähler und Seite
  // aus derselben Liste kommen
  const [{ items, auto }, forecast, neueBuchungen] = await Promise.all([
    laden(now, userId),
    computeMonthlyForecast({ customerId: null, revenueLabel: "Umsatz" }).catch((err) => {
      reportError(err, "admin-heute-forecast");
      return null;
    }),
    countNeueBuchungen(userId, now).catch((err) => {
      reportError(err, "admin-neue-buchungen");
      return 0;
    }),
  ]);
  return { items, auto, forecast, neueBuchungen };
}
