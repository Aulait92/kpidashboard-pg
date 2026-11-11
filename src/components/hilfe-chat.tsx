"use client";

// KI-Hilfe im Kundenbereich: Knopf „Hilfe“ in der Kopfzeile, Fenster mit
// Vorschlägen passend zur Seite, freie Fragen, Links an die richtige Stelle,
// Bewertung (hilfreich ja/nein). Antworten kommen von /api/hilfe.
// Kann die KI nicht helfen (Abrechnung, Vertrag, Fehler, fehlende Daten, Frust)
// oder tippt man „Mit Mensch sprechen“, erscheint eine Karte mit Kontakt zu
// unserem Team: WhatsApp (vorbefüllt mit Anliegen und Referenz) und E-Mail.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, LifeBuoy, Mail, MessageCircle, SendHorizontal, Sparkles, ThumbsDown, ThumbsUp, UserRound, X } from "lucide-react";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/** Antwort von /api/hilfe bzw. /api/hilfe/escalate (siehe lib/support-server.ts). */
type Escalation = {
  id: string;
  ref: string;
  summary: string;
  responseTime: string;
  whatsappUrl: string | null;
  mailtoUrl: string | null;
};

type Msg =
  | { who: "me"; text: string }
  | {
      who: "ai";
      text: string;
      links?: { href: string; label: string }[];
      id?: string | null;
      rating?: "up" | "down";
      error?: boolean;
      escalation?: Escalation | null;
    };

function suggestionsFor(path: string, owner: boolean): string[] {
  if (/^\/buyer\/leads\/./.test(path)) return ["Wie reklamiere ich einen Lead?", "Wie setze ich eine Wiedervorlage?", "Wie gebe ich den Lead einem Kollegen?"];
  if (path.startsWith("/buyer/chats")) return ["Warum kann ich nicht frei schreiben?", "Wie übernehme ich ein Gespräch vom Assistenten?"];
  if (path.startsWith("/buyer/kanban")) return ["Wie ändere ich die Phase?", "Was bedeutet „Kein nächster Schritt“?"];
  if (path.startsWith("/buyer/leads")) return ["Wie finde ich einen Lead?", "Was heißt „Ohne nächsten Schritt“?"];
  if (path.startsWith("/buyer/zahlen")) return ["Wie wird die Hochrechnung berechnet?", "Was zählt als Abschluss?"];
  if (path.startsWith("/buyer/bestellen")) return ["Wie bestelle ich jede Woche automatisch?", "Wie bekomme ich eine Gutschrift?"];
  if (path.startsWith("/buyer/bestand")) return ["Wie lade ich meine Kundenliste hoch?", "Wann werden Kampagnen verschickt?"];
  if (path.startsWith("/buyer/einrichtung")) return ["Wie gebe ich den Meta-Zugriff frei?", "Wie bekomme ich die App aufs iPhone?"];
  return [
    "Warum bekomme ich keine Benachrichtigungen?",
    "Wie trage ich ein, wie ein Termin lief?",
    owner ? "Wie pausiere ich im Urlaub?" : "Wie verschiebe ich einen Termin?",
  ];
}

