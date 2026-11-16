import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

// Einheitlicher Zurück-Link im Admin, gleich wie im Kundenbereich (ZurueckLink): blau, Pfeil, 44 px hoch.
// Vorher gab es rund 30 Varianten („← Einstellungen“ klein/grau/blau, „← Zurück“, „← zum Dashboard“).
export const ADMIN_BACK_CLASS = "-ml-1 mb-1 inline-flex min-h-11 items-center gap-1.5 px-1 text-sm font-medium text-[color:var(--brand)] hover:underline";

/** „← Einstellungen“ oben links auf Unterseiten. `children` = Ziel, z. B. „Einstellungen“. */
export function AdminBack({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn(ADMIN_BACK_CLASS, className)} data-zurueck>
      <ArrowLeft className="h-4 w-4 shrink-0" />
      {children}
    </Link>
  );
}
