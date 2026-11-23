import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

// Belege hochladen, eine Datei je Anfrage (Ole, 23.11.2026). Bewusst eine API-Route statt Server Action: Nach einem
// Deploy lehnte der Server Uploads aus der noch offenen Seite ab (409, veraltete Action), Belege gingen verloren.
// ?fertig=1 stößt danach Auslesen und Zuordnen im Hintergrund an.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function gleicheHerkunft(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(req.url).host || new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

export async function POST(req: Request): Promise<Response> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") return Response.json({ error: "Nicht angemeldet." }, { status: 403 });
  if (!gleicheHerkunft(req)) return Response.json({ error: "Nicht erlaubt." }, { status: 403 });

  if (new URL(req.url).searchParams.get("fertig") === "1") {
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
    return Response.json({ ok: true });
  }

  const form = await req.formData().catch(() => null);
  const f = form?.get("datei");
  if (!(f && typeof f === "object" && "arrayBuffer" in f && f.size > 0)) return Response.json({ error: "Keine Datei." }, { status: 400 });
  const { belegAblegen, zaehle } = await import("@/lib/belege/ablage");
  const z = zaehle(await belegAblegen({ daten: new Uint8Array(await f.arrayBuffer()), name: f.name, quelle: "upload", absender: session.email, spaeter: true }));
  await audit("belege.upload", { details: { ...z } });
  return Response.json({ neu: z.neu, doppelt: z.doppelt, fehlerhaft: z.kein_beleg + z.fehler + z.virus });
}
