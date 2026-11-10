"use client";

// KI-Hilfe im Kundenbereich: Knopf „Hilfe“ in der Kopfzeile, Fenster mit
// Vorschlägen passend zur Seite, freie Fragen, Links an die richtige Stelle,
// Bewertung (hilfreich ja/nein). Antworten kommen von /api/hilfe.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LifeBuoy, SendHorizontal, Sparkles, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Msg =
  | { who: "me"; text: string }
  | { who: "ai"; text: string; links?: { href: string; label: string }[]; id?: string | null; rating?: "up" | "down"; error?: boolean };

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

export function HilfeChat({ firstName, owner }: { firstName: string; owner: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    try {
      const res = await fetch("/api/hilfe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history, page: pathname }),
      });
      const data = (await res.json()) as { id?: string | null; answer?: string; links?: { href: string; label: string }[]; error?: string };
      if (!res.ok || !data.answer) throw new Error(data.error ?? "Das hat nicht geklappt. Bitte noch einmal versuchen.");
      setMsgs((m) => [...m, { who: "ai", text: data.answer!, links: data.links ?? [], id: data.id ?? null }]);
    } catch (err) {
      setMsgs((m) => [...m, { who: "ai", text: err instanceof Error ? err.message : "Das hat nicht geklappt.", error: true }]);
    } finally {
      setBusy(false);
    }
  }

  async function rate(i: number, rating: "up" | "down") {
    const m = msgs[i];
    if (m.who !== "ai" || !m.id) return;
    setMsgs((all) => all.map((x, j) => (j === i && x.who === "ai" ? { ...x, rating } : x)));
    await fetch("/api/hilfe", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: m.id, rating }) }).catch(() => {});
  }

  const asked = new Set(msgs.filter((m) => m.who === "me").map((m) => m.text));
  const chips = suggestionsFor(pathname, owner).filter((q) => !asked.has(q));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[color:var(--brand-soft)] px-3 text-sm font-semibold text-[color:var(--brand-dark)] transition hover:brightness-95"
        aria-label="KI-Hilfe: Fragen zur App"
      >
        <Sparkles className="h-4 w-4" />
        <span>Hilfe</span>
      </button>

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
                <div className="text-xs text-[color:var(--muted)]">Antwortet sofort · kennt die App</div>
              </div>
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
                    {m.id ? (
                      m.rating ? (
                        <p className="mt-1.5 text-xs text-[color:var(--muted)]">
                          {m.rating === "up" ? "Danke für Ihr Feedback!" : "Schade. Schreiben Sie uns über „Etwas unklar? Feedback“ im Profilmenü – wir melden uns."}
                        </p>
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
              {!busy && chips.length ? (
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
