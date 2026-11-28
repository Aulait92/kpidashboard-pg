import json, subprocess, re, sys, os
D="/tmp/claude-0/-home-user-kpidashboard-pg/89ff9df1-6b38-516f-aedc-2d907e1a1c11/scratchpad/ov"
W=json.load(open(f"{D}/words.json"))
FIX={"Leeds":"Leads","Lids":"Leads","Liedgeschäft":"Leadgeschäft","Liedgenerierung":"Leadgenerierung",
 "Senseerfahrung":"Saleserfahrung","Liebqualität":"Leadqualität","keiner":"keinen","reicht":"erreicht","an.":"ran.","ein":None}
VIDS={
 "IMG_0617":dict(hook=["700 Verträge","in einem Monat"],sub="Einzelfall aus 2019",out="video-ole-700-vertraege"),
 "IMG_0618":dict(hook=["Warum Ihr Lead","nicht rangeht"],sub=None,out="video-ole-supermarkt"),
 "IMG_0619":dict(hook=["Jeder hat schon mal","ins Klo gegriffen"],sub=None,out="video-ole-ins-klo"),
}
def fixw(w,prev,name):
    t=w.strip()
    core=re.sub(r"[.,!?]$","",t); p=t[len(core):]
    if core=="ein" and name=="IMG_0617" and prev=="hat": core="einen"
    if core=="an" and p=="." and prev=="nicht": core="ran"
    if core in FIX and FIX[core] and core not in("an.","ein"): core=FIX[core]
    return core+p
def ts(t):
    h=int(t//3600); m=int(t%3600//60); s=t%60
    return f"{h}:{m:02d}:{s:05.2f}"
name=sys.argv[1]; cfg=VIDS[name]
src=subprocess.check_output(f"ls /mnt/user-data/uploads/*/{name}.MOV",shell=True,text=True).strip()
words=[]; prev=""
for s,e,w in W[name+".wav"]:
    t=fixw(w,prev,name)
    if t.strip().startswith("-") and words: words[-1][1]=e; words[-1][2]=words[-1][2].rstrip()+t.strip(); continue
    words.append([s,e,t]); prev=t.strip(".,")
# segments: tighten gaps
segs=[]; st=max(0,words[0][0]-0.3)
for i in range(len(words)-1):
    e=words[i][1]; n=words[i+1][0]
    if n-e>0.5:
        segs.append((st,e+0.18)); st=n-0.15
segs.append((st,words[-1][1]+0.7))
def mapt(t):
    acc=0
    for a,b in segs:
        if t<a: return acc
        if t<=b: return acc+t-a
        acc+=b-a
    return acc
DUR=sum(b-a for a,b in segs)
for w in words: w[0]=mapt(w[0]); w[1]=mapt(w[1])
# caption chunks
chunks=[]; cur=[]
for w in words:
    cur.append(w)
    L=len(" ".join(x[2].strip() for x in cur))
    if len(cur)>=3 or re.search(r"[.!?]$",w[2]) or (re.search(r",$",w[2]) and len(cur)>=2) or L>17:
        chunks.append(cur); cur=[]
if cur: chunks.append(cur)
ass=["[Script Info]","ScriptType: v4.00+","PlayResX: 1080","PlayResY: 1350","WrapStyle: 0","",
"[V4+ Styles]","Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
"Style: Cap,Inter,74,&H00FFFFFF,&H00FFFFFF,&H00201209,&H96000000,-1,0,0,0,100,100,0,0,1,7,3,2,60,60,170,1",
"Style: Hook,Inter,78,&H00FFFFFF,&H00FFFFFF,&H00201209,&H00201209,-1,0,0,0,100,100,0,0,3,22,0,8,60,60,70,1",
"Style: Sub,Inter,38,&H00FAA560,&H00FFFFFF,&H00201209,&H00201209,-1,0,0,0,100,100,0,0,3,12,0,8,60,60,300,1",
"","[Events]","Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"]
HOOK_END=3.4
for ci,ch in enumerate(chunks):
    end=chunks[ci+1][0][0] if ci+1<len(chunks) else ch[-1][1]+0.4
    if end-ch[-1][1]>0.6: end=ch[-1][1]+0.6
    for wi,w in enumerate(ch):
        ws=w[0] if wi>0 else w[0]
        we=ch[wi+1][0] if wi+1<len(ch) else end
        txt=" ".join((r"{\c&HFAA560&}"+x[2].strip()+r"{\c&HFFFFFF&}") if j==wi else x[2].strip() for j,x in enumerate(ch))
        if ws>=we: continue
        ass.append(f"Dialogue: 0,{ts(ws)},{ts(we)},Cap,,0,0,0,,{txt}")
fade=r"{\fad(150,250)}"
ass.append(f"Dialogue: 1,{ts(0)},{ts(HOOK_END)},Hook,,0,0,0,,{fade}"+r"\N".join(cfg["hook"]))
if cfg["sub"]:
    ass.append(f"Dialogue: 1,{ts(0)},{ts(HOOK_END)},Sub,,0,0,0,,{fade}{cfg['sub']}")
    ass.append(f"Dialogue: 1,{ts(HOOK_END)},{ts(DUR)},Sub,,0,0,1270,,{cfg['sub']}".replace(",Sub,,0,0,1270",",Sub,,0,0,40"))
open(f"{D}/{name}.ass","w").write("\n".join(ass)+"\n")
# filter
fc=[]
for i,(a,b) in enumerate(segs):
    fc.append(f"[0:v]trim={a:.3f}:{b:.3f},setpts=PTS-STARTPTS[v{i}];[0:a]atrim={a:.3f}:{b:.3f},asetpts=PTS-STARTPTS[a{i}]")
fc.append("".join(f"[v{i}][a{i}]" for i in range(len(segs)))+f"concat=n={len(segs)}:v=1:a=1[vc][ac]")
fc.append(f"[vc]crop=1080:1350:0:200,ass={D}/{name}.ass,format=yuv420p[vo]")
fc.append("[ac]highpass=f=80,afftdn=nf=-25,equalizer=f=200:t=q:w=1:g=-2,equalizer=f=3500:t=q:w=1.2:g=3,acompressor=threshold=-20dB:ratio=3:attack=10:release=150,loudnorm=I=-16:TP=-1.5:LRA=9[ao]")
out=f"{D}/{cfg['out']}-main.mp4"
subprocess.run(["ffmpeg","-y","-loglevel","error","-i",src,"-filter_complex",";".join(fc),"-map","[vo]","-map","[ao]","-r","30","-c:v","libx264","-crf","19","-preset","medium","-c:a","aac","-b:a","160k","-ar","48000",out],check=True)
json.dump({"dur":DUR,"segs":segs,"text":" ".join(w[2].strip() for w in words)},open(f"{D}/{name}.meta.json","w"),ensure_ascii=False)
print(name,"dur",round(DUR,2),"segs",len(segs)); print(" ".join(w[2].strip() for w in words))
