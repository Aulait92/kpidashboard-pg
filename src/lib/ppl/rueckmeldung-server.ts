// Rückmeldung des Pay-per-Lead-Käufers speichern (Liefer-E-Mail ohne Login und Leadliste, lib/ppl/rueckmeldung.ts).
// Schreibt dieselben Felder wie die übrigen Wege (Phase, erreicht, Erstkontakt, Anrufversuche, Wiedervorlage, Verlauf),
// damit die Rückmeldung in allen Zahlen erscheint (Diagnose q=ppl-rueckmeldung, Kette „kaeuferRueckmeldung“, Zahlen).
//
// Phase nur nach vorn: „Erreicht“ aus Neu/Nicht erreicht, „Termin vereinbart“ zusätzlich aus Erreicht/Im Gespräch/
// Qualifiziert, „Nicht erreicht“ nur aus Neu. Spätere Phasen (Angebot, Abschluss, Verloren, Storno) bleiben. Eine
// geänderte Rückmeldung („Ändern“ auf der Bestätigungsseite) darf die Phase der vorigen Rückmeldung ersetzen.
// „Nicht erreicht“: Anrufversuch zählen (30-Minuten-Sperre wie lib/call-attempts.ts) und Wiedervorlage am nächsten
// Werktag um 9 Uhr, außer der Käufer hat schon eine eigene spätere Wiedervorlage.
import { prisma } from "@/lib/prisma";
import { isReplaceableCallTask } from "@/lib/call-plan";
import { logLeadHistory } from "@/lib/lead-history";
import { pruefeRueckmeldungToken, rueckmeldungTokenTeile } from "@/lib/ppl/rueckmeldung-token";
import {
  naechsterWerktag9,
  RUECKMELDUNG_LABEL,
  RUECKMELDUNG_STATUS,
  RUECKMELDUNG_WIEDERVORLAGE,
  wiedervorlageText,
  type RueckmeldungArt,
  istRueckmeldungArt,
} from "@/lib/ppl/rueckmeldung";

const CALL_ATTEMPT_LOCK_MS = 30 * 60 * 1000;
const FRUEH = new Set(["", "neuer lead", "nicht erreicht"]);
const VOR_TERMIN = new Set([...FRUEH, "erreicht", "im gespräch", "qualifiziert"]);

/** Darf die Rückmeldung die Phase setzen? prev = vorige Rückmeldung (deren Phase darf ersetzt werden). */
export function neuePhase(art: RueckmeldungArt, status: string | null, prev: string | null): string | null {
  const s = (status ?? "").trim().toLowerCase();
  const ziel = RUECKMELDUNG_STATUS[art];
  if (s === ziel.toLowerCase()) return null;
  const vonVoriger = istRueckmeldungArt(prev) && s === RUECKMELDUNG_STATUS[prev].toLowerCase();
  if (vonVoriger) return ziel;
  if (art === "nicht_erreicht") return s === "" || s === "neuer lead" ? ziel : null;
  if (art === "erreicht") return FRUEH.has(s) ? ziel : null;
  return VOR_TERMIN.has(s) ? ziel : null;
}

export type RueckmeldungErgebnis =
  | { ok: true; art: RueckmeldungArt; wiedervorlageAt: Date | null; phase: string | null }
  | { ok: false; error: string };

/**
 * Rückmeldung speichern. customerId = Käufer (aus dem Token bzw. der Anmeldung), quelle = mail | app.
 * userId: angemeldeter Nutzer (Verlauf), null beim Link ohne Login.
 */
