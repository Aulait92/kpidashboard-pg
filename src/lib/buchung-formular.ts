// Buchung direkt nach dem Meta-Leadformular (Ole, 22.11.2026, „einbauen“): Der Knopf auf der Dankeseite des Formulars
// führt auf /book/<slug>?von=formular (optional &dk=<Kennung> für den Splittest der Dankeseiten-Texte). Dort fragt die
// Seite nur die Handynummer ab; der Server sucht dazu einen frischen Lead desselben Vermittlers (gleiche Nummer,
// angelegt oder erneut eingetragen in den letzten 2 Stunden) und bucht mit dessen Name und E-Mail. Angezeigt wird davon
// nichts (kein Datenleck, wenn jemand eine fremde Nummer eintippt). Kein Treffer: normale Felder, Nummer bleibt.
// Rechtliche Einschätzung: docs/recht/2026-11-22-buchungsseite-nur-handynummer.md
//
// Reine Teile (Auswahl, Marker, Nummern-Token) ohne Datenbank getestet: tests/unit/buchung-formular.test.ts.

import { EMAIL_RE, normalizePhone } from "@/lib/whatsapp/phone";
import { phoneKey } from "@/lib/vertrieb/dubletten";

/** Wert des URL-Markers auf dem Dankeseiten-Knopf. */
export const VON_FORMULAR = "formular";

/** Nur Leads, die so frisch sind (angelegt oder erneut eingetragen), gelten als „gerade das Formular abgeschickt“. */
export const FORMULAR_FENSTER_MS = 2 * 60 * 60 * 1000;

/** Kleine Uhrabweichung zwischen App und Datenbank (Lead „aus der Zukunft“) tolerieren. */
const UHR_TOLERANZ_MS = 5 * 60 * 1000;

/** Kam der Besucher über den Dankeseiten-Knopf eines Leadformulars? */
export function istVonFormular(v: unknown): boolean {
  return typeof v === "string" && v.trim().toLowerCase() === VON_FORMULAR;
}

/** Kennung der Dankeseiten-Fassung (Splittest), nur kurze, harmlose Zeichen; sonst null. */
export function dankeKennung(v: unknown): string | null {
  const x = typeof v === "string" ? v.trim() : "";
  return /^[A-Za-z0-9_-]{1,24}$/.test(x) ? x : null;
}

/**
 * Link für den Knopf auf der Dankeseite: Buchungsseite mit Marker von=formular (sonst unverändert, vorhandene
 * Parameter bleiben). Ungültige Adresse: unverändert zurück.
 */
export function formularBuchungsUrl(bookingUrl: string, dk?: string | null): string {
  try {
    const u = new URL(bookingUrl);
    u.searchParams.set("von", VON_FORMULAR);
    const k = dankeKennung(dk);
    if (k) u.searchParams.set("dk", k);
    return u.toString();
  } catch {
    return bookingUrl;
  }
}

export type FormularLeadKandidat = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  createdAt: Date;
  erasedAt?: Date | null;
  /** Erneute Eintragungen (lib/lead-erneut.ts): auch sie zählen als „gerade abgeschickt“ */
  reentries?: { createdAt: Date }[];
};

export type FormularLead = { id: string; name: string; email: string; phone: string | null };

/** Zeitpunkt der letzten Einsendung (Lead angelegt oder erneut eingetragen). */
function letzteEinsendung(l: FormularLeadKandidat): number {
  return Math.max(l.createdAt.getTime(), ...(l.reentries ?? []).map((r) => r.createdAt.getTime()));
}

/** E-Mail-Adresse zum Vergleich: getrimmt, kleingeschrieben; ungültig: null. */
export function emailKey(raw: string | null | undefined): string | null {
  const e = (raw ?? "").trim().toLowerCase();
  return e && EMAIL_RE.test(e) ? e : null;
}

export type FormularSuche = { phone: string | null | undefined } | { email: string | null | undefined };

/**
 * Passenden frischen Lead wählen (rein): gleiche Nummer (normalisiert, Schreibweise egal) bzw. gleiche E-Mail
 * (kleingeschrieben), letzte Einsendung im Zeitfenster, nicht gelöscht, Name und gültige E-Mail vorhanden. Mehrere: die
 * jüngste Einsendung. Sonst null. Die Vermittler-Grenze (customerId) zieht die Datenbankabfrage (findeFormularLead).
 */
export function waehleFormularLead(
  kandidaten: readonly FormularLeadKandidat[],
  eingabe: FormularSuche & { now: Date; fensterMs?: number },
): FormularLead | null {
  const passt: ((l: FormularLeadKandidat) => boolean) | null =
    "phone" in eingabe
      ? ((key) => (key ? (l: FormularLeadKandidat) => phoneKey(l.phone) === key : null))(phoneKey(eingabe.phone ?? null))
      : ((key) => (key ? (l: FormularLeadKandidat) => emailKey(l.email) === key : null))(emailKey(eingabe.email));
  if (!passt) return null;
  const jetzt = eingabe.now.getTime();
  const ab = jetzt - (eingabe.fensterMs ?? FORMULAR_FENSTER_MS);
  const passend = kandidaten
    .filter((l) => !l.erasedAt && passt(l))
    .filter((l) => {
      const t = letzteEinsendung(l);
      return t >= ab && t <= jetzt + UHR_TOLERANZ_MS;
    })
    .filter((l) => !!l.name?.trim() && !!l.email && EMAIL_RE.test(l.email.trim()))
    .sort((x, y) => letzteEinsendung(y) - letzteEinsendung(x));
  const l = passend[0];
  return l ? { id: l.id, name: l.name!.trim().slice(0, 80), email: l.email!.trim().toLowerCase(), phone: l.phone ?? null } : null;
}

