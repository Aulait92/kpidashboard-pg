"use server";

// Kundenlink (19.11.2026): Messung „Folie erreicht“ und Zusage „Ja, so machen wir es“ ohne Anmeldung, nur mit dem
// geheimen Link. Gespeichert werden nur Termin, Folie und Variante (lib/praesentation-messung.ts), keine IP, kein Gerät.

import { ereignisSpeichern, FOLIE_ID } from "@/lib/praesentation-messung";
import { kundenlinkPaketWaehlen, kundenlinkTermin } from "@/lib/termin-vorbereitung-server";
import { reportError } from "@/lib/monitoring";

export async function kundenlinkFolieAction(token: string, folie: string): Promise<void> {
  if (typeof token !== "string" || typeof folie !== "string" || !FOLIE_ID.test(folie)) return;
  const t = await kundenlinkTermin(token);
  if (t) await ereignisSpeichern({ ...t, quelle: "kundenlink", art: "folie", folie }).catch((e) => reportError(e, "kundenlink-folie"));
}

/** „Ja, so machen wir es“ im Kundenlink: Zusage speichern und den Vermittler einmal per Push informieren. */
export async function kundenlinkZusageAction(token: string): Promise<{ ok: boolean }> {
  if (typeof token !== "string") return { ok: false };
  const t = await kundenlinkTermin(token);
  if (!t) return { ok: false };
  const neu = await ereignisSpeichern({ ...t, quelle: "kundenlink", art: "zusage" });
  if (neu && t.leadId) {
    const name = t.name?.trim() || "Ihr Kunde";
    await (await import("@/lib/team"))
      .notifyLeadPush(t.leadId, {
        title: `Zusage: ${name}`,
        body: `${name} hat im Beratungslink „Ja, so machen wir es“ gewählt. Jetzt den Antrag mit ${name} ausfüllen.`,
        tag: `praesentation-zusage:${t.appointmentId}`,
        url: `/buyer/termine/${t.appointmentId}/praesentation`,
      })
      .catch((e) => reportError(e, "kundenlink-zusage-push"));
  }
  return { ok: true };
}

/** Fassung C: Paket auf „Ihre Entscheidung“ wählen (vor der Zusage); bringt Folien und Leiste zur neuen Auswahl. */
export async function kundenlinkPaketAction(
  token: string,
  items: number[],
): Promise<{ ok: true; folien: { id: string; html: string }[]; summe: number | null; produkte: string[] } | { ok: false }> {
  if (typeof token !== "string") return { ok: false };
  const p = await kundenlinkPaketWaehlen(token, items).catch((e) => {
    reportError(e, "kundenlink-paket");
    return null;
  });
  return p ? { ok: true, folien: p.folien.map((f) => ({ id: f.id, html: f.html })), summe: p.abschluss.summe, produkte: p.abschluss.produkte } : { ok: false };
}
