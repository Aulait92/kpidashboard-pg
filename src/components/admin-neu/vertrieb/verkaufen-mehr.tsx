"use client";

import { useRouter } from "next/navigation";
import { Calculator, FileText, Gift, Megaphone, MoreHorizontal, ShieldAlert, Upload } from "lucide-react";
import { ActionMenu } from "@/components/ui/menu";

// „Mehr“ im Kopf aller Verkaufen-Seiten (Admin-Umbau 19.11.2026): Marketing ist kein eigener Reiter mehr, sondern
// liegt mit Seltenem (Import, Datenschutz, Rechner einrichten) hier. Die Leiste bleibt bei vier Reitern.

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
          { label: "Kontakte importieren", icon: Upload, onSelect: geh("/admin/neu/einstellungen/anbindungen") },
          { label: "Webseite & Rechner", icon: Calculator, onSelect: geh(`${M}/webseite`) },
        ]}
      />
    </span>
  );
}
