import Link from "next/link";
import clsx from "clsx";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { CUSTOMER_STAGES, SOURCES, SOURCE_COLOR, SOURCE_LABEL, shortName } from "@/lib/vertrieb/crm";
import { ensureSource } from "@/lib/vertrieb/source";
import { dayKey, fmtDate, relDay, todayKey } from "@/lib/vertrieb/dates";
import { dragCustomer, moveCustomer } from "@/app/admin/vertrieb/actions";
import { Kanban, type KanbanCard, type KanbanColumn } from "@/components/vertrieb/kanban";
import { Stat } from "@/components/vertrieb/ui";

const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export default async function KundenPage() {
  await connection();
  // Bereits gewonnene Kontakte (z.B. aus dem Listen-Import) in die Kunden-Pipeline übernehmen
  await prisma.salesContact.updateMany({ where: { stage: "GEWONNEN", customerStage: null }, data: { customerStage: "VERTRAG" } });
  // Kanal für bestehende Kunden ohne Angabe vorschlagen
  for (const { id } of await prisma.salesContact.findMany({ where: { customerStage: { not: null }, customerSource: null }, select: { id: true } })) {
    await ensureSource(id);
  }
  const customers = await prisma.salesContact.findMany({
    where: { customerStage: { not: null } },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true, name: true, city: true, phone: true, customerStage: true, customerSource: true, products: true, monthlyValue: true, contractStart: true, customerSince: true,
      tasks: { where: { doneAt: null }, orderBy: { dueAt: "asc" }, take: 1, select: { title: true, dueAt: true } },
    },
  });
  const sum = (ids: string[]) => customers.filter((c) => ids.includes(c.customerStage!)).reduce((a, c) => a + (c.monthlyValue ?? 0), 0);
  const count = (ids: string[]) => customers.filter((c) => ids.includes(c.customerStage!)).length;

  const columns: KanbanColumn[] = CUSTOMER_STAGES.map((s) => ({ ...s, count: customers.filter((c) => c.customerStage === s.id).length }));
  const cards: KanbanCard[] = customers.map((c) => {
    const task = c.tasks[0];
    const idx = CUSTOMER_STAGES.findIndex((x) => x.id === c.customerStage);
    return {
      id: c.id,
      column: c.customerStage!,
      value: c.monthlyValue,
      node: (
        <div className="card p-3 hover:border-slate-300">
          <Link href={`/admin/vertrieb/kontakte/${c.id}`} draggable={false} className="block text-sm font-medium leading-tight hover:underline">{shortName(c.name)}</Link>
          <div className="mt-0.5 text-xs text-slate-500">{c.city}</div>
          <div className="mt-2 flex flex-wrap gap-1">
            {c.customerSource && <span className={`badge ${SOURCE_COLOR[c.customerSource]}`}>über {SOURCE_LABEL[c.customerSource]}</span>}
            {c.monthlyValue != null && <span className="badge bg-emerald-50 text-emerald-700">{eur(c.monthlyValue)}/Monat</span>}
            {c.products?.split(",").map((p) => p.trim()).filter(Boolean).map((p) => (
              <span key={p} className="badge bg-slate-100 text-slate-600">{p}</span>
            ))}
          </div>
          {(c.contractStart || c.customerSince) && (
            <div className="mt-1 text-xs text-slate-500">
              {c.contractStart && `Start ${fmtDate(c.contractStart)}`}
              {c.customerSince && ` · aktiv seit ${fmtDate(c.customerSince)}`}
            </div>
          )}
          {task && (
            <div className={clsx("mt-2 text-xs", dayKey(task.dueAt) < todayKey() ? "text-rose-600" : dayKey(task.dueAt) === todayKey() ? "text-amber-700" : "text-slate-500")}>
              ⏰ {task.title} · {relDay(task.dueAt)}
            </div>
          )}
          {/* Pfeile als Alternative zu Drag & Drop (z.B. auf dem Handy) */}
          <div className="mt-2 flex justify-between">
            {idx > 0 ? (
              <form action={moveCustomer}>
                <input type="hidden" name="contactId" value={c.id} />
                <input type="hidden" name="dir" value="-1" />
                <button className="btn-ghost px-2 py-0.5 text-xs" title={`Zurück zu ${CUSTOMER_STAGES[idx - 1].label}`}>←</button>
              </form>
            ) : <span />}
            {idx < CUSTOMER_STAGES.length - 1 && (
              <form action={moveCustomer}>
                <input type="hidden" name="contactId" value={c.id} />
                <input type="hidden" name="dir" value="1" />
                <button className="btn-ghost px-2 py-0.5 text-xs">{CUSTOMER_STAGES[idx + 1].label} →</button>
              </form>
            )}
          </div>
        </div>
      ),
    };
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold">Kunden-Pipeline</h1>
        <p className="text-sm text-slate-500">Karten per Drag &amp; Drop verschieben oder die Pfeile nutzen.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Aktive Kunden" value={count(["AKTIV"])} tone="green" />
        <Stat label="Monatsumsatz aktiv" value={eur(sum(["AKTIV"]))} tone="green" />
        <Stat label="In Vertrag / Onboarding / Test" value={count(["VERTRAG", "ONBOARDING", "TEST"])} tone="amber" />
        <Stat label="Potenzial in Vorbereitung" value={eur(sum(["VERTRAG", "ONBOARDING", "TEST"]))} />
      </div>

      {customers.length > 0 && (
        <div className="card flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-sm">
          <span className="text-xs font-medium text-slate-500">Kunden nach Kanal (ohne Gekündigt):</span>
          {[...SOURCES.map((x) => x.id), null].map((src) => {
            const list = customers.filter((c) => (c.customerSource ?? null) === src && c.customerStage !== "GEKUENDIGT");
            if (!list.length) return null;
            const mrr = list.filter((c) => c.customerStage === "AKTIV").reduce((a, c) => a + (c.monthlyValue ?? 0), 0);
            return (
              <span key={src ?? "none"} className="flex items-center gap-1.5">
                <span className={`badge ${src ? SOURCE_COLOR[src] : "bg-slate-100 text-slate-500"}`}>{src ? SOURCE_LABEL[src] : "Unbekannt"}</span>
                <span className="tabular-nums">{list.length}</span>
                {mrr > 0 && <span className="text-xs text-slate-500">· {eur(mrr)}/M aktiv</span>}
              </span>
            );
          })}
        </div>
      )}

      <Kanban columns={columns} cards={cards} move={dragCustomer} showValue topOffset={350} />
      <p className="text-sm text-slate-500">
        Kontakte landen hier automatisch, sobald sie in der Akquise auf „Gewonnen“ gesetzt werden. Produkte, Monatswert und Vertragsstart pflegst du auf der Kontaktseite.
      </p>
    </div>
  );
}
