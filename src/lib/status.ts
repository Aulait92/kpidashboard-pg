// Öffentliche Statusseite: Komponenten, Zustände und deren Ableitung aus den
// Lebenszeichen der Hintergrund-Jobs (SystemHeartbeat). Reine Funktionen,
// DB-Zugriff in status-server.ts. Öffentlich werden nur die drei Zustände
// gezeigt, nie Fehlermeldungen oder interne Details.

import { HEARTBEAT_MAX_AGE_MIN } from "@/lib/heartbeat-limits";

export type StatusLevel = "ok" | "degraded" | "down";
export type ComponentKey = "app" | "leads" | "whatsapp" | "calendar" | "payments" | "jobs";
export type StatusMap = Record<ComponentKey, StatusLevel>;

export const STATUS_COMPONENTS: { key: ComponentKey; label: string; text: string }[] = [
  { key: "app", label: "App und Kundenbereich", text: "Anmeldung, Leads, Chats und Zahlen" },
  { key: "leads", label: "Lead-Eingang", text: "Neue Leads aus den Formularen" },
  { key: "whatsapp", label: "WhatsApp-Assistent", text: "Erstkontakt, Erinnerungen und Nachfassen" },
  { key: "calendar", label: "Kalender", text: "Terminbuchung und Abgleich mit Ihrem Kalender" },
  { key: "payments", label: "Zahlungen", text: "Rechnungen und Lastschriften" },
  { key: "jobs", label: "Hintergrund-Jobs", text: "Automatische Abläufe im Hintergrund" },
];

export const COMPONENT_KEYS = STATUS_COMPONENTS.map((c) => c.key);

export const LEVEL_LABEL: Record<StatusLevel, string> = { ok: "Betriebsbereit", degraded: "Eingeschränkt", down: "Störung" };

const RANK: Record<StatusLevel, number> = { ok: 0, degraded: 1, down: 2 };

export function worse(a: StatusLevel, b: StatusLevel): StatusLevel {
  return RANK[b] > RANK[a] ? b : a;
}

export function isComponentKey(v: unknown): v is ComponentKey {
  return typeof v === "string" && (COMPONENT_KEYS as string[]).includes(v);
}

export function isLevel(v: unknown): v is StatusLevel {
  return v === "ok" || v === "degraded" || v === "down";
}

/** Gesamtzustand = schlechteste Komponente. */
export function overall(map: StatusMap): StatusLevel {
  return COMPONENT_KEYS.reduce<StatusLevel>((acc, k) => worse(acc, map[k]), "ok");
}

export type HeartbeatInput = { key: string; at: Date; ok: boolean; note: string | null };
export type IncidentInput = { component: string | null; level: string };

/** Teilaufgaben mit Fehler aus der Cron-Notiz „Fehler in: outreach, responses“. */
export function failedParts(note: string | null | undefined): string[] {
  const m = /Fehler in:\s*(.+)$/i.exec(note ?? "");
  return m ? m[1].split(",").map((s) => s.trim().toLowerCase()).filter(Boolean) : [];
}

// Welche Komponente eine fehlgeschlagene Cron-Teilaufgabe betrifft.
const PART_COMPONENT: Record<string, ComponentKey> = {
  outreach: "whatsapp",
  reminders: "whatsapp",
  sequences: "whatsapp",
  responses: "calendar",
};

/**
 * Zustand aller Komponenten:
 * - Datenbank nicht erreichbar → Störung (Zahlungen laufen bei Stripe weiter: eingeschränkt)
 * - Cron länger als erlaubt still → Hintergrund-Jobs Störung, WhatsApp/Kalender eingeschränkt
 *   (nach 60 Min. WhatsApp Störung: keine Erstnachrichten mehr)
 * - Cron mit Fehlern → betroffene Komponente und Hintergrund-Jobs eingeschränkt
 * - Abgleich der Leads länger als erlaubt still → Lead-Eingang eingeschränkt
 * - Manuelle Meldungen (Admin) heben den Zustand ihrer Komponente an
 * Job noch nie gelaufen → kein Alarm (wie /api/status).
 */
export function deriveStatus(input: { dbOk: boolean; beats: HeartbeatInput[]; incidents?: IncidentInput[]; now: Date }): StatusMap {
  const s: StatusMap = { app: "ok", leads: "ok", whatsapp: "ok", calendar: "ok", payments: "ok", jobs: "ok" };
  const raise = (k: ComponentKey, l: StatusLevel) => (s[k] = worse(s[k], l));

  if (!input.dbOk) {
    for (const k of COMPONENT_KEYS) raise(k, k === "payments" ? "degraded" : "down");
  } else {
    const age = (key: string) => {
      const b = input.beats.find((x) => x.key === key);
      return b ? { b, min: (input.now.getTime() - b.at.getTime()) / 60000 } : null;
    };
    const cron = age("cron");
    if (cron) {
      if (cron.min > HEARTBEAT_MAX_AGE_MIN.cron) {
        raise("jobs", "down");
        raise("whatsapp", cron.min > 60 ? "down" : "degraded");
        raise("calendar", "degraded");
      } else if (!cron.b.ok) {
        raise("jobs", "degraded");
        for (const p of failedParts(cron.b.note)) {
          const k = PART_COMPONENT[p];
          if (k) raise(k, "degraded");
        }
      }
    }
    const sync = age("sync");
    if (sync && sync.min > HEARTBEAT_MAX_AGE_MIN.sync) raise("leads", "degraded");
  }

  for (const i of input.incidents ?? []) {
    if (isComponentKey(i.component) && (i.level === "degraded" || i.level === "down")) raise(i.component, i.level);
  }
  return s;
}

export const SAMPLE_INTERVAL_MIN = 5;
export const SAMPLE_RETENTION_DAYS = 90;

/**
 * Verfügbarkeit in Prozent (Anteil der Messpunkte ohne Störung) oder null ohne Daten.
 * `countGaps`: fehlende Messpunkte zählen als Störung (für Hintergrund-Jobs: ohne Cron-Lauf
 * gibt es keinen Messpunkt).
 */
export function uptimePercent(c: { samples: number; notDown: number; firstAt: Date | null; now: Date; countGaps?: boolean }): number | null {
  if (!c.samples || !c.firstAt) return null;
  let denom = c.samples;
  if (c.countGaps) {
    const slots = Math.floor((c.now.getTime() - c.firstAt.getTime()) / (SAMPLE_INTERVAL_MIN * 60000)) + 1;
    denom = Math.max(denom, slots);
  }
  return Math.max(0, Math.min(100, (c.notDown / denom) * 100));
}

/** „99,95 %“ (abgerundet, damit 99,999 nicht als 100 % erscheint). */
export function formatUptime(p: number): string {
  const v = p >= 100 ? 100 : Math.floor(p * 100) / 100;
  return `${v.toLocaleString("de-DE", { minimumFractionDigits: v === 100 ? 0 : 2, maximumFractionDigits: 2 })} %`;
}

/** Zustand eines Tages aus den Messpunkten: ein einzelner Ausreißer färbt den Tag nicht rot. */
export function dayLevel(c: { samples: number; down: number; degraded: number }): StatusLevel | null {
  if (!c.samples) return null;
  if (c.down >= 2) return "down";
  if (c.down === 1 || c.degraded >= 2) return "degraded";
  return "ok";
}
