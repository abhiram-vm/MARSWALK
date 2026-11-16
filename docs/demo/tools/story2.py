import asyncio
from playwright.async_api import async_playwright
URL='file:///home/claude/marswalk/beta/index.html'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width':1920,'height':1080})
        pg.set_default_timeout(180000)
        await pg.goto(URL); await pg.wait_for_timeout(10000)
        await pg.mouse.move(960,540)
        for n in range(1,15):
            await pg.mouse.wheel(0,900); await pg.wait_for_timeout(4000)
            await pg.screenshot(path=f'shots/st{n:02d}.jpg', quality=92)
        await b.close()
asyncio.run(main())
