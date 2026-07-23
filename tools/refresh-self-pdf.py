#!/usr/bin/env python3
# Regenerate a "download this deck" PDF that mirrors the LIVE site, so the
# downloadable copy always matches what's being published.
# Usage: python3 refresh_self_pdf.py <site_dir> <output_pdf>
# Requires: playwright (+ chromium) and Pillow. If unavailable, skip and tell the user.
import asyncio, sys, os, tempfile
from playwright.async_api import async_playwright
from PIL import Image
SITE=os.path.abspath(sys.argv[1].rstrip("/")); OUT=sys.argv[2]
async def main():
    tmp=tempfile.mkdtemp()
    async with async_playwright() as p:
        b=await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        pg=await b.new_page(viewport={"width":1600,"height":900},device_scale_factor=2)
        await pg.goto("file://%s/index.html"%SITE); await pg.wait_for_timeout(900)
        try: await pg.evaluate("unlock()")
        except Exception: pass
        await pg.wait_for_timeout(3200)
        n=await pg.evaluate("document.querySelectorAll('.slide').length"); files=[]
        for i in range(n):
            await pg.evaluate(f"go({i})")
            kind=await pg.evaluate("(s=>s&&s.querySelector('#aiCanvas')?'ai':(s&&s.querySelector('#pictos')?'pic':'x'))(document.querySelectorAll('.slide')[%d])"%i)
            await pg.wait_for_timeout(3200 if kind=='ai' else (2200 if kind=='pic' else 700))
            f=os.path.join(tmp,"s%02d.png"%i); await pg.screenshot(path=f); files.append(f)
        await b.close()
    imgs=[Image.open(f).convert("RGB") for f in files]
    imgs[0].save(OUT,save_all=True,append_images=imgs[1:],resolution=150)
    print("deck PDF refreshed: %d pages -> %s"%(len(imgs),OUT))
asyncio.run(main())
