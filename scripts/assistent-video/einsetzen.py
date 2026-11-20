"""Neues Assistenten-Video in PPTX (Folie 13) und PDF (Seiten 13 bis 20, 8 Einzelbilder) einsetzen.
python3 einsetzen.py <unterlagen-dir> <video.mp4> <poster.png> <bild1.png> ... <bild8.png>"""
import io, os, sys, zipfile, shutil
from PIL import Image
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject, NumberObject

d, video, poster, *bilder = sys.argv[1:]
assert len(bilder) == 8
vbytes = open(video, "rb").read(); pbytes = open(poster, "rb").read()

for name in ("Vertreter", "Makler"):
    src = os.path.join(d, f"{name}-Praesentation.pptx"); tmp = src + ".neu"
    with zipfile.ZipFile(src) as zi, zipfile.ZipFile(tmp, "w") as zo:
        ersetzt = 0
        for it in zi.infolist():
            data = zi.read(it.filename)
            if it.filename == "ppt/media/media-13-1.mp4": data = vbytes; ersetzt += 1
            elif it.filename == "ppt/media/image-13-3.png": data = pbytes; ersetzt += 1
            zo.writestr(it, data, compress_type=it.compress_type)
        assert ersetzt == 2, (name, ersetzt)
    shutil.move(tmp, src)

    pdf = os.path.join(d, f"{name}-Praesentation.pdf")
    r = PdfReader(pdf); w = PdfWriter(clone_from=r)
    for k, b in enumerate(bilder):
        page = w.pages[12 + k]
        xo = page["/Resources"]["/XObject"]
        import re
        benutzt = set(re.findall(rb"/(\w+)\s+Do", page.get_contents().get_data()))
        imgs = [xo[n].get_object() for n in xo if n[1:].encode() in benutzt and xo[n].get_object().get("/Subtype") == "/Image"]
        assert len(imgs) == 1 and imgs[0]["/Width"] == 1920, (name, k)
        buf = io.BytesIO(); Image.open(b).convert("RGB").save(buf, "JPEG", quality=88, optimize=True)
        img = imgs[0]
        img._data = buf.getvalue()
        img[NameObject("/Filter")] = NameObject("/DCTDecode")
        img[NameObject("/Length")] = NumberObject(len(img._data))
        for key in ("/DecodeParms", "/SMask"):
            if key in img: del img[key]
    tmp = pdf + ".neu"
    with open(tmp, "wb") as f: w.write(f)
    shutil.move(tmp, pdf)
    print(name, "ok")
