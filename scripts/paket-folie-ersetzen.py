#!/usr/bin/env python3
"""Folie „Ihr Paket: Leads + Software“ in den Vertriebsunterlagen auf die aktuellen Listenpreise bringen (Ole, 21.11.2026).

Die Bildfolie in docs/unterlagen nannte noch die Preise vor dem 18.11.2026 (1.000/1.400/1.800 €) und „Jährlich im
Voraus: 2 Monate geschenkt“, das passt nicht zur Folie „Jahresplan: 3 Monate sparen“. Das neue Bild kommt aus derselben
HTML-Folie wie in der Web-Präsentation (Listenpreise, Seitenzahl wie in der PPTX):

    npx tsx scripts/jahresplan-folie-unterlagen.ts <Ordner>      # erzeugt auch paket-{vertreter,makler}.png
    python3 scripts/paket-folie-ersetzen.py <Ordner>

Ersetzt in docs/unterlagen/{Vertreter,Makler}-Praesentation.pptx das Bild der Paket-Folie (Vertreter Folie 22,
Makler 23) und im PDF die entsprechende Seite (Folie 13 steht im PDF als 8 Seiten: Vertreter Seite 29, Makler 30).
Wiederholbar (ersetzt jedes Mal mit dem aktuellen Bild).
"""
import io
import os
import sys
import zipfile

from PIL import Image
from pptx import Presentation
import pypdf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Zielgruppe: (Datei, Foliennummer der Paket-Folie in der PPTX, Seite im PDF)
DATEIEN = {"vertreter": ("Vertreter-Praesentation", 22, 29), "makler": ("Makler-Praesentation", 23, 30)}


def jpeg(bild: str, groesse: tuple[int, int]) -> bytes:
    im = Image.open(bild).convert("RGB").resize(groesse, Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=90)
    return buf.getvalue()


def pptx_ersetzen(pfad: str, folie: int, bild: str) -> None:
    prs = Presentation(pfad)
    slide = prs.slides[folie - 1]
    bilder = [sh for sh in slide.shapes if sh.shape_type == 13]
    if len(bilder) != 1:
        raise SystemExit(f"{os.path.basename(pfad)}: Folie {folie} hat {len(bilder)} Bilder, erwartet 1")
    teil = bilder[0].image
    # Bild der Form (a:blip r:embed), nicht ein altes Vorschaubild, das ebenfalls an der Folie hängt
    rid = bilder[0]._element.blipFill.blip.rEmbed
    name = slide.part.rels[rid].target_part.partname.lstrip("/")
    if not name.lower().endswith((".jpg", ".jpeg")):
        raise SystemExit(f"{os.path.basename(pfad)}: Folienbild {name} ist kein JPEG")
    daten = jpeg(bild, teil.size)
    tmp = pfad + ".tmp"
    with zipfile.ZipFile(pfad) as zin, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            zout.writestr(item, daten if item.filename == name else zin.read(item.filename))
    os.replace(tmp, pfad)
    print(f"{os.path.basename(pfad)}: Folie {folie} ({name}) ersetzt")


def pdf_ersetzen(pfad: str, seite: int, bild: str) -> None:
    reader = pypdf.PdfReader(pfad)
    box = reader.pages[seite - 1].mediabox
    w = float(box.width)
    im = Image.open(io.BytesIO(jpeg(bild, (1920, 1080))))
    buf = io.BytesIO()
    im.save(buf, format="PDF", resolution=im.width / (w / 72))
    neu = pypdf.PdfReader(io.BytesIO(buf.getvalue())).pages[0]
    writer = pypdf.PdfWriter()
    for i, p in enumerate(reader.pages):
        writer.add_page(neu if i == seite - 1 else p)
    if reader.metadata:
        writer.add_metadata({k: v for k, v in reader.metadata.items() if isinstance(v, str)})
    tmp = pfad + ".tmp"
    with open(tmp, "wb") as f:
        writer.write(f)
    os.replace(tmp, pfad)
    print(f"{os.path.basename(pfad)}: Seite {seite} ersetzt")


def main() -> None:
    bilder = sys.argv[1]
    for audience, (name, folie, seite) in DATEIEN.items():
        bild = os.path.join(bilder, f"paket-{audience}.png")
        basis = os.path.join(ROOT, "docs/unterlagen", name)
        pptx_ersetzen(basis + ".pptx", folie, bild)
        pdf_ersetzen(basis + ".pdf", seite, bild)


if __name__ == "__main__":
    main()
