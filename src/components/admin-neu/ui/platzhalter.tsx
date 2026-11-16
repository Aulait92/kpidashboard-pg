import { notFound } from "next/navigation";
import { ArrowRight, Hammer } from "lucide-react";
import { ButtonLink, Card, EmptyState } from "@/components/ui";
import { BEREICHE, altePfad, seiteFuer } from "@/lib/admin-neu/navigation";
import { Seite } from "./seite";

// Platzhalter für noch nicht gebaute Seiten des neuen Admins: Titel, „Wird gerade gebaut“ und der Weg zur
// heutigen Seite. Die Bereichs-Agenten ersetzen die page.tsx durch die echte Seite (README: docs/ux/admin-neu).

export function Platzhalter({ pfad, params = {} }: { pfad: string; params?: Record<string, string> }) {
  const seite = seiteFuer(pfad.replace(/\[([a-z]+)\]/gi, (_, k: string) => params[k] ?? "x"));
  if (!seite) notFound();
  const bereich = BEREICHE.find((b) => b.id === seite.bereich);
  const alt = altePfad(seite, params);
  const reiter = seite.reiter?.gruppe;
  // Reiter eines Bereichs: Kopf = Bereich (wie in der Demo); Akten und Unterseiten: eigener Titel mit „Zurück“
  const bereichsReiter = !!reiter && reiter !== "kundenakte";
  return (
    <Seite
      titel={bereichsReiter ? (bereich?.label ?? seite.titel) : seite.titel}
      reiter={reiter}
      params={params}
      zurueck={!bereichsReiter && bereich && bereich.pfad !== seite.pfad ? { href: bereich.pfad, label: bereich.label } : undefined}
    >
      <Card>
        <div data-platzhalter={seite.view}>
          <EmptyState
            icon={Hammer}
            title={`${seite.titel}: wird gerade gebaut`}
            text={alt ? "So lange erledigen Sie alles auf der heutigen Seite." : "Diese Seite kommt neu dazu."}
            action={
              alt ? (
                <ButtonLink href={alt} variant="primary" size="md" icon={ArrowRight}>
                  Heutige Seite öffnen
                </ButtonLink>
              ) : null
            }
          />
        </div>
      </Card>
    </Seite>
  );
}
