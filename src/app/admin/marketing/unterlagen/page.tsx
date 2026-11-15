import { requireAuth } from "@/lib/vertrieb/auth";
import { AUDIENCES, FORMATS, listPresentations } from "@/lib/vertrieb/praesentationen";
import { getAppUrl } from "@/lib/email";
import { publicBookingOrigin } from "@/lib/public-url";
import { DEMO_PATH } from "@/lib/public-booking-host";
import { UnterlagenGrid, type UnterlagenSlot } from "./unterlagen-grid";

export const metadata = { title: "Unterlagen | Vertrieb" };
export const dynamic = "force-dynamic";

// Aktuelle Präsentationen für Makler und Vertreter (PPTX + PDF). Das PDF kann mit der Angebotsmail mitgehen.
export default async function UnterlagenPage() {
  await requireAuth();
  const files = await listPresentations();
  const slots: UnterlagenSlot[] = AUDIENCES.flatMap((audience) =>
    FORMATS.map((format) => {
      const f = files.find((x) => x.audience === audience && x.format === format);
      return { audience, format, file: f ? { fileName: f.fileName, size: f.size, uploadedAt: f.uploadedAt.toISOString() } : null };
    }),
  );
  // Live-Demo der Beratungspräsentation (öffentlich): Buchungsadresse /demo, sonst App-Adresse /demo/beratung
  let app = "https://app.performancegrowth.de";
  try {
    app = getAppUrl().replace(/\/$/, "");
  } catch {}
  const booking = publicBookingOrigin();
  const demo = { haupt: booking ? `${booking}/demo` : `${app}${DEMO_PATH}`, app: `${app}${DEMO_PATH}` };
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
