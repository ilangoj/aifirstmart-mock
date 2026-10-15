"""Step: find English still showing on a Tamil page (translation coverage report).

    python afm.py scan                       # both editions
    python afm.py scan --edition platform

Visits every role and screen of dist/<edition>/ta/index.html, plus the main dialogs and flows of the newer screens,
and lists visible English text, with where it was seen. Codes (AFM-WA-8821, POS-01), emails and brand abbreviations
are left out. Report: tests/results/scan-<edition>.json. To fix an entry: python afm.py i18n add "English" "Tamil".
"""
import asyncio, json, re
from pipeline.common import ROOT, out_dir

COLLECT = r"""()=>{const out=[];const W=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
 while(W.nextNode()){const n=W.currentNode,p=n.parentElement;if(!p||p.closest('script,style,code,#gt,#gt-launch'))continue;
  const r=p.getBoundingClientRect();if(!r.width&&!r.height)continue;const t=n.nodeValue.trim();if(/[A-Za-z]{3,}/.test(t))out.push(t)}
 document.querySelectorAll('input[placeholder]').forEach(e=>{if(e.offsetParent&&/[A-Za-z]{3,}/.test(e.placeholder))out.push('placeholder: '+e.placeholder)});return out}"""
KEEP = re.compile(r'\b(?:[A-Z0-9]+(?:-[A-Z0-9]+)+|[A-Z]{2,}\d*|AIFirstMart|RapidGo|[\w.+-]+@[\w.-]+|training-sample\.csv|Ctrl\+V)\b')


def english_left(t):
    """True when text still has English words once codes, emails, abbreviations and brand names are set aside."""
    return bool(re.search(r'[A-Za-z]{3,}', KEEP.sub(' ', t)))


async def _scan(page):
    from playwright.async_api import async_playwright
    found = {}
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await (await b.new_context(viewport={'width': 1440, 'height': 900})).new_page()
        await pg.goto(page.as_uri()); await pg.wait_for_timeout(1200)
        await pg.evaluate("()=>{localStorage.clear();localStorage.setItem('afm-lang','ta')}"); await pg.reload(); await pg.wait_for_timeout(1800)
        await pg.evaluate("()=>{try{AFMGuidedTraining.close()}catch(e){}}")
        async def grab(where):
            for t in await pg.evaluate(COLLECT): found.setdefault(t, set()).add(where)
        for per in await pg.evaluate("()=>[...document.querySelectorAll('#personaSelect option')].map(o=>o.value)"):
            await pg.evaluate("()=>{try{close()}catch(e){}}"); await pg.select_option('#personaSelect', per); await pg.wait_for_timeout(450)
            for nv in await pg.evaluate("()=>[...document.querySelectorAll('#side [data-nav]')].filter(e=>e.offsetParent).map(e=>e.dataset.nav)"):
                await pg.evaluate("()=>{try{close()}catch(e){}}"); await pg.click(f'#side [data-nav="{nv}"]'); await pg.wait_for_timeout(350); await grab(f'{per}/{nv}')
        await b.close()
    return {t: sorted(w) for t, w in found.items() if english_left(t)}


def scan(edition):
    page = out_dir(edition, 'ta') / 'index.html'
    if not page.exists():
        raise SystemExit(f'Build first: python afm.py build --edition {edition} --lang ta')
    left = asyncio.run(_scan(page))
    out = ROOT / 'tests' / 'results' / f'scan-{edition}.json'; out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(left, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'{edition}: {len(left)} English text(s) on the Tamil page -> {out.relative_to(ROOT)}')
    for t, w in list(left.items())[:15]: print(f'  {t[:90]!r}  ({", ".join(w[:2])})')
