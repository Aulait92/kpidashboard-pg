#!/usr/bin/env python3
"""Folie „Und wenn es schlecht läuft?“ ohne Garantien (Ole, 22.11.2026: „ich verkaufe erstmal ohne Garantie“).

Rechte Karte vorher: Lead-Garantie, Break-even- bzw. Vertrags-Garantie, Pause/Urlaub, Kunden bzw. Bestand bleiben.
Jetzt: Pause/Urlaub (Original), „Kampagne wird nachgeschärft“ (neu gesetzt, Aussage wie auf Folie 20 und im
Sprechzettel) und Kunden bzw. Bestand bleiben (Original). Die Fußnote verliert den Garantie-Satz.

    python3 scripts/folie-ohne-garantien.py

Arbeitet auf dem Folienbild in docs/unterlagen/{Vertreter,Makler}-Praesentation.pptx (Vertreter Folie 23, Makler 24),
ersetzt es dort, im PDF (Folie 13 steht im PDF als 8 Seiten: Vertreter Seite 30, Makler 31) und in der Web-Präsentation
(public/praesentation/vertrieb/{vertreter/23,makler/24}.webp). Nur einmal laufen lassen: Die Maße gelten für die
Folie mit Garantien. Mit --nur-bild <Ordner> nur die Bilder zum Ansehen erzeugen.
"""
import io
import os
import sys

from PIL import Image, ImageDraw, ImageFont
from pptx import Presentation

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib.util

_spec = importlib.util.spec_from_file_location("paket", os.path.join(os.path.dirname(os.path.abspath(__file__)), "paket-folie-ersetzen.py"))
paket = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(paket)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEIST = os.path.join(ROOT, "public/fonts/Geist-Bold.ttf")
INTER = "/usr/share/fonts/opentype/inter/Inter-Regular.otf"
INTER_SB = "/usr/share/fonts/opentype/inter/Inter-SemiBold.otf"

# Zielgruppe: Datei, Folie (PPTX), Seite (PDF), Web-Bild, Karte (oben, Trenner 1..3, unten), Fußzeile (oben, unten)
DATEIEN = {
    "vertreter": ("Vertreter-Praesentation", 23, 30, "vertreter/23.webp", (391, 545, 693, 813, 964), (984, 1042)),
    "makler": ("Makler-Praesentation", 24, 31, "makler/24.webp", (387, 541, 717, 837, 988), (1006, 1054)),
}
X0, X1 = 977, 1821  # Innenkante der rechten Karte
TEXT_X = 1088


def zeilen_bereiche(im, y0, y1, x0=90, x1=1700, th=185):
    rs, cur = [], None
    for y in range(y0, y1):
        d = min(sum(im.getpixel((x, y))) / 3 for x in range(x0, x1, 2))
        if d < th:
            cur = [y, y] if cur is None else [cur[0], y]
        elif cur:
            rs.append(tuple(cur))
            cur = None
    if cur:
        rs.append(tuple(cur))
    return rs


def hintergrund(im, box):
    """Fläche senkrecht zwischen der Zeile darüber und darunter interpolieren (Verlauf und Kartenschatten bleiben)."""
    x0, y0, x1, y1 = box
    px = im.load()
    for x in range(x0, x1):
        a, b = px[x, y0 - 1], px[x, y1]
        for y in range(y0, y1):
            t = (y - y0 + 1) / (y1 - y0 + 1)
            px[x, y] = tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def text_mit_abstand(d, xy, text, font, fill, tracking):
    x, y = xy
    for ch in text:
        d.text((x, y), ch, font=font, fill=fill)
        x += d.textlength(ch, font=font) + tracking


def neuer_punkt(icon):
    """Punkt „Kampagne wird nachgeschärft“ im Stil der Originalpunkte (Maße aus dem Punkt „Jederzeit“ gemessen)."""
    im = Image.new("RGB", (X1 - X0, 150), (255, 255, 255))
    im.paste(icon, (1016 - X0, 17))
    d = ImageDraw.Draw(im)
    x = TEXT_X - X0
    text_mit_abstand(d, (x + 1, 18), "LAUFEND", ImageFont.truetype(INTER_SB, 15), (106, 116, 126), 1.6)
    d.text((x, 40), "Kampagne wird nachgeschärft", font=ImageFont.truetype(GEIST, 26), fill=(10, 13, 20))
    body = ImageFont.truetype(INTER, 19)
    d.text((x, 78), "Wir optimieren Ihre Anzeigen laufend nach Umsatz je Werbe-Euro,", font=body, fill=(54, 58, 70))
    d.text((x, 106), "nicht nach Klicks.", font=body, fill=(54, 58, 70))
    return im


