import Link from "next/link";
import { notFound } from "next/navigation";
import { SubTabs } from "@/components/admin-tabs";
import { BackToList } from "@/components/admin/list-memory";
import { KUNDEN_LISTS } from "@/lib/admin-lists";
import { isAdminNewUi } from "@/lib/admin-ui";
import { Badge } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/vertrieb/auth";
import { CUSTOMER_COLOR, CUSTOMER_LABEL } from "@/lib/vertrieb/crm";

// Kundenakte: alles zu einem Kunden an einem Ort, als Reiter.
export default async function KundenakteLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  await requireAuth();
  const { id } = await params;
  const c = await prisma.customer.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      plan: true,
      paymentOverdueSince: true,
      salesContact: { select: { customerStage: true } },
      pauses: { where: { status: "active" }, select: { id: true }, take: 1 },
      onboarding: { select: { liveAt: true } },
      agentConfig: { select: { active: true } },
      whatsAppAccount: { select: { status: true } },
      _count: { select: { leadSources: true, users: { where: { role: "BUYER" } } } },
    },
  });
  if (!c) notFound();
  const base = `/admin/kunden/${c.id}`;
  const stage = c.salesContact?.customerStage ?? null;
  return (
    <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
      {(await isAdminNewUi()) ? (
        <BackToList id="kunden" fallback="/admin/kunden" allowed={KUNDEN_LISTS} className="text-sm text-[color:var(--muted)] hover:underline">
          ← Zurück
        </BackToList>
      ) : (
        <Link href="/admin/kunden" className="text-sm text-[color:var(--muted)] hover:underline">
          ← Kunden
        </Link>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{c.name.replace(/^Allianz\s+/i, "")}</h1>
        {stage ? <span className={`badge ${CUSTOMER_COLOR[stage]}`}>{CUSTOMER_LABEL[stage]}</span> : <Badge>Leads (Airtable)</Badge>}
        <Badge>{c.plan === "service" ? "Nur Betreuung" : "Betreuung + Software"}</Badge>
        {c.onboarding && !c.onboarding.liveAt ? <Badge tone="brand">Onboarding</Badge> : null}
        {c.plan !== "service" ? (
          c.agentConfig?.active && c.whatsAppAccount?.status === "connected" ? (
            <Badge tone="success">WhatsApp aktiv</Badge>
          ) : (
            <Badge>WhatsApp aus</Badge>
          )
        ) : null}
        {c.paymentOverdueSince ? <Badge tone="danger">Zahlung offen</Badge> : null}
        {c.pauses.length ? <Badge tone="warning">pausiert</Badge> : null}
      </div>
      <div className="mt-4">
        <SubTabs
          tabs={[
            { href: base, label: "Übersicht", exact: true },
            { href: `${base}/leads`, label: "Leads & Formulare" },
            ...(c.plan !== "service" ? [{ href: `${base}/whatsapp`, label: "WhatsApp-Assistent" }] : []),
            { href: `${base}/logins`, label: "Logins & Team" },
            { href: `${base}/abrechnung`, label: "Abrechnung & Pause" },
          ]}
        />
      </div>
      {children}
    </main>
  );
}
