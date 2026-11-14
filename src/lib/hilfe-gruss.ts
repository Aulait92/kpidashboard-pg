// Begrüßung in der KI-Hilfe (Ole, 14.11.2026): nie Firmen- oder Platzhalternamen.
// Mit Anrede und Nachname „Guten Tag Herr Müller!“, sonst neutral „Hallo!“.

export function hilfeGruss(p: { salutation?: string | null; lastName?: string | null } | null | undefined): string {
  const sal = p?.salutation?.trim() ?? "";
  const last = p?.lastName?.trim() ?? "";
  if (/^(herr|frau)$/i.test(sal) && last && !/^(company|firma|test|kunde|platzhalter)$/i.test(last)) {
    return `Guten Tag ${sal[0].toUpperCase()}${sal.slice(1).toLowerCase()} ${last}!`;
  }
  return "Hallo!";
}
