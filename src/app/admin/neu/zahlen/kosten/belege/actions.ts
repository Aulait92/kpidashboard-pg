"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
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

/**
 * Belege hochladen (PDF, Bilder, ZIP, mehrere auf einmal). Dateien werden sofort gespeichert; das Auslesen und Zuordnen
 * läuft danach im Hintergrund (große ZIP-Pakete würden sonst die Anfrage sprengen).
 */
export async function belegeHochladenAction(form: FormData) {
  const session = await requireAuth();
  const dateien = form.getAll("dateien").filter((f): f is File => typeof f === "object" && "arrayBuffer" in f && f.size > 0);
  if (!dateien.length) redirect(`${ZIEL}?fehler=${encodeURIComponent("Keine Datei gewählt.")}`);
  const { belegAblegen, zaehle, belegeAuslesenOffen } = await import("@/lib/belege/ablage");
  const alle = [];
  for (const f of dateien.slice(0, 50)) {
    alle.push(...(await belegAblegen({ daten: new Uint8Array(await f.arrayBuffer()), name: f.name, quelle: "upload", absender: session.email, spaeter: true })));
  }
  const z = zaehle(alle);
  await audit("belege.upload", { details: { ...z } });
  after(async () => {
    const { belegeAbgleichen } = await import("@/lib/belege/server");
    // in Runden, damit auch Hunderte Belege durchlaufen
    for (let i = 0; i < 20; i++) {
      const r = await belegeAuslesenOffen(50).catch(() => ({ ausgelesen: 0, doppelt: 0, fehler: 0 }));
      if (!r.ausgelesen && !r.doppelt && !r.fehler) break;
    }
    await belegeAbgleichen().catch(() => 0);
  });
  revalidatePath("/admin/neu/zahlen", "layout");
  redirect(`${ZIEL}?hochgeladen=${z.neu}&doppelt=${z.doppelt}&fehlerhaft=${z.kein_beleg + z.fehler + z.virus}&imHintergrund=1`);
}

/**
 * Ein einzelner Beleg (Ole, 23.11.2026: 8 Dateien zusammen über 100 MB wurden abgelehnt): Die Seite lädt die Dateien
 * nacheinander hoch, jede Anfrage bleibt so unter der Grenze. Danach belegeUploadFertigAction (Auslesen im Hintergrund).
 */
export async function belegEinzelnHochladenAction(form: FormData): Promise<{ neu: number; doppelt: number; fehlerhaft: number }> {
  const session = await requireAuth();
  const f = form.get("datei");
  if (!(typeof f === "object" && f && "arrayBuffer" in f && f.size > 0)) return { neu: 0, doppelt: 0, fehlerhaft: 1 };
  const { belegAblegen, zaehle } = await import("@/lib/belege/ablage");
  const z = zaehle(await belegAblegen({ daten: new Uint8Array(await f.arrayBuffer()), name: f.name, quelle: "upload", absender: session.email, spaeter: true }));
  await audit("belege.upload", { details: { ...z } });
  return { neu: z.neu, doppelt: z.doppelt, fehlerhaft: z.kein_beleg + z.fehler + z.virus };
}

/** Nach dem Hochladen: Auslesen und Zuordnen im Hintergrund anstoßen. */
export async function belegeUploadFertigAction(): Promise<void> {
  await requireAuth();
  const { belegeAuslesenOffen } = await import("@/lib/belege/ablage");
  after(async () => {
    const { belegeAbgleichen } = await import("@/lib/belege/server");
    for (let i = 0; i < 20; i++) {
      const r = await belegeAuslesenOffen(50).catch(() => ({ ausgelesen: 0, doppelt: 0, fehler: 0 }));
      if (!r.ausgelesen && !r.doppelt && !r.fehler) break;
    }
    await belegeAbgleichen().catch(() => 0);
  });
  revalidatePath("/admin/neu/zahlen", "layout");
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
