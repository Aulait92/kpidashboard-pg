"use client";

// Karte „Maklervollmacht“ im Kontakt (nur Makler). Je Zustand genau eine Hauptaktion:
//   noch nichts gesendet: „Per WhatsApp senden“ (Chat da und senden möglich), sonst „Per E-Mail senden“ bzw.
//   „Vollmacht anfordern“ (Link); gesendet: keine Hauptaktion, nur der Stand; unterschrieben: „Schreiben an Versicherer
//   herunterladen“. Seltenes (anderer Weg, Link, Termin, „Eigene Vollmacht liegt vor“) unter „Mehr“.

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronDown, Copy, Download, ExternalLink, Mail, MessageCircle } from "lucide-react";
import { Button, buttonClass } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import {
  vollmachtAnfordernAction,
  vollmachtEigeneAction,
  vollmachtPerMailAction,
  vollmachtPerWhatsAppAction,
  vollmachtSchreibenGesendetAction,
  vollmachtWiderrufenAction,
} from "@/app/buyer/vollmacht-actions";

type Stand = { versicherer: { name: string; vertraege: number; gesendetAm: string | null }[]; offen: number; zeile: string };
type V = {
  id: string;
  status: string;
  link: string;
  abgelaufen: boolean;
  gesendet: boolean;
  unterschrieben: string;
  /** Kopie an den Kunden: gesendet | fehlgeschlagen | keine_adresse | null (alt bzw. unbekannt) */
  kopie: string | null;
  stand: Stand;
  /** Per WhatsApp gesendet am (TT.MM.) */
  waGesendet: string | null;
  /** „Erinnerung geplant am 20.11.“ bzw. „Erinnerung gesendet am 20.11.“ */
  erinnerung: string | null;
};
/** WhatsApp an diesen Kontakt: Chat vorhanden, jetzt möglich, sonst warum nicht */
export type VvWa = { chat: boolean; moeglich: boolean; grund: string | null };

const KOPIE: Record<string, string> = {
  gesendet: "Kopie an den Kunden per E-Mail gesendet",
  fehlgeschlagen: "Kopie per E-Mail fehlgeschlagen, bitte das PDF selbst schicken",
  keine_adresse: "Ohne E-Mail-Adresse, Kopie bitte selbst schicken",
};
const kurzDatum = (iso: string) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit" }).format(new Date(iso));

