import { connection } from "next/server";
import { NeuigkeitenAdmin } from "@/app/admin/einstellungen/neuigkeiten/form";
import { ModuleCandidatesCard } from "@/app/admin/nutzung/module-card";
import { EinstellungSeite } from "@/components/admin-neu/einstellungen/rahmen";
import { listAllUpdates } from "@/lib/neuigkeiten";
import { requireAuth } from "@/lib/vertrieb/auth";

export const metadata = { title: "Neuigkeiten | performancegrowth Admin" };

const BASIS = "/admin/neu/einstellungen/neuigkeiten";

// Neuigkeiten für den Kundenbereich (Demo „e-neuigkeiten“, heute /admin/einstellungen/neuigkeiten): Liste, neu anlegen,
// bearbeiten, KI-Entwurf, löschen, Vorschau (alles im bestehenden Baustein NeuigkeitenAdmin). Dazu, eingeklappt, die
// einmalige Ankündigung des Zusatzmoduls an Kandidaten (heute /admin/nutzung), mit Rücksprung hierher.
export default async function Page({ searchParams }: { searchParams: Promise<{ ankuendigung?: string }> }) {
  await connection();
  await requireAuth();
  const { ankuendigung } = await searchParams;
  const items = await listAllUpdates();
  return (
    <EinstellungSeite pfad={BASIS} breit>
      <div
        data-funktion="actions-saveupdateaction--neuigkeiten-liste-neu-anlegen actions-saveupdateaction--eintrag-bearbeiten-art-zielgruppe-push-an-kunden actions-draftupdateaction--ki-entwurf-aus-notizen actions-deleteupdateaction--eintrag-loeschen form--vorschau-im-kundenbereich"
      >
        <NeuigkeitenAdmin items={items} />
      </div>
      <details
        id="zusatzmodule"
        open={!!ankuendigung}
        className="scroll-mt-20 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] shadow-[var(--shadow-md)]"
        data-funktion="module-actions-sendannouncementaction--ankuendigung-des-zusatzmoduls-an-kunden-senden"
      >
        <summary className="flex min-h-12 cursor-pointer items-center px-5 text-[15px] font-semibold">Ankündigung an Modul-Kandidaten</summary>
        <div className="border-t border-[color:var(--border)] p-3 sm:p-4 [&>section]:mb-0 [&>section]:shadow-none">
          <ModuleCandidatesCard message={ankuendigung ?? null} zurueck={BASIS} />
        </div>
      </details>
    </EinstellungSeite>
  );
}
