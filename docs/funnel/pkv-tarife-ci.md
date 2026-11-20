# CI pkv-tarife.com (UX/UI, 20.11.2026)

Ruhige, seriöse Marke in Petrol, abgegrenzt von Versicherer-Farben und vom App-Blau. Logo-Dateien und Vorschau:
`docs/funnel/marke/` (logo-hell.svg, logo-dunkel.svg, favicon.svg, apple-touch-icon.svg, vorschau.png).

- Bildzeichen: Schild mit Pfeil nach unten („Beitrag senken“); Wortmarke „pkv-tarife“ fett Petrol 800 + „.com“ Grau.
  In der App Wortmarke als HTML in Geist neben dem Inline-SVG-Bildzeichen.
- Farben: Primär Petrol 700 #0E5F68 (Knopf, Fortschritt, gewählte Option, Links), Petrol 800 #0B4A52 (Hover, Wortmarke),
  Petrol 50 #EAF4F3 (gewählte Option), Mint #A9D6D0 (nur Deko), Seite #F8F7F4, Karte #FFFFFF mit Rand #E3E1DA,
  Text #0F172A, Text leise #475569, Grau Marke #5B6B78, Feldrand #7C8C9A, Fehler #B42318, Erfolg #047857.
  Kein Rot/Orange/Gelb, kein „Spar-Grün“ als Knopf.
- Schrift Geist (schon über next/font), Fließtext 16 px, H1 Handy 25 px, Fragen 20 px, Einwilligung 13 px.
- Radius 12 px (Knöpfe, Optionen, Felder), 16 px (Karte, Bild). Seitenrand 16 px, Karte innen 20/28 px,
  Optionen-Abstand 10 px, Tippfläche min. 56 px. Ein Primärknopf je Schritt. Optionen weiß, Rand 2 px #CFD6DC,
  gewählt Rand Petrol, Hintergrund Petrol 50, Haken. Cookie-Knöpfe gleichwertig sekundär.
- Ton: Du, ruhig, sachlich, keine Ausrufezeichen in Überschriften, keine Prozentzahlen in Bildern.

## Bilder
- Fotorealistisch, deutscher Alltag, Tageslicht, warm gedämpft mit leichtem Petrol in den Schatten; keine Texte,
  Logos, lesbaren Briefe; keine Testimonials; kein KI-Gesicht als „dein Experte“. Personen in Beratungssituation mit
  „Symbolbild“ (Alt-Text und klein im Bild).
- Start-Hero 12:5 (Handy 358 × 149, Desktop 576 × 240), erzeugt 1536 × 1024, zugeschnitten 1536 × 640, `hero.webp`
  Qualität 75, Handy ≤ 45 KB, priority. Prompt: „Photorealistic editorial photo, natural daylight, a German couple in
  their mid fifties sitting at a bright kitchen table in a tidy German apartment, looking calmly at a tablet together,
  a few unbranded paper documents and a cup of coffee on the table, relaxed and relieved expressions, subtle smile,
  casual smart clothing, warm muted colors with soft teal shadows, shallow depth of field, wide composition with the
  people on the right third and calm empty space on the left, no text, no readable writing, no logos, no brand names,
  no insurance company symbols, not staged stock-photo look.“ Alt „Paar am Küchentisch prüft Unterlagen“.
- Zwischenseite 16:9, max. 160 px hoch, `fast-fertig.webp` ≤ 30 KB, „Symbolbild“: „Photorealistic photo, a professional
  advisor in a bright modern German office, seen from the side and slightly from behind so the face is not clearly
  identifiable, wearing a headset, looking at a laptop with a blurred screen, calm and attentive posture, warm natural
  light, muted colors with soft teal accents, no text, no readable screen content, no logos, no brand names.“
- Danke-Seite: kein KI-Bild; Bildzeichen im Petrol-Kreis 56 px.
- Schritte 2 bis 7 ohne Bild.
