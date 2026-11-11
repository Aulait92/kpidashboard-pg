// Ohne Datenbank-Import, damit auch Client-Komponenten (Statusseite) die Grenzen kennen.
export type HeartbeatKey = "cron" | "sync";

/** Maximal erlaubtes Alter, bevor /api/status Alarm schlägt. */
export const HEARTBEAT_MAX_AGE_MIN: Record<HeartbeatKey, number> = { cron: 20, sync: 240 };
