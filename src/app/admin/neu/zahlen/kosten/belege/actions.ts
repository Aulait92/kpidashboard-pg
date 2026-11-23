"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/vertrieb/auth";
import { audit } from "@/lib/audit";

const ZIEL = "/admin/neu/zahlen/kosten/belege";

/** Belege neu abgleichen (und, solange verbunden, aus GetMyInvoices holen). Sonst nachts automatisch. */
export async function belegeJetztAbgleichenAction() {
  await requireAuth();
  const { gmiKonfiguriert } = await import("@/lib/belege/gmi");
  const { syncBelege, belegeAbgleichen } = await import("@/lib/belege/server");
  const r = gmiKonfiguriert()
    ? await syncBelege().catch((e: unknown) => ({ geholt: 0, neu: 0, zugeordnet: 0, fehler: e instanceof Error ? e.message : String(e) }))
    : { geholt: 0, neu: 0, zugeordnet: await belegeAbgleichen(), fehler: undefined as string | undefined };
  await audit("belege.abgleich", { details: { ...r } });
  revalidatePath("/admin/neu/zahlen", "layout");
  if (r.fehler) redirect(`${ZIEL}?fehler=${encodeURIComponent(r.fehler.slice(0, 200))}`);
  redirect(`${ZIEL}?ok=${r.zugeordnet}`);
}

/** Belege hochladen (PDF, Bilder, ZIP, mehrere auf einmal). */
export async function belegeHochladenAction(form: FormData) {
  const session = await requireAuth();
  const dateien = form.getAll("dateien").filter((f): f is File => typeof f === "object" && "arrayBuffer" in f && f.size > 0);
  if (!dateien.length) redirect(`${ZIEL}?fehler=${encodeURIComponent("Keine Datei gewählt.")}`);
  const { belegAblegen, zaehle } = await import("@/lib/belege/ablage");
  const alle = [];
  for (const f of dateien.slice(0, 50)) {
    alle.push(...(await belegAblegen({ daten: new Uint8Array(await f.arrayBuffer()), name: f.name, quelle: "upload", absender: session.email })));
  }
  const { belegeAbgleichen } = await import("@/lib/belege/server");
  const zugeordnet = await belegeAbgleichen().catch(() => 0);
  const z = zaehle(alle);
  await audit("belege.upload", { details: { ...z, zugeordnet } });
  revalidatePath("/admin/neu/zahlen", "layout");
  redirect(`${ZIEL}?hochgeladen=${z.neu}&doppelt=${z.doppelt}&fehlerhaft=${z.kein_beleg + z.fehler + z.virus}&ok=${zugeordnet}`);
}

/** Monatspaket an das Steuerbüro senden (nur auf diesen Klick). */
export async function monatspaketSendenAction(form: FormData) {
  const session = await requireAuth();
  const monat = String(form.get("monat") ?? "");
  if (!/^\d{4}-\d{2}$/.test(monat)) redirect(`${ZIEL}?fehler=${encodeURIComponent("Ungültiger Monat.")}`);
  const { paketSenden } = await import("@/lib/belege/monatspaket");
  const r = await paketSenden(monat, { antwortAn: session.email });
  await audit("belege.monatspaket", { details: { monat, ok: r.ok, ...(r.ok ? { anzahl: r.anzahl } : { error: r.error }) } });
  revalidatePath(ZIEL);
  if (!r.ok) redirect(`${ZIEL}?fehler=${encodeURIComponent(r.error)}`);
  redirect(`${ZIEL}?gesendet=${monat}`);
}
