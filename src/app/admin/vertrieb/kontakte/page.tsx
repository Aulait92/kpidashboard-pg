import Link from "next/link";
import clsx from "clsx";
import { prisma } from "@/lib/prisma";
import { STAGES, shortName } from "@/lib/vertrieb/crm";
import { fmtDate } from "@/lib/vertrieb/dates";
import { StageBadge } from "@/components/vertrieb/ui";
import { LI_COLOR, LI_LABEL, LI_STATUSES } from "@/lib/vertrieb/linkedin";
import { deleteContacts } from "@/app/admin/vertrieb/actions";
import { ConfirmButton, SelectAll } from "@/components/vertrieb/confirm-button";
import type { Prisma } from "@/generated/prisma/client";
import type { SalesStage as Stage } from "@/generated/prisma/enums";

const PAGE = 50;

const MAIL_FILTERS: Record<string, { label: string; where: Prisma.SalesContactWhereInput }> = {
  sent: { label: "Cold Mail erhalten", where: { campaigns: { some: { sentAt: { not: null } } } } },
  none: { label: "Keine Cold Mail", where: { campaigns: { none: { sentAt: { not: null } } } } },
  opened: { label: "Geöffnet", where: { campaigns: { some: { openCount: { gt: 0 } } } } },
  replied: { label: "Geantwortet", where: { campaigns: { some: { replyCount: { gt: 0 } } } } },
  bounced: { label: "Bounced", where: { campaigns: { some: { bounced: true } } } },
};

