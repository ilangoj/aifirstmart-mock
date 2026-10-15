import sys, pathlib; sys.path.insert(0, str(pathlib.Path(__file__).parent))
from _page import PAGE, RESULT, SHOTS
import asyncio, json, base64, io
from playwright.async_api import async_playwright
from PIL import Image
URL = PAGE
R = []
def rec(item, ok, detail=''):
    R.append({'item': item, 'pass': bool(ok), 'detail': detail}); print('PASS' if ok else 'FAIL', item, '|', str(detail)[:230])

def png_b64(color):
    b = io.BytesIO(); Image.new('RGB', (600, 600), color).save(b, 'PNG'); return base64.b64encode(b.getvalue()).decode()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await (await b.new_context(viewport={'width': 1440, 'height': 900})).new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:120]))
        await pg.goto(URL); await pg.wait_for_timeout(1500)
        await pg.evaluate("()=>localStorage.clear()"); await pg.reload(); await pg.wait_for_timeout(1500); errs.clear()
        await pg.evaluate("()=>{try{AFMGuidedTraining.close()}catch(e){};AFMPhase2.reset();AFMCatalogue.reset()}")
        W = lambda ms=400: pg.wait_for_timeout(ms)
        async def as_(r, screen=None):
            await pg.evaluate("()=>{try{close()}catch(e){}}"); await pg.select_option('#personaSelect', r); await W(500)
            if screen: await pg.click(f'#side [data-nav="{screen}"]'); await W(400)
        shop_img = "sku=>{const c=document.querySelector(`#shop [data-shop-item=\"${sku}\"] img`);return c?c.src.slice(0,30):null}"

        # 1. Customer opens the shop first (before any image), then staff add one: the shop must refresh by itself.
        await as_('customer', 'shop')
        before = await pg.evaluate(shop_img, '8901002')
        await as_('catalogue', 'catalogue')
        await pg.click('[data-cat-edit="8901002"]'); await W(); await pg.click('#ceImgSample'); await W(900)
        main_id = await pg.evaluate("()=>AFMCatalogue.mainImage('8901002')?.id")
        await pg.evaluate("()=>{try{close()}catch(e){}}")
        await as_('customer', 'shop')
        web = await pg.evaluate(shop_img, '8901002')
        rec('Image uploaded in Catalogue shows on the web shop', before is None and main_id and web and web.startswith('data:image/jpeg'), f'before: {before}; after: {web}')

        await pg.click('[data-shop-ch="mobile_app"]'); await W()
        app = await pg.evaluate(shop_img, '8901002')
        rec('…and in the mobile app', bool(app and app.startswith('data:image')), app)

        await pg.click('[data-shop-ch="whatsapp"]'); await W()
        if await pg.locator('#shWaStart').count(): await pg.click('#shWaStart'); await W()
        await pg.click('[data-shopwa="g:now"]'); await W(700)
        wa = await pg.evaluate("()=>{const c=document.querySelector('#shChat [data-wa-card=\"8901002\"] img');return c?c.src.slice(0,30):null}")
        others = await pg.evaluate("()=>document.querySelectorAll('#shChat [data-wa-card] .afm-thumb').length")
        rec('…and in the WhatsApp catalogue (photo cards, emoji when a product has no photo)', bool(wa and wa.startswith('data:image')) and others > 3, f'milk: {wa}; product cards with a picture slot: {others}')
        await pg.click('#shChat [data-wa-card="8901002"] [data-shop-inc]'); await W()
        cart = await pg.evaluate("()=>!!document.querySelector('#shCart [data-waimg=\"8901002\"] img')")
        rec('The cart shows the product photo', cart, cart)

        # 2. Paste into the table: not on the storefront until Save changes, with a clear notice.
        await as_('catalogue', 'catalogue')
        await pg.evaluate("""async b64=>{const bin=atob(b64),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
          const f=new File([u],'atta.png',{type:'image/png'}),dt=new DataTransfer();dt.items.add(f);
          const cell=document.querySelector('[data-imgcell=\"8901001\"]');cell.focus();
          document.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true}))}""", png_b64((200, 120, 40)))
        await W(900)
        pend = await pg.evaluate("()=>AFMCatalogue.pending().images.length")
        await as_('customer', 'shop'); await pg.click('[data-shop-ch="web"]'); await W()
        atta_before = await pg.evaluate(shop_img, '8901001')
        note = await pg.evaluate("()=>document.querySelector('#shop [data-afm-pendnote]')?.innerText||''")
        rec('A pasted, unsaved image is flagged on the shop and not shown to shoppers', pend == 1 and atta_before is None and 'not saved' in note, f'pending {pend}; atta img {atta_before}; note: {note[:90]}')
        await pg.click('[data-afm-gocat]'); await W()
        await pg.evaluate("()=>{try{close()}catch(e){}}")
        await as_('catalogue', 'catalogue'); await pg.click('#catSaveAll'); await W(900)
        await as_('customer', 'shop')
        atta = await pg.evaluate(shop_img, '8901001'); note2 = await pg.evaluate("()=>!!document.querySelector('#shop [data-afm-pendnote]')")
        rec('After Save changes the pasted image appears and the notice clears', bool(atta) and not note2, f'atta img {atta}; notice still shown: {note2}')

        # 3. Live refresh without switching role, change of main image, removal.
        await pg.evaluate("""()=>{const s=AFMCatalogue.state();const l=s.images['8901001'];l.forEach(i=>i.main=false);l[0].main=true;}""")
        await W(900)
        live = await pg.evaluate("()=>document.querySelector('#shop [data-shop-item=\"8901001\"] img')?.src.slice(0,30)")
        await pg.evaluate("()=>{const s=AFMCatalogue.state();delete s.images['8901001']}"); await W(900)
        gone = await pg.evaluate("()=>{const c=document.querySelector('#shop [data-shop-item=\"8901001\"]');return !c.querySelector('img')&&c.innerText.includes('🌾')}")
        rec('Storefront refreshes on its own when images change or are removed (back to the emoji)', bool(live) and gone, f'live: {live}; removed → emoji: {gone}')

        # 4. Till quick products use the photo too.
        await as_('cashier', 'sell')
        till = await pg.evaluate("()=>!!document.querySelector('#products [data-add=\"8901002\"] img.afm-thumb')")
        rec('Till quick products show the product photo', till, till)

        # 5. Persisted: reload keeps the image on the storefront.
        await pg.reload(); await pg.wait_for_timeout(1800)
        await as_('customer', 'shop'); await pg.click('[data-shop-ch="web"]'); await W()
        kept = await pg.evaluate(shop_img, '8901002')
        rec('After a reload the photo is still on the shop', bool(kept), kept)
        await pg.screenshot(path=str(SHOTS/'shop_images.png'))
        await pg.click('[data-shop-ch="whatsapp"]'); await W(); await pg.screenshot(path=str(SHOTS/'wa_images.png'))
        rec('No page errors', not errs, errs[:3])
        await b.close()
    json.dump(R, open(RESULT, 'w'), indent=1)
    print(sum(r['pass'] for r in R), '/', len(R))
asyncio.run(main())
