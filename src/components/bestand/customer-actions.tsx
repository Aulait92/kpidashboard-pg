"use client";

// Aktionen je Zeile in der Kundenliste (Bestand), kompakt als Icon-Knöpfe (Ole, 14.11.2026):
// - Senden: öffnet „Empfehlungslink senden“ mit der Frage „Warum melden Sie sich?“ (Anlässe als Karten),
//   Vorschau des Textes und „Senden“. Ohne Mobilnummer deaktiviert (Tooltip „keine Mobilnummer“).
// - „…“: Im Termin zeigen (QR-Code), Text und Link zum Kopieren.
// Texte und Anrede kommen unverändert aus lib/empfehlung (renderText, OCCASIONS).

import { useActionState, useEffect, useState, useTransition } from "react";
import { Check, Copy, Link2, Loader2, MoreHorizontal, QrCode, Send, Share2 } from "lucide-react";
import { Button, buttonClass } from "@/components/ui";
import { ActionSheet, Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import { referralQrAction, sendReferralLinkAction, type QrState, type ShareState } from "@/app/buyer/empfehlungen/actions";
import { referralCopyAction, referralPreviewAction, type ReferralPreview } from "@/app/buyer/bestand/actions";

/** Anlässe als Karten: Schlüssel wie in lib/empfehlung/shared.ts OCCASIONS ("" = ohne Anlass). */
const CARDS: { key: string; title: string; hint: string }[] = [
  { key: "", title: "Ohne besonderen Anlass", hint: "Allgemeine Bitte um eine Empfehlung" },
  { key: "schaden", title: "Schaden geregelt", hint: "Nach einem gut geregelten Schaden" },
  { key: "ersparnis", title: "Beitrag gespart", hint: "Besser abgesichert oder günstiger geworden" },
  { key: "jahresgespraech", title: "Nach dem Jahresgespräch", hint: "Wie im Gespräch besprochen" },
];

const iconBtn = "h-9 w-9 px-0";

export function CustomerRowActions({ existingCustomerId, name, hasPhone, readOnly }: { existingCustomerId: string; name: string; hasPhone: boolean; readOnly: boolean }) {
  const [dialog, setDialog] = useState<null | "send" | "copy">(null);
  const [menu, setMenu] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [qr, setQr] = useState<QrState | null>(null);
  const [qrPending, startQr] = useTransition();
  const showQr = () => {
    setQrOpen(true);
    if (qr?.ok) return;
    startQr(async () => setQr(await referralQrAction({ existingCustomerId })));
  };
  return (
    <div className="flex shrink-0 items-center gap-1" data-row-actions>
      {/* Deaktivierte Knöpfe bekommen keinen Mauszeiger: Tooltip daher am umschließenden Element */}
      <span title={hasPhone ? "Empfehlungslink per WhatsApp senden" : "keine Mobilnummer"} className="inline-flex">
        <Button
          icon={Send}
          className={iconBtn}
          aria-label={hasPhone ? `Empfehlungslink an ${name} senden` : "Empfehlungslink senden: keine Mobilnummer"}
          disabled={readOnly || !hasPhone}
          onClick={() => setDialog("send")}
          data-referral-send
        />
      </span>
      <span title="Weitere Aktionen" className="inline-flex">
        <Button icon={MoreHorizontal} className={iconBtn} aria-label={`Weitere Aktionen für ${name}`} disabled={readOnly} onClick={() => setMenu(true)} data-row-more />
      </span>
      <ActionSheet
        open={menu}
        onClose={() => setMenu(false)}
        title={name}
        actions={[
          ...(hasPhone ? [{ label: "Empfehlungslink senden", icon: Send, onSelect: () => setDialog("send") }] : []),
          { label: "Im Termin zeigen (QR-Code)", icon: QrCode, onSelect: showQr },
          { label: "Text und Link zum Kopieren", icon: Link2, onSelect: () => setDialog("copy") },
        ]}
      />
      {dialog ? <ReferralDialog existingCustomerId={existingCustomerId} name={name} mode={hasPhone ? dialog : "copy"} onClose={() => setDialog(null)} /> : null}
      <Sheet open={qrOpen} onClose={() => setQrOpen(false)} title="Empfehlung im Termin" message="Ihr Kunde scannt den Code und leitet die Empfehlung gleich weiter.">
        <div className="space-y-3 px-5 py-4 text-center text-sm" data-referral-qr-sheet>
          {qrPending || !qr ? (
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-[color:var(--muted)]" />
          ) : qr.ok && qr.qr ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr.qr} alt="QR-Code zum persönlichen Empfehlungslink" className="mx-auto h-60 w-60 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white p-2" />
              {qr.followUp ? <p className="text-xs font-medium text-emerald-700">Aufgabe zum Nachfassen ist angelegt.</p> : null}
            </>
          ) : (
            <p className="font-medium text-rose-700">{qr.error ?? "Der QR-Code konnte nicht erstellt werden."}</p>
          )}
        </div>
      </Sheet>
    </div>
  );
}

