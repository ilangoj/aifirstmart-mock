"""Tamil edition: same lessons and screens as English, Tamil text and Tamil narration everywhere.
Usage: python t_tamil.py [path to Tamil index.html]"""
import sys, pathlib; sys.path.insert(0, str(pathlib.Path(__file__).parent))
from _page import PAGE, RESULT
import asyncio, json, sys, re, pathlib
from playwright.async_api import async_playwright

OUT = sys.argv[2] if len(sys.argv) > 2 else RESULT
R = []
def rec(item, ok, detail=''): R.append({'item': item, 'pass': bool(ok), 'detail': detail}); print('PASS' if ok else 'FAIL', item, '|', str(detail)[:300])
LATIN_OK = re.compile(r'\b(?:[A-Z]{2,}[-\w]*|\d[\w-]*|priya@example\.com|priya-pass-1|AIFirstMart|barcode|name|category|price|stock|O|DS2208|TM-T82|Ctrl\+V)\b')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await (await b.new_context(viewport={'width': 1440, 'height': 900})).new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:120]))
        await pg.goto(PAGE); await pg.wait_for_timeout(1500)
        await pg.evaluate("()=>localStorage.clear()"); await pg.reload(); await pg.wait_for_timeout(2000)
        lang = await pg.evaluate("()=>lang")
        info = await pg.evaluate("""()=>{const C=AFMGuidedTraining.courses,A=window.AFM_TRAINING_AUDIO,out=[];for(const[c,v]of Object.entries(C))v.lessons.forEach((l,i)=>{const need=[`ta:${c}-${i}-intro`,`ta:${c}-${i}-done`,...l.steps.map(s=>`ta:${c}-${i}-${s.id}`)];out.push({c,i,title:l.title,steps:l.steps.length,missing:need.filter(k=>!A[k])})});return out}""")
        en_courses = await pg.evaluate("()=>Object.keys(AFMGuidedTraining.courses).length")
        miss = [(x['c'], x['i'], x['missing']) for x in info if x['missing']]
        rec('Opens in Tamil, with the same courses and lessons as the English edition', lang == 'ta' and en_courses == 5 and len(info) == 48, f'language {lang}; {en_courses} courses, {len(info)} lessons')
        rec('Every Tamil lesson step has Tamil narration', not miss, f"{len(info)} lessons, {sum(x['steps'] for x in info)} steps; missing: {miss[:4]}")
        # every lesson: opens, its intro and first step are Tamil
        bad = []; latin = []
        for x in info:
            await pg.evaluate("""([c,i])=>{const m=JSON.parse(localStorage.getItem('afm-guided-training-v1')||'{}');Object.assign(m,{course:c,lesson:i,step:0,view:'intro',voiceOn:false});m.done=m.done||{};localStorage.setItem('afm-guided-training-v1',JSON.stringify(m))}""", [x['c'], x['i']])
            await pg.reload(); await pg.wait_for_timeout(900)
            if not await pg.locator('#gt [data-gt="start"]').count() and await pg.locator('#gt-launch').count(): await pg.click('#gt-launch'); await pg.wait_for_timeout(300)
            intro = await pg.evaluate("()=>document.querySelector('#gt-body')?.innerText||''")
            n = len(errs); ok = await pg.locator('#gt [data-gt="start"]').count()
            if ok: await pg.click('#gt [data-gt="start"]'); await pg.wait_for_timeout(700)
            step = await pg.evaluate("()=>document.querySelector('#gt .gt-step.now .gt-text, #gt .gt-step.now')?.innerText||''")
            if not ok or not step or len(errs) > n: bad.append((x['c'], x['i'] + 1, 'no start' if not ok else 'no step' if not step else errs[n:]))
            words = [w for w in re.findall(r'[A-Za-z][A-Za-z+@.-]{2,}', LATIN_OK.sub(' ', intro + ' ' + step))]
            if len(words) > 2: latin.append((f"{x['c']}-{x['i']+1}", words[:6]))
        rec('Every lesson opens in Tamil and shows its first step', not bad, f"{len(info) - len(bad)} of {len(info)}; problems: {bad[:4]}")
        rec('Lesson introductions and first steps are written in Tamil', not latin, f'lessons with English words: {latin[:6]}')
        # the newest screens in Tamil
        await pg.evaluate("()=>{try{AFMGuidedTraining.close()}catch(e){}}")
        async def view(per, nav):
            await pg.evaluate("()=>{try{close()}catch(e){}}"); await pg.select_option('#personaSelect', per); await pg.wait_for_timeout(500)
            await pg.click(f'#side [data-nav="{nav}"]'); await pg.wait_for_timeout(500)
            return await pg.evaluate("(n)=>document.querySelector('#'+n)?.innerText||''", nav)
        checks = [('payments', 'refunds', 'பணத்திருப்பங்கள்'), ('customer', 'shop', 'வாடிக்கையாளர் கடை'), ('admin', 'policy', 'அணுகல் கொள்கை'),
                  ('admin', 'channels', 'விற்பனை வழி'), ('admin', 'signin', 'உள்நுழைவு'), ('catalogue', 'catalogue', 'பொருள் பட்டியல்'), ('admin', 'records', 'பயிற்சிப் பதிவுகள்')]
        res = []
        for per, nav, word in checks:
            t = await view(per, nav); eng = [w for w in re.findall(r'[A-Za-z]{4,}', LATIN_OK.sub(' ', t)) if w not in ('Kumar',)]
            res.append((nav, word in t, len(eng), eng[:4]))
        rec('Newer screens appear in Tamil (refunds, customer shop, access policy, channels, sign-in, catalogue, records)', all(r[1] and r[2] <= 3 for r in res), res)
        # customer shop groups and a toast in Tamil
        await view('customer', 'shop'); await pg.click('[data-shop-ch="mobile_app"]'); await pg.wait_for_timeout(400)
        tabs = await pg.evaluate("()=>[...document.querySelectorAll('[data-shop-plan]')].map(b=>b.innerText.split('\\n')[1])")
        await pg.click('[data-shop-plan="weekly"]'); await pg.wait_for_timeout(300); await pg.click('[data-shop-item="8901002"] [data-shop-inc]'); await pg.wait_for_timeout(300)
        await pg.click('#shStartPlan'); await pg.wait_for_timeout(300); await pg.fill('#shEmail', 'priya@example.com'); await pg.fill('#shPass', 'priya-pass-1'); await pg.click('#shEmailGo'); await pg.wait_for_timeout(500)
        await pg.click('#shStartPlan'); await pg.wait_for_timeout(700); toast = await pg.text_content('#toast')
        rec('Mobile app groups and plan messages are in Tamil', tabs == ['உடனடி டெலிவரி', 'வாராந்திரத் திட்டம்', 'மாதாந்திரத் திட்டம்'] and 'வாராந்திரத் திட்டம்' in toast and 'அடுத்த டெலிவரி' in toast, f'{tabs}; toast: {toast}')
        # switching language back works both ways
        await pg.select_option('#language', 'en'); await pg.wait_for_timeout(900)
        en_tabs = await pg.evaluate("()=>[...document.querySelectorAll('[data-shop-plan]')].map(b=>b.innerText.split('\\n')[1])")
        await pg.select_option('#language', 'ta'); await pg.wait_for_timeout(900)
        ta_tabs = await pg.evaluate("()=>[...document.querySelectorAll('[data-shop-plan]')].map(b=>b.innerText.split('\\n')[1])")
        rec('Switching to English and back redraws the screens in that language', en_tabs == ['Immediate delivery', 'Weekly plan', 'Monthly plan'] and ta_tabs == tabs, f'English: {en_tabs}; Tamil again: {ta_tabs}')
        rec('No page errors', not errs, errs[:3])
        await b.close()
    json.dump(R, open(OUT, 'w'), ensure_ascii=False, indent=1)
    print(sum(r['pass'] for r in R), '/', len(R))
asyncio.run(main())
