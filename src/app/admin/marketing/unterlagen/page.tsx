import { requireAuth } from "@/lib/vertrieb/auth";
import { ladeUnterlagen } from "@/lib/vertrieb/unterlagen-seite";
import { UnterlagenGrid } from "./unterlagen-grid";

export const metadata = { title: "Unterlagen | Vertrieb" };
export const dynamic = "force-dynamic";

// Aktuelle Präsentationen für Makler und Vertreter (PPTX + PDF). Das PDF kann mit der Angebotsmail mitgehen.
// Laden gemeinsam mit dem neuen Admin (lib/vertrieb/unterlagen-seite.ts).
export default async function UnterlagenPage() {
  await requireAuth();
  const { slots, demo } = await ladeUnterlagen();
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Unterlagen</h1>
        <p className="text-sm text-[color:var(--muted)]">
          Aktuelle Präsentation für Makler und für Vertreter. Ein neuer Upload ersetzt die alte Datei. Das PDF können Sie beim Versand eines Angebots
          mitschicken.
        </p>
      </div>
      <UnterlagenGrid slots={slots} demo={demo} />
    </div>
  );
}