export function HilfeChat({
  firstName,
  owner,
  variant = "pill",
}: {
  firstName: string;
  owner: boolean;
  /** „nav“: als Zeile in der Seitenleiste der neuen Oberfläche. */
  variant?: "pill" | "nav";
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Öffnen von außen (z. B. „Hilfe“ im Profilmenü). Es können zwei Instanzen
  // eingebunden sein (Handy-Kopfzeile, Seitenleiste) – nur die sichtbare reagiert.
  useEffect(() => {
    const onOpen = () => {
      if (triggerRef.current && triggerRef.current.offsetParent !== null) setOpen(true);
    };
    window.addEventListener("pg-hilfe-open", onOpen);
    return () => window.removeEventListener("pg-hilfe-open", onOpen);
  }, []);
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [msgs, busy, open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => {
      document.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [open]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const history = msgs
      .filter((m) => !(m.who === "ai" && m.error))
      .map((m) => ({ role: m.who === "me" ? "user" : "assistant", text: m.text }));
    setMsgs((m) => [...m, { who: "me", text: q }]);
    setInput("");
    setBusy(true);
    haptic("selection");
    try {
      const res = await fetch("/api/hilfe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history, page: pathname }),
      });
      const data = (await res.json()) as {
        id?: string | null;
        answer?: string;
        links?: { href: string; label: string }[];
        escalation?: Escalation | null;
        error?: string;
      };
      if (!res.ok || !data.answer) throw new Error(data.error ?? "Das hat nicht geklappt. Bitte noch einmal versuchen.");
      setMsgs((m) => [...m, { who: "ai", text: data.answer!, links: data.links ?? [], id: data.id ?? null, escalation: data.escalation ?? null }]);
      haptic(data.escalation ? "notification" : "light");
    } catch (err) {
      setMsgs((m) => [...m, { who: "ai", text: err instanceof Error ? err.message : "Das hat nicht geklappt.", error: true }]);
      haptic("error");
    } finally {
      setBusy(false);
    }
  }

  // „Mit Mensch sprechen“: Weitergabe ohne KI anbieten (letzte Fragen als Anliegen).
  async function human() {
    if (busy) return;
    haptic("selection");
    setBusy(true);
    try {
      const questions = msgs.filter((m) => m.who === "me").map((m) => m.text);
      const res = await fetch("/api/hilfe/escalate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions, page: pathname }),
      });
      const data = (await res.json()) as { escalation?: Escalation; error?: string };
      if (!res.ok || !data.escalation) throw new Error(data.error ?? "Das hat nicht geklappt. Bitte noch einmal versuchen.");
      setMsgs((m) => [...m, { who: "ai", text: "Gern. Unser Team hilft Ihnen persönlich weiter.", escalation: data.escalation }]);
      haptic("notification");
    } catch (err) {
      setMsgs((m) => [...m, { who: "ai", text: err instanceof Error ? err.message : "Das hat nicht geklappt.", error: true }]);
      haptic("error");
    } finally {
      setBusy(false);
    }
  }

  async function rate(i: number, rating: "up" | "down") {
    const m = msgs[i];
    if (m.who !== "ai" || !m.id) return;
    setMsgs((all) => all.map((x, j) => (j === i && x.who === "ai" ? { ...x, rating } : x)));
    haptic("selection");
    await fetch("/api/hilfe", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: m.id, rating }) }).catch(() => {});
  }

  const asked = new Set(msgs.filter((m) => m.who === "me").map((m) => m.text));
  const chips = suggestionsFor(pathname, owner).filter((q) => !asked.has(q));
  const offered = msgs.some((m) => m.who === "ai" && m.escalation);

  return (
    <>
      {variant === "nav" ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-11 w-full items-center gap-3 rounded-[var(--radius-sm)] px-3 text-[15px] font-medium text-[color:var(--foreground)] transition hover:bg-[color:var(--surface-sunken)]"
          aria-label="KI-Hilfe: Fragen zur App"
        >
          <Sparkles className="h-5 w-5 text-[color:var(--brand)]" />
          <span>KI-Hilfe</span>
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[color:var(--brand-soft)] px-3 text-sm font-semibold text-[color:var(--brand-dark)] transition hover:brightness-95"
          aria-label="KI-Hilfe: Fragen zur App"
        >
          <Sparkles className="h-4 w-4" />
          <span>Hilfe</span>
        </button>
      )}

      {/* Portal: die Kopfzeile hat backdrop-blur und wäre sonst der Bezugsrahmen für „fixed“. */}
      {open ? createPortal(
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30 sm:bg-black/20" onClick={() => setOpen(false)}>
          <section
            role="dialog"
            aria-label="KI-Hilfe"
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-full flex-col bg-[color:var(--background)] shadow-2xl sm:max-w-[420px] sm:border-l sm:border-[color:var(--border)]"
          >
            <header className="flex items-center gap-3 border-b border-[color:var(--border)] bg-white px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--brand-soft)] text-[color:var(--brand)]">
                <Sparkles className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">KI-Hilfe</div>
                <div className="truncate text-xs text-[color:var(--muted)]">Antwortet sofort · kennt die App</div>
              </div>
              <button
                type="button"
                onClick={() => void human()}
                disabled={busy}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-[color:var(--border)] px-3 text-[13px] font-semibold text-[color:var(--foreground)] hover:border-[color:var(--brand)] disabled:opacity-50"
              >
                <UserRound className="h-4 w-4" /> <span>Mit Mensch sprechen</span>
              </button>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full p-2 text-[color:var(--muted)] hover:bg-[color:var(--surface-sunken)]" aria-label="Hilfe schließen">
                <X className="h-5 w-5" />
              </button>
            </header>

            <div ref={bodyRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              <AiBubble text={`Hallo${firstName ? ` ${firstName}` : ""}! Ich bin die KI-Hilfe. Fragen Sie mich alles zur App – zum Beispiel, wie Sie einen Lead reklamieren oder einen Termin verschieben.`} />
              {msgs.map((m, i) =>
                m.who === "me" ? (
                  <div key={i} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-tr-md bg-[color:var(--brand)] px-3 py-2 text-[14.5px] text-white">
                    {m.text}
                  </div>
                ) : (
                  <AiBubble key={i} text={m.text} error={m.error}>
                    {m.links?.length ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {m.links.map((l) => (
                          <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-lg bg-[color:var(--brand-soft)] px-2.5 py-1.5 text-[13px] font-semibold text-[color:var(--brand-dark)]">
                            {l.label} →
                          </Link>
                        ))}
                      </div>
                    ) : null}
                    {m.escalation ? <EscalationCard e={m.escalation} /> : null}
                    {m.id ? (
                      m.rating ? (
                        m.rating === "up" || m.escalation ? (
                          <p className="mt-1.5 text-xs text-[color:var(--muted)]">Danke für Ihr Feedback!</p>
                        ) : (
                          <p className="mt-1.5 text-xs text-[color:var(--muted)]">
                            Schade.{" "}
                            <button type="button" onClick={() => void human()} className="font-semibold text-[color:var(--brand)] hover:underline">
                              Mit unserem Team sprechen
                            </button>
                          </p>
                        )
                      ) : (
                        <div className="mt-1 flex items-center gap-1 text-xs text-[color:var(--muted)]">
                          Hilfreich?
                          <button type="button" onClick={() => void rate(i, "up")} className="rounded-md p-1 hover:bg-[color:var(--surface-sunken)]" aria-label="Ja, hilfreich"><ThumbsUp className="h-3.5 w-3.5" /></button>
                          <button type="button" onClick={() => void rate(i, "down")} className="rounded-md p-1 hover:bg-[color:var(--surface-sunken)]" aria-label="Nein, nicht hilfreich"><ThumbsDown className="h-3.5 w-3.5" /></button>
                        </div>
                      )
                    ) : null}
                  </AiBubble>
                ),
              )}
              {busy ? (
                <div className="flex items-center gap-2 text-sm text-[color:var(--muted)]">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[color:var(--brand-soft)] text-[color:var(--brand)]"><Sparkles className="h-4 w-4" /></span>
                  <span className="animate-pulse">schreibt …</span>
                </div>
              ) : null}
              {!busy && chips.length && !offered ? (
                <div className="flex flex-col items-end gap-1.5 pt-1">
                  {chips.map((q) => (
                    <button key={q} type="button" onClick={() => void ask(q)} className="rounded-full border border-[color:var(--border-strong)] bg-white px-3 py-1.5 text-right text-[13px] font-medium hover:border-[color:var(--brand)]">
                      {q}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <form
              className="flex gap-2 border-t border-[color:var(--border)] bg-white px-3 pt-2.5"
              onSubmit={(e) => {
                e.preventDefault();
                void ask(input);
              }}
            >
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Frage zur App stellen …"
                aria-label="Frage an die KI-Hilfe"
                maxLength={1000}
                className="h-11 min-w-0 flex-1 rounded-full border border-[color:var(--border)] bg-[color:var(--surface-sunken)] px-4 text-[15px] outline-none focus:border-[color:var(--brand)]"
              />
              <button type="submit" disabled={busy || !input.trim()} className="flex h-11 w-11 items-center justify-center rounded-full bg-[color:var(--brand)] text-white disabled:opacity-50" aria-label="Senden">
                <SendHorizontal className="h-5 w-5" />
              </button>
            </form>
            <p className="flex items-center justify-center gap-1 bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1.5 text-center text-[11px] text-[color:var(--muted)]">
              <LifeBuoy className="h-3 w-3" /> Kennt nur die Anleitung der App. Bitte keine Kundendaten eingeben.
            </p>
          </section>
        </div>,
        document.body,
      ) : null}
    </>
  );
}

function AiBubble({ text, error, children }: { text: string; error?: boolean; children?: React.ReactNode }) {
  return (
    <div className="flex max-w-[94%] items-start gap-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand-soft)] text-[color:var(--brand)]">
        <Sparkles className="h-4 w-4" />
      </span>
      <div>
        <div className={cn("whitespace-pre-line rounded-2xl rounded-tl-md border px-3 py-2 text-[14.5px] leading-relaxed", error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-[color:var(--border)] bg-white")}>
          {text}
        </div>
        {children}
      </div>
    </div>
  );
}

/** Kontakt zu unserem Team: WhatsApp und E-Mail, falls eingerichtet; sonst „An unser Team weitergeben“. */
function EscalationCard({ e }: { e: Escalation }) {
  const [done, setDone] = useState<"whatsapp" | "email" | "team" | null>(null);
  const contact = (channel: "whatsapp" | "email" | "team") => {
    haptic("success");
    setDone(channel);
    // keepalive: Der Link öffnet WhatsApp/Mail sofort, die Meldung an uns läuft im Hintergrund weiter.
    void fetch("/api/hilfe/escalate", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: e.id, channel }),
      keepalive: true,
    }).catch(() => {});
  };
  const btn = "flex h-11 w-full items-center justify-center gap-2 rounded-xl px-3 text-[14.5px] font-semibold transition active:scale-[0.98]";
  return (
    <div className="mt-2 rounded-2xl border border-[color:var(--border)] bg-white p-3">
      <p className="text-[13.5px] font-semibold">Das klärt unser Team gern persönlich.</p>
      <p className="mt-0.5 text-xs text-[color:var(--muted)]">{e.responseTime}</p>
      <div className="mt-2.5 space-y-2">
        {e.whatsappUrl ? (
          <a href={e.whatsappUrl} target="_blank" rel="noopener noreferrer" onClick={() => contact("whatsapp")} className={cn(btn, "bg-[#25D366] text-white")}>
            <MessageCircle className="h-5 w-5" /> Per WhatsApp an unser Team
          </a>
        ) : null}
        {e.mailtoUrl ? (
          <a href={e.mailtoUrl} onClick={() => contact("email")} className={cn(btn, "border border-[color:var(--border-strong)] bg-white text-[color:var(--foreground)]")}>
            <Mail className="h-5 w-5" /> Per E-Mail
          </a>
        ) : null}
        {!e.whatsappUrl && !e.mailtoUrl ? (
          <button type="button" disabled={!!done} onClick={() => contact("team")} className={cn(btn, "bg-[color:var(--brand)] text-white disabled:opacity-60")}>
            <UserRound className="h-5 w-5" /> An unser Team weitergeben
          </button>
        ) : null}
      </div>
      {done ? (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-emerald-700">
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {done === "team" ? "Weitergegeben. Wir melden uns bei Ihnen." : "Unser Team ist informiert. Schicken Sie die Nachricht einfach ab."} Referenz {e.ref}
        </p>
      ) : (
        <p className="mt-2 text-[11px] text-[color:var(--muted)]">
          Anliegen: {e.summary} · Referenz {e.ref}
        </p>
      )}
    </div>
  );
}
