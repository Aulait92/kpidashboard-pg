// Chat-Ansicht (Ole, 17.11.2026: „Champions-League-Niveau“): reine Helfer für Verlauf, Liste und Seitenleiste.
// Genutzt vom Kundenbereich (/buyer/chats) und vom Admin-Chat (app/admin/whatsapp/chats-ansicht.tsx) über
// components/chat/chat-verlauf.tsx. Ohne Datenbank, getestet (tests/unit/chat-ansicht.test.ts).

import { findPhaseForStatus, PHASE_DOT } from "@/lib/products";

const TZ = "Europe/Berlin";
const DAY = 86_400_000;
const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("de-DE", { timeZone: TZ, ...opts }).format(d);
export const tagSchluessel = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
export const uhrzeit = (d: Date) => fmt(d, { hour: "2-digit", minute: "2-digit" });

/** Tagestrenner im Verlauf: „Heute“, „Gestern“, „Fr., 13.11.“ (anderes Jahr mit Jahr). */
export function tagLabel(d: Date, now: number): string {
  const k = tagSchluessel(d);
  if (k === tagSchluessel(new Date(now))) return "Heute";
  if (k === tagSchluessel(new Date(now - DAY))) return "Gestern";
  const gleichesJahr = k.slice(0, 4) === tagSchluessel(new Date(now)).slice(0, 4);
  return fmt(d, { weekday: "short", day: "2-digit", month: "2-digit", ...(gleichesJahr ? {} : { year: "numeric" }) });
}

/** Chatliste: heute Uhrzeit, gestern „Gestern“, sonst „07.11.“. */
export function listenZeit(d: Date, now: number): string {
  const k = tagSchluessel(d);
  if (k === tagSchluessel(new Date(now))) return uhrzeit(d);
  if (k === tagSchluessel(new Date(now - DAY))) return "Gestern";
  return fmt(d, { day: "2-digit", month: "2-digit" });
}

/** „Heute 16:00“, „Morgen 16:00“, sonst „Mi., 18.11. 16:00“. */
export function terminKurz(d: Date, now: number): string {
  const k = tagSchluessel(d);
  const tag =
    k === tagSchluessel(new Date(now)) ? "Heute" : k === tagSchluessel(new Date(now + DAY)) ? "Morgen" : fmt(d, { weekday: "short", day: "2-digit", month: "2-digit" });
  return `${tag} ${uhrzeit(d)}`;
}

/** Kalenderblatt: „MI“ und „18“. */
export function kalenderblatt(d: Date): { wochentag: string; tag: string; monat: string } {
  return {
    wochentag: fmt(d, { weekday: "short" }).replace(".", "").toUpperCase(),
    tag: fmt(d, { day: "numeric" }),
    monat: fmt(d, { month: "short" }).replace(".", ""),
  };
}

/** Zwei Initialen: Vor- und Nachname („Ole Kannapinn“ → „OK“), sonst die ersten zwei Zeichen. */
export function initialen(name: string): string {
  const teile = name.trim().split(/\s+/).filter((t) => /[A-Za-zÄÖÜäöüß0-9]/.test(t));
  const buchst = (t: string) => t.replace(/[^A-Za-zÄÖÜäöüß0-9]/g, "").charAt(0);
  const s = teile.length > 1 ? buchst(teile[0]) + buchst(teile[teile.length - 1]) : name.replace(/[^A-Za-zÄÖÜäöüß0-9]/g, "").slice(0, 2);
  return s.toUpperCase() || "··";
}

/** Avatar-Farben (Hintergrund, Schrift), ruhig und gut lesbar. */
export const AVATAR_FARBEN = [
  { bg: "#e0e9ff", fg: "#1d4ed8" },
  { bg: "#fef3c7", fg: "#b45309" },
  { bg: "#fce7f3", fg: "#be185d" },
  { bg: "#dcfce7", fg: "#15803d" },
  { bg: "#ede9fe", fg: "#6d28d9" },
  { bg: "#e0f2fe", fg: "#0369a1" },
  { bg: "#ffedd5", fg: "#c2410c" },
  { bg: "#ccfbf1", fg: "#0f766e" },
] as const;

