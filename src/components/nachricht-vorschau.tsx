// Vorschau einer geplanten Nachricht (Paket P6): WhatsApp als Sprechblase mit Formatierung (*fett*), E-Mail mit Betreff
// („Betreff: …“ in der ersten Zeile), Hinweise für den Vermittler schlicht. Für „Nächste Nachrichten“ und die Ablaufübersicht.

import { waFormatKnoten } from "@/lib/wa-format";

export function NachrichtVorschau({ kanal, text }: { kanal: string; text: string }) {
  if (kanal === "whatsapp") {
    return (
      <div className="max-w-md whitespace-pre-wrap break-words rounded-[var(--radius-md)] rounded-tl-sm bg-[#e7f8e9] px-3 py-2 text-[13px] leading-relaxed text-[color:var(--foreground)]" data-nachricht-vorschau>
        {waFormatKnoten(text)}
      </div>
    );
  }
  if (kanal === "email") {
    const [kopf, ...rest] = text.split("\n\n");
    const betreff = kopf.replace(/^Betreff:\s*/, "");
    return (
      <div className="max-w-md rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white px-3 py-2 text-[13px] leading-relaxed" data-nachricht-vorschau>
        <div className="font-semibold">{betreff}</div>
        {rest.length ? <div className="mt-1.5 whitespace-pre-wrap break-words text-[color:var(--foreground)]/90">{rest.join("\n\n")}</div> : null}
      </div>
    );
  }
  return (
    <div className="max-w-md rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] px-3 py-2 text-[13px]" data-nachricht-vorschau>
      {text}
    </div>
  );
}
