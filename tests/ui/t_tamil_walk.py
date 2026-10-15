"""Walk new lessons end to end in the Tamil edition: Tamil text, Tamil answers, checks that work in Tamil."""
import sys, pathlib; sys.path.insert(0, str(pathlib.Path(__file__).parent))
from _page import PAGE, RESULT, TAMIL_SRC
import asyncio, json, sys, pathlib
from playwright.async_api import async_playwright


OUT = sys.argv[2] if len(sys.argv) > 2 else RESULT
TA_LESSONS = json.loads((TAMIL_SRC / 'lessons.json').read_text(encoding='utf-8'))
R = []
def rec(item, ok, detail=''): R.append({'item': item, 'pass': bool(ok), 'detail': detail}); print('PASS' if ok else 'FAIL', item, '|', str(detail)[:300])
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await (await b.new_context(viewport={'width': 1440, 'height': 900})).new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:120]))
        await pg.goto(PAGE); await pg.wait_for_timeout(1500)
        await pg.evaluate("()=>{localStorage.clear();localStorage.setItem('afm-guided-training-v1',JSON.stringify({course:null,view:'home',lesson:0,step:0,done:{},answers:{},voiceOn:false}))}")
        await pg.reload(); await pg.wait_for_timeout(2000)
        W = lambda ms=450: pg.wait_for_timeout(ms)
        msg = lambda: pg.evaluate("()=>document.querySelector('#gt .gt-step.now .gt-msg')?.textContent||''")
        async def start(course, i):
            await pg.evaluate("""([c,i])=>{const m=JSON.parse(localStorage.getItem('afm-guided-training-v1')||'{}');Object.assign(m,{course:c,lesson:i,step:0,view:'intro',voiceOn:false});localStorage.setItem('afm-guided-training-v1',JSON.stringify(m))}""", [course, i])
            await pg.reload(); await pg.wait_for_timeout(1200)
            if not await pg.locator('#gt [data-gt="start"]').count() and await pg.locator('#gt-launch').count(): await pg.click('#gt-launch'); await W()
            await pg.click('#gt [data-gt="start"]'); await W(700)
        async def ans(course, i, qid, right=True):
            opts = TA_LESSONS['courses'][course]['lessons'][i]['q'][qid][1]
            await pg.click(f'#gt .gt-step.now .gt-opts button:has-text("{opts[0 if right else 1]}")'); await W(250)
            if right: await pg.click('#gt [data-gt="next"]'); await W(300)
        async def done(): await W(900); return await pg.evaluate("()=>document.querySelector('#gt-body h2')?.innerText||''")
        async def as_(per, nav):
            await pg.evaluate("()=>{try{close()}catch(e){}}"); await pg.select_option('#personaSelect', per); await W(500); await pg.click(f'#side [data-nav="{nav}"]'); await W(700)
        # owner-8: suspend Flipkart (guard on the Reason select, which shows Tamil)
        await start('owner', 8); await as_('owner', 'channels')
        await pg.click('#gt [data-gt="next"]') if await pg.locator('#gt .gt-step.now [data-gt="next"]').count() else None; await W()
        await ans('owner', 8, 'cause')
        await pg.click('[data-ch-act="suspend"][data-ch="flipkart"]'); await W()
        reason_label = await pg.evaluate("()=>document.querySelector('#chReason')?.selectedOptions[0]?.text")
        await pg.select_option('#chReason', 'Security concern'); await pg.click('#overlay.show #modalFoot .btn.primary'); await W(); g1 = await msg()
        await pg.select_option('#chReason', 'Stock errors'); await pg.fill('#chNote', 'பிழை'); await pg.click('#overlay.show #modalFoot .btn.primary'); await W(800)
        await ans('owner', 8, 'placed'); d = await done()
        rec('Owner lesson 9 in Tamil: suspend Flipkart (wrong reason caught by a Tamil message)', 'முடிந்தது' in d and 'சரக்குப் பிழைகள்' in g1 and reason_label == 'சரக்குப் பிழைகள்', f"reason shown '{reason_label}'; guard: '{g1}'; end '{d}'")
        # admin-15: product images (window-title check works in Tamil)
        await start('admin', 15); await as_('catalogue', 'catalogue')
        await pg.click('[data-cat-edit="8901002"]'); await W(700)
        title = await pg.text_content('#modalTitle'); await W(700)
        await pg.click('#ceImgSample'); await W(1200)
        if await pg.locator('#gt .gt-step.now [data-gt="next"]').count(): await pg.click('#gt .gt-step.now [data-gt="next"]'); await W()
        await pg.evaluate("()=>{try{close()}catch(e){}}"); await W()
        if await pg.locator('#gt .gt-step.now [data-gt="next"]').count(): await pg.click('#gt .gt-step.now [data-gt="next"]'); await W()
        await ans('admin', 15, 'size'); d = await done()
        rec('Administrator lesson 16 in Tamil: add a product photo (Tamil window title, lesson still advances)', 'முடிந்தது' in d and 'திருத்து' in (title or ''), f"window title '{title}'; end '{d}'")
        # backoffice-3: weekly plan with Tamil slot labels; wrong day caught
        await start('backoffice', 3); await as_('customer', 'shop')
        await pg.click('[data-shop-ch="mobile_app"]'); await W(); await pg.click('[data-shop-plan="weekly"]'); await W(900)
        for sku in ['8901002', '8901002', '8901007']: await pg.click(f'[data-shop-item="{sku}"] [data-shop-inc]'); await W(400)
        await W(500); await pg.click('#shStartPlan'); await W(); await pg.fill('#shEmail', 'priya@example.com'); await pg.fill('#shPass', 'priya-pass-1'); await pg.click('#shEmailGo'); await W(900)
        slot_label = await pg.evaluate("()=>document.querySelector('#shPlanSlot').selectedOptions[0].text")
        await pg.select_option('#shPlanWhen', '5'); await pg.click('#shStartPlan'); await W(); g2 = await msg()
        await pg.select_option('#shPlanWhen', '6'); await pg.select_option('#shPlanPay', 'upi'); await pg.click('#shStartPlan'); await W(900)
        await ans('backoffice', 3, 'away', False); await ans('backoffice', 3, 'away')
        await pg.click('[data-sub-skip]'); await W(900); await pg.click('[data-sub-run]'); await W(900)
        await ans('backoffice', 3, 'store'); d = await done()
        sub = await pg.evaluate("()=>AFMPhase2.shop().subs[0]")
        rec('Back office lesson 4 in Tamil: weekly plan (Tamil slot label, English data kept, wrong day caught)',
            'முடிந்தது' in d and 'சனிக்கிழமை' in g2 and slot_label == 'காலை 7–9 மணி' and sub['slot'] == 'Morning 7–9 AM', f"slot shown '{slot_label}', stored '{sub['slot']}'; guard '{g2}'; end '{d}'")
        # backoffice-2: return reason select (Tamil label, English value)
        await start('backoffice', 2); await as_('customer', 'shop')
        await pg.click('[data-shop-ch="whatsapp"]'); await W()
        if await pg.locator('#shWaStart').count(): await pg.click('#shWaStart'); await W(900)
        await pg.click('[data-shopwa="g:now"]'); await W(600)
        for _ in range(2): await pg.click('#shChat [data-shop-inc="8901002"][data-plan="now"] >> nth=-1'); await W(500)
        await pg.select_option('#shSlot', 'express'); await pg.select_option('#shPay', 'upi'); await pg.click('#shCheckout'); await W(900)
        await ans('backoffice', 2, 'express')
        for _ in range(3): await pg.click('[data-shop-next]'); await W(400)
        await W(500); await pg.click('[data-shop-return]'); await W()
        reason = await pg.evaluate("()=>document.querySelector('#shRetWhy').selectedOptions[0].text")
        await pg.click('#shRetSave'); await W(900)
        await as_('payments', 'refunds'); await pg.click('#rfTable [data-rf-approve] >> nth=0'); await W(500); await pg.click('#rfApproveGo'); d = await done()
        rf = await pg.evaluate("()=>AFMPhase2.refunds().items.find(r=>/Customer return/.test(r.reason))")
        rec('Back office lesson 3 in Tamil: order, return and refund (Tamil reason shown, English reason recorded)',
            'முடிந்தது' in d and reason == 'சேதமடைந்தது அல்லது கசிகிறது' and 'Damaged or leaking' in rf['reason'], f"reason shown '{reason}'; refund '{rf['reason']}' {rf['status']}; end '{d}'")
        rec('No page errors', not errs, errs[:3])
        await b.close()
    json.dump(R, open(OUT, 'w'), ensure_ascii=False, indent=1)
    print(sum(r['pass'] for r in R), '/', len(R))
asyncio.run(main())
