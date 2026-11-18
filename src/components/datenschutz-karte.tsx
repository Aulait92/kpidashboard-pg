"use client";

// Karte „Datenschutz-Anfrage“ auf Heute (Betroffenenrechte, Ole 18.11.2026, lib/dsgvo): offene Anfragen mit Frist,
// ganz oben. Tippen öffnet den Kontakt, „Erledigt“ schließt die Anfrage. Ausbau (Banner, Erinnerung) mit D4.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, ShieldAlert } from "lucide-react";
import { Button, Card, CardHeader } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { dsgvoErledigtAction } from "@/app/buyer/dsgvo-actions";
import type { HeuteDsgvo } from "@/lib/dsgvo/server";

const datum = (iso: string) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit" }).format(new Date(iso));

export function DatenschutzKarte({ items, leadUrl }: { items: HeuteDsgvo[]; leadUrl: (id: string) => string }) {
  const [weg, setWeg] = useState<Set<string>>(new Set());
  const [, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const sichtbar = items.filter((i) => !weg.has(i.id));
  if (!sichtbar.length) return null;
  return (
    <Card>
      <CardHeader icon={ShieldAlert} title="Datenschutz-Anfrage" count={sichtbar.length} />
      <ul className="divide-y divide-[color:var(--border)]" data-datenschutz-karte>
        {sichtbar.map((i) => (
          <li key={i.id} className="flex items-center gap-3 py-3">
            <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" />
            <div className="min-w-0 flex-1">
              {i.leadId ? (
                <Link href={leadUrl(i.leadId)} className="block truncate font-medium hover:underline">
                  {i.name}
                </Link>
              ) : (
                <div className="truncate font-medium">{i.name}</div>
              )}
              <p className={`truncate text-xs ${i.ueberfaellig ? "font-semibold text-rose-700" : "text-[color:var(--muted)]"}`}>
                {i.art} · Antwort bis {datum(i.fristBis)}
              </p>
            </div>
            <Button
              variant="secondary"
              icon={Check}
              onClick={() =>
                start(async () => {
                  setWeg((s) => new Set(s).add(i.id));
                  const r = await dsgvoErledigtAction(i.id);
                  if (!r.ok) {
                    setWeg((s) => {
                      const n = new Set(s);
                      n.delete(i.id);
                      return n;
                    });
                    toast.show({ message: r.error ?? "Nicht gespeichert.", tone: "error" });
                  } else toast.show({ message: `${i.name}: Anfrage erledigt` });
                  router.refresh();
                })
              }
            >
              Erledigt
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
