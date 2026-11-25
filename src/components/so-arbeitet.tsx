// „So arbeitet Ihr Assistent“ (Paket P8, Ole 17.11.2026): Zeitleiste mit drei Spuren (Kunde, Assistent, Sie) und
// Beispielchat in WhatsApp-Optik (aus Sicht des Kunden auf seinem Handy). Daten aus lib/so-arbeitet.ts, dieselben
// Textfunktionen wie der Assistent. Ohne Client-Code: genutzt in der Einrichtung und unter Einstellungen → Assistent →
// Ablauf. Handy zuerst: einspaltig, Spuren als drei schmale Linien links, Chat in einem Rahmen mit eigener Scrollfläche.

import Link from "next/link";
import { CheckCheck, ChevronDown, FileText } from "lucide-react";
import { waFormatKnoten } from "@/lib/wa-format";
import { SPUR_NAME, type ChatZeile, type Moment, type Spur } from "@/lib/so-arbeitet";
import type { SoArbeitetDaten } from "@/lib/so-arbeitet-server";
import { cn } from "@/lib/utils";

const SPUREN: Spur[] = ["lead", "assistent", "sie"];
const PUNKT: Record<Spur, string> = {
  lead: "bg-slate-400",
  assistent: "bg-emerald-500",
  sie: "bg-[color:var(--brand)]",
};
const ETIKETT: Record<Spur, string> = {
  lead: "bg-slate-100 text-slate-700",
  assistent: "bg-emerald-50 text-emerald-800",
  sie: "bg-[color:var(--brand-soft)] text-[color:var(--brand)]",
};