/** Farbe stabil aus dem Namen (gleicher Name, gleiche Farbe; unabhängig von Groß- und Kleinschreibung). */
export function avatarFarbe(name: string): (typeof AVATAR_FARBEN)[number] {
  let h = 0;
  for (const ch of name.trim().toLowerCase()) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return AVATAR_FARBEN[h % AVATAR_FARBEN.length];
}

/** Punktfarbe zur Phase (gleiche Farben wie die Pipeline). */
export function phasenPunkt(status: string | null | undefined): string {
  const s = (status ?? "").trim();
  if (!s) return PHASE_DOT.neu;
  if (s.toLowerCase().startsWith("storno")) return "bg-rose-400";
  if (s === "Im Gespräch") return PHASE_DOT.gespraech;
  return PHASE_DOT[findPhaseForStatus(s)?.key ?? "neu"] ?? PHASE_DOT.neu;
}

// ─── Absender ──────────────────────────────────────────────────────────

/** lead = Kontakt, assistent = KI bzw. automatisch, ich = Vermittler bzw. Team (App oder WhatsApp-App). */
export type Absender = "lead" | "assistent" | "ich";

export function absenderVon(direction: string, sentBy: string | null): Absender {
  if (direction !== "outbound") return "lead";
  return sentBy === "agent" || sentBy === "app" ? "ich" : "assistent";
}

// ─── Ereignisse ────────────────────────────────────────────────────────

export type EreignisTon = "gut" | "info" | "achtung" | "stopp";
export type EreignisIcon = "termin" | "termin-ok" | "termin-weg" | "liste" | "person" | "schild" | "stopp" | "uhr" | "post";
export type Ereignis = { label: string; ton: EreignisTon; icon: EreignisIcon };

const EREIGNISSE: Record<string, Ereignis> = {
  qualification: { label: "Qualifizierung aktualisiert", ton: "info", icon: "liste" },
  appointment_proposal: { label: "Terminwunsch notiert", ton: "info", icon: "termin" },
  appointment_booked: { label: "Termin gebucht", ton: "gut", icon: "termin-ok" },
  appointment_confirmed: { label: "Termin zugesagt", ton: "gut", icon: "termin-ok" },
  appointment_cancelled: { label: "Termin abgesagt", ton: "stopp", icon: "termin-weg" },
  appointment_rescheduled: { label: "Termin verschoben", ton: "info", icon: "termin" },
  appointment_declined: { label: "Einladung abgelehnt", ton: "stopp", icon: "termin-weg" },
  handover: { label: "An Sie übergeben", ton: "achtung", icon: "person" },
  ki_handover: { label: "Möchte einen Menschen: an Sie übergeben, Assistent pausiert", ton: "achtung", icon: "person" },
  advice_blocked: { label: "Antwort ersetzt: keine Tarif-, Preis- oder Versichereraussagen", ton: "achtung", icon: "schild" },
  opt_out: { label: "„STOPP“: keine weiteren WhatsApp-Nachrichten", ton: "stopp", icon: "stopp" },
  // lib/whatsapp/buchungsnummer.ts: Formular-Nummer ohne WhatsApp, Lead hat online mit dieser Nummer gebucht
  wa_nummer_uebernommen: { label: "WhatsApp über die Nummer aus der Online-Buchung", ton: "info", icon: "person" },
  erneut_eingetragen: { label: "Hat sich erneut eingetragen", ton: "info", icon: "person" },
  followup_scheduled: { label: "Wiedervorlage geplant", ton: "info", icon: "uhr" },
  email_updated: { label: "E-Mail-Adresse aktualisiert", ton: "info", icon: "post" },
  lead_lost: { label: "Kein Bedarf, als verloren markiert", ton: "stopp", icon: "stopp" },
};

/** Admin-Sicht: „an den Berater“ statt „an Sie“. */
const ADMIN_LABEL: Record<string, string> = {
  handover: "An den Berater übergeben",
  ki_handover: "Möchte einen Menschen: an den Berater übergeben, Bot pausiert",
};

export type Sicht = "kunde" | "admin";

