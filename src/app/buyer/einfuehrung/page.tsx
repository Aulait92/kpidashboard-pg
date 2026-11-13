import { redirect } from "next/navigation";
import { PageHeader } from "@/components/buyer-shell";
import { Card } from "@/components/ui";
import { IntroVideo } from "@/components/intro-video";
import { VIDEOS } from "@/lib/intro-videos";
import { getBuyerContext } from "@/lib/buyer-context";

export const metadata = { title: "Einführung | performancegrowth" };

// Einführungsvideos jederzeit wieder ansehen (Profilmenü). Inhaber: kurz + ausführlich + WhatsApp verbinden.
// Berater sehen manche Bereiche aus dem ausführlichen Video nicht (Wachstum, Team) → nur das Kurzvideo.
export default async function EinfuehrungPage() {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  const owner = ctx.teamRole !== "advisor";
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title="Einführung" subtitle="Rundgang durch Ihre Software – funktioniert auch ohne Ton." />
      <Card>
        <div className="p-5">
          <h2 className="mb-3 text-[15px] font-semibold">{VIDEOS.kurz.title}</h2>
          <IntroVideo kind="kurz" />
        </div>
      </Card>
      {owner ? (
        <Card>
          <div className="p-5">
            <h2 className="mb-1 text-[15px] font-semibold">{VIDEOS.ausfuehrlich.title}</h2>
            <p className="mb-3 text-sm text-[color:var(--muted)]">Kontakt öffnen, Anrufliste, selbst schreiben, Pipeline, Zahlen, Kalender und Team.</p>
            <IntroVideo kind="ausfuehrlich" />
          </div>
        </Card>
      ) : null}
      {owner ? (
        <Card>
          <div className="p-5">
            <h2 className="mb-1 text-[15px] font-semibold">{VIDEOS.whatsapp.title}</h2>
            <p className="mb-3 text-sm text-[color:var(--muted)]">Ihre WhatsApp-Nummer Schritt für Schritt anbinden – mit Nummer aus der WhatsApp Business App oder einer neuen Nummer.</p>
            <IntroVideo kind="whatsapp" />
          </div>
        </Card>
      ) : null}
    </main>
  );
}
