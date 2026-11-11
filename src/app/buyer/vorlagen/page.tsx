import { redirect } from "next/navigation";
import { CheckCircle2, Clock, Info, MessageCircle, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { advisorDisplayName, CUSTOMER_TITLES, exampleValuesFor, previewBodyFor, purposesFor } from "@/lib/whatsapp/template-plan";
import { renderTemplate, TEMPLATE_BUTTONS, type NoticePurpose } from "@/lib/whatsapp/templates";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "WhatsApp-Vorlagen | performancegrowth" };

type Badge = { label: string; hint?: string; cls: string; icon: typeof CheckCircle2 };

function badgeFor(status: string | null, connected: boolean): Badge {
  if (status === "approved") return { label: "Freigegeben", cls: "bg-emerald-50 text-emerald-700", icon: CheckCircle2 };
  if (status === "pending") return { label: "In Prüfung bei Meta", hint: "Meist in wenigen Minuten bis Stunden erledigt.", cls: "bg-amber-50 text-amber-700", icon: Clock };
  if (status === "rejected" || status === "paused")
    return { label: status === "paused" ? "Pausiert" : "Abgelehnt", hint: "Wir kümmern uns darum und reichen den Text angepasst neu ein.", cls: "bg-rose-50 text-rose-700", icon: TriangleAlert };
  return connected
    ? { label: "Wird eingereicht", hint: "Wir reichen die Vorlage in Kürze bei Meta ein.", cls: "bg-slate-100 text-slate-600", icon: Clock }
    : { label: "Noch nicht eingereicht", hint: "Wird automatisch eingereicht, sobald Ihre WhatsApp-Nummer verbunden ist.", cls: "bg-slate-100 text-slate-600", icon: Clock };
}

// Kundenansicht: welche WhatsApp-Vorlagen der Assistent nutzt und ob Meta sie
// freigegeben hat. Nur lesen – Änderungswünsche laufen über uns.
export default async function VorlagenPage() {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  const customer = await prisma.customer.findUnique({
    where: { id: ctx.customerId },
    select: {
      name: true,
      plan: true,
      existingCustomersEnabled: true,
      whatsAppAccount: { select: { status: true } },
      messageTemplates: { select: { purpose: true, status: true, body: true, updatedAt: true }, orderBy: { updatedAt: "desc" } },
    },
  });
  if (!customer) redirect("/buyer");
  const connected = customer.whatsAppAccount?.status === "connected";
  const advisor = advisorDisplayName(customer.name);
  const purposes = purposesFor({ bestand: customer.existingCustomersEnabled });

  const rows = purposes.map((purpose) => {
    const list = customer.messageTemplates.filter((t) => t.purpose === purpose);
    const tpl = list.find((t) => t.status === "approved") ?? list[0] ?? null;
    const text = tpl ? renderTemplate(tpl.body, exampleValuesFor(purpose)) : previewBodyFor(purpose, advisor);
    return { purpose, tpl, text, badge: badgeFor(tpl?.status ?? null, connected), buttons: TEMPLATE_BUTTONS[purpose as NoticePurpose] ?? [] };
  });

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title="WhatsApp-Vorlagen" subtitle="Diese Nachrichten schickt Ihr Assistent in Ihrem Namen." />

      {customer.plan === "service" ? (
        <p className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-4 text-sm text-[color:var(--muted)]">
          WhatsApp-Vorlagen gehören zum Paket mit Software. In Ihrem Paket bekommen Sie neue Leads per E-Mail.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-4 text-sm">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--brand)]" />
            <p className="text-[color:var(--muted)]">
              WhatsApp erlaubt die erste Nachricht an einen Kontakt nur mit einem Text, den Meta vorher geprüft hat. Das gilt auch, wenn jemand länger als
              24 Stunden nicht geantwortet hat. Deshalb reichen wir diese Vorlagen für Ihre Nummer bei Meta ein. Antwortet ein Lead, schreibt Ihr Assistent
              frei weiter. Namen und Termine werden beim Senden passend eingesetzt; unten sehen Sie Beispiele.
            </p>
          </div>

          <ul className="flex flex-col gap-3">
            {rows.map((r) => {
              const meta = CUSTOMER_TITLES[r.purpose];
              const Icon = r.badge.icon;
              return (
                <li key={r.purpose} className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="text-sm font-semibold">{meta.title}</h2>
                      <p className="text-xs text-[color:var(--muted)]">{meta.when}</p>
                    </div>
                    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium", r.badge.cls)}>
                      <Icon className="h-3.5 w-3.5" />
                      {r.badge.label}
                    </span>
                  </div>
                  <div className="mt-3 rounded-[var(--radius-md,12px)] bg-[#efeae2] p-3">
                    <div className="max-w-md rounded-lg rounded-tl-none bg-white px-3 py-2 text-sm leading-relaxed text-slate-900 shadow-sm">
                      <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                        <MessageCircle className="h-3 w-3" /> {advisor}
                      </div>
                      {r.text}
                    </div>
                    {r.buttons.length ? (
                      <div className="mt-1 flex max-w-md flex-col gap-1">
                        {r.buttons.map((b) => (
                          <span key={b} className="rounded-lg bg-white px-3 py-1.5 text-center text-sm font-medium text-sky-700 shadow-sm">
                            {b}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {r.badge.hint ? <p className="mt-2 text-xs text-[color:var(--muted)]">{r.badge.hint}</p> : null}
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-[color:var(--muted)]">Sie möchten einen Text anders formulieren? Schreiben Sie uns, wir passen ihn an und reichen ihn neu ein.</p>
        </div>
      )}
    </main>
  );
}
