import subprocess
T=0.3; FPS=30
S=[('base_title.jpg','title',2.5),('shots/st01.jpg','chal',2.5),('shots/story00.jpg','tag',5.0),
('shots/st04.jpg','data',2.0),('shots/p01-overview.jpg','plan',2.0),('shots/p03-slope.jpg','layers',2.0),
('shots/p06-station.jpg','site',2.0),('shots/p10-guide.jpg','guide',2.0),('shots/p08-helmet.jpg','walk',4.0),('base_end.jpg','end',5.5)]
args=['ffmpeg','-y','-loglevel','error']
for b,o,t in S: args+=['-i',b]
for b,o,t in S: args+=['-i',f'ov_{o}.png']
n=len(S); fc=[]
for i,(b,o,t) in enumerate(S):
    d=t+(T if i<n-1 else 0); N=round(d*FPS)
    fc.append(f"[{i}:v]scale=2880:1620,zoompan=z='1+0.05*on/{N}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={N}:s=1920x1080:fps={FPS},setsar=1[z{i}];[z{i}][{n+i}:v]overlay=0:0,format=yuv420p,trim=end_frame={N},setpts=PTS-STARTPTS[v{i}]")
prev='v0'; off=0
for i in range(1,n):
    off+=S[i-1][2]
    fc.append(f"[{prev}][v{i}]xfade=transition=fade:duration={T}:offset={off:.3f}[x{i}]"); prev=f'x{i}'
fc.append(f"[{prev}]fade=t=in:st=0:d=0.4,fade=t=out:st={sum(s[2] for s in S)-0.5}:d=0.5[out]")
args+=['-filter_complex',';'.join(fc),'-map','[out]','-r',str(FPS),'-c:v','libx264','-preset','veryfast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart','tmp_demo.mp4']
subprocess.run(args,check=True)
