import os; EV=os.environ.get('EV_DIR','/var/tmp/ev')
import json, subprocess, numpy as np
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'scenes_oa.py')).read().split("KURZ=[")[0])
INSTR=INSTR+" 360dialog sprichst du als 'dreihundertsechzig Dialog' aus."
from faster_whisper import WhisperModel
m=WhisperModel('small',device='cpu',compute_type='int8')
L=[
 ("card_intro","","In diesem Video zeigen wir Ihnen, wie Sie Ihre WhatsApp-Nummer mit Performance Growth verbinden. Das machen Sie nur einmal, und es dauert etwa zehn Minuten.",["Growth"]),
 ("bereit","Vorher bereitlegen","Legen Sie vorher drei Dinge bereit: Ihren Facebook-Login mit Admin-Rechten im Unternehmensportfolio, also dort, wo auch Ihr Werbekonto liegt. Ihr Handy mit der WhatsApp Business App. Und einen Computer, auf dem Pop-up-Fenster erlaubt sind.",["Pop-up"]),
 ("app_open","1. In der Software: Nummer wählen","Öffnen Sie in der Software die Einrichtung und dort den Schritt „WhatsApp verbinden“. Zuerst wählen Sie, welche Nummer Ihr Assistent nutzen soll.",[]),
 ("app_business","Ihre Nummer aus der WhatsApp Business App","Am häufigsten ist es Ihre Nummer aus der WhatsApp Business App. Leads und Kunden kennen sie schon, und Sie schreiben in der App einfach weiter.",["Leads"]),
 ("app_anbieter","„Jetzt WhatsApp verbinden“","Ist die Nummer nicht bei einem anderen WhatsApp-Anbieter verbunden, wählen Sie „Nein“. Dann klicken Sie auf „Jetzt WhatsApp verbinden“.",[]),
 ("s360","2. Konto bei 360dialog anlegen","Es öffnet sich die Seite von 360dialog, unserem WhatsApp-Anbieter. Dort legen Sie kostenlos ein Konto mit E-Mail und Passwort an. Die Nummer bleibt Ihre.",[]),
 ("mlogin","3. Mit Facebook anmelden","Danach öffnet sich ein Fenster von Meta. Sie melden sich mit Facebook an und klicken auf „Weiter“. Sehen Sie kein Fenster? Dann erlauben Sie Pop-ups im Browser und klicken noch einmal.",[]),
 ("mport","4. Unternehmensportfolio wählen","Wählen Sie Ihr Unternehmensportfolio, meist dasselbe wie für Ihr Werbekonto. Diese Auswahl lässt sich später nicht mehr ändern.",[]),
 ("mbiz","5. „Mit der WhatsApp Business App verbunden“","Meta fragt, ob die Nummer schon in WhatsApp läuft. Wählen Sie: „Ja, diese Nummer ist mit der WhatsApp Business App verbunden“.",[]),
 ("qr","6. QR-Code mit dem Handy scannen","Auf Ihrem Handy kommt eine Nachricht in der WhatsApp Business App. Tippen Sie darauf und scannen Sie den QR-Code auf dem Bildschirm. Chatverlauf und Kontakte können Sie dabei übernehmen.",[]),
 ("done","Fertig: verbunden","Fertig. Das Fenster schließt sich, und in der Software steht „Verbunden“. Steht dort „wird eingerichtet“, ist das normal. Es dauert meist nur wenige Minuten.",[]),
 ("wege","Andere Nummer?","Sie nutzen eine neue Nummer oder Festnetz? Dann bestätigen Sie die Nummer mit einem Code per SMS oder Anruf. Eine private WhatsApp-Nummer stellen Sie vorher kostenlos auf WhatsApp Business um.",[]),
 ("card_outro","","Hakt es irgendwo? Buchen Sie in der Einrichtung einfach den Fünfzehn-Minuten-Hilfetermin. Dann verbinden wir WhatsApp gemeinsam.",[]),
]
out=[]
for i,(act,cap,text,must) in enumerate(L):
    f=f"{EV}/wa_{i:02d}.wav"
    for k in range(5):
        d,_=synth(text,f)
        subprocess.run(['ffmpeg','-v','error','-y','-i',f,'-ar','16000','-ac','1','-f','f32le',EV+'/chk.raw'])
        t=' '.join(s.text for s in m.transcribe(np.fromfile(EV+'/chk.raw',dtype=np.float32),language='de')[0])
        ok=all(w.lower() in t.lower() for w in must+["WhatsApp"] if (w!="WhatsApp" or "WhatsApp" in text))
        print(i,k,ok,round(d,1),t[:120])
        if ok: break
    out.append(dict(act=act,cap=cap,text=text,wav=f,dur=round(d,2)))
json.dump(out,open(EV+'/wa.json','w'),ensure_ascii=False,indent=1)
print('total',round(sum(x['dur'] for x in out),1))