export function MaklervollmachtAktionen({ leadId, v, readOnly, hatEmail, wa }: { leadId: string; v: V | null; readOnly: boolean; hatEmail: boolean; wa: VvWa }) {
  const toast = useToast();
  const router = useRouter();
  const [busy, start] = useTransition();
  const [link, setLink] = useState<string | null>(v?.status === "offen" && !v.abgelaufen ? v.link : null);
  const datei = useRef<HTMLInputElement | null>(null);

  const melde = (r: { ok: true; message?: string } | { ok: false; error: string }) => {
    toast.show(r.ok ? { message: r.message ?? "Gespeichert" } : { message: r.error, tone: "error" });
    if (r.ok) router.refresh();
  };
  const anfordern = () =>
    start(async () => {
      const r = await vollmachtAnfordernAction(leadId);
      if (!r.ok) return toast.show({ message: r.error, tone: "error" });
      setLink(r.link ?? null);
      router.refresh();
    });
  const perWhatsApp = () =>
    start(async () => {
      const r = await vollmachtPerWhatsAppAction(leadId);
      if (r.ok && r.link) setLink(r.link);
      melde(r);
    });
  const perMail = () =>
    start(async () => {
      // Noch keine Vollmacht: erst den Link anlegen, dann senden
      let id = v?.status === "offen" && !v.abgelaufen ? v.id : null;
      if (!id) {
        const a = await vollmachtAnfordernAction(leadId);
        if (!a.ok) return toast.show({ message: a.error, tone: "error" });
        setLink(a.link ?? null);
        id = a.id ?? null;
      }
      if (!id) return toast.show({ message: "Bitte die Seite neu laden.", tone: "error" });
      melde(await vollmachtPerMailAction(id, leadId));
    });
  const kopieren = async () => {
    let l = link;
    if (!l) {
      const a = await vollmachtAnfordernAction(leadId);
      if (!a.ok) return toast.show({ message: a.error, tone: "error" });
      l = a.link ?? null;
      setLink(l);
    }
    if (!l) return;
    await navigator.clipboard?.writeText(l).catch(() => {});
    toast.show({ message: "Link kopiert" });
  };
  const eigene = (an: boolean) => start(async () => melde(await vollmachtEigeneAction(leadId, an)));
  const ablegen = (f: File | undefined) => {
    if (!f) return;
    start(async () => {
      const res = await fetch(`/api/buyer/leads/${leadId}/dateien?kind=sonstiges`, { method: "POST", headers: { "x-file-name": encodeURIComponent(f.name) }, body: f }).catch(() => null);
      const j = (await res?.json().catch(() => null)) as { error?: string } | null;
      toast.show(res?.ok ? { message: "Unter Dateien im Kontakt abgelegt" } : { message: j?.error ?? "Hochladen hat nicht geklappt.", tone: "error" });
      if (res?.ok) router.refresh();
    });
  };

  if (v?.status === "unterschrieben") {
    return (
      <div className="space-y-3">
        <Uebertragung id={v.id} leadId={leadId} stand={v.stand} readOnly={readOnly} unterschrieben={v.unterschrieben} kopie={v.kopie} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <a href={`/buyer/vollmacht/${v.id}/pdf`} target="_blank" rel="noopener" className="font-medium text-[color:var(--brand)] hover:underline">
            Alle Dokumente (PDF)
          </a>
          {!readOnly ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (!confirm("Hat der Kunde die Vollmacht widerrufen? Die Dokumente bleiben als Nachweis gespeichert.")) return;
                start(async () => melde(await vollmachtWiderrufenAction(v.id, leadId)));
              }}
              className="text-[color:var(--muted)] hover:text-rose-700"
            >
              Widerruf eintragen
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  // Eigene Vollmacht liegt vor: die App schickt nichts
  if (v?.status === "eigene") {
    return (
      <div className="space-y-2" data-vv-eigene-stand>
        <p className="flex items-center gap-1.5 text-[15px] font-semibold">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> Eigene Vollmacht liegt vor
        </p>
        <p className="text-sm text-[color:var(--muted)]">Die App schickt diesem Kunden keine Vollmacht und keine Erinnerung.</p>
        {!readOnly ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <button type="button" disabled={busy} onClick={() => datei.current?.click()} className="font-medium text-[color:var(--brand)] hover:underline" data-vv-eigene-pdf>
              PDF ablegen (optional)
            </button>
            <input ref={datei} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => ablegen(e.target.files?.[0])} />
            <button type="button" disabled={busy} onClick={() => eigene(false)} className="text-[color:var(--muted)] hover:text-[color:var(--foreground)]" data-vv-eigene-zurueck>
              Rückgängig
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  const offen = !!link && !!v && v.status === "offen" && !v.abgelaufen;
  const waGesendet = offen ? v.waGesendet : null;
  // Eine Hauptaktion: WhatsApp (noch nicht gesendet und möglich), sonst E-Mail, sonst Link
  const haupt: "whatsapp" | "mail" | "link" | "anfordern" | null = readOnly
    ? null
    : waGesendet || (offen && v.gesendet)
      ? null
      : wa.moeglich
        ? "whatsapp"
        : hatEmail
          ? "mail"
          : offen
            ? "link"
            : "anfordern";
  const status = waGesendet
    ? `Per WhatsApp gesendet am ${waGesendet}${v?.erinnerung ? ` · ${v.erinnerung}` : ""}`
    : offen && v.gesendet
      ? "Per E-Mail gesendet, wartet auf Unterschrift."
      : offen
        ? "Wartet auf Unterschrift."
        : v?.abgelaufen
          ? "Der Link ist abgelaufen."
          : "Bestehende Verträge des Kunden zu Ihnen holen.";
  // Ehrlicher Hinweis, wenn der Chat da ist, WhatsApp aber gerade nicht geht
  const waHinweis =
    !readOnly && wa.chat && !wa.moeglich && !waGesendet
      ? wa.grund === "fenster_zu"
        ? `Per WhatsApp geht es erst wieder, wenn Ihr Kunde schreibt.${hatEmail ? "" : " Bitte den Link kopieren und selbst schicken."}`
        : `Ihr Kunde möchte keine WhatsApp-Nachrichten.${hatEmail ? "" : " Bitte den Link kopieren und selbst schicken."}`
      : null;

  const mehr: { key: string; label: string; icon: typeof Copy; onClick?: () => void; href?: string }[] = [];
  if (!readOnly && wa.moeglich && haupt !== "whatsapp") mehr.push({ key: "wa", label: waGesendet ? "Erneut per WhatsApp senden" : "Per WhatsApp senden", icon: MessageCircle, onClick: perWhatsApp });
  if (!readOnly && hatEmail && haupt !== "mail") mehr.push({ key: "mail", label: offen && v.gesendet ? "Erneut per E-Mail senden" : "Per E-Mail senden", icon: Mail, onClick: perMail });
  if (haupt !== "link") mehr.push({ key: "link", label: "Link kopieren", icon: Copy, onClick: kopieren });
  if (link) mehr.push({ key: "termin", label: "Im Termin öffnen", icon: ExternalLink, href: link });

  return (
    <div className="space-y-3" data-vv-offen>
      <p className="text-sm text-[color:var(--muted)]" data-vv-status>
        {status}
      </p>
      {waHinweis ? (
        <p className="rounded-[var(--radius-sm)] bg-amber-50 px-3 py-2 text-sm text-amber-900" data-vv-wa-hinweis>
          {waHinweis}
        </p>
      ) : null}
      {haupt === "whatsapp" ? (
        <Button variant="primary" size="md" icon={MessageCircle} disabled={busy} onClick={perWhatsApp} className="w-full sm:w-auto" data-vv-whatsapp>
          Per WhatsApp senden
        </Button>
      ) : haupt === "mail" ? (
        <Button variant="primary" size="md" icon={Mail} disabled={busy} onClick={perMail} className="w-full sm:w-auto" data-vv-mail>
          Per E-Mail senden
        </Button>
      ) : haupt === "link" ? (
        <Button variant="primary" size="md" icon={Copy} onClick={kopieren} className="w-full sm:w-auto" data-vv-kopieren>
          Link kopieren
        </Button>
      ) : haupt === "anfordern" ? (
        <Button variant="primary" size="md" disabled={busy} onClick={anfordern} className="w-full sm:w-auto" data-vv-anfordern>
          {v?.abgelaufen ? "Neuen Link erstellen" : "Vollmacht anfordern"}
        </Button>
      ) : null}
      <details className="group text-sm" data-vv-mehr>
        <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1 font-medium text-[color:var(--muted)] hover:text-[color:var(--foreground)] [&::-webkit-details-marker]:hidden">
          Mehr <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
        </summary>
        <div className="mt-1 space-y-1">
          <div className="flex flex-wrap gap-2">
            {mehr.map((m) =>
              m.href ? (
                <a key={m.key} href={m.href} target="_blank" rel="noopener" className={buttonClass("secondary", "sm")}>
                  <m.icon className="h-4 w-4" /> {m.label}
                </a>
              ) : (
                <Button key={m.key} variant="secondary" size="sm" icon={m.icon} disabled={busy} onClick={m.onClick} data-vv-mehr-aktion={m.key}>
                  {m.label}
                </Button>
              ),
            )}
          </div>
          {!readOnly ? (
            <label className="flex min-h-10 cursor-pointer items-center gap-3 pt-1" data-vv-eigene>
              <input type="checkbox" className="h-5 w-5 shrink-0 accent-[color:var(--brand)]" checked={false} disabled={busy} onChange={() => eigene(true)} />
              <span>Eigene Vollmacht liegt bereits vor</span>
            </label>
          ) : null}
        </div>
      </details>
    </div>
  );
}

/**
 * Nach der Unterschrift (Ole, 18.11.2026): klare Aufgabe statt Statuszeile. Eine Hauptaktion „Schreiben an Versicherer
 * herunterladen“ (alle noch offenen in einer Datei), je Versicherer offen/gesendet zum Abhaken (gespeichert).
 */
function Uebertragung({ id, leadId, stand, readOnly, unterschrieben, kopie }: { id: string; leadId: string; stand: Stand; readOnly: boolean; unterschrieben: string; kopie: string | null }) {
  const toast = useToast();
  const [busy, start] = useTransition();
  const [gesendet, setGesendet] = useState<Record<string, string | null>>(() => Object.fromEntries(stand.versicherer.map((g) => [g.name, g.gesendetAm])));
  const zeilen = stand.versicherer.map((g) => ({ ...g, gesendetAm: gesendet[g.name] ?? null }));
  const offen = zeilen.filter((g) => !g.gesendetAm);
  const gesamt = zeilen.reduce((s, g) => s + g.vertraege, 0);
  const offenVertraege = offen.reduce((s, g) => s + g.vertraege, 0);
  const vt = (n: number) => `${n} ${n === 1 ? "Vertrag" : "Verträge"}`;
  // Zeile wie uebertragungsStand (lib/maklervollmacht/regeln.ts), hier mit dem abgehakten Stand ohne Neuladen
  const zeile = offenVertraege === 0 ? `${vt(gesamt)}, alle Schreiben gesendet` : offenVertraege === gesamt ? `${vt(gesamt)}, noch nicht übertragen` : `${vt(offenVertraege)} von ${gesamt} noch nicht übertragen`;

  const abhaken = (name: string, an: boolean) => {
    const vorher = gesendet[name] ?? null;
    setGesendet((s) => ({ ...s, [name]: an ? new Date().toISOString() : null }));
    start(async () => {
      const r = await vollmachtSchreibenGesendetAction(id, leadId, name, an);
      if (!r.ok) {
        setGesendet((s) => ({ ...s, [name]: vorher }));
        toast.show({ message: r.error, tone: "error" });
      }
    });
  };

  return (
    <>
      <div>
        <p className="flex items-center gap-1.5 text-[15px] font-semibold" data-vv-stand>
          {offen.length === 0 ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : null}
          {zeile}
        </p>
        <p className="mt-0.5 text-xs text-[color:var(--muted)]">
          Unterschrieben am {unterschrieben}
          {kopie && KOPIE[kopie] ? <span className={kopie === "gesendet" ? undefined : "text-amber-700"}> · {KOPIE[kopie]}</span> : null}
        </p>
      </div>
      {offen.length ? (
        <a href={`/buyer/vollmacht/${id}/pdf?offen=1`} target="_blank" rel="noopener" className={buttonClass("primary", "md", "w-full sm:w-auto")} data-vv-alle-schreiben>
          <Download className="h-4 w-4 shrink-0" /> Schreiben an Versicherer herunterladen
        </a>
      ) : null}
      <ul className="divide-y divide-[color:var(--border)] rounded-[var(--radius-md)] border border-[color:var(--border)]">
        {zeilen.map((g) => (
          <li key={g.name} className="flex items-center gap-3 px-3 py-1.5 text-sm" data-vv-versicherer-zeile>
            <label className="flex min-h-10 min-w-0 flex-1 cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                className="h-5 w-5 shrink-0 accent-[color:var(--brand)]"
                checked={!!g.gesendetAm}
                disabled={readOnly || busy}
                onChange={(e) => abhaken(g.name, e.target.checked)}
                aria-label={`Schreiben an ${g.name} gesendet`}
                data-vv-gesendet
              />
              <span className="min-w-0">
                <span className={`block truncate font-medium ${g.gesendetAm ? "text-[color:var(--muted)]" : ""}`}>{g.name}</span>
                <span className="block text-xs text-[color:var(--muted)]">
                  {vt(g.vertraege)} · {g.gesendetAm ? `gesendet am ${kurzDatum(g.gesendetAm)}` : "offen"}
                </span>
              </span>
            </label>
            <a
              href={`/buyer/vollmacht/${id}/pdf?v=${encodeURIComponent(g.name)}`}
              target="_blank"
              rel="noopener"
              className={buttonClass("ghost", "sm", "shrink-0")}
              aria-label={`Schreiben an ${g.name} herunterladen`}
              title="Nur dieses Schreiben"
              data-vv-schreiben
            >
              <Download className="h-4 w-4" />
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
