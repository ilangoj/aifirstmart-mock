import sys, pathlib; sys.path.insert(0, str(pathlib.Path(__file__).parent))
from _page import PAGE, RESULT
import asyncio, json
from playwright.async_api import async_playwright
R=[]
def rec(item, ok, detail=''): R.append({'item':item,'pass':bool(ok),'detail':detail}); print(('PASS' if ok else 'FAIL'), item, '|', str(detail)[:260])
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await b.new_page(viewport={'width':1440,'height':900})
        errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)[:100]))
        await pg.goto(PAGE); await pg.wait_for_timeout(1500)
        info=await pg.evaluate("""()=>{const C=AFMGuidedTraining.courses,A=window.AFM_TRAINING_AUDIO,out=[];for(const[c,v]of Object.entries(C))v.lessons.forEach((l,i)=>{const need=[`${c}-${i}-intro`,`${c}-${i}-done`,...l.steps.map(s=>`${c}-${i}-${s.id}`)];out.push({c,i,title:l.title,steps:l.steps.length,missing:need.filter(k=>!A[k])})});return out}""")
        total=len(info); miss=[(x['c'],x['i'],x['missing']) for x in info if x['missing']]
        rec('Every lesson step has narration', not miss, f"{total} lessons, {sum(x['steps'] for x in info)} steps; missing: {miss[:4]}")
        bad=[]; errs.clear()
        for x in info:
            await pg.evaluate("""([c,i])=>{const m=JSON.parse(localStorage.getItem('afm-guided-training-v1')||'{}');Object.assign(m,{course:c,lesson:i,step:0,view:'intro',voiceOn:false});m.done=m.done||{};localStorage.setItem('afm-guided-training-v1',JSON.stringify(m))}""", [x['c'], x['i']])
            await pg.reload(); await pg.wait_for_timeout(900)
            if not await pg.locator('#gt [data-gt="start"]').count():
                if await pg.locator('#gt-launch').count(): await pg.click('#gt-launch'); await pg.wait_for_timeout(300)
            n=len(errs)
            ok=await pg.locator('#gt [data-gt="start"]').count()
            if ok: await pg.click('#gt [data-gt="start"]'); await pg.wait_for_timeout(700)
            step=await pg.evaluate("()=>document.querySelector('#gt .gt-step.now')?.innerText.replace(/\\s+/g,' ').slice(0,60)||''")
            if not ok or not step or len(errs)>n: bad.append((x['c'], x['i']+1, x['title'], 'no start' if not ok else 'no step' if not step else errs[n:]))
        rec('Every lesson opens, runs its setup and shows its first step', not bad, f"{total - len(bad)} of {total} lessons; problems: {bad[:5]}")
        json.dump(R,open(RESULT,'w'),indent=1)
        await b.close()
asyncio.run(main())
