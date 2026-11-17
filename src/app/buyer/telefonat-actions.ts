"use server";

// Telefonate sauber erfassen (lib/telefonat.ts): „Anrufen“ getippt (Assistent pausiert), Bedarf nach dem Gespräch
// laden und speichern, Notiz per KI den Punkten zuordnen. Schreibrecht wie überall (eigener Kunde, Vorschau nur Demo).

import { revalidatePath } from "next/cache";
import { getBuyerContext } from "@/lib/buyer-context";
import { writableCustomerId } from "@/lib/buyer-write";
import { recordUsage } from "@/lib/usage";
import { anrufGestartet, bedarfAusNotiz, bedarfLaden, bedarfSpeichern, type BedarfStandDaten } from "@/lib/telefonat-server";
import { isNeedState } from "@/lib/telefonat";
import type { QualificationData } from "@/lib/whatsapp/qualification";

const PREVIEW = "In der Vorschau nur mit Demo-Leads möglich.";

/** „Anrufen“ getippt: Assistent pausiert für diesen Lead, bis ein Ergebnis eingetragen ist. */
export async function callStartedAction(leadId: string): Promise<void> {
  const customerId = await writableCustomerId(leadId);
  if (!customerId) return;
  await anrufGestartet(leadId, customerId).catch((e) => console.error("[telefonat start]", e));
}

/** Bedarfspunkte für „Was haben Sie besprochen?“ (bekannte vorbelegt). */
export async function needLoadAction(leadId: string): Promise<{ ok: true; data: BedarfStandDaten } | { ok: false; error: string }> {
  const customerId = await writableCustomerId(leadId);
  if (!customerId) return { ok: false, error: PREVIEW };
  const data = await bedarfLaden(leadId, customerId);
  return data ? { ok: true, data } : { ok: false, error: "Lead nicht gefunden." };
}

/** Notiz bzw. Diktat per KI den Punkten zuordnen; der Vermittler prüft und speichert. */
export async function needFromNoteAction(leadId: string, text: string): Promise<{ ok: true; angaben: QualificationData } | { ok: false; error: string }> {
  const customerId = await writableCustomerId(leadId);
  if (!customerId) return { ok: false, error: PREVIEW };
  const data = await bedarfLaden(leadId, customerId);
  if (!data) return { ok: false, error: "Lead nicht gefunden." };
  try {
    const angaben = await bedarfAusNotiz(text, data.felder);
    await recordUsage("action", "telefonat.notiz_zuordnen");
    return { ok: true, angaben };
  } catch (e) {
    console.error("[telefonat notiz]", e);
    return { ok: false, error: "Das hat gerade nicht geklappt. Bitte die Punkte von Hand eintragen." };
  }
}

/** Bedarf aus dem Telefonat speichern (auch „Überspringen“: dann fragt der Assistent vorsichtig nach). */
export async function needSaveAction(
  leadId: string,
  input: { angaben?: QualificationData; notiz?: string | null; stand?: string | null; uebersprungen?: boolean },
): Promise<{ ok: true; offen: string[] } | { ok: false; error: string }> {
  const customerId = await writableCustomerId(leadId);
  if (!customerId) return { ok: false, error: PREVIEW };
  const ctx = await getBuyerContext();
  const r = await bedarfSpeichern(leadId, customerId, {
    angaben: input.angaben ?? {},
    notiz: input.notiz ?? null,
    stand: isNeedState(input.stand) ? input.stand : null,
    uebersprungen: !!input.uebersprungen,
    userId: ctx?.userId ?? null,
  });
  if (!r) return { ok: false, error: "Lead nicht gefunden." };
  await recordUsage("action", input.uebersprungen ? "telefonat.bedarf_uebersprungen" : "telefonat.bedarf");
  revalidatePath("/buyer");
  revalidatePath("/buyer/kontakte", "layout");
  revalidatePath(`/buyer/leads/${leadId}`);
  return { ok: true, offen: r.offen };
}
