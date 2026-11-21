import WhatsAppSettingsPage from "@/app/admin/whatsapp/settings/einstellungen-ansicht";
import { WhatsAppFeesCard } from "@/components/whatsapp-fees-card";
import { Card, CardHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Aufklapp } from "@/components/admin-neu/kunden/aufklapp";
import { AvailabilityCard } from "./availability-card";
import { D360Assign } from "./d360-assign";
import { freePartnerChannels } from "@/lib/whatsapp/dialog360-match";
import { selfConnectEnabled } from "@/lib/whatsapp/dialog360-partner";

// Reiter „WhatsApp-Assistent“: die WhatsApp-Einstellungen nur für diesen Kunden
// und die Meta-Gebühren (im Preis enthalten, intern erfasst).
export default async function KundenWhatsApp({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ wa?: string }> }) {
  const { id } = await params;
  const { wa } = await searchParams;
  // SUS-Prüfung 20.11.2026: Oben das Tägliche (Nummer, Assistent, Kalender, Vorlagen). Verbindung, Verfügbarkeit,
  // Gebühren und Bestandskunden sind seltener und stehen zugeklappt darunter (vorher rund 4.000 px am Handy).
  const acc = await prisma.whatsAppAccount.findUnique({ where: { customerId: id }, select: { status: true, apiKeyEnc: true } });
  return (
    <div className="space-y-5">
      <WhatsAppSettingsPage searchParams={Promise.resolve({ kunde: id, wa })} />
      <div className="max-w-5xl space-y-3">
        <Aufklapp titel="Verfügbarkeit für Termine" zusammenfassung="Termindauer, buchbare Zeiten, blockierte Zeiten">
          <AvailabilityCard customerId={id} />
        </Aufklapp>
        <Aufklapp titel="Verbindung zu 360dialog" zusammenfassung={verbindungStand(acc)} offen={!!acc && acc.status !== "connected" && acc.status !== "invited" && acc.status !== "pending"}>
          <D360Card customerId={id} />
        </Aufklapp>
        <Aufklapp titel="Meta-Gebühren und Bestandskunden" zusammenfassung="Kosten der Vorlagen-Nachrichten, Zusatzmodul Bestandskunden">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <WhatsAppFeesCard customerId={id} admin />
            <BestandModuleCard customerId={id} />
          </div>
        </Aufklapp>
      </div>
    </div>
  );
}

function verbindungStand(acc: { status: string; apiKeyEnc: string | null } | null): string {
  if (!acc) return "Nicht verbunden";
  if (acc.status === "connected") return acc.apiKeyEnc ? "Verbunden" : "Verbunden, API-Key fehlt";
  return acc.status === "invited" ? "Einladung von 360dialog verschickt" : acc.status === "pending" ? "Nummer wird eingerichtet" : acc.status === "error" ? "Fehler beim Verbinden" : "Nicht verbunden";
}

async function BestandModuleCard({ customerId }: { customerId: string }) {
  const [c, count, campaigns] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId }, select: { existingCustomersEnabled: true, bestandMonthly: true, bestandGrandfathered: true } }),
    prisma.existingCustomer.count({ where: { customerId } }),
    prisma.customerCampaign.count({ where: { customerId } }),
  ]);
  const on = !!c?.existingCustomersEnabled;
  const status = !on ? "Nicht gebucht" : c?.bestandMonthly != null ? "Gebucht" : c?.bestandGrandfathered ? "Frei (Bestandsschutz)" : "Freigeschaltet";
  return (
    <Card>
      <CardHeader title="Bestandskunden-Kampagnen" />
      <div className="space-y-3 px-5 pb-5 text-sm">
        <p className="text-[color:var(--muted)]">
          Zusatzmodul: Kunde lädt seinen Bestand hoch und spricht ihn per WhatsApp an (Lücken, Jahresgespräch, Geburtstag, Ablauf). Vorlagen
          „Bestandskunden: …“ oben einreichen.
        </p>
        <p>
          {status} · {count.toLocaleString("de-DE")} Bestandskunden · {campaigns} Kampagnen
        </p>
        <Link href={`/admin/neu/kunden/${customerId}/abrechnung`} className="text-sm font-medium text-[color:var(--brand)] hover:underline">
          Buchen, freischalten und Kontingent unter „Abrechnung“ →
        </Link>
      </div>
    </Card>
  );
}

/**
 * WhatsApp-Verbindung (Admin v2 A5, Ole 18.11.2026): Stand und eine Hauptaktion „Verbindung reparieren“ (auch bei
 * verbundenen Kunden, z. B. wenn keine Nachrichten mehr ankommen). Ohne Verbindung zusätzlich zurücksetzen und freie
 * 360dialog-Nummern von Hand zuordnen (lib/whatsapp/dialog360-match.ts).
 */
async function D360Card({ customerId }: { customerId: string }) {
  const acc = await prisma.whatsAppAccount.findUnique({ where: { customerId }, select: { status: true, apiKeyEnc: true, phoneNumber: true } });
  if (!selfConnectEnabled() && !acc) return null;
  const verbunden = acc?.status === "connected" && !!acc.apiKeyEnc;
  const free = verbunden ? [] : await freePartnerChannels().catch(() => []);
  const stand = verbunden
    ? `Verbunden${acc?.phoneNumber ? `: +${acc.phoneNumber.replace(/^\+/, "")}` : ""}`
    : acc?.status === "invited"
      ? "Einladung von 360dialog verschickt"
      : acc?.status === "pending"
        ? "Nummer wird eingerichtet"
        : acc?.status === "error"
          ? "Fehler beim Verbinden"
          : acc?.status === "connected"
            ? "Verbunden, API-Key fehlt"
            : "Nicht verbunden";
  return (
    <Card className="max-w-5xl">
      <CardHeader title="WhatsApp-Verbindung" />
      <div className="px-5 pb-5 pt-4">
        <p className={`mb-3 text-sm font-medium ${verbunden ? "text-emerald-700" : "text-amber-800"}`} data-verbindung-stand>
          {stand}
        </p>
        <D360Assign
          customerId={customerId}
          verbunden={verbunden}
          resettable={acc && !verbunden ? (acc.status === "invited" ? "Einladung von 360dialog verschickt" : acc.status === "pending" ? "Nummer wird eingerichtet" : acc.status) : null}
          free={free.slice(0, 20).map((c) => ({ id: c.id, phone: c.phone, name: c.name, clientName: c.clientName, availability: c.availability, createdAt: c.createdAt }))}
        />
      </div>
    </Card>
  );
}
