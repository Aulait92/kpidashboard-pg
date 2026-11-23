"""Prueft einen Kontakt gegen seine eigene Webseite.

Die Firma-Felder im Pool stammen aus dem Crawler und sind oft falsch, deshalb
entscheidet die eigene Seite. Zwei Quellen mit unterschiedlichem Gewicht:

  kopf    = Seitentitel und Meta-Description. Was ein Betrieb dort nennt, ist
            seine Selbstbeschreibung. Nur hier wird ausgeschlossen, sonst
            trifft "maler" in "normalerweise" oder "Heizung" als Ausstattung.
  koerper = der sichtbare Textanfang. Nur fuer den positiven Beleg, dass ein
            als Bautraeger gefuehrter Kontakt wirklich Wohnraum erstellt.

Rueckgabe von mangel_laut_seite: None wenn sauber, sonst ein Grund als Text.
"""
import re
import subprocess

AUSFUEHRUNG = re.compile(
    r'vermessungsb|abdichter|abdichtung|zimmerer|zimmerei|dachdeck|bedachung|'
    r'\bmaler\b|lackier|geruestbau|gerüstbau|elektrotechn|elektroinstall|'
    r'sanitaer|sanitär|klempner|tiefbau|strassenbau|straßenbau|erdbau|'
    r'rohrbau|kanalbau|stahlbau|metallbau|schlosser|trockenbau|estrich|'
    r'fliesenleg|verputz|stuckateur|landschaftsbau|schreinerei|tischlerei|'
    r'glaserei|bauunternehmen|hoch.?und.?tiefbau|\brohbau\b|baugeschaeft|'
    r'baugeschäft|transportbeton|betonprodukt|betonwerk|baustoffhandel|'
    r'kernsanierung|komplettsanierung|sanierungsunternehmen', re.I)

DIENSTLEISTER = re.compile(
    r'ingenieurb|planungsb|statik|tragwerksplan|bauphysik|gutachter|'
    r'sachverstaendig|sachverständig|energieberat|bildungsdienstleister|'
    r'bildungszentrum|ausbildungszentrum|steuerberat|rechtsanwalt|'
    r'versicherung|\bbank\b|sparkasse', re.I)

# Makler und Hausverwaltung schliessen nur aus, wenn kein Bautraeger-Beleg
# dagegensteht: viele Bautraeger vermarkten und verwalten auch selbst.
NEBENGESCHAEFT = re.compile(r'makler|immobilienmakl|hausverwaltung|verwalterb', re.I)

BESTAND = re.compile(
    r'genossensch|baugenossensch|bauverein|wohnungsgesellschaft|'
    r'wohnungsbaugesellschaft|wohnungsunternehmen|wohnungsverwaltung|'
    r'kommunale|siedlungswerk|wohnstaetten|wohnstätten|spar.?und.?bau', re.I)

HOTEL = re.compile(r'\bhotel\b|gasthaus|gaestehaus|gästehaus|\bpension\b|hostel|herberge', re.I)

# Eindeutige Selbstbeschreibungen eines Bestandshalters. Diese Wendungen kommen
# nicht zufaellig vor, deshalb duerfen sie auch im Koerpertext ausschliessen:
# ein kommunales Wohnungsunternehmen nennt sich im Titel oft nur "Wohnen in X".
BESTAND_PHRASEN = re.compile(
    r'kommunale[sn]? wohnungsunternehmen|st(ae|ä)dtische[sn]? wohnungsunternehmen|'
    r'wohnungsgenossenschaft|baugenossenschaft|wohnungsbaugenossenschaft|'
    r'wohnungsverwaltungs|unseren? wohnungsbestand|unseres wohnungsbestandes|'
    r'f(ue|ü)hrende[rn]? vermieter|gr(oe|ö)(ss|ß)te[rn]? vermieter|'
    r'bewirtschaftung und verwaltung|mitglieder der genossenschaft', re.I)

# Beleg, dass wirklich Wohnraum erstellt wird. Ohne einen davon ist der Opener
# "Sie entwickeln Wohnprojekte" nicht gedeckt.
BAUTRAEGER_BELEG = re.compile(
    r'bautr(ae|ä)ger|projektentwickl|eigentumswohn|schl(ue|ü)sselfertig|'
    r'wohnprojekt|wohnquartier|wohnbauprojekt|neubauprojekt|bauvorhaben|'
    r'wohnanlage|reihenh(ae|äu)s|doppelh(ae|äu)s|stadth(ae|äu)s|'
    r'wohnungsbau|immobilienentwickl', re.I)

BEHERBERGUNG = ('Boardinghaus', 'Appartementhäuser', 'Studentenwohnheime')


def seite_holen(domain, timeout=12):
    """Liefert (kopf, koerper). Beide leer, wenn die Seite nicht erreichbar ist."""
    url = 'https://' + domain.strip().lstrip('.')
    try:
        roh = subprocess.run(['curl', '-sS', '-L', '--max-time', str(timeout), url],
                             capture_output=True,
                             timeout=timeout + 5).stdout.decode('utf-8', 'replace')
    except Exception:
        return '', ''
    roh = roh.replace('\n', ' ')
    kopf = []
    t = re.search(r'<title[^>]*>(.{0,200}?)</title>', roh, re.I | re.S)
    if t:
        kopf.append(t.group(1))
    for m in re.finditer(r'<meta[^>]+name=[\'"]description[\'"][^>]+content=[\'"]([^\'"]{0,300})',
                         roh, re.I):
        kopf.append(m.group(1))
    koerper = re.sub(r'<(script|style|noscript)[^>]*>.*?</\1>', ' ', roh, flags=re.I | re.S)
    koerper = re.sub(r'\s+', ' ', re.sub(r'<[^>]*>', ' ', koerper))[:6000]
    return re.sub(r'<[^>]*>', ' ', ' '.join(kopf)), koerper


def mangel_laut_seite(kontakt, seite=None):
    if seite is None:
        seite = seite_holen(kontakt['Email'].split('@')[-1])
    kopf, koerper = seite
    if not kopf.strip() and not koerper.strip():
        return 'Seite nicht erreichbar, nicht pruefbar'
    beleg = BAUTRAEGER_BELEG.search(kopf + ' ' + koerper)
    for regex, grund in ((AUSFUEHRUNG, 'Handwerks- oder Bauausfuehrungsbetrieb'),
                         (DIENSTLEISTER, 'Planungs- oder Dienstleistungsbuero, kein Auftraggeber'),
                         (BESTAND, 'Bestandshalter, kein Bautraeger')):
        tr = regex.search(kopf)
        if tr:
            return '%s (nennt sich selbst: "%s")' % (grund, tr.group(0).strip())
    tr = BESTAND_PHRASEN.search(kopf + ' ' + koerper)
    if tr:
        return 'Bestandshalter, kein Bautraeger (nennt sich selbst: "%s")' % tr.group(0).strip()
    tr = NEBENGESCHAEFT.search(kopf)
    if tr and not beleg:
        return 'Makler oder Verwalter ohne eigene Bautaetigkeit (nennt sich selbst: "%s")' % tr.group(0).strip()
    seg = kontakt.get('Segment', '')
    if seg in BEHERBERGUNG:
        tr = HOTEL.search(kopf)
        if tr:
            return 'Hotelbetrieb, kein Boardinghaus (nennt sich selbst: "%s")' % tr.group(0).strip()
    if seg == 'Bauträger' and not beleg:
        return 'kein Beleg fuer Bautraegertaetigkeit auf der eigenen Seite'
    return None
