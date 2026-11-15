# Sprechertexte und Ton für das Video „WhatsApp verbinden“ (Ablauf Stand 15.11.2026, Ole).
# Aufruf: python3 wa_scenes.py            alle Szenen neu
#         python3 wa_scenes.py 3 7        nur Szene 3 und 7 neu (Rest bleibt aus $EV_DIR/wa.json)
import os; EV=os.environ.get('EV_DIR','/var/tmp/ev'); os.makedirs(EV,exist_ok=True)
import json, subprocess, sys, numpy as np
ONLY=[int(x) for x in sys.argv[1:]]
sys.argv=['x']; exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'scenes_oa.py')).read().split("KURZ=[")[0])
INSTR=INSTR+(" 360dialog sprichst du als 'dreihundertsechzig Dialog' aus. Englische Begriffe aus der Oberfläche wie Join 360Dialog Hub,"
 " Log in, Sign up, Continue, Next, Use Meta-provided number, No, It's not connected, Yes, Business app, Voice call, Embedded Signup,"
 " Meta Business Signup, Create a WhatsApp account, Europe Berlin, Confirm, Improve your experience und Finish sprichst du englisch aus.")
from faster_whisper import WhisperModel
m=WhisperModel('small',device='cpu',compute_type='int8')
# (Aktion in wa_rec.js, Untertitel, Sprechertext, Wörter, die die Kontrolle per faster-whisper finden muss)
L=[
 ("card_intro","","In diesem Video zeigen wir Ihnen, wie Sie Ihre WhatsApp-Nummer mit Performance Growth verbinden. Das machen Sie nur einmal, es dauert etwa zehn Minuten.",["Growth"]),
 ("bereit","Vorher bereitlegen","Sie brauchen: Ihren Facebook-Login mit Admin-Rechten, Ihr E-Mail-Postfach, das Telefon zur Nummer und einen Computer, auf dem Pop-ups erlaubt sind.",["Admin"]),
 ("app_open","1. Einrichtung: WhatsApp verbinden","Öffnen Sie in der Einrichtung den Schritt „WhatsApp verbinden“ und wählen Sie Ihre Nummer, in diesem Beispiel eine neue Nummer.",[]),
 ("app_start","„Jetzt WhatsApp verbinden“","Klicken Sie auf „Jetzt WhatsApp verbinden“. Wir legen Ihr Konto bei 360dialog, unserem WhatsApp-Anbieter, kostenlos für Sie an.",["kostenlos"]),
 ("app_invited","2. E-Mail von 360dialog öffnen","Jetzt das Wichtigste: Öffnen Sie die E-Mail von 360dialog. Sie ist auf Englisch. Der Knopf öffnet direkt Ihr Postfach.",["Mail"]),
 ("mail","In der E-Mail: „Join 360Dialog Hub“","Klicken Sie in der E-Mail auf „Join 360Dialog Hub“ und legen Sie ein Passwort fest.",["Join","Passwort"]),
 ("app_check","3. Häkchen setzen, dann „Weiter“","Zurück in der Software setzen Sie das Häkchen „Erledigt“. Darunter finden Sie alle weiteren Schritte mit Bildern. Dann klicken Sie auf „Weiter: WhatsApp verbinden“.",["Häkchen"]),
 ("login","4. Bei 360dialog anmelden","Bei 360dialog melden Sie sich mit dem neuen Passwort an, über „Log in“. Bitte nicht mit Facebook oder Google.",["Google"]),
 ("verify","Code aus der zweiten E-Mail","Zur Sicherheit kommt eine zweite E-Mail mit einem Code. Tragen Sie ihn ein und klicken Sie auf „Continue“.",["Code"]),
 ("number","5. Nummer: Deutschland +49 statt USA +1","Geben Sie die Nummer ein: Stellen Sie das Land von USA auf Deutschland um, plus neunundvierzig, und tippen Sie die Nummer ohne die Null vorne. Dann „Next“.",["Deutschland"]),
 ("question","6. Schon bei WhatsApp?","Bei der Frage, ob die Nummer schon bei WhatsApp ist, wählen Sie für eine neue Nummer „No, It's not connected“.",["connected"]),
 ("sms","7. Nummer mit SMS-Code bestätigen","Dann bestätigen Sie die Nummer mit dem Code per SMS, bei Festnetz per „Voice call“.",["SMS"]),
 ("signup","8. „Embedded Signup“","Auf der Seite „Meta Business Signup“ klicken Sie unten rechts auf „Embedded Signup“. Es öffnet sich ein Fenster von Meta.",["Meta"]),
 ("mcontinue","9. Fenster von Meta: „Continue“","Im Fenster von Meta klicken Sie auf „Continue“. Ihre Nummer ist schon ausgewählt, also einfach „Next“.",["Continue"]),
 ("massets","10. Portfolio und WhatsApp-Konto","Wählen Sie Ihr eigenes Unternehmensportfolio und beim WhatsApp-Konto „Create a WhatsApp account“.",["account"]),
 ("minfo","11. Zeitzone Europe/Berlin","Firmenname wie im Impressum, Kategorie und Land. Bei der Zeitzone wählen Sie Europe, Berlin.",["Berlin"]),
 ("mreview","12. Prüfen und „Confirm“","Prüfen Sie, dass überall Ihr Firmenname steht, und klicken Sie auf „Confirm“.",["Firmenname"]),
 ("mfinish","13. Zwei Häkchen entfernen, dann „Finish“","Zum Schluss entfernen Sie unter „Improve your experience“ beide Häkchen und klicken auf „Finish“.",["Häkchen"]),
 ("app_done","Fast geschafft","Zurück in der Software steht „Fast geschafft“. Nach wenigen Minuten steht dort von selbst „Verbunden“. Meta prüft Ihr Konto dann noch innerhalb von 24 Stunden.",["geschafft","Meta"]),
 ("business","WhatsApp Business App? QR-Code statt SMS","Mit der WhatsApp Business App wählen Sie bei der Frage „Yes, Business app“ und scannen statt des SMS-Codes einen QR-Code mit der App.",["QR"]),
 ("card_outro","","Hakt es irgendwo? Buchen Sie in der Einrichtung einfach den Fünfzehn-Minuten-Hilfetermin. Dann verbinden wir WhatsApp gemeinsam.",["Hilfetermin"]),
]
for t in [x[1]+x[2] for x in L]:
    assert "–" not in t and "—" not in t, t
old={}
if ONLY and os.path.exists(EV+'/wa.json'):
    old={i:x for i,x in enumerate(json.load(open(EV+'/wa.json')))}
out=[]
for i,(act,cap,text,must) in enumerate(L):
    f=f"{EV}/wa_{i:02d}.wav"
    if ONLY and i not in ONLY and i in old and old[i]['text']==text:
        out.append(old[i]); continue
    for k in range(5):
        d,_=synth(text,f)
        subprocess.run(['ffmpeg','-v','error','-y','-i',f,'-ar','16000','-ac','1','-f','f32le',EV+'/chk.raw'])
        t=' '.join(s.text for s in m.transcribe(np.fromfile(EV+'/chk.raw',dtype=np.float32),language='de')[0])
        ok=all(w.lower() in t.lower() for w in must)
        print(i,k,ok,round(d,1),t[:160],flush=True)
        if ok: break
    out.append(dict(act=act,cap=cap,text=text,wav=f,dur=round(d,2),heard=t))
json.dump(out,open(EV+'/wa.json','w'),ensure_ascii=False,indent=1)
print('total',round(sum(x['dur'] for x in out),1))
