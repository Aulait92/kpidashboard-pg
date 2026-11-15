import { erstinfoDokument } from "@/lib/erstinformation";

// Erstinformation als PDF (§ 16 VersVermV: dauerhafter Datenträger), öffentlich über den Token: hochgeladenes
// PDF des Vermittlers (z. B. Vorlage der Gesellschaft), sonst aus den Pflichtangaben erzeugt
// (lib/erstinformation.ts). Diese Adresse lädt auch WhatsApp für das Dokument an den Lead.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(token)) return new Response("Nicht gefunden", { status: 404 });
  const doc = await erstinfoDokument({ token });
  if (!doc) return new Response("Nicht gefunden", { status: 404 });
  const name = doc.fileName.replace(/[^\w.\- ]+/g, "_");
  return new Response(new Uint8Array(doc.bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${name}"`,
      "cache-control": "public, max-age=300",
      "x-robots-tag": "noindex",
      "x-content-type-options": "nosniff",
    },
  });
}
