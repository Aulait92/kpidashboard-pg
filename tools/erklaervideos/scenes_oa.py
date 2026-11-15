import os; EV=os.environ.get('EV_DIR','/var/tmp/ev'); os.makedirs(EV,exist_ok=True)
import json, sys
import subprocess, urllib.request, wave
INSTR="Sprich auf Deutsch, freundlich, ruhig und klar, wie ein professioneller Sprecher in einem Erklärvideo für eine Software. Den Firmennamen Performance Growth sprichst du englisch aus. Englische Wörter wie Lead, Leads, Chats, App, Pipeline, Videocall, Google und Outlook sprichst du englisch aus."
def synth(text,out):
    req=urllib.request.Request('https://api.openai.com/v1/audio/speech',data=json.dumps(dict(model='gpt-4o-mini-tts',voice='onyx',input=text,instructions=INSTR,response_format='wav')).encode(),headers={'Authorization':'Bearer proxy-injected','Content-Type':'application/json'})
    open(out+'.tmp.wav','wb').write(urllib.request.urlopen(req,timeout=120).read())
    subprocess.run(['ffmpeg','-v','error','-y','-i',out+'.tmp.wav','-ar','48000','-ac','1',out],check=True)
    d=float(subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',out],capture_output=True,text=True).stdout)
    return d,0
KURZ=[
 ("intro","", "Willkommen bei Performance Growth. In einer Minute zeigen wir Ihnen das Wichtigste."),
 ("heute","Heute: alles, was heute zu tun ist","Ihr Startpunkt ist ‚Heute‘. Hier steht alles, was heute zu tun ist: Chats, Termine und Ihre Anrufliste."),
 ("termin","Termin antippen","Tippen Sie auf einen Termin. Sie sehen sofort, was der Assistent schon gefragt hat."),
 ("nachrichten_chat","Nachrichten: Ihr WhatsApp-Assistent","Ihr WhatsApp-Assistent schreibt neue Leads in wenigen Minuten an und bucht Termine direkt in Ihren Kalender."),
 ("kontakte_pipeline","Kontakte: alle Leads im Überblick","Unter ‚Kontakte‘ finden Sie alle Leads, als Liste oder als Pipeline."),
 ("wachstum_zahlen","Wachstum: Ihre Zahlen","Und unter ‚Wachstum‘ sehen Sie, was es Ihnen bringt."),
 ("outro","","Fragen? Die KI-Hilfe unten links ist jederzeit für Sie da. Viel Erfolg!"),
]
LANG=[
 ("intro","", "Willkommen bei Performance Growth. In den nächsten Minuten zeigen wir Ihnen Schritt für Schritt, wie Sie mit der Software arbeiten."),
 ("nav","Die vier Bereiche","Links finden Sie die vier Bereiche: Heute, Kontakte, Nachrichten und Wachstum. Auf dem Handy finden Sie dieselben Bereiche unten am Bildschirmrand."),
 ("tiles","Heute: Ihr Startpunkt","‚Heute‘ ist Ihr Startpunkt. Ganz oben stehen Termine, für die Sie vorher ein Angebot rechnen. Darunter sehen Sie auf einen Blick, wie viele Chats, Termine, Ergebnisse und Anrufe anstehen."),
 ("braucht","Braucht dich","Unter ‚Braucht dich‘ stehen Leads, die geantwortet haben und auf Sie warten. Mit ‚Antworten‘ öffnen Sie direkt den Chat."),
 ("termin","Ihre Termine","Bei Ihren Terminen sehen Sie die Zusammenfassung des Assistenten: Lebenssituation, Interesse und Rückfragen. Anrufen oder Videocall starten Sie mit einem Klick."),
 ("phase","Phase und Ergebnis","Oben im Kontakt sehen Sie die Phase. Ein Klick ändert sie. Mit ‚Gewonnen‘ oder ‚Verloren‘ schließen Sie einen Lead ab."),
 ("notizen","Angaben und Notizen","Darunter stehen alle Angaben aus dem Formular und Ihre Notizen."),
 ("anrufliste","Anrufliste","In der Anrufliste stehen Rückrufe und fällige Wiedervorlagen. Überfälliges ist rot markiert. Nach dem Anruf tragen Sie das Ergebnis ein, den Rest erledigt die App."),
 ("nachrichten","Nachrichten","Unter ‚Nachrichten‘ finden Sie alle WhatsApp-Gespräche mit Ihren Leads."),
 ("chat","Ihr WhatsApp-Assistent","Ihr Assistent schreibt jeden neuen Lead in wenigen Minuten an, in Ihrem Namen. Er stellt die wichtigsten Fragen und bucht den Termin in eine freie Zeit Ihres Kalenders. Bestätigung und Erinnerung schickt er automatisch."),
 ("selbst","Selbst schreiben","Möchten Sie selbst antworten, schreiben Sie einfach los. Dann hält sich der Assistent in diesem Chat zurück."),
 ("kontakte","Kontakte","Unter ‚Kontakte‘ sehen Sie alle Leads als Liste, mit Suche und Filtern, zum Beispiel ‚Rückruf nötig‘ oder ‚Wiedervorlage fällig‘."),
 ("pipeline","Pipeline","In der Pipeline sehen Sie jeden Lead nach Phase. Am Computer ziehen Sie Karten einfach in die nächste Spalte. Bei Abschlüssen zeigt die App Beitrag und geschätzte Provision."),
 ("wachstum","Wachstum","Unter ‚Wachstum‘ finden Sie Ihre Zahlen, Ihr Werbebudget und die Hochrechnung für den Monat."),
 ("zahlen","Ihre Zahlen","Der Vertriebstrichter zeigt, wie viele Leads Sie erreichen, wie viele einen Termin bekommen und wie viele abschließen. Darunter sehen Sie Ihre Kosten und den Ertrag."),
 ("kalender","Mein Kalender","Unter ‚Mein Kalender‘ verbinden Sie Ihren Google- oder Outlook-Kalender und legen fest, wann Leads Termine buchen dürfen. Der Assistent bietet nur diese Zeiten an, und nur, wenn Sie dann frei sind."),
 ("team","Team","Arbeiten Sie im Team? Dann laden Sie unter ‚Team‘ Ihre Berater ein. Neue Leads werden automatisch reihum verteilt."),
 ("outro","","Wenn Sie Fragen haben, hilft Ihnen die KI-Hilfe unten links sofort weiter, und mit einem Klick erreichen Sie unser Team. Viel Erfolg mit Performance Growth!"),
]
for name,L in (("kurz",KURZ),("lang",LANG)):
    out=[]
    for i,(act,cap,text) in enumerate(L):
        f=f"{EV}/{name}_{i:02d}.wav"; d,h=synth(text.replace("‚","„").replace("‘","“"),f)
        out.append(dict(act=act,cap=cap,text=text,wav=f,dur=round(d,2)))
    json.dump(out,open(f"{EV}/{name}.json","w"),ensure_ascii=False,indent=1)
    print(name, round(sum(x['dur'] for x in out),1), "s")
