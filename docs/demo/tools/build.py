import subprocess, sys, os
walk_rate=float(sys.argv[1]) if len(sys.argv)>1 else 0.6
guide_mode=sys.argv[2] if len(sys.argv)>2 else 'still'
out=sys.argv[3] if len(sys.argv)>3 else 'MarsWalk_demo_quick.mp4'
nw=len(os.listdir('seg_walk')); ng=len(os.listdir('seg_guide')) if os.path.isdir('seg_guide') else 0
WD=round(nw/15/walk_rate,3)
T_TITLE=1.9; T_STORY=120/15; T_PLAN=152/15; T_GUIDE=2.4 if guide_mode=='still' else round(ng/15,3); T_END=4.0
# scenes rendered to separate mp4s with identical settings
enc=['-c:v','libx264','-preset','veryfast','-crf','18','-pix_fmt','yuv420p','-r','30']
def run(a): subprocess.run(['ffmpeg','-y','-loglevel','error']+a,check=True)
def ov_chain(base, caps):
    # caps: list of (png, start, end)
    inputs=[]; fc=base; last='[v0]'
    for i,(png,s,e) in enumerate(caps):
        inputs+=['-i',png]
        fc+=f";{last}[{i+1}:v]overlay=0:0:enable='between(t,{s},{e})'[v{i+1}]"; last=f'[v{i+1}]'
    return inputs, fc, last
def scene(name, src_args, base, caps, dur):
    inp,fc,last=ov_chain(base,caps)
    run(src_args+inp+['-filter_complex',fc,'-map',last,'-t',str(dur)]+enc+[f'tmp_{name}.mp4']); os.replace(f'tmp_{name}.mp4',f's_{name}.mp4')
# title: dark background
scene('title',['-f','lavfi','-i',f'color=c=0x0d0a09:s=1920x1080:r=30:d={T_TITLE}'],'[0:v]format=yuv420p,vignette=PI/5[v0]',[('ov_title.png',0,99)],T_TITLE)
scene('story',['-framerate','15','-i','seg_story/%04d.jpg'],'[0:v]fps=30,format=yuv420p[v0]',[('ov_chal.png',0,3.0),('ov_tag.png',3.0,99)],T_STORY)
b=[0,33,78,98,126,152]; caps=[(f'ov_b{i+1}.png',b[i]/15,b[i+1]/15) for i in range(5)]
scene('plan',['-framerate','15','-i','seg_plan/%04d.jpg'],'[0:v]fps=30,format=yuv420p[v0]',caps,T_PLAN)
scene('walk',['-framerate','15','-i','seg_walk/%04d.jpg'],f'[0:v]setpts=PTS/{walk_rate},fps=30,format=yuv420p[v0]',[('ov_walk.png',0,99)],WD)
if guide_mode=='still':
    N=round(T_GUIDE*30)
    scene('guide',['-i','guide_still.jpg'],f"[0:v]scale=2880:1620,zoompan=z='1+0.04*on/{N}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={N}:s=1920x1080:fps=30,format=yuv420p[v0]",[('ov_guide.png',0,99)],T_GUIDE)
else:
    scene('guide',['-framerate','15','-i','seg_guide/%04d.jpg'],'[0:v]fps=30,format=yuv420p[v0]',[('ov_guide.png',0,99)],T_GUIDE)
# end card over blurred boxwork frame
scene('end',['-loop','1','-framerate','30','-i','seg_story/0119.jpg'],f"[0:v]gblur=sigma=22,eq=brightness=-0.25,format=yuv420p,fade=t=in:st=0:d=0.4[v0]",[('ov_end.png',0,99)],T_END)
open('list.txt','w').write(''.join(f"file 's_{n}.mp4'\n" for n in ['title','story','plan','walk','guide','end']))
run(['-f','concat','-safe','0','-i','list.txt','-c','copy','-movflags','+faststart','tmp_out.mp4']); os.replace('tmp_out.mp4',out)
print('total', T_TITLE+T_STORY+T_PLAN+WD+T_GUIDE+T_END)
