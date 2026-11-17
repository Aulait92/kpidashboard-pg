#!/usr/bin/env python3
"""Folie „Ihr Abschlussbonus“ als vorletzte Folie in die Vertriebsunterlagen einfügen (Ole, 17.11.2026).

Bild vorher mit `npx tsx scripts/bonus-folie-unterlagen.ts <Ordner>` erzeugen, dann:

    python3 scripts/bonus-folie-einfuegen.py <Ordner mit abschlussbonus-*.png> <Zielordner>

Liest docs/unterlagen/{Vertreter,Makler}-Praesentation.{pptx,pdf} und schreibt die neuen Fassungen in den
Zielordner. Das Bild heißt in der PPTX „abschlussbonus.png“: scripts/vertrieb-folien.mjs überspringt diese Folie,
weil die Web-Präsentation die Bonusfolie selbst (mit Frist aus dem Angebot) einfügt.
Läuft die Datei schon mit Bonusfolie, wird nichts doppelt eingefügt.
"""
import copy
import io
import os
import sys
import zipfile

from PIL import Image
from pptx import Presentation
from pptx.util import Emu
import pypdf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATEIEN = {"vertreter": "Vertreter-Praesentation", "makler": "Makler-Praesentation"}
MEDIA_NAME = "abschlussbonus.png"


def pptx_hat_bonus(pfad: str) -> bool:
    with zipfile.ZipFile(pfad) as z:
        return any(n.endswith(MEDIA_NAME) for n in z.namelist())


def pptx_einfuegen(quelle: str, bild: str, ziel: str) -> None:
    if pptx_hat_bonus(quelle):
        print(f"{os.path.basename(quelle)}: Bonusfolie schon enthalten, unverändert")
        copy_file(quelle, ziel)
        return
    prs = Presentation(quelle)
    # Leeres Layout: das mit den wenigsten Platzhaltern
    layout = min(prs.slide_layouts, key=lambda l: len(l.placeholders))
    slide = prs.slides.add_slide(layout)
    for ph in list(slide.placeholders):
        ph._element.getparent().remove(ph._element)
    slide.shapes.add_picture(bild, 0, 0, width=Emu(prs.slide_width), height=Emu(prs.slide_height))
    # Neue Folie an die vorletzte Stelle schieben
    ids = prs.slides._sldIdLst
    neu = ids[-1]
    ids.remove(neu)
    ids.insert(len(ids) - 1, neu)
    prs.save(ziel)
    # Bildname in der Datei festlegen (python-pptx nennt Medien imageN.png)
    umbenennen_medium(ziel, slide)
    print(f"{os.path.basename(ziel)}: Bonusfolie als Folie {len(ids) - 1} von {len(ids)}")


def umbenennen_medium(pfad: str, slide) -> None:
    rel = next(r for r in slide.part.rels.values() if "image" in r.reltype)
    alt = rel.target_part.partname  # z. B. /ppt/media/image42.png
    alt_name = alt.split("/")[-1]
    slide_part = slide.part.partname.split("/")[-1]  # slideN.xml
    tmp = pfad + ".tmp"
    with zipfile.ZipFile(pfad) as zin, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            name = item.filename
            if name == alt.lstrip("/"):
                name = f"ppt/media/{MEDIA_NAME}"
            elif name == f"ppt/slides/_rels/{slide_part}.rels":
                data = data.replace(f"../media/{alt_name}".encode(), f"../media/{MEDIA_NAME}".encode())
            zout.writestr(name if name != item.filename else item, data)
    os.replace(tmp, pfad)


def pdf_einfuegen(quelle: str, bild: str, ziel: str) -> None:
    reader = pypdf.PdfReader(quelle)
    box = reader.pages[0].mediabox
    w, h = float(box.width), float(box.height)
    if MEDIA_NAME in str((reader.metadata or {}).get("/Subject", "")):
        print(f"{os.path.basename(quelle)}: Bonusfolie schon enthalten, unverändert")
        copy_file(quelle, ziel)
        return
    # Bild als PDF-Seite in derselben Größe (72 dpi-Punkte)
    im = Image.open(bild).convert("RGB")
    buf = io.BytesIO()
    dpi = im.width / (w / 72)
    im.save(buf, format="PDF", resolution=dpi)
    seite = pypdf.PdfReader(io.BytesIO(buf.getvalue())).pages[0]
    writer = pypdf.PdfWriter()
    n = len(reader.pages)
    for i, p in enumerate(reader.pages):
        if i == n - 1:
            writer.add_page(seite)
        writer.add_page(p)
    writer.add_metadata({"/Subject": f"Enthält {MEDIA_NAME}"})
    with open(ziel, "wb") as f:
        writer.write(f)
    print(f"{os.path.basename(ziel)}: Bonusfolie als Seite {n} von {n + 1}")


def copy_file(a: str, b: str) -> None:
    with open(a, "rb") as fa, open(b, "wb") as fb:
        fb.write(fa.read())


def main() -> None:
    bilder, ziel = sys.argv[1], sys.argv[2]
    os.makedirs(ziel, exist_ok=True)
    for audience, name in DATEIEN.items():
        bild = os.path.join(bilder, f"abschlussbonus-{audience}.png")
        quelle = os.path.join(ROOT, "docs/unterlagen", name)
        pptx_einfuegen(quelle + ".pptx", bild, os.path.join(ziel, name + ".pptx"))
        pdf_einfuegen(quelle + ".pdf", bild, os.path.join(ziel, name + ".pdf"))


if __name__ == "__main__":
    main()
