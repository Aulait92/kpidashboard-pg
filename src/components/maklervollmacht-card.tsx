// Karte „Maklervollmacht“ in der Kundenakte (Ole, 18.11.2026; nur Makler, docs/rechtstexte/maklervollmacht-2026-11-18.md).
// Je Zustand eine Hauptaktion: per WhatsApp senden (Chat da) bzw. per E-Mail/Link → warten (Stand, Erinnerung) →
// Schreiben an die Versicherer herunterladen. Details: components/maklervollmacht-aktionen.tsx.

import { FileSignature } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";
import { istMakler, vollmachtFuerLead } from "@/lib/maklervollmacht/server";
import { erinnerungGeplantAm } from "@/lib/maklervollmacht/regeln";
import { prisma } from "@/lib/prisma";
import { MaklervollmachtAktionen } from "@/components/maklervollmacht-aktionen";

const fmt = (d: Date | null) => (d ? new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(d) : "");
const kurz = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit" }).format(d);

/** „Erinnerung geplant am 20.11.“, „Erinnerung gesendet am 20.11.“, gestoppt: „keine Erinnerung“ */
export function erinnerungZeile(v: { status: string; waSentAt: Date | null; erinnerungAt: Date | null; erinnerungStatus: string | null }): string | null {
  if (!v.waSentAt) return null;
  if (v.erinnerungAt) return v.erinnerungStatus === "gesendet" ? `Erinnerung gesendet am ${kurz(v.erinnerungAt)}` : "keine Erinnerung (Ihr Kunde möchte keine WhatsApp)";
  const geplant = erinnerungGeplantAm(v);
  return geplant ? `Erinnerung geplant am ${kurz(geplant)}` : null;
}

export async function MaklervollmachtCard({ leadId, customerId, readOnly }: { leadId: string; customerId: string; readOnly: boolean }) {
  if (!(await istMakler(customerId))) return null;
  const [v, lead] = await Promise.all([vollmachtFuerLead(leadId, customerId), prisma.lead.findUnique({ where: { id: leadId }, select: { email: true, status: true } })]);
  // Nur, wenn es passt: Kontakt erreicht (Gespräch, Termin, Angebot, Abschluss) oder schon eine Vollmacht da (UX: keine Karte bei jedem neuen Lead)
  const status = (lead?.status ?? "").toLowerCase();
  const passt = !/^(neu|neuer lead|nicht erreicht|kein interesse|disqualifiziert|storno|verloren)/.test(status);
  if (!v && !passt) return null;
  // WhatsApp nur, wenn der Kontakt einen Chat hat und noch nicht unterschrieben ist
  const wa =
    v?.status === "unterschrieben" || v?.status === "eigene"
      ? { chat: false, moeglich: false, grund: null }
      : await import("@/lib/maklervollmacht/whatsapp").then((m) => m.whatsAppStand(leadId, customerId)).catch(() => ({ chat: false, moeglich: false, grund: null }));
  return (
    <Card className="mb-6">
      <CardHeader title="Maklervollmacht" icon={FileSignature} />
      <div className="px-5 py-4" data-maklervollmacht>
        <MaklervollmachtAktionen
          leadId={leadId}
          readOnly={readOnly}
          hatEmail={!!lead?.email}
          wa={{ chat: wa.chat, moeglich: wa.moeglich, grund: wa.grund }}
          v={
            v
              ? {
                  id: v.id,
                  status: v.status,
                  link: v.link,
                  abgelaufen: v.abgelaufen,
                  gesendet: !!v.sentAt,
                  unterschrieben: fmt(v.signedAt),
                  kopie: v.kopieStatus,
                  stand: v.stand,
                  waGesendet: v.waSentAt ? kurz(v.waSentAt) : null,
                  erinnerung: erinnerungZeile(v),
                }
              : null
          }
        />
      </div>
    </Card>
  );
}
