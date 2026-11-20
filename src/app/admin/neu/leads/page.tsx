import Link from "next/link";
import { CheckCircle2, Inbox, Plus, Workflow } from "lucide-react";
import { Badge, Button, ButtonLink, Card, CardHeader, EmptyState } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { Seite } from "@/components/admin-neu/ui/seite";
import { Meldung } from "@/components/admin-neu/leads/ansichten";
import { ZielWahl } from "@/components/admin-neu/leads/ziel-wahl";
import { ladeProduktNamen } from "@/components/admin-neu/leads/produkt-namen";
import { assignFormAction, dismissUnassignedAction, toggleSourceAction, toggleVertriebFormAction } from "@/app/admin/lead-eingang/actions";
import { VERTRIEB_ZIEL, loadLeadEingang } from "@/app/admin/lead-eingang/daten";

export const metadata = { title: "Formulare | performancegrowth Admin" };

// Liefern → Formulare (früher Lead-Eingang): Hauptzweck „jedes Leadformular landet bei einem Kunden oder dem Vertrieb“.
// Links Leads ohne Zuordnung (zu tun), rechts die Zuordnungen; das Formular zum Zuordnen klappt erst auf, wenn man
// „Zuordnen“ bzw. „+ Zuordnung“ tippt. UX-Umbau 20.11.2026: Technik (Meta-Prüfliste mit Variablennamen, Webhook-Adresse,
// Zapier-Übergang) steht nur noch unter Einstellungen › Anbindungen; hier bei Bedarf eine Zeile „Prüfen“ dorthin.
// Das Feld „Airtable-Bezug“ ist entfallen (der gespeicherte Wert bleibt, actions.ts überschreibt ihn nur, wenn das Feld
// mitkommt). Daten und Aktionen wie /admin/lead-eingang (lead-eingang/daten.ts, actions.ts).

const PFAD = "/admin/neu/leads";
const input =
  "h-10 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-base outline-none focus:border-[color:var(--brand)] sm:text-sm";
const fmt = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);
const eur = (n: number) => `${n.toLocaleString("de-DE")} €`;

