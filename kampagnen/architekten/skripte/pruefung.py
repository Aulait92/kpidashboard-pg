# Qualitaetspruefung der Opener, bevor etwas im Namen von Leyla rausgeht.
import re
GENO = re.compile(r'genossensch|baugen|bauverein|wohnungsbau|wohnungsgesell|wohnbau|gewoge|'
                  r'\bwbg\b|\bwg\b|\bwgg\b|\bswg\b|\bawg\b|\bwvg\b|\bgwg\b|\bgwm\b|'
                  r'\bbsg\b|\bgbg\b|\bbvg\b|\bwobau\b|'
                  r'siedlungswerk|spar.?und.?bau', re.I)
ORT_KAPUTT = {'Have'}   # nachweislich abgeschnitten
# Studentenverbindungen: keine Betreiber, sondern Korporationen mit einem Haus.
VERBINDUNG = re.compile(r'burschenschaft|studentenverbindung|\bcorps\b|landsmannschaft|'
                        r'turnerschaft|wingolf|\bk\.?d\.?st\.?v|\bkstv\b|\bakv\b|'
                        r'saengerschaft|sängerschaft|\bverbindung\b|akademische.?verbindung|'
                        r'(?:^|[^a-z])(?:franconia|nibelungia|teutonia|saxonia|borussia|rhenania|'
                        r'markomannia|alemannia|cheruskia|germania|guestfalia|hansea|normannia|'
                        r'palatia|suevia|thuringia|vandalia|westfalia|bavaria|silesia|'
                        r'arminia|hercynia|frisia|holsatia|baltia|rugia|onoldia|marchia)(?:[^a-z]|$)', re.I)
VERB_MAIL = re.compile(r'^(senior|consenior|cc|fm|x|aha|ahv|chargen)@', re.I)
HANDWERK = re.compile(r'balkon|fenster|tueren|türen|treppen|zaun|dachdeck|schlosser|'
                      r'sanitaer|sanitär|elektro|maler|geruest|gerüst|estrich|fliesen|'
                      r'tiefbau|strassenbau|straßenbau|rohrbau|erdbau|abbruch|'
                      r'vermessung|modulbau|gartenbau|landschaftsbau|gerueststell|'
                      r'putz|stuck|keramik|stahlbau|metallbau|zimmerei|trockenbau|'
                      r'bedachung|pflaster|lackier|beschichtung|galvanik|schweiss|'
                      r'schweiß|zerspan|bohrtechn|kaelte|kälte|klimatechn|heizung', re.I)
# Branchen, die keine moeblierten Wohnungen abnehmen.
FREMD = re.compile(r'finanz|versicher|steuerberat|rechtsanwalt|\bnotar|\bbank\b|'
                   r'sparkasse|autohaus|apotheke|werbeagentur|druckerei', re.I)
# Orte, die der Crawler aus Navigationstexten gezogen hat, nicht aus einer Adresse.
ORT_UNSINN = re.compile(r'^(im unternehmen|kontakt|karte|startseite|impressum|home|'
                        r'unternehmen|aktuelles|ueber uns|über uns|die|der|das|den|dem|'
                        r'leistungen|referenzen|service|news|e-mail|email|mail|'
                        r'telefon|fax|adresse|anfahrt|datenschutz|anschrift|anfragen|'
                        r'buchungsanfrage|buchung|herzlich|willkommen|oeffnungszeiten|'
                        r'öffnungszeiten|anmeldung|reservierung)$', re.I)
# Rollenadressen, die nie im Einkauf landen.
ROLLE = re.compile(r'^(ir|presse|press|karriere|jobs|bewerbung|datenschutz|'
                   r'webmaster|marketing|redaktion|medizinprodukte|hygiene|'
                   r'qualitaetsmanagement|qualitätsmanagement|betriebsrat|buchhaltung)@', re.I)
# Bestandshalter: Genossenschaften und kommunale Wohnungsunternehmen. Die vermieten
# unmoebliert an Mitglieder oder zu Sozialmieten und bauen keine Musterwohnungen.
# Drei Absagen aus genau dieser Gruppe (Gewoge Duisburg, Bochumer Wohnstaetten,
# Baugisar Regensburg) sagen dasselbe: falsches Geschaeftsmodell, nicht fehlendes Budget.
BESTANDSHALTER = re.compile(r'genossensch|baugen|bauverein|wohnungsgesell|wohnungsunternehmen|'
                            r'wohnungsbaugesell|wohnstaetten|wohnstätten|gewoge|wobau|'
                            r'kreisbau|siedlungswerk|spar.?und.?bau|gemeinnuetzig|gemeinnützig|'
                            r'\bwbg\b|\bwg\b|\bwgg\b|\bswg\b|\bawg\b|\bwvg\b|\bgwg\b|\bgwm\b|'
                            r'\bbsg\b|\bgbg\b|\bbvg\b|\bvbw\b|\beg\b', re.I)
