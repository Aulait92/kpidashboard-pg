"use server";

import { revalidatePath } from "next/cache";
import { getBuyerContext } from "@/lib/buyer-context";
import { MELDUNG } from "@/lib/datennutzung";
import { bestaetigeHinweis, merkeAnzeige, nimmZurueck, widerspreche } from "@/lib/datennutzung-server";
import { reportError } from "@/lib/monitoring";
import { recordUsage } from "@/lib/usage";

// Hinweis „KI-Hilfe und gemeinsames Anzeigenlernen“ (lib/datennutzung-server.ts). Wer was darf (nur der Inhaber eines
// Software-Kunden, nie Vorschau oder Demo), prüft jede Funktion dort selbst; hier nur Sitzung, Rückmeldung und Neuladen.

type Ergebnis = { ok: true } | { ok: false; error: string };

/** Banner im Browser eingeblendet: erste Anzeige festhalten (einmal je Kunde und Textversion). Ändert nichts Sichtbares. */
export async function datennutzungAngezeigtAction(): Promise<void> {
  try {
    const ctx = await getBuyerContext();
    if (ctx) await merkeAnzeige(ctx, "banner");
  } catch (err) {
    reportError(err, "datennutzung-angezeigt");
  }
}

/** „Verstanden“ im Banner bzw. auf der Detailseite. */
export async function datennutzungVerstandenAction(quelle: "banner" | "detailseite"): Promise<Ergebnis> {
  try {
    const ctx = await getBuyerContext();
    if (!ctx || !(await bestaetigeHinweis(ctx, quelle === "detailseite" ? "detailseite" : "banner"))) return { ok: false, error: MELDUNG.fehler };
    await recordUsage("action", "datennutzung.verstanden");
    revalidatePath("/buyer", "layout");
    return { ok: true };
  } catch (err) {
    reportError(err, "datennutzung-verstanden");
    return { ok: false, error: MELDUNG.fehler };
  }
}

/** „Widerspruch senden“ im Dialog: einer oder beide Punkte. */
export async function datennutzungWiderspruchAction(punkte: string[]): Promise<Ergebnis> {
  try {
    const ctx = await getBuyerContext();
    if (!ctx) return { ok: false, error: MELDUNG.fehler };
    const r = await widerspreche(ctx, punkte);
    if (!r.ok) return r;
    if (r.punkte.length) await recordUsage("action", "datennutzung.widerspruch", { meta: { punkte: r.punkte } });
    revalidatePath("/buyer", "layout");
    return { ok: true };
  } catch (err) {
    reportError(err, "datennutzung-widerspruch");
    return { ok: false, error: MELDUNG.fehler };
  }
}

/** „Widerspruch zurücknehmen“ je Punkt. */
export async function datennutzungRuecknahmeAction(punkt: string): Promise<Ergebnis> {
  try {
    const ctx = await getBuyerContext();
    if (!ctx) return { ok: false, error: MELDUNG.fehler };
    const r = await nimmZurueck(ctx, punkt);
    if (!r.ok) return r;
    if (r.punkte.length) await recordUsage("action", "datennutzung.ruecknahme", { meta: { punkt: r.punkte[0] } });
    revalidatePath("/buyer", "layout");
    return { ok: true };
  } catch (err) {
    reportError(err, "datennutzung-ruecknahme");
    return { ok: false, error: MELDUNG.fehler };
  }
}
