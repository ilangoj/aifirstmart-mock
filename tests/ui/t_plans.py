import sys, pathlib; sys.path.insert(0, str(pathlib.Path(__file__).parent))
from _page import PAGE, RESULT, SHOTS
import asyncio, json, datetime
from playwright.async_api import async_playwright
URL = PAGE
R = []
def rec(item, ok, detail=''):
    R.append({'item': item, 'pass': bool(ok), 'detail': detail}); print('PASS' if ok else 'FAIL', item, '|', str(detail)[:240])

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await (await b.new_context(viewport={'width': 1440, 'height': 900})).new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:140]))
        await pg.goto(URL); await pg.wait_for_timeout(1500)
        await pg.evaluate("()=>localStorage.clear()"); await pg.reload(); await pg.wait_for_timeout(1500); errs.clear()
        await pg.evaluate("()=>{try{AFMGuidedTraining.close()}catch(e){};AFMPhase2.reset()}")
        W = lambda ms=350: pg.wait_for_timeout(ms)
        T = lambda: pg.text_content('#toast')
        SH = lambda: pg.evaluate("()=>AFMPhase2.shop()")
        await pg.select_option('#personaSelect', 'customer'); await W(500); await pg.click('#side [data-nav="shop"]'); await W()

        # ---- web shop is unchanged
        web_tabs = await pg.locator('[data-shop-plan]').count()
        # ---- mobile app: three groups
        await pg.click('[data-shop-ch="mobile_app"]'); await W()
        tabs = await pg.evaluate("()=>[...document.querySelectorAll('[data-shop-plan]')].map(b=>b.dataset.shopPlan+':'+b.getAttribute('aria-selected'))")
        heads = await pg.evaluate("()=>[...document.querySelectorAll('.afm-phone h3')].map(h=>h.textContent)")
        rec('Mobile app opens on three groups: Immediate delivery, Weekly plan, Monthly plan (web shop has no groups)',
            tabs == ['now:true', 'weekly:false', 'monthly:false'] and web_tabs == 0 and heads[0] == 'Suggested for immediate delivery', f'{tabs}; sections {heads}; web group tabs {web_tabs}')

        # immediate: express+COD refused, then order
        await pg.click('[data-shop-item="8901002"] [data-shop-inc]'); await W()
        await pg.click('#shCheckout'); await W()
        await pg.fill('#shEmail', 'priya@example.com'); await pg.fill('#shPass', 'priya-pass-1'); await pg.click('#shEmailGo'); await W(500)
        opts = await pg.evaluate("()=>[...document.querySelectorAll('#shSlot option')].map(o=>o.value)")
        await pg.select_option('#shPay', 'cod'); await pg.click('#shCheckout'); await W(); t1 = await T()
        await pg.select_option('#shPay', 'upi'); await pg.click('#shCheckout'); await W()
        o = (await SH())['orders'][0]
        rec('Immediate delivery: express or pickup only; Express + cash refused; order labelled Immediate delivery',
            opts == ['express', 'pickup'] and 'paid online' in t1 and o['service'] == 'Immediate delivery' and o['ch'] == 'mobile_app', f"options {opts}; COD → '{t1[:45]}'; order {o['id']} {o['service']}")

        # weekly plan
        await pg.click('[data-shop-plan="weekly"]'); await W()
        sug = await pg.evaluate("()=>[...document.querySelectorAll('.afm-phone h3')][0].nextElementSibling?.dataset.shopItem")
        for sku in ['8901002', '8901002', '8901007']: await pg.click(f'[data-shop-item="{sku}"] [data-shop-inc]'); await W(250)
        badge = await pg.evaluate("()=>document.querySelector('[data-shop-plan=\"weekly\"]').innerText")
        bar = await pg.evaluate("()=>document.querySelector('.afm-phone > div:last-child').innerText")
        await pg.select_option('#shPlanWhen', '6'); await pg.select_option('#shPlanSlot', 'Morning 7–9 AM'); await pg.select_option('#shPlanPay', 'upi'); await pg.click('#shStartPlan'); await W()
        s = await SH(); w = [x for x in s['subs'] if x['plan'] == 'weekly'][0]
        nxt = datetime.datetime.fromtimestamp(w['next'] / 1000)
        rec('Weekly plan: suggested items first, basket count on the tab, plan starts on the next Saturday',
            sug == '8901002' and '3 in basket' in badge and '₹94.00' in bar and w['status'] == 'Active' and nxt.weekday() == 5 and nxt.date() > datetime.date.today(),
            f"first suggestion {sug}; tab '{badge.replace(chr(10), ' ')}'; bar '{bar.replace(chr(10), ' ')}'; {w['id']} next {nxt:%a %d %b}")

        # adding again changes the plan rather than starting a second one
        await pg.click('[data-shop-item="8901006"] [data-shop-inc]'); await W()
        editing = await pg.evaluate("()=>document.querySelector('#shStartPlan')?.textContent")
        await pg.click('#shStartPlan'); await W()
        s = await SH(); ws = [x for x in s['subs'] if x['plan'] == 'weekly']
        rec('Adding to a group with a plan edits that plan (no duplicate plan)', len(ws) == 1 and len(ws[0]['lines']) == 3 and 'Save changes' in (editing or ''), f"button '{editing}'; weekly plans {len(ws)}; lines {[l['n'] for l in ws[0]['lines']]}")

        # monthly plan on the 5th
        await pg.click('[data-shop-plan="monthly"]'); await W()
        msug = await pg.evaluate("()=>[...document.querySelectorAll('.afm-phone h3')][0].parentElement.querySelectorAll('[data-shop-item]')[0].dataset.shopItem")
        for sku in ['8901001', '8901003', '8901008']: await pg.click(f'[data-shop-item="{sku}"] [data-shop-inc]'); await W(250)
        await pg.select_option('#shPlanWhen', '5'); await pg.select_option('#shPlanPay', 'cod'); await pg.click('#shStartPlan'); await W()
        m = [x for x in (await SH())['subs'] if x['plan'] == 'monthly'][0]; mn = datetime.datetime.fromtimestamp(m['next'] / 1000)
        rec('Monthly plan: staples suggested, delivered on the chosen date each month', msug == '8901001' and mn.day == 5 and m['pay'] == 'cod', f"first suggestion {msug}; {m['id']} next {mn:%a %d %b}; pay {m['pay']}")

        # skip, pause/resume, delivery day, shortage, cancel
        before = w['next']; await pg.click(f'[data-sub-skip="{w["id"]}"]'); await W()
        w2 = [x for x in (await SH())['subs'] if x['id'] == w['id']][0]
        await pg.click(f'[data-sub-pause="{w["id"]}"]'); await W()
        paused_run = await pg.locator(f'[data-sub-run="{w["id"]}"]').count()
        await pg.click(f'[data-sub-pause="{w["id"]}"]'); await W()
        rec('Skip moves the next delivery by a week; pause stops deliveries; resume restarts', (w2['next'] - before) == 7 * 86400000 and paused_run == 0, f"skip +{(w2['next'] - before) / 86400000:.0f} days; delivery button while paused: {paused_run}")
        await pg.evaluate("()=>{const it=items.find(x=>x.id==='8901006');it.s=0}")
        res0 = await pg.evaluate("()=>AFMChannels.state().reserved['8901002']||0")
        await pg.click(f'[data-sub-run="{w["id"]}"]'); await W()
        s = await SH(); o = s['orders'][0]; ch = await pg.evaluate("()=>AFMChannels.state().orders[0]"); res1 = await pg.evaluate("()=>AFMChannels.state().reserved['8901002']||0")
        w3 = [x for x in s['subs'] if x['id'] == w['id']][0]
        rec('Delivery day: the plan becomes a store order with stock reserved; out-of-stock items are left out and not charged',
            'Weekly plan' in o['service'] and ch['id'] == o['id'] and ch['items'].startswith('Weekly plan:') and res1 - res0 == 2 and all(l['sku'] != '8901006' for l in o['lines']) and 'short of Marie Gold' in w3['note'] and o['total'] == 94,
            f"{o['id']} · {o['service']} · ₹{o['total']}; store sees '{ch['items']}'; milk reserved +{res1 - res0}; note '{w3['note']}'")
        await pg.click(f'[data-sub-cancel="{m["id"]}"]'); await W(); title = await pg.text_content('#overlay.show #modalTitle'); await pg.click('#shSubCancelGo'); await W()
        mc = [x for x in (await SH())['subs'] if x['id'] == m['id']][0]
        rec('Cancelling a plan asks first and offers Pause instead', 'Cancel monthly plan' in title and mc['status'] == 'Cancelled', f"'{title}' → {mc['status']}")
        await pg.screenshot(path=str(SHOTS/'app_plans.png'), full_page=False)

        # ---- WhatsApp
        await pg.click('#shSignout'); await W(); await pg.click('[data-shop-ch="whatsapp"]'); await W(); await pg.click('#shWaStart'); await W()
        welcome = await pg.evaluate("()=>[...document.querySelectorAll('#shChat [role=log] > div')].pop().innerText")
        menu = await pg.evaluate("()=>[...document.querySelectorAll('#shChat [data-shopwa]')].map(b=>b.innerText)")
        await pg.click('[data-shopwa="g:weekly"]'); await W()
        last = await pg.evaluate("()=>[...document.querySelectorAll('#shChat [role=log] > div')].pop().innerText")
        rec('WhatsApp: welcome and menu are the three groups; each group lists Suggested, then More products',
            all(x in welcome for x in ['Immediate delivery', 'Weekly plan', 'Monthly plan']) and menu[:3] == ['⚡ Immediate delivery', '📅 Weekly plan', '🗓 Monthly plan'] and 'Suggested' in last and 'More products' in last,
            f"menu {menu}; message starts '{last[:60]}'")
        await pg.click('#shChat [data-shop-inc="8901002"][data-plan="weekly"] >> nth=-1'); await W()
        await pg.click('#shChat [data-shop-inc="8901007"][data-plan="weekly"] >> nth=-1'); await W()
        await pg.click('[data-shopwa="cart"]'); await W()
        rev = await pg.evaluate("()=>[...document.querySelectorAll('#shChat [role=log] > div')].pop().innerText")
        await pg.select_option('#shPlanWhen', '0'); await pg.click('#shStartPlan'); await W()
        conf = await pg.evaluate("()=>[...document.querySelectorAll('#shChat [role=log] > div')].pop().innerText")
        await pg.click('[data-shopwa="plans"]'); await W()
        plans = await pg.evaluate("()=>[...document.querySelectorAll('#shChat [role=log] > div')].pop().innerText")
        rec('WhatsApp weekly plan: add from chat, review basket, start, confirmation and My plans in the chat',
            'a week' in rev and 'Weekly plan' in rev and 'is started' in conf and 'Sun' in conf and 'SUB-W' in plans, f"review '{rev[:70]}'; confirm '{conf[:80]}'; plans '{plans[:60]}'")
        await pg.click('[data-shopwa="g:now"]'); await W()
        await pg.click('#shChat [data-shop-inc="8901003"][data-plan="now"] >> nth=-1'); await W()
        imm = await pg.evaluate("()=>document.querySelector('#shCart h2').innerText")
        await pg.screenshot(path=str(SHOTS/'wa_plans.png'), full_page=False)
        rec('Switching group in WhatsApp switches the checkout beside the chat', 'Immediate delivery' in imm, imm)

        # ---- narrow phone width still works
        await pg.set_viewport_size({'width': 390, 'height': 844}); await pg.click('[data-shop-ch="mobile_app"]'); await W()
        over = await pg.evaluate("()=>document.documentElement.scrollWidth-window.innerWidth")
        rec('Phone width: no sideways scrolling in the grouped app', over <= 2, f'overflow {over}px')
        rec('No page errors', not errs, errs[:3])
        await b.close()
    json.dump(R, open(RESULT, 'w'), indent=1)
    print(sum(r['pass'] for r in R), '/', len(R))
asyncio.run(main())