export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string; ok?: string; err?: string; form?: string; neu?: string }> }) {
  const sp = await searchParams;
  const { diag, sources, customers, productOptions, unassigned, forms, formsError, metaReady, vertriebForms } = await loadLeadEingang(sp.page);
  const offen = unassigned.reduce((a, u) => a + u._count._all, 0);
  const zuordnenOffen = !!(sp.form || sp.page || sp.neu || sp.err);
  const name = await ladeProduktNamen(sources.map((s) => s.productKey));

  return (
    <Seite titel="Liefern" reiter="liefern">
      <Meldung ok={sp.ok} err={sp.err} />
      {!metaReady ? (
        <p className="mb-4 rounded-[var(--radius-md)] bg-amber-50 px-4 py-2.5 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
          Meta-Verbindung unvollständig: neue Leads kommen nicht an.{" "}
          <Link href="/admin/neu/einstellungen/anbindungen" className="font-semibold underline">
            Prüfen
          </Link>
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card tone={offen ? "attention" : "default"}>
          <div data-funktion="page--posteingang-leads-ohne-zuordnung">
            <CardHeader title="Ohne Zuordnung" icon={Inbox} count={offen} />
            {unassigned.length ? (
              <ul className="divide-y divide-[color:var(--border)] text-sm">
                {unassigned.map((u) => (
                  <li key={u.formId ?? "none"} className="flex items-center gap-2 px-4 py-3 sm:px-5">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">Formular {u.formId ?? "unbekannt"}</div>
                      <div className="text-xs text-[color:var(--muted)]">
                        {u._count._all} {u._count._all === 1 ? "Lead" : "Leads"} · zuletzt {u._max.createdAt ? fmt(u._max.createdAt) : "-"}
                      </div>
                    </div>
                    <ButtonLink href={`${PFAD}?form=${u.formId ?? ""}#zuordnen`} variant="primary">
                      Zuordnen
                    </ButtonLink>
                    <form action={dismissUnassignedAction} data-funktion="actions-dismissunassignedaction--wartende-leads-ohne-zuordnung-verwerfen">
                      <input type="hidden" name="formId" value={u.formId ?? ""} />
                      <SubmitButton pendingLabel="…" className="h-10 px-2 text-xs font-medium text-[color:var(--muted)] hover:text-rose-700 sm:h-8">
                        Verwerfen
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={CheckCircle2} title="Alle Formulare sind zugeordnet." text="Neue Formulare ohne Kunde erscheinen hier." />
            )}
          </div>
        </Card>

        <Card>
          <div data-funktion="page--zuordnungen-tabelle-mit-preis-letztem-lead">
            <CardHeader
              title="Zuordnungen"
              icon={Workflow}
              count={sources.filter((s) => s.active).length + vertriebForms.filter((f) => f.active).length}
              actions={
                <ButtonLink href={`${PFAD}?neu=1#zuordnen`} icon={Plus}>
                  Zuordnung
                </ButtonLink>
              }
            />
            {sources.length || vertriebForms.length ? (
              <ul className="divide-y divide-[color:var(--border)] text-sm">
                {/* Formulare des Vertriebs (Oles eigene Vermittler-Leads) zuerst */}
                {vertriebForms.map((f) => (
                  <li key={f.id} className={`flex items-center gap-3 px-4 py-3 sm:px-5 ${f.active ? "" : "opacity-60"}`} data-funktion="lead-eingang--vertriebsformulare-in-den-zuordnungen">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">
                        {f.formName ?? `Formular ${f.formId}`} → Vertrieb
                      </div>
                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-[color:var(--muted)]">
                        <Badge tone="brand">Vermittler-Leads</Badge>
                        <span>· {f.lastLeadAt ? `zuletzt ${fmt(f.lastLeadAt)}` : "noch kein Lead"}</span>
                        {!f.active ? <Badge>pausiert</Badge> : null}
                      </div>
                    </div>
                    <form action={toggleVertriebFormAction}>
                      <input type="hidden" name="id" value={f.id} />
                      <SubmitButton pendingLabel="…" className="h-10 px-2 text-xs font-medium text-[color:var(--brand)] hover:underline sm:h-8">
                        {f.active ? "Pausieren" : "Aktivieren"}
                      </SubmitButton>
                    </form>
                  </li>
                ))}
                {sources.map((s) => (
                  <li key={s.id} className={`flex items-center gap-3 px-4 py-3 sm:px-5 ${s.active ? "" : "opacity-60"}`}>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">
                        {s.formName ?? `Formular ${s.formId}`} → {s.customer.name}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-[color:var(--muted)]">
                        <span>{name(s.productKey)}</span>
                        {s.leadPrice ? <span>· {eur(Number(s.leadPrice))} je Lead</span> : null}
                        <span>· {s.lastLeadAt ? `zuletzt ${fmt(s.lastLeadAt)}` : "noch kein Lead"}</span>
                        {!s.active ? <Badge>pausiert</Badge> : null}
                        {s.lastConsentState === "ohne" ? <Badge tone="warning">ohne Einwilligungs-Häkchen</Badge> : null}
                      </div>
                    </div>
                    <form action={toggleSourceAction} data-funktion="actions-togglesourceaction--zuordnung-an-aus-schalten">
                      <input type="hidden" name="id" value={s.id} />
                      <SubmitButton pendingLabel="…" className="h-10 px-2 text-xs font-medium text-[color:var(--brand)] hover:underline sm:h-8">
                        {s.active ? "Pausieren" : "Aktivieren"}
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={Workflow}
                title="Noch keine Formulare zugeordnet."
                action={
                  <ButtonLink href={`${PFAD}?neu=1#zuordnen`} variant="primary" icon={Plus}>
                    Erste Zuordnung
                  </ButtonLink>
                }
              />
            )}
          </div>
        </Card>
      </div>

      <Card className="mt-4" id="zuordnen">
        <details open={zuordnenOffen} className="group [&>summary::-webkit-details-marker]:hidden">
          <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-5 text-[15px] font-semibold group-open:border-b group-open:border-[color:var(--border)]">
            <Plus className="h-4 w-4 text-[color:var(--muted)]" />
            <span className="flex-1">Formular zuordnen</span>
          </summary>
          <div className="space-y-4 p-4 text-sm sm:p-5">
            {diag.pages.length ? (
              <form action={PFAD} className="flex flex-wrap items-end gap-2" data-funktion="page-listpageforms--facebook-seite-waehlen-und-formulare-laden">
                {sp.form ? <input type="hidden" name="form" value={sp.form} /> : null}
                <label className="block min-w-[220px] flex-1 space-y-1">
                  <span className="text-xs font-medium text-[color:var(--muted)]">Facebook-Seite</span>
                  <select name="page" defaultValue={sp.page ?? ""} className={input}>
                    <option value="">Seite wählen</option>
                    {diag.pages.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Button type="submit" size="md">
                  Formulare laden
                </Button>
              </form>
            ) : null}
            {formsError ? <p className="text-rose-700">{formsError}</p> : null}
            <form action={assignFormAction} className="grid grid-cols-1 gap-3 md:grid-cols-2" data-funktion="actions-assignformaction--formular-zuordnen-seite-formular-kunde-produkt">
              <input type="hidden" name="pageId" value={sp.page ?? ""} />
              <input type="hidden" name="zurueck" value={PFAD} />
              <label className="block space-y-1">
                <span className="text-xs font-medium text-[color:var(--muted)]">Leadformular</span>
                {forms.length ? (
                  <select name="formId" required className={input} defaultValue={sp.form ?? undefined}>
                    {forms.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({f.status ?? "?"})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input name="formId" required defaultValue={sp.form ?? ""} placeholder="Formular-ID, z. B. 1909684100014197" inputMode="numeric" className={input} />
                )}
              </label>
              {/* Ziel: Kunde (mit Produkt) oder Vertrieb (Oles eigene Vermittler-Leads, ohne Produkt) */}
              <div className="contents" data-funktion="lead-eingang--formular-dem-vertrieb-zuordnen">
                <ZielWahl
                  customers={customers}
                  productOptions={productOptions}
                  vertriebWert={VERTRIEB_ZIEL}
                  inputClass={input}
                  listId="neu-lead-products"
                  erweitert={
                    <details className="md:col-span-2" data-funktion="actions-assignformaction--beim-zuordnen-lead-preis-ppl-und-airtable-bezug">
                      <summary className="inline-flex min-h-10 cursor-pointer items-center text-xs font-medium text-[color:var(--muted)]">Lead-Preis (nur Pay-per-Lead)</summary>
                      <label className="block max-w-xs space-y-1">
                        <span className="text-xs font-medium text-[color:var(--muted)]">Lead-Preis netto</span>
                        <input name="leadPrice" inputMode="decimal" placeholder="leer = kein Lead-Preis" className={input} />
                      </label>
                    </details>
                  }
                />
              </div>
              <div className="flex flex-wrap items-center gap-3 md:col-span-2">
                <SubmitButton pendingLabel="Wird zugeordnet …" className="h-10 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-5 text-sm font-semibold text-white">
                  Zuordnen
                </SubmitButton>
                <span className="text-xs text-[color:var(--muted)]">Wartende Leads des Formulars werden übernommen.</span>
              </div>
            </form>
          </div>
        </details>
      </Card>

      <p className="mt-4 text-xs text-[color:var(--muted)]">
        Neue Kampagne für einen Kunden: in der Kundenakte unter <Link href="/admin/neu/kunden" className="underline">Kampagne & Leads</Link>.
      </p>
    </Seite>
  );
}