/** Zeitleiste: je Zeile ein Punkt in der Spur des Handelnden; Ihre Momente hervorgehoben und nummeriert. */
export function AssistentZeitleiste({ momente }: { momente: Moment[] }) {
  return (
    <div data-so-arbeitet-zeitleiste>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[13px] font-medium" aria-hidden>
        {SPUREN.map((s) => (
          <span key={s} className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1", ETIKETT[s])}>
            <span className={cn("h-2 w-2 rounded-full", PUNKT[s])} />
            {SPUR_NAME[s]}
          </span>
        ))}
      </div>
      <ol className="relative">
        {/* Drei Spuren als feine Linien */}
        {SPUREN.map((s, i) => (
          <span key={s} aria-hidden className="absolute bottom-3 top-3 w-px bg-[color:var(--border)]" style={{ left: 9 + i * 16 }} />
        ))}
        {momente.map((m) => {
          const i = SPUREN.indexOf(m.spur);
          const sie = m.spur === "sie";
          return (
            <li key={m.key} className="relative flex items-stretch gap-3 py-1" data-moment={m.key} data-spur={m.spur}>
              <span className="relative w-[50px] shrink-0" aria-hidden>
                {sie ? (
                  <span
                    className="absolute top-[11px] flex h-5 w-5 items-center justify-center rounded-full bg-[color:var(--brand)] text-xs font-bold text-white ring-2 ring-white"
                    style={{ left: i * 16 - 1 }}
                  >
                    {m.nr}
                  </span>
                ) : (
                  <span className={cn("absolute top-[17px] h-2.5 w-2.5 rounded-full ring-2 ring-white", PUNKT[m.spur])} style={{ left: 4.5 + i * 16 }} />
                )}
              </span>
              <div
                className={cn(
                  "min-w-0 flex-1 rounded-[var(--radius-md)] px-3 py-2",
                  sie ? "border border-[color:var(--brand)]/25 bg-[color:var(--brand-soft)]/60" : "",
                )}
              >
                <p className="text-[13px] text-[color:var(--muted)]">
                  <span className="sr-only">{SPUR_NAME[m.spur]}, </span>
                  {m.wann}
                </p>
                <p className={cn("text-[15px] font-semibold leading-snug", sie && "text-[color:var(--foreground)]")}>{m.titel}</p>
                <p className="text-sm text-[color:var(--muted)]">{m.text}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Lange Nachricht (z. B. Einwilligung) wie in WhatsApp gekürzt mit „Weiterlesen“. */
function Text({ text }: { text: string }) {
  if (text.length <= 320) return <span className="whitespace-pre-wrap">{waFormatKnoten(text)}</span>;
  return (
    <details className="group">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <span className="whitespace-pre-wrap group-open:hidden">
          {text.slice(0, 180).replace(/\s+\S*$/, "")} … <span className="font-medium text-sky-700">Weiterlesen</span>
        </span>
      </summary>
      <span className="whitespace-pre-wrap">{waFormatKnoten(text)}</span>
    </details>
  );
}

/**
 * Beispielchat in WhatsApp-Optik: Kopf mit Absender, Verlauf auf dem bekannten beigen Hintergrund, Nachrichten des
 * Assistenten links (weiß), die des Kunden rechts (grün), Knöpfe unter der Blase wie bei WhatsApp.
 */
export function BeispielChat({ zeilen, absender, hoehe = "max-h-[560px]" }: { zeilen: ChatZeile[]; absender: string; hoehe?: string }) {
  return (
    <div className="mx-auto w-full max-w-[400px] overflow-hidden rounded-[24px] border border-[color:var(--border)] bg-white shadow-[var(--shadow-md)]" data-beispiel-chat>
      <div className="flex items-center gap-3 bg-[#008069] px-4 py-2.5 text-white">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-semibold" aria-hidden>
          {absender.trim().charAt(0).toUpperCase() || "A"}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold">{absender}</span>
          <span className="block text-xs text-white/80">KI-Assistent</span>
        </span>
      </div>
      <div className={cn("space-y-1.5 overflow-y-auto bg-[#efeae2] px-3 py-3", hoehe)} tabIndex={0} aria-label="Beispielchat">
        {zeilen.map((z, n) =>
          z.art === "hinweis" ? (
            <p key={n} className="mx-auto w-fit rounded-md bg-white/90 px-2.5 py-1 text-center text-xs font-medium text-slate-600 shadow-sm">
              {z.text}
            </p>
          ) : (
            <div key={n} className={cn("flex", z.von === "lead" ? "justify-end" : "justify-start")} data-chat-von={z.von}>
              <div className="max-w-[85%]">
                <div
                  className={cn(
                    "rounded-lg px-2.5 pb-1 pt-1.5 text-[14px] leading-snug text-slate-900 shadow-sm",
                    z.von === "lead" ? "rounded-tr-none bg-[#d9fdd3]" : "rounded-tl-none bg-white",
                  )}
                >
                  {z.anhang ? (
                    <span className="mb-1.5 flex items-center gap-2 rounded-md bg-slate-100 px-2 py-1.5 text-xs text-slate-700">
                      <FileText className="h-4 w-4 shrink-0 text-rose-600" /> {z.anhang}
                    </span>
                  ) : null}
                  {z.text ? <Text text={z.text} /> : null}
                  {z.fusszeile ? <span className="mt-1 block text-xs text-slate-500">{z.fusszeile}</span> : null}
                  <span className="mt-0.5 flex items-center justify-end gap-1 text-xs text-slate-500">
                    {z.zeit}
                    {z.von === "lead" ? <CheckCheck className="h-3.5 w-3.5 text-sky-500" /> : null}
                  </span>
                </div>
                {z.knoepfe?.length ? (
                  <div className="mt-0.5 grid gap-0.5">
                    {z.knoepfe.map((k) => (
                      <span key={k} className="rounded-lg bg-white py-1.5 text-center text-[13.5px] font-medium text-[#027eb5] shadow-sm">
                        {k}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

/** Auswahl des Produkts für das Beispiel (nur bei mehreren Produkten), als Links. */
export function ProduktWahl({ produkte, aktiv, href }: { produkte: string[]; aktiv: string; href: (p: string) => string }) {
  if (produkte.length < 2) return null;
  return (
    <div className="mb-3 flex flex-wrap justify-center gap-1.5" data-produkt-wahl>
      {produkte.slice(0, 6).map((p) => (
        <Link
          key={p}
          href={href(p)}
          scroll={false}
          aria-current={p === aktiv ? "true" : undefined}
          className={cn(
            "inline-flex min-h-9 items-center rounded-full border px-3 text-sm font-medium transition",
            p === aktiv ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)] text-[color:var(--brand)]" : "border-[color:var(--border)] bg-white text-[color:var(--muted)] hover:text-[color:var(--foreground)]",
          )}
        >
          {p}
        </Link>
      ))}
    </div>
  );
}

/**
 * Ganzer Abschnitt: ein Satz, Zeitleiste, Beispielchat. chat = "offen" (Einrichtung) bzw. "zu" (Ablauf-Seite, dort
 * stehen die Texte zusätzlich je Schritt).
 */
export function SoArbeitet({ d, produktHref, chat = "offen" }: { d: SoArbeitetDaten; produktHref: (p: string) => string; chat?: "offen" | "zu" }) {
  const beispiel = (
    <>
      <ProduktWahl produkte={d.produkte} aktiv={d.produkt} href={produktHref} />
      <BeispielChat zeilen={d.zeilen} absender={d.absender} />
    </>
  );
  return (
    <div className="space-y-6" data-so-arbeitet>
      <p className="text-[15px] text-[color:var(--muted)]">Ihr Assistent schreibt mit Ihren Kunden. Sie sind nur in fünf Momenten gefragt.</p>
      <AssistentZeitleiste momente={d.momente} />
      {chat === "offen" ? (
        <div>
          <h3 className="mb-3 text-[15px] font-semibold">So sieht es Ihr Kunde</h3>
          {beispiel}
        </div>
      ) : (
        <details className="group rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white" data-so-arbeitet-chat>
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-4 text-[15px] font-semibold [&::-webkit-details-marker]:hidden">
            So sieht es Ihr Kunde: Beispiel im Chat
            <ChevronDown className="h-4 w-4 shrink-0 text-[color:var(--muted)] transition group-open:rotate-180" />
          </summary>
          <div className="px-3 pb-4">{beispiel}</div>
        </details>
      )}
    </div>
  );
}
