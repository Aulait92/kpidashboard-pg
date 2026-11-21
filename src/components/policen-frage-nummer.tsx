// Nummer einer „Frage für den Termin“ (Policen auslesen): gleich auf der Vertragsseite und im Spickzettel der
// Terminvorbereitung, damit Frage und Vertragskarte dieselbe Markierung tragen.

export function FrageNummer({ n }: { n: number }) {
  return (
    <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 px-1 text-[11px] font-semibold text-amber-900" aria-label={`Frage ${n}`}>
      {n}
    </span>
  );
}

/** Anker der Vertragskarte auf der Vertragsseite (Sprung aus einer Frage). */
export const vertragAnker = (id: string) => `vertrag-${id}`;
