from PIL import Image, ImageDraw, ImageFont
W,H=1920,1080
INTER='/usr/share/fonts/opentype/inter/Inter-%s.otf'
SERIF='/mnt/skills/examples/canvas-design/canvas-fonts/InstrumentSerif-Regular.ttf'
f=lambda s,n: ImageFont.truetype(INTER%s,n)
sf=lambda n: ImageFont.truetype(SERIF,n)
ORANGE=(255,122,61); WHITE=(255,255,255,255); SOFT=(232,224,216,255)
def watermark(d):
    t='AI-ASSISTED  ·  video and code made with Claude'
    fn=f('Medium',22); w=d.textlength(t,font=fn); x,y=W-w-48,H-56
    d.rounded_rectangle([x-16,y-10,x+w+16,y+34],8,fill=(0,0,0,150)); d.text((x,y),t,font=fn,fill=(255,255,255,215))
def tick(d,t):
    fn=f('SemiBold',20); w=d.textlength(t,font=fn); x,y=W-w-48,40
    d.rounded_rectangle([x-14,y-8,x+w+14,y+30],6,fill=(0,0,0,150)); d.text((x,y),t,font=fn,fill=ORANGE)
def caption(name,label,text,sub=None,step=None,x=72):
    im=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(im)
    fl,ft,fs=f('SemiBold',24),f('SemiBold',46),f('Regular',30)
    tw=max(d.textlength(text,font=ft),d.textlength(label,font=fl),d.textlength(sub or '',font=fs))
    hgt=118+(48 if sub else 0); y=H-130-hgt
    d.rounded_rectangle([x-28,y-26,x+tw+32,y+hgt],14,fill=(10,8,8,195)); d.rectangle([x-28,y-26,x-22,y+hgt],fill=ORANGE)
    d.text((x,y),label,font=fl,fill=ORANGE); d.text((x,y+40),text,font=ft,fill=WHITE)
    if sub: d.text((x,y+104),sub,font=fs,fill=SOFT)
    watermark(d); im.save(f'ov_{name}.png')
def title():
    im=Image.new('RGBA',(W,H),(0,0,0,140)); d=ImageDraw.Draw(im); x=120
    d.text((x,330),'HELLO FROM',font=f('SemiBold',28),fill=ORANGE)
    d.text((x,375),'Team MarsWalk',font=sf(140),fill=WHITE)
    names=['Satvik Vitta','Abhiram Menon','Satwik Pokala','Kalaanidhi Sundar']
    d.text((x,560),'   ·   '.join(names),font=f('Medium',40),fill=SOFT)
    d.text((x,640),'NASA Space Apps Challenge 2026',font=f('Regular',30),fill=(210,200,190,255))
    watermark(d); im.save('ov_title.png')
def end():
    im=Image.new('RGBA',(W,H),(0,0,0,175)); d=ImageDraw.Draw(im)
    def ctr(t,fn,y,c):
        w=d.textlength(t,font=fn); d.text(((W-w)/2,y),t,font=fn,fill=c)
    ctr('THE FUTURE',f('SemiBold',28),200,ORANGE)
    ctr('Safer first steps on Mars',sf(120),245,WHITE)
    ctr('Routes tested against real terrain, and numbers a crew can trust.',f('Medium',38),420,SOFT)
    ctr('Next: any site on Mars with a HiRISE terrain model, for mission planners, crews and classrooms.',f('Regular',30),490,(220,210,200,255))
    ctr('MarsWalk  ·  Plan the first walk on Mars, metre by metre.',f('SemiBold',36),640,WHITE)
    ctr('github.com/abhiram-vm/MARSWALK',f('SemiBold',34),705,ORANGE)
    ctr('Team MarsWalk  ·  Satvik Vitta, Abhiram Menon, Satwik Pokala, Kalaanidhi Sundar',f('Regular',26),800,(200,190,180,255))
    watermark(d); im.save('ov_end.png')
title(); end()
caption('chal','THE CHALLENGE','Interplanetary Survival Guide: Martian Map','Inspired by NASA Curiosity drilling the boxwork ridges of Gale crater in 2025','CHALLENGE')
caption('tag','MARSWALK','Plan the first walk on Mars, metre by metre.',"Astronauts won't need a map of the planet, but of the next 500 metres",'PROJECT')
caption('data','HOW IT WORKS: THE DATA','NASA MRO, Mars Odyssey and Curiosity data','plus ESA Mars Express stereo in the 1 m terrain model, and Spain’s REMS weather','HOW IT WORKS')
caption('plan','HOW IT WORKS: PLAN','Pick stops; get two routes under a 20° slope limit','A GO or NO-GO call from daylight, slope, space weather and pair rules','HOW IT WORKS',x=470)
caption('layers','HOW IT WORKS: LAYERS','See slope, night temperature and Curiosity’s track','on real 1 m terrain and HiRISE imagery','HOW IT WORKS',x=470)
caption('site','HOW IT WORKS: SCIENCE','114 real places Curiosity stopped','each with the rover’s own Navcam photo','HOW IT WORKS',x=470)
caption('guide','HOW IT WORKS: BRIEFING','A printable field guide for the crew','every number labelled measured, derived or assumed','HOW IT WORKS',x=470)
caption('walk','THE EXPERIENCE','Walk the route at eye level before anyone goes','with the next hazard and the back-by time in the visor','FUTURE')
