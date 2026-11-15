import { getBuyerContext } from "@/lib/buyer-context";
import { audit } from "@/lib/audit";
import { buildCustomerExport } from "@/lib/export/kundendaten";

// Datenexport (ZIP mit CSV-Dateien) unter Konto & Rechnungen: Inhaber, oder ein Admin in „Als Kunde ansehen“
// (z. B. zum Vertragsende). Jeder Download steht im Änderungsprotokoll.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const ctx = await getBuyerContext();
  if (!ctx || ctx.teamRole !== "owner") return new Response("Nicht erlaubt.", { status: 403 });
  const { fileName, zip, counts } = await buildCustomerExport(ctx.customerId);
  await audit("customer.export", {
    entity: "Customer",
    entityId: ctx.customerId,
    customerId: ctx.customerId,
    details: { ...counts, preview: ctx.preview },
  });
  return new Response(new Uint8Array(zip), {
    headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${fileName}"`, "cache-control": "no-store" },
  });
}