export default async function KontaktePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const q = sp.q?.trim();
  const stage = STAGES.some((s) => s.id === sp.stage) ? (sp.stage as Stage) : undefined;
  const mail = sp.mail && MAIL_FILTERS[sp.mail] ? sp.mail : undefined;
  const plz = sp.plz?.trim();
  const li = sp.li === "none" || LI_STATUSES.some((x) => x.id === sp.li) ? sp.li : undefined;
  const page = Math.max(1, Number(sp.page) || 1);

  const where: Prisma.SalesContactWhereInput = {
    AND: [
      q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { city: { contains: q, mode: "insensitive" } },
              { phone: { contains: q } },
              { leaderNames: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              // "Joerg Riccius" → Vor- und Nachname getrennt suchen
              ...(q.includes(" ")
                ? [{ AND: q.split(/\s+/).map((w) => ({ OR: [{ name: { contains: w, mode: "insensitive" as const } }, { leaderNames: { contains: w, mode: "insensitive" as const } }] })) }]
                : []),
            ],
          }
        : {},
      stage ? { stage } : {},
      mail ? MAIL_FILTERS[mail].where : {},
      plz ? { zip: { startsWith: plz } } : {},
      li ? { linkedinStatus: li === "none" ? null : li } : {},
    ],
  };

  const [total, contacts] = await Promise.all([
    prisma.salesContact.count({ where }),
    prisma.salesContact.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
      skip: (page - 1) * PAGE,
      take: PAGE,
      select: {
        id: true, name: true, leaderNames: true, city: true, linkedinStatus: true, zip: true, phone: true, stage: true, ratingValue: true, ratingCount: true, lastContactAt: true,
        campaigns: { select: { sentAt: true, openCount: true, replyCount: true, bounced: true } },
        tasks: { where: { doneAt: null }, orderBy: { dueAt: "asc" }, take: 1, select: { dueAt: true, title: true } },
      },
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const link = (p: Record<string, string | undefined>) => {
    const params = new URLSearchParams(Object.entries({ q, stage, mail, plz, li, ...p }).filter(([, v]) => v) as [string, string][]);
    return `/admin/vertrieb/kontakte?${params}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Kontakte <span className="text-base font-normal text-slate-500">({total.toLocaleString("de-DE")})</span></h1>
        <Link href="/admin/vertrieb/kontakte/neu" className="btn-primary">+ Neuer Lead</Link>
      </div>

      <form className="card grid gap-3 p-4 md:grid-cols-[2fr_1fr_1fr_1fr_110px_auto] md:items-end">
        <div>
          <label className="label">Suche (Agentur, Ansprechpartner, E-Mail, Ort, Telefon)</label>
          <input name="q" defaultValue={q} className="input" placeholder="z.B. Krefeld" />
        </div>
        <div>
          <label className="label">Stufe</label>
          <select name="stage" defaultValue={stage ?? ""} className="input">
            <option value="">Alle</option>
            {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Cold Mail</label>
          <select name="mail" defaultValue={mail ?? ""} className="input">
            <option value="">Alle</option>
            {Object.entries(MAIL_FILTERS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">LinkedIn</label>
          <select name="li" defaultValue={li ?? ""} className="input">
            <option value="">Alle</option>
            <option value="none">Noch nicht auf LinkedIn</option>
            {LI_STATUSES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">PLZ beginnt mit</label>
          <input name="plz" defaultValue={plz} className="input" placeholder="40" />
        </div>
        <div className="flex gap-2">
          <button className="btn-primary">Filtern</button>
          <Link href="/admin/vertrieb/kontakte" className="btn-ghost">Zurücksetzen</Link>
        </div>
      </form>

      <form id="bulk" action={deleteContacts} className="flex items-center justify-between gap-2 text-sm text-slate-500">
        <span>Kontakte per Häkchen auswählen, um sie zu löschen.</span>
        <ConfirmButton
          form="bulk"
          message="Ausgewählte Kontakte wirklich löschen? Verlauf, Aufgaben und Cold-Mail-Status werden mit gelöscht."
          className="btn-ghost text-rose-600 hover:bg-rose-50"
        >
          🗑 Ausgewählte löschen
        </ConfirmButton>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 text-left text-xs text-slate-500">
            <tr>
              <th className="w-8 py-2 pl-4"><SelectAll form="bulk" /></th>
              <th className="px-4 py-2 font-medium">Agentur</th>
              <th className="px-4 py-2 font-medium">Ort</th>
              <th className="px-4 py-2 font-medium">Telefon</th>
              <th className="px-4 py-2 font-medium">Stufe</th>
              <th className="px-4 py-2 font-medium">Cold Mail</th>
              <th className="px-4 py-2 font-medium">LinkedIn</th>
              <th className="px-4 py-2 font-medium">Nächste Aufgabe</th>
              <th className="px-4 py-2 font-medium">Letzter Kontakt</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {contacts.map((c) => {
              const sent = c.campaigns.filter((x) => x.sentAt).length;
              const replied = c.campaigns.some((x) => x.replyCount > 0);
              const opened = c.campaigns.some((x) => x.openCount > 0);
              const bounced = c.campaigns.some((x) => x.bounced);
              return (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="py-2 pl-4"><input type="checkbox" name="ids" value={c.id} form="bulk" aria-label="Auswählen" /></td>
                  <td className="px-4 py-2">
                    <Link href={`/admin/vertrieb/kontakte/${c.id}`} className="font-medium hover:underline">{shortName(c.name)}</Link>
                    {c.leaderNames && !shortName(c.name).includes(c.leaderNames.split(",")[0]) && (
                      <span className="ml-2 text-xs text-slate-500">{c.leaderNames}</span>
                    )}
                    {c.ratingValue != null && <span className="ml-2 text-xs text-slate-400">★ {c.ratingValue} ({c.ratingCount})</span>}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-slate-600">{c.zip} {c.city}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{c.phone && <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="text-sky-700 hover:underline">{c.phone}</a>}</td>
                  <td className="px-4 py-2"><StageBadge stage={c.stage} /></td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {bounced ? <span className="badge bg-rose-50 text-rose-700">Bounced</span>
                      : replied ? <span className="badge bg-emerald-100 text-emerald-800">Geantwortet</span>
                      : sent ? <span className={clsx("badge", opened ? "bg-sky-100 text-sky-800" : "bg-sky-50 text-sky-700")}>Gesendet{opened ? " · geöffnet" : ""}</span>
                      : <span className="text-xs text-slate-400">–</span>}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {c.linkedinStatus ? <span className={`badge ${LI_COLOR[c.linkedinStatus]}`}>{LI_LABEL[c.linkedinStatus]}</span> : <span className="text-xs text-slate-400">–</span>}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-600">{c.tasks[0] ? `${fmtDate(c.tasks[0].dueAt)} · ${c.tasks[0].title}` : ""}</td>
                  <td className="px-4 py-2 text-xs text-slate-500 whitespace-nowrap">{fmtDate(c.lastContactAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!contacts.length && <p className="py-10 text-center text-sm text-slate-500">Keine Kontakte gefunden.</p>}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          {page > 1 && <Link href={link({ page: String(page - 1) })} className="btn-ghost">← Zurück</Link>}
          <span className="text-slate-500">Seite {page} von {pages}</span>
          {page < pages && <Link href={link({ page: String(page + 1) })} className="btn-ghost">Weiter →</Link>}
        </div>
      )}
    </div>
  );
}
