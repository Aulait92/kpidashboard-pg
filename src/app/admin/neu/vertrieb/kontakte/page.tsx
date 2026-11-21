import Link from "next/link";
import { ChevronLeft, ChevronRight, Phone, Plus, SearchX, ShieldAlert, Trash2 } from "lucide-react";
import { Badge, ButtonLink, Card, EmptyState, buttonClass } from "@/components/ui";
import { ConfirmButton, SelectAll } from "@/components/vertrieb/confirm-button";
import { StageBadge } from "@/components/vertrieb/ui";
import { Seite } from "@/components/admin-neu/ui/seite";
import { KONTAKTE, V, kontaktPfad } from "@/components/admin-neu/vertrieb/listen";
import { offeneRechtsFaelle } from "@/lib/vertrieb/datenschutz-recht-server";
import { SuchFilter } from "@/components/admin-neu/vertrieb/such-filter";
import { VerkaufenMehr } from "@/components/admin-neu/vertrieb/verkaufen-mehr";
import { prisma } from "@/lib/prisma";
import { deleteContacts } from "@/app/admin/vertrieb/actions";
import { STAGES, shortName } from "@/lib/vertrieb/crm";
import { fmtDate } from "@/lib/vertrieb/dates";
import { LI_LABEL, LI_STATUSES } from "@/lib/vertrieb/linkedin";
import { MAIL_FILTERS, coldMailStand, kontakteFilter, ladeKontakte } from "@/lib/vertrieb/kontakte-liste";
import { requireAuth } from "@/lib/vertrieb/auth";
import { ladeMetaLeads } from "@/lib/vertrieb/meta-leads";
import { META_ANSICHT, MetaLeads, metaPfad } from "@/components/admin-neu/vertrieb/meta-leads";
import { cn } from "@/lib/utils";

export const metadata = { title: "Kontakte | performancegrowth Admin" };

