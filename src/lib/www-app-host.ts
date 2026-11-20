// www vor der App-Adresse (Ole, 20.11.2026: www.app.performancegrowth.de): dauerhaft (308) auf dieselbe Adresse ohne
// „www.“ umleiten, Pfad und Abfrage bleiben. Nur Hosts, die mit „www.app.“ beginnen; die Buchungsadresse
// (www.dein-beratungstermin.de) regelt lib/public-booking-host.ts. Reine Funktion: Middleware und Tests.

export function wwwAppRedirect(host: string, pathname: string, search: string): string | null {
  const h = host.split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
  if (!h.startsWith("www.app.") || h.length <= "www.app.".length) return null;
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const query = search && search !== "?" ? (search.startsWith("?") ? search : `?${search}`) : "";
  return `https://${h.slice(4)}${path}${query}`;
}