export async function setzeRueckmeldung(opts: {
  leadId: string;
  customerId: string;
  art: RueckmeldungArt;
  quelle: "mail" | "app";
  userId?: string | null;
  now?: Date;
}): Promise<RueckmeldungErgebnis> {
  const now = opts.now ?? new Date();
  const lead = await prisma.lead.findFirst({
    where: { id: opts.leadId, customerId: opts.customerId, erasedAt: null },
    select: {
      id: true,
      airtableId: true,
      status: true,
      firstContactAt: true,
      contactAttempts: true,
      followUpAt: true,
      followUpNote: true,
      kaeuferRueckmeldung: true,
      stornoState: true,
      closedAt: true,
    },
  });
  if (!lead) return { ok: false, error: "Lead nicht gefunden." };
  const phase = lead.stornoState || lead.closedAt ? null : neuePhase(opts.art, lead.status, lead.kaeuferRueckmeldung);
  const erreicht = opts.art !== "nicht_erreicht";

  // Wiedervorlage: „Nicht erreicht“ → nächster Werktag 9 Uhr (eigene spätere Wiedervorlage bleibt); sonst entfällt die
  // von uns gesetzte „Erneut anrufen“ (geänderte Rückmeldung)
  const eigeneSpaeter =
    !!lead.followUpAt && lead.followUpAt.getTime() > now.getTime() && lead.followUpNote !== RUECKMELDUNG_WIEDERVORLAGE && !isReplaceableCallTask(lead.followUpNote);
  const wiedervorlageAt = opts.art === "nicht_erreicht" && !eigeneSpaeter ? naechsterWerktag9(now) : null;
  const unsereWiedervorlage = lead.followUpNote === RUECKMELDUNG_WIEDERVORLAGE;

  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      kaeuferRueckmeldung: opts.art,
      kaeuferRueckmeldungAt: now,
      kaeuferRueckmeldungQuelle: opts.quelle,
      callStartedAt: null,
      ...(phase ? { status: phase } : {}),
      ...(erreicht ? { reached: true } : phase ? { reached: false } : {}),
      ...(!lead.firstContactAt ? { firstContactAt: now, contactAttempts: Math.max(1, lead.contactAttempts) } : {}),
      ...(wiedervorlageAt
        ? { followUpAt: wiedervorlageAt, followUpNote: RUECKMELDUNG_WIEDERVORLAGE, callbackSnoozedUntil: wiedervorlageAt }
        : erreicht && unsereWiedervorlage
          ? { followUpAt: null, followUpNote: null }
          : {}),
    },
  });
  if (opts.art === "nicht_erreicht") {
    // Anrufversuch zählen (zwei Klicks kurz hintereinander zählen einmal)
    await prisma.lead.updateMany({
      where: { id: lead.id, OR: [{ lastCallAttemptAt: null }, { lastCallAttemptAt: { lte: new Date(now.getTime() - CALL_ATTEMPT_LOCK_MS) } }] },
      data: { callAttempts: { increment: 1 }, contactAttempts: { increment: lead.firstContactAt ? 1 : 0 }, lastCallAttemptAt: now },
    });
  }
  if (lead.airtableId && phase) {
    const { updateLeadEditableFields } = await import("@/lib/airtable-write");
    await updateLeadEditableFields({ airtableId: lead.airtableId, bearbeitungsstatus: phase }).catch((e) => console.error("[ppl-rueckmeldung airtable]", e));
  }
  const weg = opts.quelle === "mail" ? " (per E-Mail)" : "";
  await logLeadHistory(
    lead.id,
    opts.art === "nicht_erreicht" ? "anruf" : "status",
    `Rückmeldung${weg}: ${RUECKMELDUNG_LABEL[opts.art]}${wiedervorlageAt ? ` · Wiedervorlage ${wiedervorlageText(wiedervorlageAt)}` : ""}`,
    { customerId: opts.customerId, userId: opts.userId ?? null },
  );
  return { ok: true, art: opts.art, wiedervorlageAt, phase };
}

export type RueckmeldungSeite =
  | { ok: false; grund: "ungueltig" | "abgelaufen" }
  | {
      ok: true;
      leadId: string;
      customerId: string;
      name: string | null;
      produkt: string | null;
      eingang: Date;
      aktuell: RueckmeldungArt | null;
      aktuellAt: Date | null;
      wiedervorlageAt: Date | null;
    };

/** Lead zum Link (Seite ohne Login). Ungültig auch, wenn der Lead gelöscht ist oder nicht mehr diesem Käufer gehört. */
export async function ladeRueckmeldungSeite(token: string, now = new Date()): Promise<RueckmeldungSeite> {
  const teile = rueckmeldungTokenTeile(token);
  if (!teile) return { ok: false, grund: "ungueltig" };
  const lead = await prisma.lead.findUnique({
    where: { id: teile.leadId },
    select: {
      id: true,
      customerId: true,
      name: true,
      source: true,
      createdAt: true,
      deliveredAt: true,
      erasedAt: true,
      subscriptionId: true,
      kaeuferRueckmeldung: true,
      kaeuferRueckmeldungAt: true,
      followUpAt: true,
      followUpNote: true,
    },
  });
  if (!lead || lead.erasedAt || !lead.subscriptionId) return { ok: false, grund: "ungueltig" };
  const p = pruefeRueckmeldungToken(token, lead.customerId, now);
  if (!p.ok) return p;
  return {
    ok: true,
    leadId: lead.id,
    customerId: lead.customerId,
    name: lead.name,
    produkt: lead.source,
    eingang: lead.deliveredAt ?? lead.createdAt,
    aktuell: istRueckmeldungArt(lead.kaeuferRueckmeldung) ? lead.kaeuferRueckmeldung : null,
    aktuellAt: lead.kaeuferRueckmeldungAt,
    wiedervorlageAt: lead.followUpNote === RUECKMELDUNG_WIEDERVORLAGE && lead.followUpAt ? lead.followUpAt : null,
  };
}
