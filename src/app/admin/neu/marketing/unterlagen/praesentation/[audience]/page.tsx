import { Platzhalter } from "@/components/admin-neu/ui/platzhalter";

export const metadata = { title: "Präsentation | performancegrowth Admin" };

// Platzhalter (wird gerade gebaut). Ersetzen durch die echte Seite: docs/ux/admin-neu/README.md
export default async function Page({ params }: { params: Promise<{ audience: string }> }) {
  return <Platzhalter pfad="/admin/neu/marketing/unterlagen/praesentation/[audience]" params={await params} />;
}
