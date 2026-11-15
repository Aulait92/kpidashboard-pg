// Beratungspräsentation (Ole, 15.11.2026): nie Text abschneiden. Gemeinsam für Deck (App, Demo), Kundenlink und PDF.

/**
 * Folien einpassen (im Browser und vor dem PDF): Ragt der Inhalt einer Folie in die Fußzeile oder seitlich hinaus,
 * wird er schrittweise kleiner (CSS zoom), bis alles sichtbar ist. Eigenständig (keine Bezüge nach außen), damit die
 * Funktion auch als Skript ins PDF-Dokument kann.
 */
export function folienEinpassen(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>(".slide").forEach((s) => {
    const inhalt = s.querySelector<HTMLElement>(":scope > .inhalt");
    if (!inhalt) return;
    inhalt.style.removeProperty("zoom");
    const foot = s.querySelector<HTMLElement>(":scope > .foot");
    const sr = s.getBoundingClientRect();
    const k = sr.height / 720 || 1;
    const grenze = foot ? (foot.getBoundingClientRect().top - sr.top) / k - 6 : 700;
    const zuGross = () => (inhalt.getBoundingClientRect().bottom - sr.top) / k > grenze || inhalt.scrollWidth > inhalt.clientWidth + 1;
    for (let z = 100; z > 55 && zuGross(); ) {
      z -= 5;
      inhalt.style.setProperty("zoom", String(z / 100));
    }
  });
}
