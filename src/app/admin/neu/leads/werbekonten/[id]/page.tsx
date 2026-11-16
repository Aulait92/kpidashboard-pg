import { Platzhalter } from "@/components/admin-neu/ui/platzhalter";

export const metadata = { title: "Werbekonto | performancegrowth Admin" };

// Platzhalter (wird gerade gebaut). Ersetzen durch die echte Seite: docs/ux/admin-neu/README.md
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <Platzhalter pfad="/admin/neu/leads/werbekonten/[id]" params={await params} />;
}