function json(body: string | null): Record<string, unknown> {
  if (!body) return {};
  try {
    const v = JSON.parse(body) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const datum = (v: unknown): Date | null => {
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** „Mi., 18.11. um 16:00“ */
export function terminZeit(d: Date): string {
  return `${fmt(d, { weekday: "short", day: "2-digit", month: "2-digit" })} um ${uhrzeit(d)}`;
}

/**
 * Interne Nachricht als dezente Ereigniszeile. Unbekannte Arten: null (Kundenbereich blendet sie aus; der Admin
 * zeigt sie mit ihrem Schlüssel). termine: Startzeiten je Termin-ID, damit „Termin zugesagt“ die Zeit nennt.
 */
export function ereignisVon(kind: string, body: string | null, termine?: Map<string, Date>, sicht: Sicht = "kunde"): (Ereignis & { detail: string | null }) | null {
  const basis = EREIGNISSE[kind];
  if (!basis) return null;
  const e = sicht === "admin" && ADMIN_LABEL[kind] ? { ...basis, label: ADMIN_LABEL[kind] } : basis;
  const p = json(body);
  let wann: Date | null = null;
  if (kind === "appointment_booked") wann = datum(p.start) ?? datum(p.starts);
  else if (kind === "appointment_rescheduled") wann = datum(p.auf);
  if (!wann && typeof p.appointmentId === "string" && (kind === "appointment_booked" || kind === "appointment_confirmed")) wann = termine?.get(p.appointmentId) ?? null;
  const detail = wann ? (kind === "appointment_rescheduled" ? `auf ${terminZeit(wann)}` : terminZeit(wann)) : null;
  return { ...e, detail };
}

// ─── Verlauf ───────────────────────────────────────────────────────────

export type VerlaufNachricht = { id: string; direction: string; kind: string | null; body: string | null; sentBy: string | null; createdAt: Date };

export type VerlaufEintrag<M extends VerlaufNachricht> =
  | { art: "tag"; key: string; label: string }
  | { art: "ereignis"; key: string; m: M; ereignis: (Ereignis & { detail: string | null }) | null }
  | { art: "nachricht"; key: string; m: M; absender: Absender; /** Absender gewechselt: Etikett zeigen, mehr Abstand */ wechsel: boolean };

/**
 * Verlauf mit Tagestrennern und Absenderwechseln. Ein Ereignis oder ein neuer Tag beginnt eine neue Gruppe.
 * Interne Nachrichten ohne bekanntes Ereignis fallen weg, außer unbekannteZeigen (Admin).
 */
export function verlaufAufbauen<M extends VerlaufNachricht>(
  messages: M[],
  now: number,
  opts: { termine?: Map<string, Date>; unbekannteZeigen?: boolean; sicht?: Sicht } = {},
): VerlaufEintrag<M>[] {
  const out: VerlaufEintrag<M>[] = [];
  let tag = "";
  let vorher: Absender | null = null;
  for (const m of messages) {
    const k = tagSchluessel(m.createdAt);
    if (k !== tag) {
      tag = k;
      vorher = null;
      out.push({ art: "tag", key: `tag:${k}`, label: tagLabel(m.createdAt, now) });
    }
    if (m.direction === "internal") {
      const ereignis = ereignisVon(m.kind ?? "", m.body, opts.termine, opts.sicht);
      if (!ereignis && !opts.unbekannteZeigen) continue;
      out.push({ art: "ereignis", key: m.id, m, ereignis });
      vorher = null;
      continue;
    }
    const absender = absenderVon(m.direction, m.sentBy);
    out.push({ art: "nachricht", key: m.id, m, absender, wechsel: absender !== vorher });
    vorher = absender;
  }
  return out;
}

// ─── Seitenleiste ──────────────────────────────────────────────────────

/** Sparten aus „Interesse“ des Assistenten bzw. Produkt (Komma, „und“, Schrägstrich), ohne Dopplungen. */
export function sparten(interesse: string | null | undefined, produkt: string | null | undefined): string[] {
  if (!interesse) return [];
  const p = (produkt ?? "").trim().toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of interesse.split(/,|;|\/|\bund\b|\+/i)) {
    const s = raw.replace(/\(.*?\)/g, "").trim();
    if (!s || s.length > 40) continue;
    const key = s.toLowerCase();
    if (key === p || seen.has(key)) continue;
    seen.add(key);
    out.push(s.charAt(0).toUpperCase() + s.slice(1));
  }
  return out.slice(0, 6);
}
