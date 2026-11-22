"use server";

// „Nächste Nachrichten“ am Kontakt (Paket P6): Aktionen je Eintrag und „Alle pausieren“/„Fortsetzen“
// (Logik: lib/nachrichtenplan-aktionen.ts).

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { adminVorschauCustomerId, writableCustomerId } from "@/lib/buyer-write";
import { logLeadHistory } from "@/lib/lead-history";
import { getCurrentSession } from "@/lib/auth";
import { fortsetzen, jetztSenden, pausieren, ueberspringen, verschieben, zielAus, type AktionsErgebnis } from "@/lib/nachrichtenplan-aktionen";
import { recordUsage } from "@/lib/usage";

export type NachrichtenAktion =
  | { aktion: "pausieren" | "fortsetzen" }
  | { aktion: "ueberspringen" | "rueckgaengig" | "jetzt"; key: string }
  | { aktion: "verschieben"; key: string; datum: string; uhrzeit: string };

/** Text im Verlauf des Kontakts (nur, was der Vermittler bewusst geändert hat). */
const VERLAUF: Partial<Record<NachrichtenAktion["aktion"], string>> = {
  pausieren: "Automatische Nachrichten pausiert",
  fortsetzen: "Automatische Nachrichten fortgesetzt",
};

export async function nachrichtenAktion(leadId: string, a: NachrichtenAktion): Promise<AktionsErgebnis> {
  // Admin in der Vorschau: Nachrichten steuern auch bei echten Leads (lib/buyer-write.ts adminVorschauCustomerId)
  const customerId = (await writableCustomerId(leadId)) ?? (await adminVorschauCustomerId(leadId));
  if (!customerId) return { ok: false, error: "In der Vorschau nur mit Demo-Leads möglich." };
  if ("key" in a && !zielAus(a.key)) return { ok: false, error: "Dieser Eintrag lässt sich nicht ändern." };
  let res: AktionsErgebnis;
  switch (a.aktion) {
    case "pausieren":
      res = await pausieren(leadId);
      break;
    case "fortsetzen":
      res = await fortsetzen(leadId);
      break;
    case "ueberspringen":
    case "rueckgaengig":
      res = await ueberspringen(leadId, a.key, a.aktion === "ueberspringen");
      break;
    case "jetzt":
      res = await jetztSenden(leadId, a.key);
      break;
    case "verschieben": {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(a.datum) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(a.uhrzeit)) return { ok: false, error: "Bitte Datum und Uhrzeit wählen." };
      const { berlinAt } = await import("@/lib/calendar/lead-times");
      res = await verschieben(leadId, a.key, berlinAt(a.datum, a.uhrzeit));
      break;
    }
    default:
      return { ok: false, error: "Unbekannte Aktion." };
  }
  if (res.ok) {
    const s = await getCurrentSession();
    await audit("lead.nachrichten", {
      entity: "Lead",
      entityId: leadId,
      customerId,
      details: { aktion: a.aktion, ...("key" in a ? { key: a.key } : {}), ...(s?.role === "ADMIN" ? { vorschau: true } : {}) },
      ...(s?.role === "ADMIN" ? { actor: { id: s.userId, email: s.email, role: s.role } } : {}),
    });
    await recordUsage("action", `nachrichten.${a.aktion}`);
    const verlauf = VERLAUF[a.aktion];
    if (verlauf) {
      const session = await getCurrentSession();
      await logLeadHistory(leadId, "wiedervorlage", verlauf, { customerId, userId: session?.userId ?? null }).catch(() => null);
    }
  }
  revalidatePath(`/buyer/leads/${leadId}`);
  revalidatePath("/buyer");
  return res;
}
