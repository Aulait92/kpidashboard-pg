import { connection } from "next/server";
import { Seite } from "@/components/admin-neu/ui/seite";
import { UnterlagenGrid } from "@/app/admin/marketing/unterlagen/unterlagen-grid";
import { requireAuth } from "@/lib/vertrieb/auth";
import { ladeUnterlagen } from "@/lib/vertrieb/unterlagen-seite";

export const metadata = { title: "Unterlagen | performancegrowth Admin" };

// Marketing → Unterlagen (früher /admin/marketing/unterlagen): Web-Präsentation je Zielgruppe, PPTX und PDF hochladen,
// herunterladen, entfernen, Live-Demo der Beratungspräsentation. Gleicher Baustein (unterlagen-grid.tsx) und dieselben
// Routen (/api/admin/praesentationen).
export default async function Page() {
  await connection();
  await requireAuth();
  const { slots, demo } = await ladeUnterlagen();
  return (
    <Seite titel="Marketing" reiter="marketing">
      <UnterlagenGrid
        slots={slots}
        demo={demo}
        praesentationBasis="/admin/neu/marketing/unterlagen/praesentation"
        funktionen={{
          web: "page--web-praesentation-je-zielgruppe-oeffnen-und-als",
          datei: "route-get--datei-pptx-pdf-herunterladen route-post--datei-hochladen-bzw-ersetzen route-delete--datei-entfernen",
          demo: "unterlagen-grid--live-demo-der-beratungspraesentation",
        }}
      />
    </Seite>
  );
}
