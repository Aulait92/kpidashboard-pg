import { redirect } from "next/navigation";
import { CheckCircle2, ChevronRight, Clock, FileText, Info, MessageCircle, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { CUSTOMER_TITLES, exampleRestFor, exampleValuesFor, formOf, previewBodyFor, purposesFor, templateNameFor, templateNamesOf, TEMPLATE_VERSION, isTemplateRevisionOf } from "@/lib/whatsapp/template-plan";
import { AnspracheForm } from "@/components/ansprache-form";
import { asAnsprache } from "@/lib/ansprache";
import { rankTemplates, renderTemplate, TEMPLATE_BUTTONS, TEMPLATE_HEADER, type NoticePurpose } from "@/lib/whatsapp/templates";
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
      empfehlungEnabled: true,
      leadAddress: true,
      whatsAppAccount: { select: { status: true } },
      messageTemplates: { select: { name: true, purpose: true, status: true, body: true, headerFormat: true, updatedAt: true }, orderBy: { updatedAt: "desc" } },
    },
  });
  if (!customer) redirect("/buyer");
  const connected = customer.whatsAppAccount?.status === "connected";
  const names = templateNamesOf(customer.name);
  const purposes = purposesFor({ bestand: customer.existingCustomersEnabled, empfehlung: customer.empfehlungEnabled });

  // Gespeicherte Ansprache (Sie/Du) bestimmt Fassung und Vorschau; Beispielkontakt: Julia Schneider, Anrede „Frau“
  const an = asAnsprache(customer.leadAddress);
  const beispiel = { firstName: "Julia", lastName: "Schneider", salutation: "Frau" };
  const rows = purposes.map((purpose) => {
    const list = customer.messageTemplates.filter((t) => t.purpose === purpose);
    const form = formOf(purpose, an);
    const wanted = templateNameFor(purpose, TEMPLATE_VERSION, form);
    const own = list.filter((t) => isTemplateRevisionOf(t.name, wanted));
    const tpl = own.find((t) => t.status === "approved") ?? own[0] ?? null;
    const text = tpl ? renderTemplate(tpl.body, exampleValuesFor(purpose, form)) : previewBodyFor(purpose, names, form);
    // Was bis zur Freigabe tatsächlich rausgeht (bisherige freigegebene Fassung)
    const sending = tpl?.status === "approved" ? null : rankTemplates(list.filter((t) => t.status === "approved"), purpose, an, beispiel);
    const fallbackText = sending ? renderTemplate(sending.tpl.body, sending.params(exampleRestFor(purpose, an))) : null;
    const failed = tpl?.status === "rejected" || tpl?.status === "paused";
    const badge: Badge =
      sending && !failed ? { label: tpl ? "Neue Fassung in Prüfung bei Meta" : "Neue Fassung wird eingereicht", cls: "bg-amber-50 text-amber-700", icon: Clock } : badgeFor(tpl?.status ?? null, connected);
    // Erstinformation als PDF im Kopf (wie eingereicht; vor dem Einreichen laut Plan)
    const pdf = !!TEMPLATE_HEADER[purpose] && (tpl ? tpl.headerFormat === "DOCUMENT" : true);
    return { purpose, tpl, text, badge, fallbackText, pdf, sie: form !== "du", buttons: TEMPLATE_BUTTONS[purpose as NoticePurpose] ?? [] };
  });

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader back="/buyer/einstellungen" title="WhatsApp-Vorlagen" subtitle="Diese Nachrichten schickt Ihr Assistent in Ihrem Namen." />

      {customer.plan === "service" ? (
        <p className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-4 text-sm text-[color:var(--muted)]">
          WhatsApp-Vorlagen gehören zum Paket mit Software. In Ihrem Paket bekommen Sie neue Leads per E-Mail.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {ctx.teamRole === "owner" ? <AnspracheForm current={an} readOnly={ctx.preview} /> : null}
          <div className="flex gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-4 text-sm">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--brand)]" />
            <p className="text-[color:var(--muted)]">
              Erste Nachrichten und Nachrichten nach 24 Stunden ohne Antwort prüft Meta vorher; Anrede, Namen und Termine setzt die App beim Senden ein
              {an === "sie" ? " (ohne Anrede im Formular mit vollem Namen, ohne Nachnamen „Guten Tag,“)" : ""}.
            </p>
          </div>

          {/* Nach Anlass gruppiert und zugeklappt (UX, Ole 15.11.2026: die Liste war über 6.000 Pixel lang) */}
          {GRUPPEN.map((g) => {
            const inGruppe = rows.filter((r) => gruppeVon(CUSTOMER_TITLES[r.purpose].title) === g);
            if (!inGruppe.length) return null;
            const offen = inGruppe.filter((r) => r.badge.label !== "Freigegeben").length;
            return (
              <details key={g} className="group rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white" data-vorlagen-gruppe>
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0 flex-1 text-[15px] font-semibold">
                    {g} <span className="font-normal text-[color:var(--muted)]">· {inGruppe.length}</span>
                  </span>
                  <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", offen ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700")}>
                    {offen ? `${offen} noch nicht freigegeben` : "Alle freigegeben"}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--border-strong)] transition group-open:rotate-90" />
                </summary>
          <ul className="flex flex-col gap-3 border-t border-[color:var(--border)] p-3">
            {inGruppe.map((r) => {
              const meta = CUSTOMER_TITLES[r.purpose];
              const Icon = r.badge.icon;
              return (
                <li key={r.purpose} className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="text-sm font-semibold">{meta.title}</h2>
                      <p className="text-sm text-[color:var(--muted)]">{meta.when}</p>
                    </div>
                    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium", r.badge.cls)}>
                      <Icon className="h-3.5 w-3.5" />
                      {r.badge.label}
                    </span>
                  </div>
                  <div className="mt-3 rounded-[var(--radius-md,12px)] bg-[#efeae2] p-3">
                    <div className="max-w-md rounded-lg rounded-tl-none bg-white px-3 py-2 text-sm leading-relaxed text-slate-900 shadow-sm">
                      {r.pdf ? (
                        <div className="mb-2 flex items-center gap-2 rounded-md bg-slate-100 px-2 py-1.5 text-xs text-slate-700">
                          <FileText className="h-4 w-4 shrink-0" /> Erstinformation.pdf
                        </div>
                      ) : null}
                      <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                        <MessageCircle className="h-3 w-3" /> {names.firm}
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
                  {r.fallbackText ? (
                    <p className="mt-2 text-xs text-[color:var(--muted)]">
                      Bis zur Freigabe geht die bisherige Fassung raus: <span className="italic">„{r.fallbackText}“</span>
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
              </details>
            );
          })}
          <p className="text-sm text-[color:var(--muted)]">Sie möchten einen Text anders formulieren? Schreiben Sie uns, wir passen ihn an und reichen ihn neu ein.</p>
        </div>
      )}
    </main>
  );
}

const GRUPPEN = ["Erste Nachricht", "Rund um den Termin", "Nachfassen", "Weitere"] as const;
function gruppeVon(titel: string): (typeof GRUPPEN)[number] {
  if (/^Erste Nachricht/i.test(titel)) return "Erste Nachricht";
  if (/termin/i.test(titel) && !/nachfass|verpasst/i.test(titel)) return "Rund um den Termin";
  if (/nachfass|nachfrage|verpasst|letzte nachricht|nicht erreicht/i.test(titel)) return "Nachfassen";
  return "Weitere";
}
