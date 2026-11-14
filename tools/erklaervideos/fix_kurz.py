import os; EV=os.environ.get('EV_DIR','/var/tmp/ev')
import json, sys, subprocess, numpy as np
sys.argv=['x']; exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'scenes_oa.py')).read().split("for name,L in")[0])
from faster_whisper import WhisperModel
m=WhisperModel('small',device='cpu',compute_type='int8')
sc=json.load(open('kurz.json'))
need={1:["Chats"],3:["Leads"],4:["Leads"]}
for i,words in need.items():
    for k in range(6):
        d,_=synth(sc[i]['text'].replace("‚","„").replace("‘","“"),sc[i]['wav'])
        subprocess.run(['ffmpeg','-v','error','-y','-i',sc[i]['wav'],'-ar','16000','-ac','1','-f','f32le',EV+'/chk.raw'])
        a=np.fromfile(EV+'/chk.raw',dtype=np.float32); t=' '.join(s.text for s in m.transcribe(a,language='de')[0])
        ok=all(w in t for w in words); print(i,k,ok,t)
        if ok: sc[i]['dur']=round(d,2); break
json.dump(sc,open('kurz.json','w'),ensure_ascii=False,indent=1)
