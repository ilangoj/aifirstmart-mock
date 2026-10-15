"""Platform-only build: every role and screen works in English and Tamil, with no training content left."""
import sys, pathlib; sys.path.insert(0, str(pathlib.Path(__file__).parent))
from _page import PAGE_PATH, RESULT
import asyncio, json, sys, re, pathlib
from playwright.async_api import async_playwright

OUT = sys.argv[2] if len(sys.argv) > 2 else RESULT
R = []
def rec(item, ok, detail=''): R.append({'item': item, 'pass': bool(ok), 'detail': detail}); print('PASS' if ok else 'FAIL', item, '|', str(detail)[:300])
TRAINING = re.compile(r'\b(?:Guided training|Hands-on training|lesson|Lesson|coach|Coach|Training center|Teacher|trainee|Trainee|Voice on|Action Lab|Action Map)\b|பயிற்சி மையம்|வழிகாட்டும் பயிற்சி|பாடம்|ஆசிரியர்')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        DIR = PAGE_PATH.parents[1]
        for lang, page in [('en', DIR / 'en' / 'index.html'), ('ta', DIR / 'ta' / 'index.html')]:
            pg = await (await b.new_context(viewport={'width': 1440, 'height': 900})).new_page()
            errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:140]))
            await pg.goto(page.as_uri()); await pg.wait_for_timeout(1500)
            await pg.evaluate("()=>localStorage.clear()"); await pg.reload(); await pg.wait_for_timeout(1800)
            gone = await pg.evaluate("()=>({gt:!!window.AFMGuidedTraining, audio:!!window.AFM_TRAINING_AUDIO, launcher:!!document.querySelector('#gt-launch,#gt'), records:!!document.querySelector('[data-nav=\"records\"]')})")
            personas = await pg.evaluate("()=>[...document.querySelectorAll('#personaSelect option')].map(o=>o.value)")
            screens = 0; trainingText = []; dead = []; broken = []
            for per in personas:
                await pg.evaluate("()=>{try{close()}catch(e){}}"); await pg.select_option('#personaSelect', per); await pg.wait_for_timeout(450)
                navs = await pg.evaluate("()=>[...document.querySelectorAll('#side [data-nav]')].filter(e=>e.offsetParent).map(e=>e.dataset.nav)")
                for nv in navs:
                    await pg.evaluate("()=>{try{close()}catch(e){}}"); await pg.click(f'#side [data-nav="{nv}"]'); await pg.wait_for_timeout(300); screens += 1
                    txt = await pg.evaluate("()=>document.body.innerText")
                    for m in TRAINING.findall(txt): trainingText.append((per, nv, m))
                    empty = await pg.evaluate("()=>{const s=document.querySelector('.screen.active');return !s||s.innerText.trim().length<20}")
                    if await pg.evaluate("()=>/\\bundefined\\b|\\bNaN\\b/.test(document.querySelector('.screen.active')?.innerText||'')"): broken.append((per, nv))
                    if empty: dead.append((per, nv))
            rec(f'[{lang}] Training removed: no lessons, narration, launcher or training records', not any(gone.values()), gone)
            rec(f'[{lang}] Every role and screen opens with content', not dead and screens > 60, f'{len(personas)} roles, {screens} screens; empty: {dead[:5]}')
            rec(f'[{lang}] No training wording left on any screen', not trainingText, sorted(set(trainingText))[:8])
            rec(f'[{lang}] No screen shows "undefined" or "NaN"', not broken, broken[:6])
            # core flows still work
            await pg.evaluate("()=>{try{close()}catch(e){}}"); await pg.select_option('#personaSelect', 'payments'); await pg.wait_for_timeout(400); await pg.click('#side [data-nav="refunds"]'); await pg.wait_for_timeout(300)
            await pg.click('[data-rf-approve="RF-501"]'); await pg.wait_for_timeout(300); await pg.click('#rfApproveGo'); await pg.wait_for_timeout(300)
            rf = await pg.evaluate("()=>AFMPhase2.refunds().items.find(r=>r.id==='RF-501').status")
            await pg.select_option('#personaSelect', 'customer'); await pg.wait_for_timeout(400); await pg.click('#side [data-nav="shop"]'); await pg.wait_for_timeout(300)
            await pg.click('[data-shop-ch="mobile_app"]'); await pg.wait_for_timeout(300); await pg.click('[data-shop-plan="weekly"]'); await pg.wait_for_timeout(300)
            tabs = await pg.evaluate("()=>document.querySelectorAll('[data-shop-plan]').length")
            await pg.select_option('#personaSelect', 'catalogue'); await pg.wait_for_timeout(400); await pg.click('#side [data-nav="catalogue"]'); await pg.wait_for_timeout(300)
            await pg.click('[data-cat-edit="8901002"]'); await pg.wait_for_timeout(500); await pg.click('#ceImgSample'); await pg.wait_for_timeout(900)
            img = await pg.evaluate("()=>!!AFMCatalogue.mainImage('8901002')")
            await pg.evaluate("()=>{try{close()}catch(e){}}"); await pg.select_option('#personaSelect', 'cashier'); await pg.wait_for_timeout(400); await pg.click('#side [data-nav="sell"]'); await pg.wait_for_timeout(300)
            await pg.click('[data-add="8901002"]'); await pg.wait_for_timeout(300)
            cart = await pg.evaluate("()=>cart.length")
            rec(f'[{lang}] Core flows work: refund approval, mobile app plans, catalogue photo, till', rf.startswith('Approved') and tabs == 3 and img and cart == 1, f'refund {rf}; plan groups {tabs}; photo {img}; till lines {cart}')
            if lang == 'ta':
                eng = await pg.evaluate("()=>{const t=document.querySelector('.screen.active').innerText;return (t.match(/[A-Za-z]{4,}/g)||[]).filter(w=>!/^(POS|AFM|SUB|Aavin|AIFirstMart)/.test(w)).slice(0,8)}")
                rec('[ta] Opens in Tamil', await pg.evaluate("()=>lang") == 'ta', f'language ta; English words on the till: {eng}')
            rec(f'[{lang}] No page errors', not errs, errs[:3])
        await b.close()
    json.dump(R, open(OUT, 'w'), ensure_ascii=False, indent=1)
    print(sum(r['pass'] for r in R), '/', len(R))
asyncio.run(main())
