import os; EV=os.environ.get('EV_DIR','/var/tmp/ev'); os.makedirs(EV,exist_ok=True)
import json, subprocess, sys
V=sys.argv[1]; out=sys.argv[2]
log=json.load(open(f'{EV}/{V}_log.json')); sc=json.load(open(f'{EV}/{V}.json'))
t0=log['starts'][0]+0.15; end=log['end']; D=end-t0
inputs=['-ss',str(t0),'-t',str(D),'-i',log['video']]; fl=[]; labels=[]
for i,(s,st) in enumerate(zip(sc,log['starts'])):
    inputs+=['-i',s['wav']]; d=int((st-t0+0.45)*1000)
    fl.append(f'[{i+1}:a]aresample=48000,adelay={d}|{d},apad[a{i}]'); labels.append(f'[a{i}]')
fl.append(''.join(labels)+f'amix=inputs={len(labels)}:normalize=0:duration=first,atrim=0:{D:.2f},afade=t=out:st={D-0.6:.2f}:d=0.6,loudnorm=I=-16:TP=-1.5[aout]')
fl.append(f'[0:v]scale=1920:1080:flags=lanczos,fps=30,format=yuv420p,fade=t=in:st=0:d=0.4,fade=t=out:st={D-0.6:.2f}:d=0.6[vout]')
cmd=['ffmpeg','-v','error','-y']+inputs+['-filter_complex',';'.join(fl),'-map','[vout]','-map','[aout]','-c:v','libx264','-preset','slow','-crf','20','-c:a','aac','-b:a','160k','-shortest','-movflags','+faststart',out]
subprocess.run(cmd,check=True); print('ok',out,round(D,1))
