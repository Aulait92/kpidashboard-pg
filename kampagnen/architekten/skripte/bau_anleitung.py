# -*- coding: utf-8 -*-
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                TableStyle, HRFlowable, KeepTogether)

F = "/usr/share/fonts/truetype/dejavu/"
pdfmetrics.registerFont(TTFont("DJ", F+"DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("DJ-B", F+"DejaVuSans-Bold.ttf"))
pdfmetrics.registerFont(TTFont("DJ-M", F+"DejaVuSansMono.ttf"))

AKZENT = colors.HexColor("#1F4E5F")
GRAU   = colors.HexColor("#5A5A5A")
HELL   = colors.HexColor("#F2F4F5")

def st(name, **kw):
    base = dict(fontName="DJ", fontSize=9.5, leading=14, textColor=colors.black,
                spaceAfter=5)
    base.update(kw)
    return ParagraphStyle(name, **base)

S = {
 "titel":   st("titel", fontName="DJ-B", fontSize=19, leading=23,
                textColor=AKZENT, spaceAfter=3),
 "unter":   st("unter", fontSize=10.5, leading=15, textColor=GRAU, spaceAfter=14),
 "h1":      st("h1", fontName="DJ-B", fontSize=12.5, leading=16,
                textColor=AKZENT, spaceBefore=14, spaceAfter=6),
 "h2":      st("h2", fontName="DJ-B", fontSize=10, leading=14, spaceBefore=8,
                spaceAfter=3),
 "p":       st("p"),
 "li":      st("li", leftIndent=11, bulletIndent=2, spaceAfter=3),
 "code":    st("code", fontName="DJ-M", fontSize=8.3, leading=12.5,
                backColor=HELL, borderPadding=6, leftIndent=2, spaceAfter=7),
 "klein":   st("klein", fontSize=8.5, leading=12, textColor=GRAU),
 "merk":    st("merk", fontSize=9.5, leading=14, leftIndent=8, rightIndent=6,
                borderPadding=7, backColor=colors.HexColor("#FFF6E0"),
                spaceBefore=4, spaceAfter=8),
}

def P(t, s="p"):  return Paragraph(t, S[s])
def LI(t):        return Paragraph(t, S["li"], bulletText="•")
def CODE(t):      return Paragraph(t.replace("\n","<br/>"), S["code"])
def LINIE():      return HRFlowable(width="100%", thickness=0.7, color=AKZENT,
                                    spaceBefore=2, spaceAfter=10)

def fuss(c, d):
    c.saveState()
    c.setFont("DJ", 7.5); c.setFillColor(GRAU)
    c.drawString(20*mm, 12*mm, "Anleitung Domain und E-Mail-Postfach  ·  Leyla Huseynova")
    c.drawRightString(190*mm, 12*mm, "Seite %d" % c.getPageNumber())
    c.setStrokeColor(colors.HexColor("#DDDDDD")); c.setLineWidth(0.5)
    c.line(20*mm, 15*mm, 190*mm, 15*mm)
    c.restoreState()

ziel = "/tmp/claude-0/-home-user-kpidashboard-pg/2111094c-af39-585d-9649-ab21b643292c/scratchpad/pdf/Anleitung_Domain_und_Postfach.pdf"
doc = SimpleDocTemplate(ziel, pagesize=A4, title="Anleitung: Domain und E-Mail-Postfach einrichten",
                        author="Leyla Huseynova", leftMargin=20*mm, rightMargin=20*mm,
                        topMargin=18*mm, bottomMargin=20*mm)
E = []

E += [P("Eigene Domain und E-Mail-Adresse einrichten", "titel"),
      P("Schritt für Schritt. Zeitaufwand etwa eine Stunde, Kosten rund 2 bis 3 Euro im Monat.", "unter"),
      LINIE()]

E += [P("Warum das nötig ist", "h1"),
      P("Die Akquisemails gehen bisher von einer privaten Gmail-Adresse ohne Website und ohne "
        "Impressum raus. Für einen Geschäftsführer, der die Mail bekommt, sieht das nach "
        "Massenversand aus, und Spamfilter sehen das genauso. Eine eigene Domain ändert beides: "
        "die Mail wirkt wie von einem Unternehmen, und sie kommt häufiger im Posteingang an "
        "statt im Spam."),
      P("Wichtig vorweg: Das Gmail-Postfach bleibt bestehen. Alle bereits verschickten Mails und "
        "laufenden Gespräche hängen daran. Nur neue Erstkontakte laufen künftig über die neue Adresse.")]

E += [P("Schritt 1  ·  Domain aussuchen und kaufen", "h1"),
      P("Empfehlung: <b>leyla-huseynova.de</b>", "p"),
      P("Der eigene Name ist hier die beste Wahl, weil er zum Antrag auf Selbstständigkeit passt "
        "und auch dann noch stimmt, wenn sich das Angebot später verschiebt.")]

t = Table([[Paragraph("<b>Ebenfalls frei</b>", S["klein"]), Paragraph("<b>Anmerkung</b>", S["klein"])],
           [Paragraph("moeblierungsplanung.de", S["klein"]), Paragraph("beschreibend, gute Alternative", S["klein"])],
           [Paragraph("huseynova-planung.de", S["klein"]),   Paragraph("Name plus Leistung", S["klein"])],
           [Paragraph("moeblierte-einheiten.de", S["klein"]),Paragraph("sehr eng auf ein Modell", S["klein"])],
           [Paragraph("wohnungen-moeblieren.de", S["klein"]),Paragraph("sehr eng auf ein Modell", S["klein"])]],
          colWidths=[62*mm, 98*mm])
t.setStyle(TableStyle([
    ("BACKGROUND",(0,0),(-1,0), HELL),
    ("LINEBELOW",(0,0),(-1,0), 0.6, AKZENT),
    ("LINEBELOW",(0,1),(-1,-2), 0.3, colors.HexColor("#DDDDDD")),
    ("VALIGN",(0,0),(-1,-1),"MIDDLE"),
    ("TOPPADDING",(0,0),(-1,-1),4), ("BOTTOMPADDING",(0,0),(-1,-1),4),
    ("LEFTPADDING",(0,0),(-1,-1),6),
]))
E += [Spacer(1,3), t, Spacer(1,8)]

E += [Paragraph("Wichtig: Der Name darf kein „Architekt“, „Architektur“ oder „Innenarchitektur“ "
                "enthalten. Die Berufsbezeichnung ist in Berlin geschützt und nur mit Eintragung "
                "in die Architektenliste erlaubt, und zwar auch in Wortverbindungen wie "
                "„Architekturbüro“. Der Studienabschluss darf genannt werden: „M.Sc. Architektur“.",
                S["merk"])]

E += [P("Kaufen lässt sich die Domain bei jedem Anbieter. Eine .de-Domain kostet 10 bis 15 Euro im "
        "Jahr, bei deutschen Anbietern meist weniger als bei internationalen.")]

E += [P("Schritt 2  ·  Postfach anlegen", "h1")]
t2 = Table([[Paragraph("<b>Anbieter</b>", S["klein"]), Paragraph("<b>Kosten etwa</b>", S["klein"]), Paragraph("<b>Für wen</b>", S["klein"])],
            [Paragraph("Zoho Mail", S["klein"]), Paragraph("0 bis 1 € / Monat", S["klein"]), Paragraph("günstigste seriöse Lösung", S["klein"])],
            [Paragraph("IONOS oder Strato", S["klein"]), Paragraph("1 bis 3 € / Monat", S["klein"]), Paragraph("Domain und Postfach aus einer Hand", S["klein"])],
            [Paragraph("Google Workspace", S["klein"]), Paragraph("6 bis 7 € / Monat", S["klein"]), Paragraph("wenn die Gmail-Oberfläche gewohnt ist", S["klein"])]],
           colWidths=[48*mm, 40*mm, 72*mm])
t2.setStyle(TableStyle([
    ("BACKGROUND",(0,0),(-1,0), HELL),
    ("LINEBELOW",(0,0),(-1,0), 0.6, AKZENT),
    ("LINEBELOW",(0,1),(-1,-2), 0.3, colors.HexColor("#DDDDDD")),
    ("VALIGN",(0,0),(-1,-1),"MIDDLE"),
    ("TOPPADDING",(0,0),(-1,-1),4), ("BOTTOMPADDING",(0,0),(-1,-1),4),
    ("LEFTPADDING",(0,0),(-1,-1),6),
]))
E += [Spacer(1,3), t2, Spacer(1,8),
      P("Die Adresse sollte <b>leyla@leyla-huseynova.de</b> lauten, nicht info@ oder kontakt@. "
        "Eine persönliche Mail soll auch persönlich abgesendet sein. Die Preise sind "
        "Größenordnungen, sie ändern sich.")]

E += [P("Schritt 3  ·  Drei DNS-Einträge setzen", "h1"),
      P("Ohne diese Einträge landen die Mails schlechter als vorher. Sie werden beim "
        "Domain-Anbieter unter „DNS“ eingetragen."),
      P("MX-Eintrag", "h2"),
      P("Kommt aus der Anleitung des Mailanbieters, einfach übernehmen."),
      P("SPF, als TXT-Eintrag auf der Hauptdomain", "h2"),
      P("Genau ein SPF-Eintrag pro Domain. Der Teil nach „include:“ hängt vom Anbieter ab:"),
      CODE("Zoho&nbsp;&nbsp;&nbsp;&nbsp;v=spf1 include:zoho.eu -all\n"
           "Google&nbsp;&nbsp;v=spf1 include:_spf.google.com -all\n"
           "IONOS&nbsp;&nbsp;&nbsp;v=spf1 include:_spf-eu.ionos.com -all"),
      P("DKIM", "h2"),
      P("Der Schlüssel wird im Mailkonto erzeugt, nicht selbst ausgedacht. Der Anbieter nennt "
        "dabei einen sogenannten Selector, zum Beispiel „zoho“. Der Eintrag kommt dann als "
        "TXT-Eintrag auf:"),
      CODE("&lt;selector&gt;._domainkey" + "&nbsp;"*8 + "Wert: vom Anbieter geliefert"),
      P("DMARC, als TXT-Eintrag auf _dmarc", "h2"),
      CODE("v=DMARC1; p=none; rua=mailto:leyla@leyla-huseynova.de"),
      P("Zuerst p=none, damit nichts verloren geht. Nach zwei bis drei Wochen ohne Probleme auf "
        "p=quarantine ändern."),
      P("Prüfen", "h2"),
      P("Etwa eine Stunde später eine Testmail an ein Gmail-Konto schicken, dort im Menü "
        "„Original anzeigen“ öffnen. Bei SPF, DKIM und DMARC muss jeweils PASS stehen.")]

E += [P("Schritt 4  ·  Langsam anfangen", "h1"),
      Paragraph("Das ist der wichtigste Punkt. Eine neue Domain, die sofort viele Mails "
                "verschickt, wird als Spam eingestuft. Der Ruf einer Domain lässt sich nur "
                "schwer reparieren, deshalb lieber zwei Wochen Geduld.", S["merk"])]
t3 = Table([[Paragraph("<b>Zeitraum</b>", S["klein"]), Paragraph("<b>Mails pro Tag</b>", S["klein"])],
            [Paragraph("Woche 1", S["klein"]),   Paragraph("5 bis 8", S["klein"])],
            [Paragraph("Woche 2", S["klein"]),   Paragraph("12 bis 15", S["klein"])],
            [Paragraph("ab Woche 3", S["klein"]),Paragraph("24", S["klein"])]],
           colWidths=[48*mm, 112*mm])
t3.setStyle(TableStyle([
    ("BACKGROUND",(0,0),(-1,0), HELL),
    ("LINEBELOW",(0,0),(-1,0), 0.6, AKZENT),
    ("LINEBELOW",(0,1),(-1,-2), 0.3, colors.HexColor("#DDDDDD")),
    ("VALIGN",(0,0),(-1,-1),"MIDDLE"),
    ("TOPPADDING",(0,0),(-1,-1),4), ("BOTTOMPADDING",(0,0),(-1,-1),4),
    ("LEFTPADDING",(0,0),(-1,-1),6),
]))
E += [t3, Spacer(1,8),
      P("Was in dieser Zeit hilft: echte Mails an Menschen, die auch antworten. Jede Antwort "
        "verbessert den Ruf der Domain. Gespräche mit früheren Arbeitgebern oder Büros also "
        "ruhig per Mail von der neuen Adresse weiterführen.")]

E += [P("Schritt 5  ·  Eine Seite Website", "h1"),
      P("Eine Domain ohne Website ist schlechter als keine Domain, weil jeder, der nachsieht, "
        "ins Leere läuft. Eine einzige Seite genügt:"),
      LI("Was angeboten wird, in drei Sätzen"),
      LI("Die drei Pakete mit Festpreisen"),
      LI("Kontakt"),
      LI("Impressum mit Name, vollständiger Anschrift, E-Mail und Telefon, Pflicht nach § 5 DDG"),
      Spacer(1,4),
      P("Auch hier gilt: kein „Architektin“ und kein „Architekturbüro“ auf der Seite.")]

E += [KeepTogether([P("Neuer Signaturblock für E-Mails", "h1"),
      CODE("Leyla Huseynova\n"
           "Einrichtung möblierter Wohnungen\n"
           "M.Sc. Architektur\n"
           "[Straße, PLZ Berlin]\n"
           "Tel. 0152 56246004\n"
           "leyla@leyla-huseynova.de\n"
           "leyla-huseynova.de")]),
      P("Die vollständige Anschrift ist für eine einzelne Mail keine Pflicht, hebt die "
        "Glaubwürdigkeit aber deutlich.")]

E += [LINIE(),
      P("Checkliste", "h1"),
      LI("Domain gekauft"),
      LI("Postfach angelegt, Adresse leyla@…"),
      LI("MX-Eintrag gesetzt"),
      LI("SPF-Eintrag gesetzt"),
      LI("DKIM im Mailkonto erzeugt und als TXT eingetragen"),
      LI("DMARC-Eintrag mit p=none gesetzt"),
      LI("Testmail an Gmail geschickt, SPF, DKIM und DMARC stehen auf PASS"),
      LI("Eine Seite Website mit Impressum online"),
      LI("Drei Pakete mit Festpreisen auf einem Blatt"),
      Spacer(1,8),
      Paragraph("Sobald das Postfach läuft, werden Versand und Vorlagen auf die neue Adresse "
                "umgestellt und die Tagesmenge auf den Warmlaufplan gesetzt. Das übernimmt nicht "
                "Leyla. Sie braucht nur Domain, Postfach und die DNS-Einträge, daran hängen ihre "
                "Zugangsdaten.", S["klein"])]

doc.build(E, onFirstPage=fuss, onLaterPages=fuss)
print("fertig:", ziel)
