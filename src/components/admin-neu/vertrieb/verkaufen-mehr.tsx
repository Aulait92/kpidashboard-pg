"use client";

import { useRouter } from "next/navigation";
import { Calculator, FileText, Gift, Megaphone, MoreHorizontal, ShieldAlert } from "lucide-react";
import { ActionMenu } from "@/components/ui/menu";

// „Mehr“ im Kopf aller Verkaufen-Seiten (Admin-Umbau 19.11.2026): Marketing ist kein eigener Reiter mehr, sondern
// liegt mit Seltenem (Datenschutz, Rechner einrichten) hier. Die Leiste bleibt bei vier Reitern. Steht auf allen vier
// Reitern (Pipeline, Kontakte, Termine, Angebote), damit es überall an derselben Stelle ist. Kein „Kontakte importieren“
// mehr: der Import aus dem alten Cold-CRM ist entfernt (ENTFERNT F135/F136), neue Kontakte kommen per Formular oder Meta.

const M = "/admin/neu/marketing";

export function VerkaufenMehr({ datenschutzOffen = 0 }: { datenschutzOffen?: number }) {
  const router = useRouter();
  const geh = (href: string) => () => router.push(href);
  return (
    <span data-verkaufen-mehr>
      <ActionMenu
        label="Mehr"
        icon={MoreHorizontal}
        labelClassName="sr-only sm:not-sr-only"
        chevronClassName="hidden sm:block"
        className="[&>button]:min-h-10"
        items={[
          { type: "label", label: "Marketing" },
          { label: "LinkedIn", icon: Megaphone, onSelect: geh(M) },
          { label: "Empfehlungen", icon: Gift, onSelect: geh(`${M}/empfehlungen`) },
          { label: "Unterlagen", icon: FileText, onSelect: geh(`${M}/unterlagen`) },
          { type: "label", label: "Selten" },
          {
            label: "Datenschutz und Recht",
            hint: datenschutzOffen ? `${datenschutzOffen} offen` : undefined,
            icon: ShieldAlert,
            onSelect: geh("/admin/neu/vertrieb/datenschutz"),
          },
          { label: "Webseite & Rechner", icon: Calculator, onSelect: geh(`${M}/webseite`) },
        ]}
      />
    </span>
  );
}
