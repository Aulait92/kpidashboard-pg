import Link from "next/link";
import { notFound } from "next/navigation";
import { Eye } from "lucide-react";
import { Badge, buttonClass } from "@/components/ui";
import { Seite } from "@/components/admin-neu/ui/seite";
import { TestkundeLoeschen } from "@/components/admin/testkunde-loeschen";
import { startPreviewAction } from "@/app/buyer/preview-actions";
import { packageLabel } from "@/lib/customer-package";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/vertrieb/auth";
import { fmtDayShort, teamAbsences } from "@/lib/absence";
import { memberName } from "@/lib/team";
import { wonReferralCount } from "@/lib/kollegen";
import { StatusWahl } from "./status-wahl";

export const kurzName = (name: string) => name.replace(/^Allianz\s+/i, "");

// Kopf der Kundenakte im neuen Admin (alle 7 Reiter): Name, Status zum Ändern, Abzeichen (Paket, Onboarding,
// WhatsApp, Zahlung offen, ruht/gekündigt/gelöscht, pausiert, geworben), Abwesenheiten im Team, „Als Kunde ansehen“
// und die Reiter aus navigation.ts. Gleiche Daten wie der Kopf der alten Akte (app/admin/kunden/[id]/layout.tsx).
// Keine eigene layout.tsx: „Kampagne mit KI“ liegt unter derselben Adresse, gehört aber nicht zu den Reitern.
export async function KundenakteSeite({ id, children }: { id: string; children: React.ReactNode }) {
  await requireAuth();
  const c = await prisma.customer.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      isTest: true,
      plan: true,
      retainerMonthly: true,
      paymentOverdueSince: true,
      cancelEffectiveAt: true,
      dormantSince: true,
      dataDeletedAt: true,
      salesContact: { select: { id: true, customerStage: true } },
      pauses: { where: { status: "active" }, select: { id: true }, take: 1 },
      onboarding: { select: { id: true, liveAt: true } },
      agentConfig: { select: { active: true } },
      whatsAppAccount: { select: { status: true, phoneNumber: true } },
      _count: { select: { users: { where: { role: "BUYER" } } } },
    },
  });
  if (!c) notFound();
  const [absences, referred] = await Promise.all([teamAbsences(c.id), wonReferralCount(c.id).catch(() => 0)]);
  const absentUsers = absences.size
    ? await prisma.user.findMany({ where: { id: { in: [...absences.keys()] } }, select: { id: true, email: true, displayName: true } })
    : [];
  const stage = c.salesContact?.customerStage ?? null;

  const zeile = (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5" data-funktion="layout--kopf-mit-stufe-onboarding-whatsapp-an-aus">
        {stage && c.salesContact ? (
          <span data-funktion="actions-movecustomer--kunde-eine-stufe-vor-oder-zurueck actions-dragcustomer--kunden-pipeline-vertrag-onboarding-test-aktiv">
            <StatusWahl contactId={c.salesContact.id} stage={stage} />
          </span>
        ) : null}
        <Badge>{packageLabel(c)}</Badge>
        {c.isTest ? (
          <span data-funktion="test-actions-deletetestcustomeraction--testkunde-komplett-loeschen">
            <TestkundeLoeschen customerId={c.id} name={c.name} whatsapp={c.whatsAppAccount?.phoneNumber ?? null} zurueck="/admin/neu/kunden" />
          </span>
        ) : null}
        {c.onboarding && !c.onboarding.liveAt ? <Badge tone="brand">Onboarding</Badge> : null}
        {c.plan !== "service" ? (
          c.agentConfig?.active && c.whatsAppAccount?.status === "connected" ? <Badge tone="success">WhatsApp aktiv</Badge> : <Badge>WhatsApp aus</Badge>
        ) : null}
        {c.paymentOverdueSince ? <Badge tone="danger">Zahlung offen</Badge> : null}
        {c.dataDeletedAt ? <Badge tone="danger">Daten gelöscht</Badge> : c.dormantSince ? <Badge tone="warning">ruht</Badge> : c.cancelEffectiveAt ? <Badge tone="warning">gekündigt</Badge> : null}
        {c.pauses.length ? <Badge tone="warning">pausiert</Badge> : null}
        {referred ? (
          <Link href="/admin/marketing/empfehlungen" title="Über „Kollegen empfehlen“" data-funktion="layout-referred--hinweis-hat-x-kunden-geworben-link-empfehlungen">
            <Badge tone="success">hat {referred} Kunden geworben</Badge>
          </Link>
        ) : null}
      </div>
      {absentUsers.length ? (
        <p className="text-sm text-[color:var(--muted)]" data-funktion="layout-absentusers--abwesenheiten-der-berater-mit-vertretung">
          {absentUsers
            .map((u) => {
              const a = absences.get(u.id)!;
              const who = c._count.users > 1 ? `${memberName(u)} ` : "";
              const when = a.active ? `bis ${fmtDayShort(a.to)}` : `${fmtDayShort(a.from)} bis ${fmtDayShort(a.to)}`;
              return `${who}abwesend ${when}${a.substituteName ? ` (Vertretung ${a.substituteName})` : ""}`;
            })
            .join(" · ")}
        </p>
      ) : null}
    </div>
  );

  return (
    // Reiter der Kundenakte: Leiste aus navigation.ts (Gruppe „kundenakte“), gerendert von <Seite>
    <div className="contents" data-funktion="layout-subtabs--reiter-der-kundenakte">
    <Seite
      titel={kurzName(c.name)}
      zurueck={{ href: "/admin/neu/kunden", label: "Kunden" }}
      reiter="kundenakte"
      params={{ id: c.id }}
      zeile={zeile}
      aktionen={
        <form action={startPreviewAction} data-funktion="preview-actions-startpreviewaction--als-kunde-ansehen-nur-lesend">
          <input type="hidden" name="customerId" value={c.id} />
          <button type="submit" className={buttonClass("secondary", "md")} title="Kundenbereich nur lesend ansehen">
            <Eye className="h-4 w-4" />
            <span className="hidden sm:inline">Als Kunde ansehen</span>
          </button>
        </form>
      }
    >
      {children}
    </Seite>
    </div>
  );
}
