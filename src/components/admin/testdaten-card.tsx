import { prisma } from "@/lib/prisma";
import { hasDemoData } from "@/lib/demo-data";
import { markTestCustomerAction, removeDemoAction, seedDemoAction } from "@/app/admin/whatsapp/settings/actions";
import { SubmitButton } from "@/components/submit-button";

/**
 * Kundenakte: Testdaten (ca. 45 Beispiel-Leads mit Chats, Terminen, Abschlüssen, Werbebudget).
 * Sandbox: für alle Kunden. Live-App: nur für interne Testkunden (zählen nicht in Zahlen/Umsätzen).
 */
export async function TestdatenCard({ customerId }: { customerId: string }) {
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { plan: true } });
  if (!c) return null;
  const sandbox = process.env.DEMO_TOOLS === "1";
  const internal = c.plan === "internal";
  const has = await hasDemoData(customerId);
  // Echte Kunden auf der Live-App: Karte nur, wenn schon Testdaten da sind (zum Entfernen) – sonst nichts anzeigen
  if (!sandbox && !internal && !has) {
    return (
      <details className="card px-4 py-3 text-sm" data-testdaten>
        <summary className="cursor-pointer font-medium text-slate-600">Testkunde &amp; Testdaten</summary>
        <p className="mt-2 text-slate-600">
          Nur für eigene Testkonten: Als Testkunde markiert zählt der Kunde nicht mehr in Zahlen und Umsätzen, und Sie können Testdaten einspielen.
        </p>
        <form action={markTestCustomerAction} className="mt-2 flex flex-wrap items-center gap-3">
          <input type="hidden" name="customerId" value={customerId} />
          <label className="flex items-center gap-2">
            <input type="checkbox" name="confirm" required className="h-4 w-4" /> Das ist ein eigenes Testkonto, kein echter Kunde
          </label>
          <SubmitButton pendingLabel="Speichert …" className="btn-ghost">Als Testkunde markieren</SubmitButton>
        </form>
      </details>
    );
  }
  return (
    <section className="card px-4 py-3 text-sm" data-testdaten>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-medium">Testdaten</h2>
        {internal ? <span className="badge bg-slate-100 text-slate-700">Testkunde (intern)</span> : null}
        <span className="text-slate-500">
          {has ? "angelegt: Beispiel-Leads mit Chats, Terminen, Abschlüssen und Werbebudget" : "keine"}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <form action={seedDemoAction}>
          <input type="hidden" name="customerId" value={customerId} />
          <SubmitButton pendingLabel="Legt an …" className="btn-primary">{has ? "Neu anlegen" : "Testdaten anlegen"}</SubmitButton>
        </form>
        {has ? (
          <form action={removeDemoAction}>
            <input type="hidden" name="customerId" value={customerId} />
            <SubmitButton pendingLabel="Entfernt …" className="btn-ghost">Testdaten entfernen</SubmitButton>
          </form>
        ) : null}
      </div>
    </section>
  );
}
