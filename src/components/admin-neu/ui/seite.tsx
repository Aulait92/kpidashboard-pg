import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { BackToList } from "@/components/admin/list-memory";
import { SubTabs } from "@/components/admin/sub-tabs";
import { reiterFuer, type ReiterGruppe } from "@/lib/admin-neu/navigation";
import { cn } from "@/lib/utils";

// Seitengerüst des neuen Admins: Breite, Abstände, Kopf (Titel, ein Satz, Aktionen rechts), optional „Zurück“
// und die Reiter-Leiste aus navigation.ts. Jede Seite unter /admin/neu nutzt es, damit alles gleich aussieht.

const ZURUECK = "-ml-1 mb-1 inline-flex min-h-10 items-center gap-1 text-sm text-[color:var(--muted)] hover:text-[color:var(--foreground)]";

export function Seite({
  titel,
  untertitel,
  aktionen,
  zurueck,
  reiter,
  params,
  breit,
  children,
}: {
  titel: React.ReactNode;
  /** Höchstens ein Satz (UX-Regel). Am Handy ausgeblendet. */
  untertitel?: React.ReactNode;
  /** Rechts im Kopf, höchstens ein primärer Knopf. */
  aktionen?: React.ReactNode;
  /** „Zurück“ über dem Titel (Detailseiten), z. B. { href: "/admin/neu/vertrieb/kontakte", label: "Kontakte" }.
   *  `merken`: führt zur zuletzt gefilterten Liste (RememberList mit derselben id in der Liste). */
  zurueck?: { href: string; label: string; merken?: { id: string; listen: string[] } };
  /** Reiter-Leiste aus navigation.ts (Bereich oder „kundenakte“) */
  reiter?: ReiterGruppe;
  /** Werte für [id] usw. in den Reitern */
  params?: Record<string, string>;
  /** Volle Breite (Tabellen, Board), sonst max. 1240 px wie in der Demo */
  breit?: boolean;
  children: React.ReactNode;
}) {
  return (
    <main className={cn("mx-auto w-full flex-1 px-4 pb-10 pt-5 sm:px-6 lg:px-8 lg:pt-6", breit ? "max-w-[1600px]" : "max-w-[1240px]")}>
      {zurueck?.merken ? (
        // Zurück zur gemerkten Liste (Suche, Filter, Seite), components/admin/list-memory.tsx
        <BackToList id={zurueck.merken.id} fallback={zurueck.href} allowed={zurueck.merken.listen} className={ZURUECK}>
          <ChevronLeft className="h-4 w-4" />
          {zurueck.label}
        </BackToList>
      ) : zurueck ? (
        <Link href={zurueck.href} className={ZURUECK}>
          <ChevronLeft className="h-4 w-4" />
          {zurueck.label}
        </Link>
      ) : null}
      <div className="mb-4 flex items-center justify-between gap-3 sm:items-end">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{titel}</h1>
          {untertitel ? <p className="mt-1 hidden text-sm text-[color:var(--muted)] sm:block">{untertitel}</p> : null}
        </div>
        {aktionen ? <div className="flex shrink-0 flex-wrap items-center gap-2">{aktionen}</div> : null}
      </div>
      {reiter ? <SubTabs tabs={reiterFuer(reiter, params)} /> : null}
      {children}
    </main>
  );
}
