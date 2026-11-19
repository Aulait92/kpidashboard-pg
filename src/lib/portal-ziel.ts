// Ziel für Fenster per Portal (Sheets, Nächster Schritt): Ist ein natives <dialog> mit showModal() offen (z. B. das
// Kontakt-Fenster über der Liste im Kundenbereich), liegt alles außerhalb im Hintergrund und ist nicht bedienbar
// (Ole, 19.11.2026: „Mehr“ öffnete nichts). Dann in den obersten offenen Dialog hängen, sonst an <body>.
export function portalZiel(): HTMLElement {
  const offen = document.querySelectorAll<HTMLDialogElement>("dialog[open]");
  return offen.length ? offen[offen.length - 1] : document.body;
}
