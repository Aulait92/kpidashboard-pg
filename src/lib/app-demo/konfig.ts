// Ist die App-Demo eingerichtet? Rein (auch in der Middleware nutzbar): Demo-Datenbank gesetzt und sicher verschieden
// von der echten. Kein Rückfall auf DATABASE_URL.

/** Datenbank-Adresse ohne Passwort/Parameter, zum Vergleich mit der echten. */
function ziel(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.toLowerCase()}:${u.port || "5432"}/${decodeURIComponent(u.pathname.replace(/^\//, ""))}`;
  } catch {
    return url;
  }
}

/** Demo-Adresse, wenn eingerichtet und sicher verschieden von der echten Datenbank; sonst null. */
export function demoDatenbankUrl(env: Record<string, string | undefined> = process.env): string | null {
  const url = env.APP_DEMO_DATABASE_URL?.trim();
  if (!url) return null;
  if (env.DATABASE_URL && ziel(url) === ziel(env.DATABASE_URL)) return null;
  return url;
}

