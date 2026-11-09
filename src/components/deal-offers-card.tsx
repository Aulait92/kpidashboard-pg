"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink, FileDown, FileText, Mail, Plus, Send } from "lucide-react";
import { Badge, Button, ButtonLink, Card, CardHeader } from "@/components/ui";
import { markOfferSentAction, sendOfferEmailAction } from "@/app/admin/vertrieb/offer-actions";

export type DealOfferRow = {
  id: string;
  number: string;
  version: number;
  status: string;
  token: string;
  email: string | null;
  setupFee: number;
  monthlyFee: number;
  createdAt: string;
  sentAt: string | null;
  viewedAt: string | null;
  acceptedAt: string | null;
  acceptedName: string | null;
  validUntil: string;
  paymentStatus: string;
  subscriptionStatus: string | null;
};

const PAYMENT: Record<string, { label: string; tone: "neutral" | "info" | "success" | "warning" | "danger" }> = {
  pending: { label: "Zahlung offen", tone: "warning" },
  processing: { label: "Zahlung in Bestätigung", tone: "info" },
  paid: { label: "Bezahlt", tone: "success" },
  failed: { label: "Zahlung fehlgeschlagen", tone: "danger" },
};
const SUB: Record<string, string> = {
  active: "Abo aktiv",
  past_due: "Abo: Zahlung überfällig",
  unpaid: "Abo: unbezahlt",
  canceled: "Abo beendet",
  incomplete: "Abo: Zahlung ausstehend",
  paused: "Abo pausiert",
};

const STATUS: Record<string, { label: string; tone: "neutral" | "info" | "success" | "warning" | "danger" }> = {
  draft: { label: "Entwurf", tone: "neutral" },
  sent: { label: "Verschickt", tone: "info" },
  accepted: { label: "Angenommen", tone: "success" },
  declined: { label: "Abgelehnt", tone: "danger" },
  superseded: { label: "Ersetzt", tone: "neutral" },
};

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

export function DealOffersCard({ newOfferHref, offers, appUrl }: { newOfferHref: string; offers: DealOfferRow[]; appUrl: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 4000);
  };
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const current = offers.find((o) => o.status !== "superseded");
  const older = offers.filter((o) => o !== current);

  function run(id: string, fn: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    setBusy(id);
    start(async () => {
      const res = await fn();
      setBusy(null);
      if (!res.ok) {
        alert(res.error ?? "Fehler");
        return;
      }
      flash(success);
      router.refresh();
    });
  }

  return (
    <div id="angebot">
      <Card>
        <CardHeader
          title="Angebot"
          icon={FileText}
          actions={<ButtonLink href={newOfferHref} variant={current ? "secondary" : "primary"} icon={Plus}>{current ? "Neue Version" : "Angebot erstellen"}</ButtonLink>}
        />
        {!current ? (
          <p className="px-5 py-4 text-sm text-[color:var(--muted)]">Noch kein Angebot. Erstelle es direkt im Gespräch. Der Interessent kann es online annehmen.</p>
        ) : (
          <div className="space-y-3 px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{current.number}</span>
              {current.version > 1 ? <span className="text-xs text-[color:var(--muted)]">Version {current.version}</span> : null}
              <Badge tone={STATUS[current.status]?.tone ?? "neutral"}>{STATUS[current.status]?.label ?? current.status}</Badge>
              {PAYMENT[current.paymentStatus] ? (
                <Badge tone={PAYMENT[current.paymentStatus].tone}>{PAYMENT[current.paymentStatus].label}</Badge>
              ) : null}
              {current.subscriptionStatus ? <Badge tone={current.subscriptionStatus === "active" ? "success" : "warning"}>{SUB[current.subscriptionStatus] ?? `Abo: ${current.subscriptionStatus}`}</Badge> : null}
            </div>
            <div className="text-sm text-[color:var(--muted)]">
              {eur(current.setupFee)} Setup · {eur(current.monthlyFee)} / Monat (netto) · gültig bis {fmt(current.validUntil).split(",")[0]}
            </div>
            <ul className="space-y-0.5 text-xs text-[color:var(--muted)]">
              <li>Erstellt {fmt(current.createdAt)}</li>
              {current.sentAt ? <li>Verschickt {fmt(current.sentAt)}</li> : null}
              {current.viewedAt ? <li>Vom Interessenten geöffnet {fmt(current.viewedAt)}</li> : null}
              {current.acceptedAt ? <li className="font-medium text-emerald-700">Angenommen {fmt(current.acceptedAt)} von {current.acceptedName}</li> : null}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button
                icon={Copy}
                onClick={() => {
                  navigator.clipboard.writeText(`${appUrl}/angebot/${current.token}`);
                  flash("Link kopiert");
                }}
              >
                Link kopieren
              </Button>
              <ButtonLink href={`/angebot/${current.token}`} external icon={ExternalLink}>Ansehen</ButtonLink>
              <ButtonLink href={`/angebot/${current.token}/pdf`} external icon={FileDown}>PDF</ButtonLink>
              {current.status === "draft" || current.status === "sent" ? (
                <>
                  <Button
                    icon={Mail}
                    disabled={pending || !current.email}
                    title={current.email ? `An ${current.email}` : "Keine E-Mail im Angebot"}
                    onClick={() => run(current.id, () => sendOfferEmailAction(current.id), `Angebot an ${current.email} gesendet`)}
                  >
                    {busy === current.id ? "Sende …" : "Per E-Mail senden"}
                  </Button>
                  {current.status === "draft" ? (
                    <Button icon={Send} variant="ghost" disabled={pending} onClick={() => run(current.id, () => markOfferSentAction(current.id), "Als verschickt markiert")}>
                      Als verschickt markieren
                    </Button>
                  ) : null}
                </>
              ) : null}
            </div>
            {msg ? <p className="text-xs font-medium text-emerald-700">{msg}</p> : null}
          </div>
        )}
        {older.length ? (
          <div className="border-t border-[color:var(--border)] px-5 py-3 text-xs text-[color:var(--muted)]">
            Frühere Versionen:{" "}
            {older.map((o, i) => (
              <span key={o.id}>
                {i ? ", " : ""}
                <Link href={`/angebot/${o.token}`} target="_blank" className="underline">{o.number}</Link>
              </span>
            ))}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
