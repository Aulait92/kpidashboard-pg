# Ton der Einführungsvideos gegenhören (faster-whisper) und Szenen mit falsch ausgesprochenen Begriffen neu erzeugen.
# Aufruf nach scenes_oa.py: python3 check_oa.py kurz lang
import os; EV=os.environ.get('EV_DIR','/var/tmp/ev')
import json, sys, subprocess, numpy as np
names=sys.argv[1:] or ['kurz','lang']
sys.argv=['x']; exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'scenes_oa.py')).read().split("KURZ=[")[0])
# Fallback (19.11.2026): lädt das faster-whisper-Modell nicht (Modelldateien liegen auf hf-CDN-Hosts, die die Umgebung
# evtl. sperrt), hört OpenAI whisper-1 über api.openai.com gegen (Schlüssel setzt der Proxy ein). Erzwingen: CHECK_OA_OPENAI=1
m=None
if not os.environ.get('CHECK_OA_OPENAI'):
    try:
        from faster_whisper import WhisperModel
        m=WhisperModel('small',device='cpu',compute_type='int8')
    except Exception as e:
        print('faster-whisper nicht verfügbar, nutze OpenAI whisper-1:',str(e)[:120])
def hear_openai(f):
    r=subprocess.run(['curl','-s','https://api.openai.com/v1/audio/transcriptions','-H','Authorization: Bearer proxy-injected','-F','model=whisper-1','-F','language=de','-F','file=@'+f],capture_output=True,text=True,check=True)
    return json.loads(r.stdout)['text']
# Begriffe, die englisch bzw. eindeutig klingen müssen (nur geprüft, wenn sie im Text stehen)
WORDS=["Growth","Leads","Lead","Chats","Pipeline","Google","Outlook","Videocall","Team"]
def hear(f):
    if m is None: return hear_openai(f)
    subprocess.run(['ffmpeg','-v','error','-y','-i',f,'-ar','16000','-ac','1','-f','f32le',EV+'/chk.raw'],check=True)
    return ' '.join(s.text for s in m.transcribe(np.fromfile(EV+'/chk.raw',dtype=np.float32),language='de')[0])
for name in names:
    sc=json.load(open(f'{EV}/{name}.json'))
    for i,x in enumerate(sc):
        must=[w for w in WORDS if w in x['text'].split() or w+',' in x['text'] or w+'.' in x['text'] or w+'‘' in x['text']]
        for k in range(6):
            t=hear(x['wav']); ok=all(w.lower() in t.lower() or w.lower().replace('lead','lied') in t.lower() for w in must)  # englisch „Lead“ hört Whisper als „Lied“
            print(name,i,k,ok,t[:150],flush=True)
            if ok: break
            if k==5: break
            d,_=synth(x['text'].replace("‚","„").replace("‘","“"),x['wav']); x['dur']=round(d,2)
        x['heard']=t
    json.dump(sc,open(f'{EV}/{name}.json','w'),ensure_ascii=False,indent=1)
    print(name,'total',round(sum(x['dur'] for x in sc),1))
