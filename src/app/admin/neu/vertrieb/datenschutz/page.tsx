import { connection } from "next/server";
import { Seite } from "@/components/admin-neu/ui/seite";
import { KONTAKTE, kontaktPfad } from "@/components/admin-neu/vertrieb/listen";
import { DatenschutzListe } from "@/components/vertrieb/datenschutz-liste";
import { requireAuth } from "@/lib/vertrieb/auth";
import { rechtsFaelle } from "@/lib/vertrieb/datenschutz-recht-server";

export const metadata = { title: "Datenschutz und Recht | performancegrowth Admin" };

// Verkaufen → Kontakte → Datenschutz und Recht (Ole, 19.11.2026): Nachweisprotokoll je Fall aus der Kaltakquise
// (Auskunft, Löschung, Widerspruch, Abmahnung). Offene Fälle oben, Zeile öffnet die Kontaktakte mit den Vorlagen.
export default async function DatenschutzPage() {
  await connection();
  await requireAuth();
  const faelle = await rechtsFaelle();
  return (
    <Seite titel="Datenschutz und Recht" untertitel="Nachweis je Fall. Antworten in der Kontaktakte prüfen und senden." zurueck={{ href: KONTAKTE, label: "Kontakte" }}>
      <div data-funktion="datenschutz-liste--datenschutz-und-recht-faelle-mit-frist-und-nachweis">
        <DatenschutzListe faelle={faelle} kontaktHref={(id) => `${kontaktPfad(id)}#datenschutz`} />
      </div>
    </Seite>
  );
}