# Verlage und Adressbuecher, die der Crawler faelschlich als Betreiber gefuehrt hat.
MEDIEN = re.compile(r'verlag|medien|telefonadress|adressbuch|branchenbuch|zeitung|'
                    r'werbeagentur|anzeigenblatt|buchbestellung|buchhandel|'
                    r'anzeigen@|abo@|vertrieb@', re.I)
# Hotels und Pensionen moeblieren Zimmer, keine Wohnungen. Anderes Geschaeft,
# andere Ansprache: in den moeblierten Segmenten aussortieren.
HOTEL = re.compile(r'hotel|gasthaus|gaestehaus|gästehaus|pension|hostel|herberge', re.I)
BEHERBERGUNG = {'Boardinghaus', 'Appartementhäuser', 'Studentenwohnheime'}
# Ambulante Pflege hat keine eigenen Wohnungen zum Einrichten.
AMBULANT = re.compile(r'ambulant|hauskrankenpflege|pflegedienst|sozialstation|'
                      r'tagespflege|intensivpflege|krankenpflege|pflegeteam', re.I)

def mangel(x):
    o, f, ort = x['Opener'], x['Firma'], x.get('Ort', '')
    # Der Firmenname aus dem Crawler ist oft Muell. Domain und Website mitpruefen.
    quellen = ' '.join([f, x.get('Website', ''), x['Email'].split('@')[-1]])
    if '..' in o:                                   return 'Ort kaputt (doppelter Punkt)'
    if re.search(r'\bin\.', o):                     return 'Ort fehlt'
    if ort in ORT_KAPUTT or len(ort) < 3:           return 'Ort abgeschnitten: %r' % ort
    if re.search(r'entwickeln [\d.]+ (Zimmer|Betten)', o):
                                                    return 'Einheit passt nicht zum Verb'
    m = re.search(r'(?:betreiben|entwickeln) ([\d.]+)', o)
    if m and GENO.search(quellen) and int(m.group(1).replace('.', '')) < 150:
        return 'Projektzahl (%s) statt Bestand' % m.group(1)
    if VERBINDUNG.search(quellen) \
       or VERB_MAIL.search(x['Email']) \
       or any(VERB_MAIL.search(a.strip()) for a in x.get('weitere', '').split(';') if a.strip()):
                                                    return 'Studentenverbindung, kein Betreiber'
    if HANDWERK.search(quellen):                    return 'Handwerksbetrieb, kein Abnehmer'
    if FREMD.search(x.get('Website', '') + ' ' + x['Email'].split('@')[-1]):
                                                    return 'fremde Branche, kein Abnehmer'
    if BESTANDSHALTER.search(quellen):              return 'Bestandshalter, vermietet unmoebliert'
    if MEDIEN.search(quellen) or MEDIEN.search(x['Email']) or MEDIEN.search(x.get('weitere', '')):
                                                    return 'Verlag oder Adressbuch, kein Betreiber'
    if HOTEL.search(quellen) and x.get('Segment') in BEHERBERGUNG:
                                                    return 'Hotel oder Pension, kein Wohnungsbetreiber'
    if AMBULANT.search(quellen):                    return 'ambulante Pflege, keine eigenen Wohnungen'
    if re.search(r'betreiben [\d.]+ Plätze', o):     return 'unsauberes Deutsch (Plätze betreiben)'
    if re.search(r'mit [\d.]+ Standorte', o):       return 'Standorte sind kein Haus'
    if ORT_UNSINN.match(ort.strip()):               return 'Ort aus Navigation: %r' % ort
    if re.search(r'\s(telefon|tel|fax|e-?mail)$', ort.strip(), re.I):
                                                    return 'Ort mit Navigationsrest: %r' % ort
    if re.search(r'(beschichtung|verarbeitung|fertigung|technik|montage|leistung|'
                 r'produkte|qualitaet|qualität|loesung|lösung)$', ort.strip(), re.I):
                                                    return 'Ort ist ein Produktbegriff: %r' % ort
    if ROLLE.match(x['Email']):                     return 'Rollenadresse, nicht Einkauf'
    # Von der Strichersetzung zerbrochener Satz: ". Die am Markt", ". Der ..."
    if re.search(r'\.\s+(Die|Der|Das|Den|Dem|Und|Mit|Für)\s', o):
                                                    return 'Satz zerbrochen'
    if re.search(r'mit [\d.]+ (Plätze|Zimmer|Betten|Wohnungen|Standorte|Wohneinheiten)\.', o) and 'Ihr Haus' in o:
        n = int(re.search(r'mit ([\d.]+)', o).group(1).replace('.', ''))
        if n > 60:                                  return 'ein Haus mit %d Einheiten ist keins' % n
        if re.search(r'mit [\d.]+ Plätze\.', o):    return 'Grammatik (Plätze statt Plätzen)'
    j = re.search(r'seit (\d{4})', o)
    if j and int(j.group(1)) >= 2010:               return 'Jahr (%s) zu jung, wohl kein Gruendungsjahr' % j.group(1)
    if re.search(r'[–—]', o):                       return 'Gedankenstrich'
    return None
