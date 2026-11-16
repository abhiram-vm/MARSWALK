from PIL import Image, ImageDraw, ImageFont
W,H=1920,1080
INTER='/usr/share/fonts/opentype/inter/Inter-%s.otf'
SERIF='/mnt/skills/examples/canvas-design/canvas-fonts/InstrumentSerif-Regular.ttf'
f=lambda s,n: ImageFont.truetype(INTER%s,n); sf=lambda n: ImageFont.truetype(SERIF,n)
OR=(255,122,61); WH=(255,255,255,255); SO=(232,224,216,255)
def wm(d):
    t='AI-ASSISTED  ·  video and code made with Claude'; fn=f('Medium',22); w=d.textlength(t,font=fn); x,y=W-w-48,H-56
    d.rounded_rectangle([x-16,y-10,x+w+16,y+34],8,fill=(0,0,0,165)); d.text((x,y),t,font=fn,fill=(255,255,255,220))
def cap(name,label,text,sub=None,x=72,y_bottom=None):
    im=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(im)
    fl,ft,fs=f('SemiBold',24),f('SemiBold',44),f('Regular',29)
    tw=max(d.textlength(text,font=ft),d.textlength(label,font=fl),d.textlength(sub or '',font=fs))
    hgt=114+(46 if sub else 0); yb=y_bottom or H-130; y=yb-hgt
    d.rounded_rectangle([x-28,y-26,x+tw+32,y+hgt],14,fill=(10,8,8,205)); d.rectangle([x-28,y-26,x-22,y+hgt],fill=OR)
    d.text((x,y),label,font=fl,fill=OR); d.text((x,y+40),text,font=ft,fill=WH)
    if sub: d.text((x,y+100),sub,font=fs,fill=SO)
    wm(d); im.save(f'ov_{name}.png')
def card(name,draw):
    im=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(im); draw(d); wm(d); im.save(f'ov_{name}.png')
def ctr(d,t,fn,y,c):
    w=d.textlength(t,font=fn); d.text(((W-w)/2,y),t,font=fn,fill=c)
def title(d):
    x=140
    d.text((x,300),'NASA SPACE APPS CHALLENGE 2026',font=f('SemiBold',28),fill=OR)
    d.text((x,345),'Team MarsWalk',font=sf(150),fill=WH)
    d.text((x,540),'Satvik Vitta   ·   Abhiram Menon   ·   Satwik Pokala   ·   Kalaanidhi Sundar',font=f('Medium',40),fill=SO)
    d.text((x,620),'Challenge: Interplanetary Survival Guide: Martian Map',font=f('Regular',32),fill=(210,200,190,255))
def end(d):
    ctr(d,'THE FUTURE',f('SemiBold',30),150,OR)
    ctr(d,'Safer first steps on Mars',sf(132),195,WH)
    lines=[('For crews','rehearse every EVA on real terrain before anyone suits up.'),
           ('For mission planners','turn orbital and rover data into routes, limits and a GO or NO-GO call.'),
           ('For the next site','the same method works anywhere with a HiRISE terrain model.'),
           ('For classrooms','a real place on Mars that anyone can walk, meter by meter.')]
    y=420; fb,fr=f('SemiBold',34),f('Regular',34)
    for a,b in lines:
        wa=d.textlength(a+':  ',font=fb); wb=d.textlength(b,font=fr); x=(W-wa-wb)/2
        d.text((x,y),a+':  ',font=fb,fill=OR); d.text((x+wa,y),b,font=fr,fill=SO); y+=66
    ctr(d,'MarsWalk  ·  Plan the first walk on Mars, meter by meter.',f('SemiBold',38),720,WH)
    ctr(d,'Team MarsWalk  ·  Satvik Vitta, Abhiram Menon, Satwik Pokala, Kalaanidhi Sundar',f('Regular',26),800,(200,190,180,255))
card('title',title); card('end',end)
cap('chal','THE CHALLENGE','Interplanetary Survival Guide: Martian Map','Inspired by NASA Curiosity drilling the boxwork ridges of Gale crater in 2025')
cap('tag','MARSWALK','Plan the first walk on Mars, meter by meter.',"Astronauts won't need a map of the planet, but of the next 500 meters")
P=470
cap('b1','HOW IT WORKS: PLAN','Click the ground to add a stop; both routes recompute','Direct and Cautious, kept under a 20° slope limit on a 1 m NASA terrain model',x=P)
cap('b2','HOW IT WORKS: NASA DATA','Switch layers: slope hazard, then night temperature','MRO HiRISE and CTX, Mars Odyssey THEMIS, MGS MOLA, ESA Mars Express stereo',x=P)
cap('b3','HOW IT WORKS: PAIRS','Split the stops between two astronauts','MarsWalk checks their separation and line of sight over the ridges',x=P)
cap('b4','HOW IT WORKS: THE CALL','Leave too late and GO turns to NO-GO','Daylight, slope, space weather (NASA DONKI) and pair rules decide',x=P)
cap('b5','HOW IT WORKS: SCIENCE SITES','114 real places Curiosity stopped','each with the rover’s own Navcam photo and mission blog source',x=P)
cap('walk','THE EXPERIENCE','Walk the route at eye level','next hazard, time left and back-by time in the visor; 4× speed shown')
cap('guide','THE BRIEFING','A printable field guide for the crew','every number labelled measured, derived, assumed or simulated',x=P)