// Vertrieb → Kontakte: Suche und Filter (Stufe, Cold Mail, LinkedIn, PLZ) wie /admin/vertrieb/kontakte, gleiche
// Abfrage (lib/vertrieb/kontakte-liste.ts). Handy: Liste mit Anruf-Knopf; Rechner: Tabelle mit Häkchen zum Löschen.
// Umbau 19.11.2026 (SUS-Ziel 90): eine Zeile Suche + „Filter“ (Fenster) statt drei Zeilen Umschalter, Suche und vier
// Filter. „Meta-Leads“ als Chip nur, wenn es Meta-Leads gibt; „Datenschutz“ als Chip nur bei offenen Fällen (sonst „Mehr“).
export default async function KontaktePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAuth();
  const sp = await searchParams;
  const [offenRecht, metaAnzahl] = await Promise.all([offeneRechtsFaelle(), prisma.salesInboundLead.count({ where: { source: "META_ADS", contactId: { not: null } } })]);
  const aktionen = (
    <>
      <VerkaufenMehr datenschutzOffen={offenRecht} />
      <ButtonLink href={`${KONTAKTE}/neu`} variant="primary" size="md" icon={Plus}>
        Kontakt
      </ButtonLink>
    </>
  );
  // Ansicht „Meta-Leads“ (Ole, 18.11.2026): Vermittler aus Meta-Formularen mit Stand und Trichter
  if (sp.ansicht === META_ANSICHT) {
    const daten = await ladeMetaLeads({ zeitraum: sp.zeitraum, stand: sp.stand });
    return (
      <Seite titel="Verkaufen" reiter="verkaufen" aktionen={aktionen}>
        <AnsichtWahl meta metaAnzahl={metaAnzahl} offenRecht={offenRecht} />
        <MetaLeads daten={daten} />
      </Seite>
    );
  }
  const f = kontakteFilter(sp);
  const { total, contacts, pages, filtered } = await ladeKontakte(f);
  const seite = (n: number) => {
    const p = new URLSearchParams(Object.entries({ q: f.q, stage: f.stage, mail: f.mail, plz: f.plz, li: f.li, seite: n > 1 ? String(n) : undefined }).filter(([, v]) => v) as [string, string][]);
    const s = p.toString();
    return s ? `${KONTAKTE}?${s}` : KONTAKTE;
  };

  return (
    <Seite titel="Verkaufen" reiter="verkaufen" aktionen={aktionen}>
      <div className="mb-4" data-funktion="page-q--suche-nach-agentur-name-e-mail-ort-telefon page-stage--filter-stufe page-mail-filters--filter-cold-mail-erhalten-keine-geoeffnet page-li--filter-linkedin-status-und-plz-beginnt-mit">
        <SuchFilter
          suche="Agentur, Name, E-Mail, Ort, Telefon"
          felder={[
            { key: "stage", label: "Stufe", options: STAGES.map((s) => ({ value: s.id, label: s.label })) },
            { key: "mail", label: "Cold Mail", options: Object.entries(MAIL_FILTERS).map(([value, v]) => ({ value, label: v.label })) },
            { key: "li", label: "LinkedIn", options: [{ value: "none", label: "Noch nicht auf LinkedIn" }, ...LI_STATUSES.map((x) => ({ value: x.id, label: x.label }))] },
            { key: "plz", label: "PLZ beginnt mit", text: { placeholder: "z. B. 80", inputMode: "numeric" } },
          ]}
        >
          <AnsichtWahl meta={false} metaAnzahl={metaAnzahl} offenRecht={offenRecht} />
        </SuchFilter>
      </div>

      <Card>
        <div className="flex items-center justify-between gap-3 border-b border-[color:var(--border)] px-5 py-3.5" data-funktion="page--kontaktliste-mit-zaehler">
          <h2 className="text-[15px] font-semibold tracking-tight">
            Kontakte <span className="ml-1 font-normal text-[color:var(--muted)]">{total.toLocaleString("de-DE")}</span>
          </h2>
          {/* Löschen ist selten: nur am Rechner, über die Häkchen in der Tabelle */}
          <form id="kontakte-auswahl" action={deleteContacts} className="hidden md:block" data-funktion="actions-deletecontacts--mehrere-kontakte-markieren-und-loeschen">
            <ConfirmButton
              form="kontakte-auswahl"
              message="Ausgewählte Kontakte wirklich löschen? Verlauf, Aufgaben und Cold-Mail-Status werden mit gelöscht."
              className={cn(buttonClass("ghost", "sm"), "text-rose-600 hover:bg-rose-50")}
            >
              {/* Selten und unumkehrbar: leise statt rot gefüllt, Rückfrage bleibt */}
              <Trash2 className="h-3.5 w-3.5" /> Ausgewählte löschen
            </ConfirmButton>
          </form>
        </div>

        {contacts.length ? (
          <>
            {/* Handy: Liste mit Anruf-Knopf */}
            <ul className="divide-y divide-[color:var(--border)] md:hidden">
              {contacts.map((c) => (
                <li key={c.id} className="flex items-center gap-1 pr-2">
                  <Link href={kontaktPfad(c.id)} className="flex min-w-0 flex-1 items-center gap-2 py-3 pl-4">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{shortName(c.name)}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[color:var(--muted)]">
                        <StageBadge stage={c.stage} />
                        {c.city ? <span>{c.city}</span> : null}
                        {c.tasks[0] ? <span>{fmtDate(c.tasks[0].dueAt)} {c.tasks[0].title}</span> : null}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--border-strong)]" />
                  </Link>
                  {c.phone ? (
                    <a
                      href={`tel:${c.phone.replace(/\s/g, "")}`}
                      aria-label={`${shortName(c.name)} anrufen`}
                      data-funktion="page-tel--direkt-anrufen-aus-der-liste-handy"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[color:var(--brand)] hover:bg-[color:var(--surface-sunken)]"
                    >
                      <Phone className="h-4 w-4" />
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>

            {/* Rechner: Tabelle */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="bg-[color:var(--surface-sunken)] text-left text-xs text-[color:var(--muted)]">
                  <tr>
                    <th className="w-8 py-2 pl-5">
                      <SelectAll form="kontakte-auswahl" />
                    </th>
                    <th className="px-3 py-2 font-medium">Agentur</th>
                    <th className="px-3 py-2 font-medium">Telefon</th>
                    <th className="px-3 py-2 font-medium">Stufe</th>
                    <th className="px-3 py-2 font-medium">Nächster Schritt</th>
                    <th className="px-3 py-2 font-medium">Cold Mail</th>
                    <th className="px-3 py-2 font-medium">LinkedIn</th>
                    <th className="px-3 py-2 font-medium">Letzter Kontakt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--border)]">
                  {contacts.map((c) => {
                    const m = coldMailStand(c.campaigns);
                    return (
                      <tr key={c.id} className="hover:bg-[color:var(--surface-sunken)]">
                        <td className="py-2.5 pl-5">
                          <input type="checkbox" name="ids" value={c.id} form="kontakte-auswahl" aria-label={`${shortName(c.name)} auswählen`} />
                        </td>
                        <td className="px-3 py-2.5">
                          <Link href={kontaktPfad(c.id)} className="font-medium hover:underline">
                            {shortName(c.name)}
                          </Link>
                          {c.ratingValue != null ? <span className="ml-2 text-xs text-[color:var(--muted)]">★ {c.ratingValue.toLocaleString("de-DE")} ({c.ratingCount})</span> : null}
                          <div className="text-xs text-[color:var(--muted)]">
                            {[c.leaderNames && !shortName(c.name).includes(c.leaderNames.split(",")[0]) ? c.leaderNames : null, [c.zip, c.city].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          {c.phone ? (
                            <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="text-[color:var(--brand)] hover:underline">
                              {c.phone}
                            </a>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5">
                          <StageBadge stage={c.stage} />
                        </td>
                        <td className="px-3 py-2.5 text-xs">{c.tasks[0] ? `${fmtDate(c.tasks[0].dueAt)} · ${c.tasks[0].title}` : <span className="text-[color:var(--muted)]">kein nächster Schritt</span>}</td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          {m.bounced ? <Badge tone="danger">Bounced</Badge> : m.replied ? <Badge tone="success">Geantwortet</Badge> : m.sent ? <Badge tone="info">Gesendet{m.opened ? ", geöffnet" : ""}</Badge> : <span className="text-xs text-[color:var(--muted)]">keine</span>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">{c.linkedinStatus ? <Badge tone="brand">{LI_LABEL[c.linkedinStatus]}</Badge> : <span className="text-xs text-[color:var(--muted)]">keine</span>}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs text-[color:var(--muted)]">{fmtDate(c.lastContactAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <EmptyState
            icon={SearchX}
            title={filtered ? "Kein Kontakt passt zu Suche und Filter." : "Noch keine Kontakte."}
            action={
              filtered ? (
                <ButtonLink href={KONTAKTE} size="md">
                  Filter zurücksetzen
                </ButtonLink>
              ) : (
                <ButtonLink href={`${KONTAKTE}/neu`} variant="primary" size="md" icon={Plus}>
                  Ersten Kontakt anlegen
                </ButtonLink>
              )
            }
          />
        )}
      </Card>

      {pages > 1 ? (
        <nav className="mt-4 flex items-center justify-center gap-2 text-sm" aria-label="Seiten" data-funktion="page-page--seiten-blaettern">
          {f.page > 1 ? (
            <ButtonLink href={seite(f.page - 1)} size="md" icon={ChevronLeft}>
              Zurück
            </ButtonLink>
          ) : null}
          <span className="text-[color:var(--muted)]">
            Seite {f.page} von {pages}
          </span>
          {f.page < pages ? (
            <ButtonLink href={seite(f.page + 1)} size="md">
              Weiter <ChevronRight className="h-4 w-4" />
            </ButtonLink>
          ) : null}
        </nav>
      ) : null}
    </Seite>
  );
}

/**
 * Ansichten neben der Suche: Meta-Leads (Quelle: Meta-Formular) nur, wenn es welche gibt; Datenschutz und Recht nur bei
 * offenen Fällen (sonst über „Mehr“ im Kopf). In der Ansicht Meta-Leads führt „Alle Kontakte“ zurück.
 */
function AnsichtWahl({ meta, metaAnzahl, offenRecht }: { meta: boolean; metaAnzahl: number; offenRecht: number }) {
  const klasse = (aktiv: boolean) =>
    cn(
      "inline-flex h-10 shrink-0 items-center whitespace-nowrap rounded-full border px-3 text-sm font-medium",
      aktiv ? "border-[color:var(--brand)] bg-[color:var(--brand)] text-white" : "border-[color:var(--border)] bg-white text-[color:var(--muted)] hover:text-[color:var(--foreground)]",
    );
  if (!meta && !metaAnzahl && !offenRecht) return null;
  return (
    <nav className={cn("flex gap-1.5 overflow-x-auto [scrollbar-width:none]", meta && "mb-3")} aria-label="Ansicht" data-funktion="meta-leads--ansicht-quelle-meta-formular">
      {meta ? (
        <Link href={KONTAKTE} className={klasse(false)}>
          Alle Kontakte
        </Link>
      ) : null}
      {meta || metaAnzahl ? (
        <Link href={meta ? KONTAKTE : metaPfad({})} aria-current={meta ? "page" : undefined} className={klasse(meta)}>
          Meta<span className="hidden sm:inline">-Leads</span>
        </Link>
      ) : null}
      {/* Datenschutz und Recht (Ole, 19.11.2026): Fälle aus der Kaltakquise, Zähler = offene Fälle */}
      {offenRecht ? (
        <Link href={`${V}/datenschutz`} className={klasse(false)} data-funktion="datenschutz-liste--datenschutz-und-recht-faelle-mit-frist-und-nachweis">
          <ShieldAlert className="h-4 w-4 sm:mr-1" aria-label="Datenschutz und Recht" />
          <span className="hidden sm:inline">Datenschutz</span>
          <span className="rounded-full bg-rose-600 px-1.5 text-xs font-semibold text-white sm:ml-1.5">{offenRecht}</span>
        </Link>
      ) : null}
    </nav>
  );
}