type LeadFinder = {
  lead: {
    findMany: (args: {
      where: object;
      orderBy: object;
      take: number;
      select: object;
    }) => Promise<FormularLeadKandidat[]>;
  };
};

/**
 * Frischen Lead dieses Vermittlers zur eingegebenen Nummer bzw. E-Mail suchen. Kommt der Lead gerade erst an
 * (Meta-Eingang dauert manchmal Sekunden), wird kurz nachgefragt (warten). Nur innerhalb des Vermittlers und des
 * Zeitfensters.
 */
export async function findeFormularLead(
  customerId: string,
  suche: FormularSuche,
  opts: { now?: () => Date; db?: LeadFinder; warten?: readonly number[]; schlafen?: (ms: number) => Promise<void> } = {},
): Promise<FormularLead | null> {
  let kontakt: object;
  let normSuche: FormularSuche;
  if ("phone" in suche) {
    const phone = suche.phone ? normalizePhone(suche.phone) : null;
    const key = phoneKey(phone);
    if (!phone || !key) return null;
    kontakt = { OR: [{ phone }, { phoneDigits: key }] };
    normSuche = { phone };
  } else {
    const email = emailKey(suche.email);
    if (!email) return null;
    kontakt = { email: { equals: email, mode: "insensitive" } };
    normSuche = { email };
  }
  const db: LeadFinder = opts.db ?? ((await import("@/lib/prisma")).prisma as unknown as LeadFinder);
  const now = opts.now ?? (() => new Date());
  const schlafen = opts.schlafen ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const versuche = [0, ...(opts.warten ?? [])];
  for (const ms of versuche) {
    if (ms > 0) await schlafen(ms);
    const jetzt = now();
    const seit = new Date(jetzt.getTime() - FORMULAR_FENSTER_MS);
    const kandidaten = await db.lead.findMany({
      where: {
        customerId,
        erasedAt: null,
        AND: [kontakt, { OR: [{ createdAt: { gte: seit } }, { reentries: { some: { createdAt: { gte: seit } } } }] }],
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        createdAt: true,
        erasedAt: true,
        reentries: { where: { createdAt: { gte: seit } }, select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    const treffer = waehleFormularLead(kandidaten, { ...normSuche, now: jetzt });
    if (treffer) return treffer;
  }
  return null;
}

/**
 * Abweichende Nummer (Ole, 22.11.2026): Bucht jemand mit einer anderen Nummer als im Formular und passt die E-Mail zu
 * einer frischen Anfrage, läuft die Buchung im bestehenden WhatsApp-Chat der Formular-Nummer weiter, wenn dort schon
 * geschrieben wurde und die Nummer WhatsApp hat (Assistent, Erinnerungen und Strecke kennen den Termin dann sicher).
 * Sonst (noch kein Chat, kein WhatsApp, STOPP) über die neue Nummer. Die neue Nummer kommt nur in den Verlauf.
 */
export function formularChatWeiterNutzen(chat: { optedOutAt: Date | null; ausgehend: number } | null, lead: { waUnavailableAt: Date | null }): boolean {
  return !!chat && !chat.optedOutAt && chat.ausgehend > 0 && !lead.waUnavailableAt;
}

/** Verlaufseintrag beim Lead: neue Nummer vermerkt, Formular-Nummer bleibt. Neutral, ohne Gedankenstrich. */
export function abweichendeNummerNotiz(neueNummer: string, chatWeiter: boolean): string {
  return `Online-Buchung mit abweichender Handynummer +${neueNummer.replace(/^\+/, "")}. Die Nummer aus dem Formular bleibt gespeichert${chatWeiter ? ", Bestätigung und Assistent laufen im bisherigen WhatsApp-Chat" : ", Bestätigung an die neue Nummer"}.`;
}

// Eingetippte Nummer für die Rückfallseite (normale Felder) mitnehmen, ohne sie im Klartext in die Adresse zu schreiben:
// verschlüsselt (lib/encryption, AES-GCM) mit Zeitstempel, 1 Stunde gültig. Ohne Schlüssel: keine Vorbelegung.
const NUMMER_GUELTIG_MS = 60 * 60 * 1000;

export async function nummerToken(phone: string, now = Date.now()): Promise<string | null> {
  try {
    const { encryptSecret } = await import("@/lib/encryption");
    return Buffer.from(encryptSecret(`bf1:${now}:${phone}`), "utf8").toString("base64url");
  } catch {
    return null;
  }
}

export async function nummerAusToken(token: string | null | undefined, now = Date.now()): Promise<string | null> {
  if (!token || token.length > 400 || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
  try {
    const { decryptSecret } = await import("@/lib/encryption");
    const m = /^bf1:(\d{10,16}):(\d{8,15})$/.exec(decryptSecret(Buffer.from(token, "base64url").toString("utf8")));
    if (!m) return null;
    const t = Number(m[1]);
    return now - t <= NUMMER_GUELTIG_MS && t <= now + UHR_TOLERANZ_MS ? m[2] : null;
  } catch {
    return null;
  }
}
