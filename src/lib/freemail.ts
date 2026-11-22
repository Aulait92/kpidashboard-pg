// Private E-Mail-Adresse (Freemail) erkennen, z. B. für die Einladung von 360dialog (Go-live-Prüfung 20./21.11.2026:
// Firmen- und Konzernpostfächer blockieren die Einladung oft). Liste gemeinsam mit dem Vertrieb (lib/vertrieb/dubletten.ts).

import { FREEMAIL } from "@/lib/vertrieb/dubletten";

/** Liegt die Adresse bei einem Freemail-Anbieter (gmail, gmx, web.de, t-online, outlook.com, icloud …)? (rein) */
export function istFreemail(email: string | null | undefined): boolean {
  const domain = (email ?? "").trim().toLowerCase().split("@")[1] ?? "";
  return !!domain && FREEMAIL.has(domain);
}
