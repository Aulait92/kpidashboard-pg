import { redirect } from "next/navigation";
import { Trophy } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { ButtonLink, EmptyState } from "@/components/ui";
import { AbschlussBlattKarte } from "@/components/abschluss-blatt";
import { getBuyerContext } from "@/lib/buyer-context";
import { ladeBlatt } from "@/lib/abschluss-server";
import { leadScope } from "@/lib/team";

export const dynamic = "force-dynamic";
export const metadata = { title: "Abschluss | performancegrowth" };

// Entscheidungsblatt „Hat Frau Becker abgeschlossen?“ (P4, Ole 17.11.2026): Ziel des Vorabend-Pushes und der Meldung
// aus dem Chat (Pushes haben keine Knöpfe, deshalb Deep-Link). Gleicher Aufbau wie das Blatt „Ist Frau Becker da?“
// (/buyer/termine/<id>): eine Frage, eine Hauptaktion je Kontakt. Mehrere Kontakte aus einem Push stehen untereinander.
export default async function AbschlussPage({ searchParams }: { searchParams: Promise<{ l?: string }> }) {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  const { l } = await searchParams;
  const ids = (l ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const eintraege = await ladeBlatt(ids, leadScope(ctx));
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6 sm:px-6">
      <PageHeader title={eintraege.length > 1 ? "Abgeschlossen?" : (eintraege[0]?.label ?? "Abschluss")} back="/buyer" />
      {eintraege.length ? (
        <div className="space-y-4">
          {eintraege.map((e) => (
            <AbschlussBlattKarte key={e.leadId} eintrag={e} mehrere={eintraege.length > 1} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Trophy}
          title="Nichts mehr offen"
          text="Diese Frage ist schon beantwortet."
          action={
            <ButtonLink href="/buyer" variant="primary">
              Zu Heute
            </ButtonLink>
          }
        />
      )}
    </main>
  );
}