/** „Warum melden Sie sich?“: Anlass als Karte, Vorschau, Senden (bzw. ohne Mobilnummer: Text und Link zum Kopieren). */
function ReferralDialog({ existingCustomerId, name, mode, onClose }: { existingCustomerId: string; name: string; mode: "send" | "copy"; onClose: () => void }) {
  const [occasion, setOccasion] = useState("");
  const [preview, setPreview] = useState<ReferralPreview | null>(null);
  const [sendState, action, sending] = useActionState<ShareState, FormData>(sendReferralLinkAction, {});
  const [copyState, setCopyState] = useState<ShareState | null>(null);
  const [copying, startCopy] = useTransition();
  const [copied, setCopied] = useState(false);
  // Ohne Mobilnummer (bzw. „Text und Link zum Kopieren“): nichts senden, nur Text mit echtem Link erstellen
  const state = copyState ?? sendState;
  const pending = sending || copying;
  useEffect(() => {
    let alive = true;
    referralPreviewAction(existingCustomerId).then((p) => alive && setPreview(p));
    return () => {
      alive = false;
    };
  }, [existingCustomerId]);
  useEffect(() => {
    if (state.ok) haptic("success");
  }, [state]);
  const text = preview?.texts?.[occasion] ?? "";
  const shareText = state.text ?? null;

  return (
    <Sheet open onClose={onClose} title="Empfehlungslink senden" message={mode === "send" ? `Per WhatsApp an ${name}` : `${name} hat keine Mobilnummer: Text und Link zum Kopieren`}>
      <form
        action={action}
        onSubmit={(e) => {
          if (mode !== "copy") return;
          e.preventDefault();
          startCopy(async () => setCopyState(await referralCopyAction(existingCustomerId, occasion)));
        }}
        className="max-h-[70dvh] space-y-4 overflow-y-auto px-5 py-4 text-sm"
        data-referral-dialog
      >
        <input type="hidden" name="existingCustomerId" value={existingCustomerId} />
        <input type="hidden" name="occasion" value={occasion} />
        {state.ok ? (
          <p className="rounded-[var(--radius-md)] bg-emerald-50 px-4 py-3 font-medium text-emerald-900 ring-1 ring-emerald-200" data-referral-sent>
            {state.message}
          </p>
        ) : shareText ? (
          <div className="space-y-3" data-referral-copy>
            {mode === "send" && state.error ? <p className="font-medium">{state.error}</p> : null}
            <p className="whitespace-pre-wrap rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] p-3 [overflow-wrap:anywhere]">{shareText}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                size="md"
                icon={copied ? Check : Copy}
                onClick={async () => {
                  await navigator.clipboard?.writeText(shareText).catch(() => {});
                  setCopied(true);
                  haptic("success");
                }}
              >
                {copied ? "Kopiert" : "Text kopieren"}
              </Button>
              {state.link ? (
                <Button size="md" icon={Link2} onClick={() => navigator.clipboard?.writeText(state.link!).catch(() => {})}>
                  Nur Link kopieren
                </Button>
              ) : null}
              {typeof navigator !== "undefined" && "share" in navigator ? (
                <Button size="md" icon={Share2} onClick={() => navigator.share({ text: shareText }).catch(() => {})}>
                  Teilen
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            <fieldset className="space-y-2">
              <legend className="mb-2 font-semibold">Warum melden Sie sich?</legend>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Anlass">
                {CARDS.map((c) => {
                  const active = c.key === occasion;
                  return (
                    <button
                      key={c.key || "ohne"}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setOccasion(c.key)}
                      data-referral-card={c.key || "ohne"}
                      className={cn(
                        "rounded-[var(--radius-md)] border px-3 py-2.5 text-left transition",
                        active ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)] ring-1 ring-[color:var(--brand)]" : "border-[color:var(--border)] bg-white hover:border-[color:var(--border-strong)]",
                      )}
                    >
                      <span className="block font-semibold">{c.title}</span>
                      <span className="block text-xs text-[color:var(--muted)]">{c.hint}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <div>
              <div className="mb-1.5 text-xs font-medium text-[color:var(--muted)]">So sieht die Nachricht aus</div>
              {preview?.ok === false ? (
                <p className="text-rose-700">{preview.error}</p>
              ) : text ? (
                <div className="max-w-sm whitespace-pre-wrap rounded-2xl [overflow-wrap:anywhere] rounded-tl-sm bg-[#dcf8c6] px-4 py-3 text-[14px] leading-snug text-zinc-900 shadow-sm" data-referral-preview>
                  {text}
                </div>
              ) : (
                <Loader2 className="h-5 w-5 animate-spin text-[color:var(--muted)]" />
              )}
              <p className="mt-1.5 text-xs text-[color:var(--muted)]">[persönlicher Link] wird beim Senden durch den Link für diesen Kunden ersetzt.</p>
            </div>
            {state.error && !state.text ? <p className="font-medium text-rose-700">{state.error}</p> : null}
            {mode === "copy" ? <p className="text-xs text-[color:var(--muted)]">Es wird nichts verschickt. Sie bekommen den Text mit dem persönlichen Link zum Kopieren oder Teilen.</p> : null}
            <button type="submit" className={buttonClass("primary", "md", "w-full")} disabled={pending} data-referral-submit>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "send" ? <Send className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {mode === "send" ? "Senden" : "Text und Link erstellen"}
            </button>
          </>
        )}
      </form>
    </Sheet>
  );
}
