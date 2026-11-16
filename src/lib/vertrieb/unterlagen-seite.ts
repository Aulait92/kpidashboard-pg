import { AUDIENCES, FORMATS, listPresentations } from "@/lib/vertrieb/praesentationen";
import { getAppUrl } from "@/lib/email";
import { publicBookingOrigin } from "@/lib/public-url";
import { DEMO_PATH } from "@/lib/public-booking-host";
import type { UnterlagenSlot } from "@/app/admin/marketing/unterlagen/unterlagen-grid";

// Daten der Seite „Unterlagen“ (gemeinsam für /admin/marketing/unterlagen und /admin/neu/marketing/unterlagen):
// je Zielgruppe und Format die hinterlegte Datei, dazu die Adressen der öffentlichen Live-Demo.
export async function ladeUnterlagen() {
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
  return { slots, demo };
}
