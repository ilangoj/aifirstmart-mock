# AIFirstMart mock

A working mock of the AIFirstMart retail platform, in English and Tamil, in two editions:

- **training**: the platform plus guided lessons, narration and coaching
- **platform**: the product only

Everything is built from small modules under `src/` by one command line, `afm.py`. Read **STANDARD.md** for the
rules and a walk-through of every step.

Repository: `github.com/ilangoj/aifirstmart-mock` (private). Changes go through pull requests and CI; the `.md`
files change only with the owner's confirmation (STANDARD.md sections 6 and 12). AI assistants also follow
**CLAUDE.md**.

## Quick start

```bash
git clone https://github.com/ilangoj/aifirstmart-mock.git && cd aifirstmart-mock
pip install -r requirements.txt
python -m playwright install chromium     # for tests and scans only

python afm.py build                       # writes dist/training/{en,ta} and dist/platform/{en,ta}
python afm.py serve --edition platform    # opens the platform page (or double-click dist/.../index.html)
python afm.py test                        # every browser check and the backend tests
```

## Run it as a service

```bash
cp .env.example .env                              # then set the secrets in .env
python afm.py deploy --target docker              # pages at http://127.0.0.1:8080, API at /api/docs
python afm.py deploy --list                       # local, docker, static, image, cloudrun, ecs, azure, server
```

The same container image runs on any host that runs containers; see STANDARD.md section 8.

## Most used commands

| Task | Command |
|---|---|
| What modules exist | `python afm.py modules` |
| Rebuild one page | `python afm.py build --edition training --lang ta` |
| Test one module after a fix | `python afm.py test --module phase2 --build` |
| Check Tamil translations | `python afm.py i18n check` |
| Add a Tamil translation | `python afm.py i18n add "English" "தமிழ்"` |
| Find English on Tamil pages | `python afm.py scan` |
| Re-record a narration clip | `python afm.py narrate record --lang ta --clip backoffice-3-start` |
| Zip the project | `python afm.py package` |
| Deploy | `python afm.py deploy --target <name> --dry-run`, then without `--dry-run` |
| Check a running copy | `python afm.py verify --url http://127.0.0.1:8080` |
| Start a fix | `git switch -c fix/<module>-<short-description>` |

## Published pages

| | English | Tamil |
|---|---|---|
| Training | https://claude.ai/artifact/8qNdmahPxxqe9YCJP5k6tk | https://claude.ai/artifact/FTaeGxuygTQP9F7QsrKGJQ |
| Platform | https://claude.ai/artifact/2bYWcc7XvV4uxge9dovRYS | https://claude.ai/artifact/DandhuBHwDuB7y9CELzmiA |
