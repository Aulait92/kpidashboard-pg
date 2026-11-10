// Aktuelle Zeit für Server-Komponenten. Jede Anfrage rendert neu, ein
// Zeitstempel beim Rendern ist dort gewollt (der React-Lint-Hinweis
// „impure function“ gilt für Client-Komponenten).
export const nowMs = (): number => Date.now();
