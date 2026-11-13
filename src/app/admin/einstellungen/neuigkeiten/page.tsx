import Link from "next/link";
import { connection } from "next/server";
import { requireAuth } from "@/lib/vertrieb/auth";
import { listAllUpdates } from "@/lib/neuigkeiten";
import { NeuigkeitenAdmin } from "./form";

export const metadata = { title: "Neuigkeiten | performancegrowth Admin" };

// Neuigkeiten für den Kundenbereich: anlegen, als Entwurf speichern, veröffentlichen.
export default async function NeuigkeitenEinstellungenPage() {
  await connection();
  await requireAuth();
  const items = await listAllUpdates();
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-5 px-4 py-8 sm:px-6">
      <div>
        <Link href="/admin/einstellungen" className="text-xs text-[color:var(--brand)] hover:underline">← Einstellungen</Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Neuigkeiten</h1>
        <p className="text-sm text-[color:var(--muted)]">
          Kunden sehen veröffentlichte Einträge unter Profil → Neuigkeiten (mit Hinweis auf Ungelesenes) und einmal als Karte in „Heute“. Entwürfe sind
          unsichtbar. „Nur Betreuung + Software“ sehen Kunden mit Nur Betreuung nicht.
        </p>
      </div>
      <NeuigkeitenAdmin items={items} />
    </main>
  );
}
