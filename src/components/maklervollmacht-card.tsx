// Karte „Maklervollmacht“ in der Kundenakte (Ole, 18.11.2026; nur Makler, docs/rechtstexte/maklervollmacht-2026-11-18.md).
// Je Zustand eine Hauptaktion: anfordern → Link teilen → Schreiben an die Versicherer herunterladen. Danach je Versicherer
// der Stand der Bestandsübertragung mit „Bestätigt“ / „Abgelehnt“ (lib/maklervollmacht/uebertragung.ts).

import { FileSignature } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";
import { istMakler, vollmachtFuerLead } from "@/lib/maklervollmacht/server";
import { prisma } from "@/lib/prisma";
import { MaklervollmachtAktionen } from "@/components/maklervollmacht-aktionen";
import { uebertragungenFuerVollmacht } from "@/lib/maklervollmacht/uebertragung";

export async function MaklervollmachtCard({
  leadId,
  customerId,
  readOnly,
  knoepfeInWiedervorlage = null,
}: {
  leadId: string;
  customerId: string;
  readOnly: boolean;
  /** Versicherer, dessen „Bestätigt“ / „Abgelehnt“ schon in der Wiedervorlage oben steht (nicht doppelt zeigen) */
  knoepfeInWiedervorlage?: string | null;
}) {
  if (!(await istMakler(customerId))) return null;
  const [v, lead] = await Promise.all([vollmachtFuerLead(leadId, customerId), prisma.lead.findUnique({ where: { id: leadId }, select: { email: true, status: true } })]);
  // Nur, wenn es passt: Kontakt erreicht (Gespräch, Termin, Angebot, Abschluss) oder schon eine Vollmacht da (UX: keine Karte bei jedem neuen Lead)
  const status = (lead?.status ?? "").toLowerCase();
  const passt = !/^(neu|neuer lead|nicht erreicht|kein interesse|disqualifiziert|storno|verloren)/.test(status);
  if (!v && !passt) return null;
  // Bestandsübertragung je Versicherer (läuft, bestätigt, abgelehnt) mit Ein-Klick-Bestätigung
  const uebertragung = v?.status === "unterschrieben" ? await uebertragungenFuerVollmacht(v.id, customerId).catch(() => []) : [];
  const fmt = (d: Date | null) => (d ? new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(d) : "");
  return (
    <Card className="mb-6">
      <CardHeader title="Maklervollmacht" icon={FileSignature} />
      <div className="px-5 py-4" data-maklervollmacht>
        <MaklervollmachtAktionen
          leadId={leadId}
          readOnly={readOnly}
          hatEmail={!!lead?.email}
          v={
            v
              ? {
                  id: v.id,
                  status: v.status,
                  link: v.link,
                  abgelaufen: v.abgelaufen,
                  gesendet: !!v.sentAt,
                  unterschrieben: fmt(v.signedAt),
                  vertraege: v.vertraege.length,
                  versicherer: v.versicherer,
                  uebertragung: uebertragung.map((g) => ({
                    versicherer: g.versicherer,
                    stand: g.stand,
                    beitragFragen: g.beitragFragen,
                    knoepfe: g.versicherer.toLowerCase() !== (knoepfeInWiedervorlage ?? "").toLowerCase(),
                  })),
                }
              : null
          }
        />
      </div>
    </Card>
  );
}
