"""Shared by the web server and the static deploy target: the start page and the version. Standard library only."""
from __future__ import annotations

import html
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EDITIONS = ('training', 'platform')
LANGS = {'en': 'English', 'ta': 'தமிழ்'}


def version() -> str:
    try:
        return (ROOT / 'VERSION').read_text().strip()
    except OSError:
        return 'unknown'


def served_pages(dist: Path, editions: list[str]) -> list[tuple[str, str]]:
    return [(e, lang) for e in editions for lang in LANGS if (dist / e / lang / 'index.html').is_file()]


def start_page(pages: list[tuple[str, str]], api: bool) -> str:
    rows = ''.join(f'<li><a href="/{e}/{lang}/">{html.escape(e.title())} · {LANGS[lang]}</a></li>' for e, lang in pages)
    api_row = '<li><a href="/api/docs">Backend API</a></li>' if api else ''
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>AIFirstMart mock</title>
<style>body{{font:16px/1.5 system-ui,sans-serif;margin:0 auto;max-width:640px;padding:32px 16px;color:#1d2433;background:#fff}}
a{{color:#1f5fbf}}li{{margin:8px 0}}small{{color:#5b6475}}
@media (prefers-color-scheme:dark){{body{{color:#e6e9ef;background:#151922}}a{{color:#8db8ff}}small{{color:#9aa3b5}}}}</style></head>
<body><h1>AIFirstMart mock</h1><ul>{rows or '<li>No pages built. Run: python afm.py build</li>'}{api_row}</ul>
<small>Version {html.escape(version())}</small></body></html>"""
