import type { LegalSection } from "@/lib/legal-texts";

// Nummerierte Rechtstext-Abschnitte (AGB, AVV) – auf den öffentlichen Seiten
// und als Anhang im Angebot.
export function LegalSections({
  sections,
  startAt = 1,
  compact = false,
}: {
  sections: LegalSection[];
  startAt?: number;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "legal-compact columns-1 gap-10 text-[12.5px] leading-[1.6] sm:columns-2 print:columns-2" : "space-y-8 text-[15px] leading-relaxed"}>
      {sections.map((s, i) => (
        <section key={s.title} className={compact ? "mb-5 break-inside-avoid" : undefined}>
          <h3 className={compact ? "mb-1.5 text-[14px] font-bold text-[#111827]" : "mb-3 text-lg font-bold text-[#111827]"}>
            § {startAt + i} {s.title}
          </h3>
          <div className={compact ? "space-y-1.5 text-[#374151]" : "space-y-3 text-[#374151]"}>
            {s.items.map((it, j) =>
              typeof it === "string" ? (
                <p key={j}>
                  <span className="text-[#6b7280]">({j + 1})</span> {it}
                </p>
              ) : (
                <p key={j}>
                  <span className="font-semibold text-[#111827]">{it.sub}:</span> {it.text}
                </p>
              ),
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
