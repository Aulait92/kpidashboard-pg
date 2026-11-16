import { Skeleton } from "@/components/ui";

// Ladezustand für alle Admin-Seiten: Ein Tipp im Menü zeigt sofort den Seitenrahmen,
// statt die alte Seite stehen zu lassen, bis die Daten da sind (am Handy wirkte das wie „hängt“).
export default function AdminLoading() {
  return (
    <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6 lg:px-8" aria-busy="true" aria-label="Lädt">
      <Skeleton className="mb-2 h-8 w-48" />
      <Skeleton className="mb-6 h-4 w-64 max-w-full" />
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    </main>
  );
}
