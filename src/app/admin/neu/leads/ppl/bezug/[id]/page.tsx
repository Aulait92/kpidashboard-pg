import { Platzhalter } from "@/components/admin-neu/ui/platzhalter";

export const metadata = { title: "Bezug | performancegrowth Admin" };

// Platzhalter (wird gerade gebaut). Ersetzen durch die echte Seite: docs/ux/admin-neu/README.md
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <Platzhalter pfad="/admin/neu/leads/ppl/bezug/[id]" params={await params} />;
}
