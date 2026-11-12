"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, useTransition } from "react";
import { Check, Copy, Gift, Mail, MessageCircle, Share2, X } from "lucide-react";
import { closeReferralNudgeAction } from "@/app/buyer/empfehlen/actions";
import { success as hapticSuccess, selection } from "@/lib/haptics";
import { shareMailSubject } from "@/lib/kollegen-shared";

const noopSubscribe = () => () => {};

const btn =
  "inline-flex h-11 items-center justify-center gap-2 rounded-[var(--radius-sm)] px-4 text-[15px] font-semibold transition active:scale-[0.98] disabled:opacity-50";

/** Link kopieren und teilen (Web Share, WhatsApp, E-Mail) mit editierbarem Text. */
export function ReferralShare({ url, defaultText, readOnly }: { url: string; defaultText: string; readOnly?: boolean }) {
  const [text, setText] = useState(defaultText);
  const [copied, setCopied] = useState(false);
  // Web Share nur im Browser (Server rendert ohne, kein Hydrationsfehler)
  const canShare = useSyncExternalStore(noopSubscribe, () => typeof navigator.share === "function", () => false);
  const message = text.includes(url) ? text : `${text}\n${url}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      hapticSuccess();
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  const share = async () => {
    selection();
    try {
      await navigator.share({ title: shareMailSubject, text: message });
    } catch {
      // abgebrochen
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-medium">Ihr persönlicher Link</div>
        <div className="mt-1 flex gap-2">
          <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="h-11 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-[color:var(--surface-sunken)] px-3 text-[15px]" aria-label="Persönlicher Empfehlungslink" data-kollegen-link />
          <button type="button" onClick={copy} className={`${btn} border border-[color:var(--border)] bg-white`} aria-label="Link kopieren">
            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            <span className="hidden sm:inline">{copied ? "Kopiert" : "Kopieren"}</span>
          </button>
        </div>
      </div>
      <label className="block">
        <span className="text-sm font-medium">Nachricht an Kollegen (können Sie anpassen)</span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} className="mt-1 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 py-2 text-[15px] leading-relaxed outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand)]/20" />
      </label>
      <div className="grid gap-2 sm:grid-cols-3">
        {canShare ? (
          <button type="button" onClick={share} disabled={readOnly} className={`${btn} bg-[color:var(--brand)] text-white`}>
            <Share2 className="h-4 w-4" /> Teilen
          </button>
        ) : null}
        <a
          href={readOnly ? undefined : `https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => selection()}
          aria-disabled={readOnly}
          className={`${btn} ${canShare ? "border border-[color:var(--border)] bg-white" : "bg-[#25D366] text-white"} ${readOnly ? "pointer-events-none opacity-50" : ""}`}
        >
          <MessageCircle className="h-4 w-4" /> WhatsApp
        </a>
        <a
          href={readOnly ? undefined : `mailto:?subject=${encodeURIComponent(shareMailSubject)}&body=${encodeURIComponent(message)}`}
          onClick={() => selection()}
          aria-disabled={readOnly}
          className={`${btn} border border-[color:var(--border)] bg-white ${readOnly ? "pointer-events-none opacity-50" : ""}`}
        >
          <Mail className="h-4 w-4" /> E-Mail
        </a>
      </div>
    </div>
  );
}

/** Hinweis-Karte in „Heute“ (nur Inhaber, höchstens einmal je Anlass, wegklickbar). */
export function ReferralNudgeCard({ nudgeKey, title, text }: { nudgeKey: string; title: string; text: string }) {
  const [hidden, setHidden] = useState(false);
  const [, start] = useTransition();
  if (hidden) return null;
  const close = () => {
    setHidden(true);
    start(() => closeReferralNudgeAction(nudgeKey));
  };
  return (
    <div className="mb-4 flex items-start gap-3 rounded-[var(--radius-lg)] border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-950" data-kollegen-nudge={nudgeKey}>
      <Gift className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{title}</div>
        <p className="mt-0.5 text-sm">{text}</p>
        <Link
          href="/buyer/empfehlen"
          onClick={() => {
            selection();
            start(() => closeReferralNudgeAction(nudgeKey));
          }}
          className="mt-2 inline-flex min-h-10 items-center rounded-[var(--radius-sm)] bg-emerald-700 px-4 text-sm font-semibold text-white"
        >
          Kollegen empfehlen
        </Link>
      </div>
      <button type="button" onClick={close} aria-label="Hinweis schließen" className="-mr-1 -mt-1 flex h-9 w-9 items-center justify-center rounded-full text-emerald-800 hover:bg-emerald-100">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
