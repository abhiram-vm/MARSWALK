import asyncio, os, time, math
from playwright.async_api import async_playwright
import pathlib
BASE='file://'+str(pathlib.Path(__file__).resolve().parents[3]/'index.html')
FPS=15; DT=67
CURSOR_JS = """() => {
  const c=document.createElement('div'); c.id='fc';
  c.innerHTML='<svg width="34" height="34" viewBox="0 0 24 24"><path d="M3 2l7.5 19 2.6-7.6L21 11z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  Object.assign(c.style,{position:'fixed',left:'0',top:'0',zIndex:2147483647,pointerEvents:'none',transform:'translate(-100px,-100px)',filter:'drop-shadow(0 2px 3px rgba(0,0,0,.6))'});
  const r=document.createElement('div'); r.id='fr';
  Object.assign(r.style,{position:'fixed',width:'44px',height:'44px',margin:'-22px 0 0 -22px',borderRadius:'50%',border:'3px solid #ff7a3d',zIndex:2147483646,pointerEvents:'none',opacity:'0'});
  document.body.append(r,c);
  addEventListener('mousemove',e=>{c.style.transform=`translate(${e.clientX-3}px,${e.clientY-2}px)`},true);
  addEventListener('mousedown',e=>{r.style.left=e.clientX+'px';r.style.top=e.clientY+'px';r.style.opacity='1';r.dataset.t=performance.now()},true);
  (function tick(){const t=performance.now()-(+r.dataset.t||-1e9); if(t<450){r.style.opacity=String(1-t/450);r.style.transform=`scale(${0.6+t/450})`}else r.style.opacity='0'; requestAnimationFrame(tick)})();
}"""
class Rec:
    def __init__(s,pg): s.pg=pg; s.x=960; s.y=540; s.dir=None; s.n=0
    def seg(s,name): s.dir=name; os.makedirs(name,exist_ok=True); s.n=0
    async def frame(s):
        await s.pg.clock.run_for(DT)
        await s.pg.screenshot(path=f'{s.dir}/{s.n:04d}.jpg',quality=92); s.n+=1
    async def hold(s,k):
        for _ in range(k): await s.frame()
    async def move(s,x,y,k=8):
        x0,y0=s.x,s.y
        for i in range(1,k+1):
            t=i/k; e=t*t*(3-2*t)
            await s.pg.mouse.move(x0+(x-x0)*e,y0+(y-y0)*e); await s.frame()
        s.x,s.y=x,y
    async def click(s,x,y,k=8,after=6):
        await s.move(x,y,k); await s.pg.mouse.down(); await s.frame(); await s.pg.mouse.up(); await s.hold(after)
    async def el(s,sel):
        b=await s.pg.locator(sel).first.bounding_box(); return b['x']+b['width']/2, b['y']+b['height']/2
    async def click_el(s,sel,k=8,after=6):
        x,y=await s.el(sel); await s.click(x,y,k,after)
    async def settle(s,maxf=40):
        # advance until routing finishes, recording frames
        for _ in range(maxf):
            if not await s.pg.evaluate('() => window.__mw.S.busy'): break
            await s.frame()
async def boot(b,url):
    pg=await b.new_page(viewport={'width':1920,'height':1080}); pg.set_default_timeout(180000)
    await pg.goto(url); await pg.wait_for_selector('#loading',state='detached',timeout=120000)
    await pg.wait_for_function('() => !window.__mw.S.busy'); await pg.wait_for_timeout(5000)
    await pg.evaluate(CURSOR_JS)
    await pg.clock.install(); await pg.clock.pause_at(int(time.time()*1000)+2000)
    return pg
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        # ---------- story: globe to boxwork, 8 s ----------
        pg=await boot(b,BASE); R=Rec(pg); R.seg('seg_story')
        await pg.mouse.move(-50,-50)
        async def setp(pr): await pg.evaluate(f"(()=>{{const s=document.getElementById('st-scroll');s.scrollTop=(s.scrollHeight-s.clientHeight)*{pr}/8}})()")
        await R.hold(8)
        total=112
        for i in range(total):
            t=i/(total-1)
            pr = 1.0*min(1,t/0.35) if t<0.45 else 1.0+2.2*min(1,(t-0.45)/0.5)
            await setp(pr); await R.frame()
        print('story', R.n); await pg.close()
        # ---------- planner ----------
        pg=await boot(b,BASE+'#plan'); R=Rec(pg)
        await pg.evaluate("document.getElementById('coach-ok')?.click()"); await pg.clock.run_for(1500)
        await pg.mouse.move(1500,300); R.x,R.y=1500,300
        R.seg('seg_plan')
        await R.hold(3)
        # B1 add a stop by clicking the ground
        await R.click_el('#add-stop',k=7,after=3)
        await R.click(1347,577,k=8,after=2); await R.settle(); await R.hold(8)
        print('b1',R.n)
        # B2 data layers: slope then night temperature
        await R.click_el('#b-layers',k=8,after=4)
        await R.click_el('.switch[data-k="slope"]',k=6,after=8)
        await R.click_el('.switch[data-k="slope"]',k=3,after=0)
        await R.click_el('.switch[data-k="thermal"]',k=4,after=8)
        await pg.click('.switch[data-k="thermal"]'); await pg.click('#d-close')
        print('b2',R.n)
        # B3 pair mode
        await R.click_el('#m-pair',k=8,after=2); await R.settle(); await R.hold(9)
        print('b3',R.n)
        # B4 drag departure late: GO turns NO-GO
        box=await pg.locator('#day').bounding_box()
        y=box['y']+box['height']*0.6; x0=box['x']+box['width']*0.29; x1=box['x']+box['width']*0.9
        await R.move(x0,y,8); await pg.mouse.down()
        await R.move(x1,y,12); await pg.mouse.up(); await R.hold(8)
        print('b4',R.n, await pg.evaluate("document.querySelector('.call')?.textContent"))
        # B5 open a science site card with Curiosity's photo
        await R.click_el('.pin[data-id="c4673"]',k=9,after=16)
        print('b5',R.n)
        # reset off camera
        await pg.click('#d-close'); await pg.mouse.move(x1,y); await pg.mouse.down(); await pg.mouse.move(x0-2,y,steps=5); await pg.mouse.up()
        await pg.click('#m-solo')
        for _ in range(40):
            await pg.clock.run_for(100)
            if not await pg.evaluate('() => window.__mw.S.busy'): break
            await asyncio.sleep(0.2)
        await pg.clock.run_for(1500)
        print('reset call', await pg.evaluate("document.querySelector('.call')?.textContent"))
        # ---------- walk at eye level ----------
        R.seg('seg_walk')
        await R.click_el('[data-walk="0"]',k=8,after=8)
        try:
            await R.click_el('.speeds button[data-v="4"]',k=8,after=0)
        except Exception as e: print('speed',e)
        await pg.mouse.move(1900,1000); R.x,R.y=1900,1000
        await R.hold(36)
        print('walk',R.n)
        # ---------- field guide ----------
        await pg.keyboard.press('Escape'); await pg.clock.run_for(1500)
        R.seg('seg_guide')
        await R.hold(2)
        await R.click_el('#b-guide',k=8,after=14)
        print('guide',R.n)
        await b.close()
asyncio.run(main())
