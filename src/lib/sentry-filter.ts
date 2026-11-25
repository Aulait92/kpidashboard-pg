// Erwartbare Fehler, die nicht nach Sentry gehören (Usability-Check 25.11.2026, 10 Ereignisse auf /f/[funnel]):
// Next.js wirft beim Rendern, wenn eine Anfrage einen kaputten Kopf „Next-Router-State-Tree“ mitschickt (Bots und
// Scanner, die RSC-Anfragen nachbauen, oder veraltete Tabs nach einem Deploy). Das ist eine fehlerhafte Anfrage des
// Aufrufers, kein Fehler der App. Gefiltert werden nur genau diese drei Meldungen aus
// next/dist/server/app-render/parse-and-validate-flight-router-state.js, alles andere geht weiter nach Sentry.

const ROUTER_STATE_FEHLER = [
  "The router state header was sent but could not be parsed.",
  "The router state header was too large.",
  "Multiple router state headers were sent. This is not allowed.",
] as const;

/** Fehler durch einen kaputten Router-State-Kopf der Anfrage? */
export function istKaputterRouterState(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return ROUTER_STATE_FEHLER.some((m) => msg === m || msg.endsWith(`: ${m}`));
}

/** Für beforeSend: Sentry-Ereignis mit genau dieser Meldung verwerfen. */
export function istErwartbaresEreignis(event: { exception?: { values?: { value?: string | null }[] } }): boolean {
  return (event.exception?.values ?? []).some((v) => istKaputterRouterState(v.value ?? ""));
}