def umbauen(src: Image.Image, karte, fuss, audience) -> Image.Image:
    src = src.convert("RGB")
    im = src.copy()
    top, t1, t2, t3, bottom = karte
    # Nur den Inhaltsbereich der Karte anfassen (Rand, runde Ecken und Schatten bleiben)
    c0, c1 = 1000, 1800
    icon = src.crop((1016, top + 23, 1066, top + 73))  # Ziel-Icon des bisherigen Punkts „Lead-Garantie“
    jederzeit = src.crop((c0, t2 + 2, c1, t3 - 1))
    immer = src.crop((c0, t3 + 2, c1, bottom - 8))
    trenner = src.crop((c0, t2, c1, t2 + 2))
    neu = neuer_punkt(icon).crop((c0 - X0, 0, c1 - X0, 150))
    teile = [jederzeit, neu, immer]
    y0, y1 = top + 8, bottom - 8
    frei = (y1 - y0) - sum(t.height for t in teile) - 2 * trenner.height
    pad = frei // 6
    ImageDraw.Draw(im).rectangle((c0, y0, c1 - 1, y1 - 1), fill=(255, 255, 255))
    y = y0
    for i, t in enumerate(teile):
        y += pad
        im.paste(t, (c0, y))
        y += t.height + pad
        if i < len(teile) - 1:
            im.paste(trenner, (c0, y))
            y += trenner.height
    # Fußzeile: Garantie-Satz raus, Rest in die erste Zeile
    f0, f1 = fuss
    z = zeilen_bereiche(src, f0, f1)
    if len(z) != 2:
        raise SystemExit(f"{audience}: Fußzeile hat {len(z)} Zeilen, erwartet 2")
    (a0, a1), (b0, b1) = z
    zeile2 = src.crop((80, b0 - 4, 1720, b1 + 4))
    if audience == "vertreter":
        # Zeile 2: „eingetragen. Details in den AGB. Werbebudget zahlen Sie direkt an Meta.“ → nur der letzte Satz
        dunkel = [x for x in range(zeile2.width) if min(sum(zeile2.getpixel((x, y))) / 3 for y in range(zeile2.height)) < 185]
        # Wortlücken (über 4 px): „Werbebudget“ beginnt nach der fünften
        luecken = [(dunkel[i], dunkel[i + 1]) for i in range(len(dunkel) - 1) if dunkel[i + 1] - dunkel[i] > 4]
        start = luecken[4][1]  # eingetragen.|Details|in|den|AGB.|Werbebudget
        zeile2 = zeile2.crop((start - 2, 0, dunkel[-1] + 3, zeile2.height))
        x = 95  # Zeilenanfang wie Zeile 1 (Text beginnt bei x = 97, Kopie mit 2 px Rand)
    else:
        x = 80
    # Nur die Schrift der Zeile auf den frisch interpolierten Hintergrund setzen (Maske aus der Helligkeit, damit
    # kein Kasten vom alten Hintergrund sichtbar wird)
    hintergrund(im, (82, f0, 1722, f1))
    grau = zeile2.convert("L")
    hell = grau.getextrema()[1]
    maske = grau.point(lambda v: max(0, min(255, round((hell - 6 - v) * 255 / 70))))
    im.paste(zeile2, (x, a0 - 4), maske)
    return im


def main() -> None:
    nur_bild = "--nur-bild" in sys.argv
    out = sys.argv[sys.argv.index("--nur-bild") + 1] if nur_bild else os.path.join(ROOT, "docs/unterlagen")
    os.makedirs(out, exist_ok=True)
    for audience, (name, folie, seite, web, karte, fuss) in DATEIEN.items():
        basis = os.path.join(ROOT, "docs/unterlagen", name)
        prs = Presentation(basis + ".pptx")
        bild = [sh for sh in prs.slides[folie - 1].shapes if sh.shape_type == 13][0]
        src = Image.open(io.BytesIO(bild.image.blob))
        neu = umbauen(src, karte, fuss, audience)
        png = os.path.join(out, f"ohne-garantien-{audience}.png")
        neu.save(png)
        print("Bild", png)
        if nur_bild:
            continue
        paket.pptx_ersetzen(basis + ".pptx", folie, png)
        paket.pdf_ersetzen(basis + ".pdf", seite, png)
        w = neu.copy()
        w.thumbnail((1600, 1600), Image.LANCZOS)
        w.save(os.path.join(ROOT, "public/praesentation/vertrieb", web), "WEBP", quality=78)
        print("Web", web)


if __name__ == "__main__":
    main()
