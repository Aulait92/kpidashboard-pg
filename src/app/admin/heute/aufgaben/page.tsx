import { AufgabenListe } from "@/components/admin/aufgaben-liste";

export const metadata = { title: "Aufgaben | performancegrowth Admin" };

// Alle Aufgaben (früher Vertrieb → Aufgaben, seit 16.11.2026 Reiter in Heute; alte Adresse leitet hierher weiter).
// Inhalt: components/admin/aufgaben-liste.tsx (auch im neuen Admin unter Vertrieb → Aufgaben).
export default async function AufgabenPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <AufgabenListe basis="/admin/heute/aufgaben" searchParams={await searchParams} />;
}
