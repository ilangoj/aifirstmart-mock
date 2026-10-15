"""Step: check a running copy of the system at any address (STANDARD.md section 8.3).

    python afm.py verify --url http://127.0.0.1:8080
    python afm.py verify --url https://aifirstmart-xyz.a.run.app

Checks /healthz, then opens every page the server reports in a browser (Playwright, Chromium) and fails on page
errors, an empty page or a missing title. Prints one PASS/FAIL line per check, like the tests.
"""
from __future__ import annotations

import asyncio
import json
import urllib.request


def health(url: str) -> dict:
    with urllib.request.urlopen(url.rstrip('/') + '/healthz', timeout=15) as r:
        return json.loads(r.read().decode())


async def _pages(base: str, pages: list[str]) -> list[tuple[bool, str, str]]:
    from playwright.async_api import async_playwright
    results = []
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        for page_path in pages:
            pg = await (await browser.new_context(viewport={'width': 1366, 'height': 860})).new_page()
            errors = []
            pg.on('pageerror', lambda e, errors=errors: errors.append(str(e)))
            try:
                resp = await pg.goto(f'{base}/{page_path}/', wait_until='load', timeout=90000)
                await pg.wait_for_timeout(1500)
                title = await pg.title()
                text = len((await pg.evaluate('document.body.innerText')).strip())
                ok = resp is not None and resp.ok and bool(title) and text > 200 and not errors
                results.append((ok, page_path, f'HTTP {resp.status if resp else "-"}, title {title!r}, {text} characters'
                                + (f', errors: {errors[:2]}' if errors else '')))
            except Exception as e:  # noqa: BLE001 - report any failure as a FAIL line
                results.append((False, page_path, f'{type(e).__name__}: {e}'))
            await pg.context.close()
        await browser.close()
    return results


def verify(url: str) -> int:
    base = url.rstrip('/')
    try:
        h = health(base)
    except Exception as e:  # noqa: BLE001
        print(f'FAIL /healthz | {type(e).__name__}: {e}')
        return 1
    ok_health = h.get('status') == 'ok'
    print(f'{"PASS" if ok_health else "FAIL"} /healthz | version {h.get("version")}, pages {h.get("pages")}, api {h.get("api")}')
    failed = not ok_health
    if h.get('api'):
        try:
            with urllib.request.urlopen(base + '/api/openapi.json', timeout=15) as r:
                print(f'PASS /api/openapi.json | HTTP {r.status}')
        except Exception as e:  # noqa: BLE001
            print(f'FAIL /api/openapi.json | {e}')
            failed = True
    for ok, page_path, evidence in asyncio.run(_pages(base, h.get('pages', []))):
        print(f'{"PASS" if ok else "FAIL"} /{page_path}/ | {evidence}')
        failed |= not ok
    print('All checks passed.' if not failed else 'Some checks failed.')
    return 1 if failed else 0
