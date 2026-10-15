"""Step: open a built page in the browser through a local web server.

    python afm.py serve                              # platform, English
    python afm.py serve --edition training --lang ta
"""
import functools, http.server, threading, webbrowser
from pipeline.common import DIST


def serve(edition, lang, port=8000):
    page = DIST / edition / lang / 'index.html'
    if not page.exists():
        raise SystemExit(f'Build first: python afm.py build --edition {edition} --lang {lang}')
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(DIST))
    with http.server.ThreadingHTTPServer(('127.0.0.1', port), handler) as srv:
        url = f'http://127.0.0.1:{port}/{edition}/{lang}/index.html'
        print(f'Serving {url}  (Ctrl+C to stop)')
        threading.Timer(0.6, webbrowser.open, [url]).start()
        try: srv.serve_forever()
        except KeyboardInterrupt: print('\nStopped.')
