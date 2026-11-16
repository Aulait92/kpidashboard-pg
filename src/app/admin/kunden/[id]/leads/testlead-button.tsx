"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";
import { deleteTestLeadAdminAction, sendTestLeadAction } from "./testlead-actions";

const PHONE_KEY = "pg.testlead.phone";
const field = "h-11 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-base outline-none focus:border-[color:var(--brand)]";

/**
 * Admin → Kunde → Leads: „Testlead schicken“. Ein Lead an die eigene Nummer läuft durch den echten Ablauf
 * (Push, Erstanschreiben, Assistent, Termin), zählt aber nirgends. Bei echten Kunden mit Rückfrage.
 */
export function TestLeadButton({
  customerId,
  testCustomer,
  products,
  defaultPhone,
}: {
  customerId: string;
  testCustomer: boolean;
  products: string[];
  defaultPhone: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"form" | "confirm" | "done">("form");
  const [name, setName] = useState("Test Lead");
  const [product, setProduct] = useState(products[0] ?? "");
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Zuletzt genutzte Nummer (nur in diesem Browser), beim Öffnen vorbelegen
  const openSheet = () => {
    if (!phone && !defaultPhone) {
      try {
        const saved = window.localStorage.getItem(PHONE_KEY);
        if (saved) setPhone(saved);
      } catch {
        /* Speicher gesperrt */
      }
    }
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setStep("form");
    setError(null);
    setDone(null);
  };

  const send = (confirmed: boolean) => {
    setError(null);
    start(async () => {
      const r = await sendTestLeadAction({ customerId, name, product, phone, confirmed });
      if (!r.ok) {
        if (r.needsConfirm) setStep("confirm");
        else {
          setStep("form");
          setError(r.error);
        }
        return;
      }
      try {
        window.localStorage.setItem(PHONE_KEY, phone);
      } catch {
        /* Speicher gesperrt */
      }
      setDone(r.outreach);
      setStep("done");
      router.refresh();
    });
  };

  return (
    <>
      <Button icon={FlaskConical} onClick={openSheet} data-testlead-open>
        Testlead schicken
      </Button>
      <Sheet open={open} onClose={close} title="Testlead schicken" message="Läuft wie ein echter Lead, zählt aber nirgends.">
        {step === "form" ? (
          <form
            className="space-y-3 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              send(testCustomer);
            }}
          >
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Produkt</span>
              <select value={product} onChange={(e) => setProduct(e.target.value)} className={field} required>
                {products.length === 0 ? <option value="">Kein Produkt</option> : null}
                {products.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Deine Handynummer</span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0151 12345678"
                inputMode="tel"
                autoComplete="tel"
                className={field}
                required
              />
              <span className="mt-1 block text-xs text-[color:var(--muted)]">Dorthin schreibt der Assistent per WhatsApp.</span>
            </label>
            {error ? <p className="text-sm font-medium text-rose-700">{error}</p> : null}
            <Button type="submit" variant="primary" size="md" disabled={pending || !product} className="w-full">
              {pending ? "Wird geschickt…" : "Testlead schicken"}
            </Button>
          </form>
        ) : step === "confirm" ? (
          <div className="space-y-3 p-5" data-testlead-confirm>
            <p className="text-[15px] font-semibold">Der Kunde sieht diesen Lead</p>
            <p className="text-sm text-[color:var(--muted)]">Er bekommt Push und Mail, der Lead steht mit Abzeichen „Test“ in seinen Kontakten.</p>
            {error ? <p className="text-sm font-medium text-rose-700">{error}</p> : null}
            <div className="grid grid-cols-2 gap-2">
              <Button size="md" onClick={() => setStep("form")} disabled={pending}>
                Zurück
              </Button>
              <Button variant="primary" size="md" onClick={() => send(true)} disabled={pending}>
                {pending ? "Wird geschickt…" : "Trotzdem schicken"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 p-5" data-testlead-done>
            <p className="text-[15px] font-semibold text-emerald-700">Testlead ist angelegt.</p>
            {done ? <p className="text-sm">{done}</p> : null}
            <Button variant="primary" size="md" onClick={close} className="w-full">
              Fertig
            </Button>
          </div>
        )}
      </Sheet>
    </>
  );
}

/** Löschen-Knopf für einen Testlead in der Liste. */
export function TestLeadDeleteButton({ customerId, leadId }: { customerId: string; leadId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Testlead mit Chat und Termin löschen?")) return;
          start(async () => {
            const r = await deleteTestLeadAdminAction(customerId, leadId);
            if (!r.ok) setError(r.error ?? "Löschen hat nicht geklappt.");
            else router.refresh();
          });
        }}
        aria-label="Testlead löschen"
        className="-my-1 inline-flex h-10 min-w-10 shrink-0 items-center justify-center gap-1 text-xs font-medium text-rose-700 hover:underline disabled:opacity-50 sm:h-8 sm:min-w-0"
      >
        <Trash2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{pending ? "Löscht…" : "Löschen"}</span>
      </button>
      {error ? <span className="text-xs text-rose-700">{error}</span> : null}
    </span>
  );
}
