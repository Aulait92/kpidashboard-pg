import { connection } from "next/server";
import { DatenschutzListe } from "@/components/vertrieb/datenschutz-liste";
import { rechtsFaelle } from "@/lib/vertrieb/datenschutz-recht-server";

export const metadata = { title: "Datenschutz und Recht | performancegrowth Admin" };

// Datenschutz und Recht (Ole, 19.11.2026): Fälle aus der Kaltakquise (Auskunft, Löschung, Widerspruch, Abmahnung) mit
// Eingang, Frist, Antwort und Löschung. Nachweisprotokoll nur zum Anhängen (lib/vertrieb/datenschutz-recht-server.ts).
export default async function DatenschutzPage() {
  await connection();
  const faelle = await rechtsFaelle();
  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Datenschutz und Recht</h1>
        <p className="text-sm text-slate-500">Nachweis je Fall. Antworten in der Kontaktakte prüfen und senden.</p>
      </div>
      <DatenschutzListe faelle={faelle} kontaktHref={(id) => `/admin/vertrieb/kontakte/${id}#datenschutz`} />
    </div>
  );
}
