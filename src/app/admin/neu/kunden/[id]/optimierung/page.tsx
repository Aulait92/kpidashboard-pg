import { redirect } from "next/navigation";

export const metadata = { title: "Optimierung | performancegrowth Admin" };

// Kundenakte › Optimierung: seit dem Umbau 20.11.2026 kein eigener Reiter mehr, sondern ein Abschnitt unter Leads
// (geplante Maßnahmen freigeben, Protokoll, Maßnahme eintragen). Alte Links, Push-Ziele und der Rückweg nach dem
// Speichern landen hier und werden zum aufgeklappten Abschnitt weitergeleitet.
export default async function KundeOptimierung({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/neu/kunden/${id}/leads?optimierung=1#optimierung`);
}
