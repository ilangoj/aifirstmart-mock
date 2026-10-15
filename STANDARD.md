# AIFirstMart mock: engineering standard

This document defines how the AIFirstMart mock is organised, built, tested, versioned, deployed and changed. It
explains every step of the pipeline, so that a single module can be fixed, rebuilt and tested on its own, new
features can be added without touching unrelated code, and the same build can run on a laptop or on any cloud.

- **Owner:** ilangoj (GitHub). The owner confirms every change to this document (section 12).
- **Audience:** anyone changing the mock — screens, lessons, translations, narration, the backend or deployment —
  including AI coding assistants, which follow `CLAUDE.md` as well.
- **Language of the tooling:** Python 3.10+ for every step (3.12 in CI and in the container). The pages themselves
  are HTML and JavaScript.
- **One command line:** `python afm.py <step>`. Every step can run alone.
- **Repository:** `github.com/ilangoj/aifirstmart-mock` (private). `main` is always releasable.

---

## 1. Principles

1. **One source of truth per thing.** Each screen, feature, translation and recording lives in exactly one file
   under `src/`. Nothing in `dist/` is ever edited by hand: it is rebuilt from `src/`.
2. **One module, one responsibility.** A module does one job (for example *refunds*, *catalogue photos on
   storefronts*, *Tamil for the newer screens*). If a change needs two modules, change both and test both.
3. **Declared, not discovered.** Which modules exist, what they do, where they load and which editions include them
   is written in `config/modules.json`. The build follows the manifest; it never guesses.
4. **Deterministic builds.** The same sources always give the same pages, byte for byte.
5. **English underneath, any language on screen.** Code and stored data use English values. Tamil is applied to what
   is shown. Switching language never changes records, and lesson checks work in both languages.
6. **Tested before shared.** A change is done when the tests for the modules it touches pass (section 10), and CI
   passes on its pull request.
7. **Every change is reviewed and recorded.** Nothing is committed straight to `main`. Each change goes through a
   pull request, names the modules it touches, and adds a `CHANGELOG.md` entry (section 6).
8. **Where it runs is configuration, not code.** The same container image runs locally, on a server or on any cloud.
   Addresses, secrets and switches come from environment variables; deployment targets are listed in
   `config/deploy.json` (sections 7 and 8).
9. **Documents are confirmed, not assumed.** The `.md` files describe how the project works. A change to any of them
   is proposed, shown to the owner, and applied only after the owner confirms it (section 12).

---

## 2. Project layout

```
aifirstmart-mock/
├── afm.py                     The command line: one sub-command per pipeline step
├── STANDARD.md                This document
├── README.md                  Quick start
├── CHANGELOG.md               What changed, newest first, grouped by release
├── CLAUDE.md                  Rules for AI coding assistants working in this repository
├── VERSION                    The current release number (MAJOR.MINOR.PATCH)
├── requirements.txt           Python packages for the pipeline and tests
├── pyproject.toml             Lint (ruff) and test (pytest) settings
├── .env.example               Every environment variable, with safe sample values (copy to .env)
├── .gitignore, .gitattributes What Git leaves out; how it treats text and binary files
├── .github/
│   ├── CODEOWNERS             Files that need the owner's review (every .md, config, deploy, workflows)
│   ├── pull_request_template.md  The checklist every pull request fills in
│   ├── dependabot.yml         Weekly update proposals for Python packages, Actions and the base image
│   └── workflows/
│       ├── ci.yml             On every push and pull request: lint, i18n check, build, tests, image build
│       └── release.yml        On a version tag: build, test, publish zips and the container image
├── config/
│   ├── modules.json           THE MANIFEST: editions, languages, styles, modules, add-ons
│   ├── deploy.json            Deployment targets: local, docker, static, and cloud templates
│   └── links.json             Published page links, shown inside the pages
├── server/
│   └── app.py                 The web server: built pages at /, the backend API at /api, health at /healthz
├── deploy/
│   ├── Dockerfile             One image: builds the pages, then runs the server
│   └── docker-compose.yml     Run that image locally, with a data volume and your .env
├── src/                       Everything the pages are built from (edit here)
│   ├── shell/index.html       The page skeleton: markup with named placeholders
│   ├── styles/*.css           Style sheets, in load order (NN- prefix)
│   ├── modules/
│   │   ├── platform/*.js      Platform features (in every edition)
│   │   ├── training/*.js      Training layers (training edition only)
│   │   ├── i18n/*.js          Tamil translation of the original screens
│   │   └── addons/            Newer features loaded at named slots
│   │       ├── phase2/*.js    A multi-part module: parts joined in name order, one scope
│   │       └── *.js
│   ├── i18n/
│   │   ├── en/narration.json  English narration scripts, by clip id
│   │   └── ta/
│   │       ├── ui.json        Tamil screen dictionary (English text → Tamil)
│   │       ├── lessons.json   Tamil lesson text for every course
│   │       └── narration.json Tamil narration scripts, by clip id
│   └── audio/{en,ta}/*.mp3    One recording per lesson step
├── pipeline/                  One Python module per step (see section 5)
├── tests/
│   ├── registry.json          Which pages each test checks and which modules it covers
│   ├── ui/t_*.py              Browser tests (Playwright)
│   └── results/               Test output (not shipped)
├── tools/tts/                 Voice models for narration (downloaded, not in Git)
├── backend/                   Python reference framework (FastAPI), with its own tests
└── dist/                      Built pages (generated, not in Git)
    ├── training/{en,ta}/      Platform + guided training
    └── platform/{en,ta}/      Platform only
```

What is in Git: everything above except `dist/`, `tests/results/`, `tools/tts/` model files, `.env` and caches
(`.gitignore`). Recordings (`src/audio/`, about 21 MB) are in Git as ordinary files; they change rarely.

---

## 3. Editions and languages

| Edition | Includes module kinds | Notes |
|---|---|---|
| `training` | `platform`, `i18n`, `training` | Guided lessons, narration, coaching, training records |
| `platform` | `platform`, `i18n`, `platform-only` | The product only; sets `AFM_NO_TRAINING`, which switches training records off |

| Language | Notes |
|---|---|
| `en` | English narration is embedded in the training page |
| `ta` | Tamil narration is split into `audio-ta-1.js` and `audio-ta-2.js` beside the page, to stay under the 16 MB hosting limit |

A page can switch language from its menu. The build only sets the *starting* language (`AFM_DEFAULT_LANG`).

---

## 4. The module contract

### 4.1 Kinds

| Kind | Loaded in | Use for |
|---|---|---|
| `platform` | both editions | Screens and features of the product |
| `i18n` | both editions | Translation of what the product shows |
| `training` | training edition | Lessons, narration, coaching, practice aids |
| `platform-only` | platform edition | Behaviour that only makes sense without training |

### 4.2 Positions

- **Legacy modules** keep their original position: the shell has a placeholder `<!--@module:ID-->` for each.
- **Add-ons** load at one of two slots, in manifest order:
  - `addons-before-guided` runs after the platform screens and before the guided training engine.
  - `addons-end` runs last, before `</body>`.
- **Generated parts** are filled by the build: `flags`, `title`, `narration`, `ta-ui-data`, and the Tamil lesson JSON
  inside `guided-training` (`/*@json:ta-lessons*/{}`).

### 4.3 Rules for a JavaScript module

1. **Header comment.** The first lines say what the module does and what it changes on screen.
2. **Own scope.** Wrap the module in `(() => { 'use strict'; ... })();` and guard against loading twice:
   `if (window.__afmName) return; window.__afmName = true;`.
3. **Public surface.** Expose what other modules or tests need as one object, `window.AFMName = {...}`.
   Never reach into another module's private variables.
4. **Extending platform functions.** Wrap, don't replace: keep the original and call it
   (`const base = fn; fn = function () { const r = base.apply(this, arguments); ...; return r; };`), inside `try`.
5. **Saved data.** Use `localStorage` keys named `afm-<feature>-v<N>`. Bump `N` when the shape changes, and keep
   a reset function (`AFMName.reset()`).
6. **Text on screen is English.** Tamil is added by the dictionary (`src/i18n/ta/ui.json`), not in module code.
   - Give every `<option>` an explicit `value` in English, so a translated label never changes the stored value.
   - Open windows with the platform's `open(title, body, foot)`; the English title is kept for checks.
   - Dates in messages: use the English format from `toLocaleDateString('en-IN', …)`; the Tamil layer converts them.
7. **Roles and permissions.** Check permissions through the access policy (`AFMPolicy.can(...)` or the platform's
   `can(...)`), never by role name alone.
8. **Accessibility.** Buttons are `<button>`; inputs have labels; status messages use `role="status"` or the toast.
9. **No secrets, no network calls.** The mock runs offline. Hosted extras (database, downloads) go through
   `window.claude.use(...)` and must work when that returns `null`.

### 4.4 Multi-part modules

A module with `"dir"` in the manifest (for example `phase2`) is several files joined **in file-name order into one
script**, so they share one scope. Name parts `NN-topic.js` (`20-refunds.js`, `30-shop.js`). The first part opens the
scope and the last part closes it. Put a new feature in a new part with a number between its neighbours.

### 4.5 Naming

- Module ids: lower-case words joined by hyphens (`storefront-images`). The file name is the id.
- Clip ids: `<course>-<lesson index>-<intro|step id|done>` (`backoffice-3-start`).
- Tests: `t_<area>.py`.

---

## 5. The pipeline, step by step

Run every step from the project folder: `python afm.py <step> ...`. Steps do not depend on each other's internal
state; they only read `src/`, `config/` and (for tests) `dist/`.

### Step 1 — `modules`: see what exists

```bash
python afm.py modules
```

Prints every module and add-on with its kind, the editions that include it and what it does. Use it to find the
module that owns a behaviour before changing anything. The same information is in `config/modules.json`.

### Step 2 — edit the source

Change the file(s) under `src/` that own the behaviour:

| To change | Edit |
|---|---|
| A screen or feature | `src/modules/<kind>/<id>.js` (or a part in `src/modules/addons/phase2/`) |
| Page markup | `src/shell/index.html` (keep every `<!--@...-->` placeholder) |
| Styles | `src/styles/NN-*.css` |
| Tamil on screens | `src/i18n/ta/ui.json` (or `python afm.py i18n add`) |
| Tamil lesson text | `src/i18n/ta/lessons.json` |
| English lesson text | `src/modules/training/guided-training.js` (courses) or `src/modules/addons/backoffice-course.js` |
| Narration words | `src/i18n/<lang>/narration.json`, then step 4 |
| Which editions load a module, or its order | `config/modules.json` |

### Step 3 — `i18n`: check and maintain Tamil

```bash
python afm.py i18n check                      # structure, tokens, empty values, lesson format
python afm.py i18n find "Weekly plan"         # look up English or Tamil
python afm.py i18n add "Order @ placed" "ஆர்டர் @ செய்யப்பட்டது"
```

How the Tamil dictionary works:

- **`exact`**: the whole text on screen, matched exactly → Tamil.
- **`templates`**: text with variable parts. Tokens stand for the variable parts and are put back in place:

  | Token | Stands for | Example |
  |---|---|---|
  | `#` | a number | `Only # left` |
  | `₹#` | an amount | `Refund ₹# waiting for approval` |
  | `@` | a code or email | `Order @ placed` (AFM-WEB-9100) |
  | `%p` | a product name (translated) | `Image added to %p` |
  | `%c` | a channel name (translated) | `Stock synced to %c` |
  | `§` | a date like `Sat, 17 Oct` (translated) | `Next delivery §` |

  Tokens fill in order. To reorder in Tamil, use `{1}`, `{2}`, … for the 1st, 2nd … token in the English.
- **`parts`**: pieces of text joined with ` · ` (`Cashier · Ulundurpet · POS-01`); each piece is translated alone.
- **`names`**: people's names in Tamil script.
- **`attributes`**: input placeholders.

`check` must say `OK` before you build. It runs in under a second.

### Step 4 — `narrate`: record narration

```bash
python afm.py narrate status                                   # what is recorded, what has no script
python afm.py narrate record --lang ta --clip backoffice-3-start
python afm.py narrate record --lang en --clip owner-0-intro,owner-0-read
python afm.py narrate record --lang ta --missing               # every script without a recording
```

- The words come from `src/i18n/<lang>/narration.json`. Write Tamil naturally: numbers, amounts (`₹238`), codes
  (`RF-501`), phone numbers and emails are converted to words before recording (`pipeline/tamil_speech.py`).
- One MP3 per clip is written to `src/audio/<lang>/<clip id>.mp3`. Then rebuild the training edition.
- Voices, so new clips match the old ones:

  | Language | Voice | Format | Model files in `tools/tts/` |
  |---|---|---|---|
  | en | Kokoro, `af_heart`, speed 0.86 | MP3 20 kbps, 24 kHz mono | `kokoro-v1.0.onnx`, `voices-v1.0.bin` |
  | ta | AI4Bharat Indic-TTS Tamil, female | MP3 16 kbps, 16 kHz mono | `ta/fastpitch/*`, `ta/hifigan/*` |

  Install once: `pip install kokoro-onnx lameenc numpy` (English) and
  `pip install coqui-tts "transformers>=4.57,<4.58" torch torchaudio torchcodec` (Tamil). Download the Kokoro
  files from the kokoro-onnx GitHub releases, and the Tamil model from
  `https://github.com/AI4Bharat/Indic-TTS/releases/download/v1-checkpoints-release/ta.zip` (unzip into `tools/tts/`).
- Some older clips have no saved script (`status` lists them). They are kept as recorded; add a script to change one.

### Step 5 — `build`: assemble the pages

```bash
python afm.py build                                  # all four pages
python afm.py build --edition platform --lang ta     # one page
```

What the build does, in order (`pipeline/assemble.py`):

1. Read `src/shell/index.html`.
2. Put each style sheet at its `<!--@style:...-->` placeholder.
3. Write the flags script (`AFM_DEFAULT_LANG`, `AFM_EDITION`, and the edition's flags such as `AFM_NO_TRAINING`)
   and the page title.
4. For each module in the manifest: if its kind belongs to the edition, put it at its placeholder; otherwise
   remove the placeholder. The Tamil lesson JSON is inserted into `guided-training`.
5. Put the add-ons into their slots, in manifest order. `ta-ui-data` is generated from `src/i18n/ta/ui.json`.
6. Training edition only: add narration from `src/audio/<lang>/` (embedded for English; two files beside the page
   for Tamil) and the page links from `config/links.json`.
7. Stop with an error if any placeholder is left unfilled; warn if a page is over 16 MB.

Output goes to `dist/<edition>/<lang>/`. Nothing under `src/` changes.

### Step 6 — `test`: run the tests that cover your change

```bash
python afm.py test --module phase2 --build      # rebuild, then run only the tests covering phase2
python afm.py test --test t_plans --edition platform
python afm.py test                              # everything, plus the backend's 89 Python tests
```

- `tests/registry.json` says which pages each test opens and which modules it covers. `--module` runs every test
  that lists the module, on each page it lists (narrowed by `--edition` and `--lang`). Besides module ids, the
  registry uses `narration` for tests that check recordings (`--module narration`).

  | Test | Pages | Checks |
  |---|---|---|
  | `t_phase1` | training/en, platform/en | Header role and store, status, named audit actors, duplicate barcodes, shared users |
  | `t_phase23` | training/en | Refunds and limits, one policy everywhere, customer shop, price tools, exports, accessibility, training records |
  | `t_images` | training/en, platform/en | Catalogue photos on every storefront and the till |
  | `t_plans` | training/en, platform/en | Mobile app and WhatsApp grouped by Immediate delivery, Weekly plan, Monthly plan |
  | `t_course` | training/en | Back office course walked end to end |
  | `t_smoke` | training/en | Every lesson opens; every step has English narration |
  | `t_tamil` | training/ta | Tamil lessons, Tamil narration, newer screens in Tamil, language switch |
  | `t_tamil_walk` | training/ta | Four new lessons completed in Tamil |
  | `t_platform` | platform/en + ta | No training content; every role and screen; no "undefined"; core flows |
- Results: `tests/results/<test>--<edition>-<lang>.json`; screenshots in `tests/results/screenshots/`.
- A single test can also run alone: `AFM_PAGE=dist/platform/en/index.html python tests/ui/t_plans.py`.

### Step 7 — `scan`: find English left on Tamil pages

```bash
python afm.py scan --edition platform
```

Opens the Tamil page, visits every role and screen, and lists visible English text with where it was seen
(`tests/results/scan-<edition>.json`). Codes, emails and abbreviations are ignored. Fix entries with
`python afm.py i18n add`, rebuild and scan again.

### Step 8 — `serve`: look at it

```bash
python afm.py serve --edition training --lang ta
```

Opens the built page from a local web server. You can also double-click any `dist/.../index.html`.

### Step 9 — `package`: share the project

```bash
python afm.py package
```

Writes `aifirstmart-mock.zip` beside the project folder: sources, pipeline, tests and backend. Built pages, test
results and voice models are left out; the receiver runs `python afm.py build`. GitHub is the normal way to share
the project (section 6); the zip is for someone without access to the repository.

### Step 10 — `deploy`: run it somewhere

```bash
python afm.py deploy --list                          # the targets in config/deploy.json
python afm.py deploy --target local                  # this computer, no Docker: http://127.0.0.1:8080
python afm.py deploy --target docker                 # this computer, in the container
python afm.py deploy --target static --out site/     # the four pages as plain files, for any static host
python afm.py deploy --target cloudrun --set project=my-gcp-project --set region=asia-south1
python afm.py verify --url http://127.0.0.1:8080     # health check and every page, against any address
```

Section 8 explains each target. A target that changes anything outside this computer shows its commands and asks
`Run these? [y/N]` before running them (`--yes` skips the question in CI; `--dry-run` only shows them).

### Step 11 — publish to Claude artifacts

The pages hosted as Claude artifacts are published from Claude conversations (links in `config/links.json`).
Publish the built files from `dist/`: the English training page alone; the Tamil training page together with
`audio-ta-1.js` and `audio-ta-2.js`; each platform page alone. Run the full test suite first.

---

## 6. Source control and GitHub

### 6.1 Repository

- `github.com/ilangoj/aifirstmart-mock`, **private**. The owner adds collaborators under *Settings → Collaborators*.
- `main` is the only long-lived branch and is always releasable.
- **Branch protection on `main`** (*Settings → Branches*): require a pull request, require the `ci` checks to pass,
  require review from code owners, no force-push, no deletion. GitHub enforces these rules on a private repository
  only with a paid plan (GitHub Pro or Team). On the free plan they are a written rule: everyone still works
  through pull requests, and CI still reports on each one.

### 6.2 Branches

Create one branch per change, from an up-to-date `main`, named `<type>/<module>-<short-description>`:

| Type | For | Example |
|---|---|---|
| `fix` | A bug | `fix/business-processes-undefined-label` |
| `feat` | A new feature or module | `feat/phase2-bulk-refunds` |
| `i18n` | Tamil text or narration only | `i18n/ta-ui-catalogue-hints` |
| `docs` | `.md` files only | `docs/standard-deploy-section` |
| `build` | Pipeline, CI, Docker, deployment | `build/deploy-azure-target` |
| `chore` | Dependencies, clean-up | `chore/bump-fastapi` |

### 6.3 Commits

`<type>(<module>): <what changed, present tense>`, for example
`fix(business-processes): use the role's own input and output labels`. Use the module id from
`python afm.py modules`; for several modules, list them (`fix(phase2,ta-screens): …`). Keep each commit to one
logical change. Never commit `dist/`, `.env`, secrets, voice models or test results.

### 6.4 Pull requests

1. Push the branch and open a pull request into `main`. The template asks for: what changed for the user, the
   modules touched, the tests run, and whether any `.md` file changed.
2. CI runs (6.5). A red check is fixed on the branch, never bypassed.
3. Changes to `.md` files, `config/`, `deploy/`, `server/` or `.github/` request the owner's review automatically
   (`CODEOWNERS`). The owner reads the change and approves it, or asks for changes (section 12).
4. Merge with **Squash and merge**, so `main` gets one commit per change, titled like a commit message (6.3).
5. Delete the branch.

### 6.5 Continuous integration (`.github/workflows/ci.yml`)

Runs on every push to a branch and on every pull request:

| Job | What it runs | Fails when |
|---|---|---|
| `lint` | `ruff check .` | Python errors or unused imports in `pipeline/`, `server/`, `backend/`, `tests/` |
| `i18n` | `python afm.py i18n check` | The Tamil dictionary or lessons are malformed |
| `build` | `python afm.py build`, then builds again and compares | A page fails to build, or two builds differ |
| `test` | `python afm.py test` (all browser checks and backend tests) | Any check fails |
| `changelog` | Compares the branch with `main` | Code, config or source changed without a `CHANGELOG.md` entry |
| `image` | `docker build -f deploy/Dockerfile .` and a `/healthz` check | The container does not build or start |

The built pages and test results are attached to each run for 14 days (*Actions → the run → Artifacts*).

### 6.6 Versions and releases

- Versions are `MAJOR.MINOR.PATCH` in `VERSION`: PATCH for fixes, MINOR for new features or lessons, MAJOR for a
  change that breaks saved data or the backend API.
- `CHANGELOG.md` keeps an `## Unreleased` section at the top. Each pull request adds its lines there: date, modules
  touched, what changed for the user, tests run.
- To release: move the `Unreleased` lines under `## <version> — <date>`, update `VERSION`, merge, then tag `main`
  with `v<version>` and push the tag. `.github/workflows/release.yml` then builds and tests everything, attaches
  `aifirstmart-training-<version>.zip`, `aifirstmart-platform-<version>.zip` and the source zip to a GitHub Release,
  and pushes the container image to `ghcr.io/ilangoj/aifirstmart-mock:<version>` and `:latest`.

### 6.7 Dependencies

Python packages are listed in `requirements.txt` and `backend/requirements.txt` with lower bounds; the container
installs the same lists. Dependabot opens a pull request each week for newer packages, GitHub Actions and the
Python base image; each one goes through CI like any other change.

---

## 7. Configuration and secrets

Every setting the running system needs comes from an environment variable. Code reads them in one place
(`backend/aifirstmart_connect/config.py` for the backend, `server/app.py` for the web server). `.env.example` lists
all of them; copy it to `.env` for local use. `.env` is never committed.

| Variable | Used by | Default | Production |
|---|---|---|---|
| `AFM_ENV` | server | `development` | `production`: refuses to start with the sample secrets below |
| `PORT` | server | `8080` | Set by most cloud hosts |
| `AFM_EDITIONS` | server, image build | `training,platform` | Which built pages to serve |
| `AFM_ENABLE_API` | server | `true` | `false` serves the pages only |
| `AFM_JWT_SECRET` | backend | sample value | **Secret.** 48+ random characters |
| `AFM_VAULT_MASTER_KEY` | backend | none | **Secret.** A Fernet key |
| `AFM_PLATFORM_ADMIN_EMAIL` / `_PASSWORD` | backend | sample values | **Secret** password |
| `AFM_DB_PATH` | backend | in memory | A file on a persistent volume, e.g. `/data/afm.sqlite` |
| `AFM_GOOGLE_CLIENT_IDS` | backend | empty | Comma-separated OAuth client ids |

Secrets live in the host's secret store (GitHub Actions secrets, Google Secret Manager, AWS Secrets Manager, Azure
Key Vault, or a `.env` file readable only by the service on a server) and reach the container as environment
variables. They are never written into code, `config/`, images or logs.

---

## 8. Deployment

### 8.1 What gets deployed

One container image, built by `deploy/Dockerfile` in two stages:

1. **Build stage:** copies the repository and runs `python afm.py build` for the editions in `AFM_EDITIONS`.
2. **Run stage:** a slim Python image with the backend packages, `backend/`, `server/` and the built pages from
   stage 1, running as a non-root user. It starts `uvicorn server.app:app` on `$PORT`.

The running server answers:

| Path | Serves |
|---|---|
| `/` | A start page linking to every built page |
| `/training/en/`, `/training/ta/`, `/platform/en/`, `/platform/ta/` | The built pages |
| `/api/v1/...`, `/api/docs` | The backend API and its documentation (when `AFM_ENABLE_API=true`) |
| `/healthz` | `{"status": "ok", "version": "<VERSION>"}`, for load balancers and uptime checks |

Because the image only needs "run a container, give it `PORT` and environment variables", it runs unchanged on a
laptop, a virtual machine or any container service. The pages alone also work from any static file host.

### 8.2 Targets (`config/deploy.json`)

Each target is a list of commands with `{placeholders}`, filled from `--set name=value`, then from environment
variables, then from the target's defaults. Adding a cloud means adding an entry; no Python changes.

| Target | Where | Needs | What it does |
|---|---|---|---|
| `local` | This computer | Python | Builds, then runs the server without Docker on port 8080 |
| `docker` | This computer | Docker | `docker compose -f deploy/docker-compose.yml up --build`; data kept in a volume |
| `static` | Any static host | — | Copies the built pages and a start page to `--out`; no API |
| `image` | Any registry | Docker | Builds the image and pushes it to `{registry}/aifirstmart-mock:{version}` |
| `cloudrun` | Google Cloud Run | `gcloud`, signed in | Deploys the image to a Cloud Run service |
| `ecs` | Amazon ECS Express Mode | `aws`, signed in, two IAM roles | Creates the service (Fargate, load balancer, scaling) from the image |
| `azure` | Azure Container Apps | `az`, signed in | Creates or updates a container app from the image |
| `server` | Your own Linux server | SSH access, Docker on the server | Copies `deploy/` and `.env`, pulls the image, restarts it |

The cloud entries follow each provider's documented commands at the time of writing. Before the first real
deployment to a provider, check the commands against that provider's current documentation, then run with
`--dry-run` to see them filled in. Never put secrets in `--set`; pass them through the host's secret store (section 7).

### 8.3 Switching where it runs

1. Pick or add a target in `config/deploy.json`.
2. Put the secrets in that host's secret store.
3. `python afm.py deploy --target <name> --dry-run`, check the commands, then run without `--dry-run`.
4. `python afm.py verify --url <address>`: checks `/healthz`, opens every served page in a browser and reports
   errors; then look at the pages yourself.
5. Record the change and the new address in `CHANGELOG.md` and, if links change, `config/links.json`.

### 8.4 Data

The mock pages keep their data in the browser. The backend keeps it in memory, or in SQLite when `AFM_DB_PATH` is
set. In a container, SQLite must point at a persistent volume (`docker-compose.yml` does this); most container
clouds give no persistent disk, so a cloud deployment of the backend loses its data on restart until it moves to a
managed database (section 13).

---

## 9. Common tasks

### Fix a bug in one module

1. `git switch main && git pull`, then `git switch -c fix/<id>-<short-description>`.
2. `python afm.py modules` → find the module that owns the behaviour.
3. Edit `src/modules/.../<id>.js` (or one part of a multi-part module).
4. `python afm.py test --module <id> --build`.
5. If the bug shows on Tamil pages too: `python afm.py test --module <id> --lang ta`.
6. Add a line under `## Unreleased` in `CHANGELOG.md`.
7. Commit (`fix(<id>): …`), push, open a pull request, wait for CI, merge (section 6.4).

#### Worked example: "undefined" on the Payment approver's Command center

1. **Found by** `python afm.py scan --edition platform`: the Tamil page listed the text `undefined` on
   `payments/command`. The English page showed it too ("Input from: undefined").
2. **Owner:** `python afm.py modules` → the panel is drawn by `business-processes`; the Payment approver role is added
   by `phase2` (part `10-roles.js`); the Tamil panel by `ta-screens`.
3. **Fix, in the owning modules only:**
   - `business-processes.js`: use the role's own `from` / `to` when it is not in the built-in list.
   - `phase2/10-roles.js`: give the Payment approver its process (`BUSINESS_FLOWS.payments`).
   - `ta-screens.js`: a role with no Tamil process table uses the standard panel, which the dictionary translates.
   - Tamil for the new text: `python afm.py i18n add "Review the queue" "வரிசையை ஆய்வு செய்"` (and the rest).
4. **Guard against regressions:** `t_platform.py` now fails if any screen shows `undefined` or `NaN`, and lists
   `business-processes` in `tests/registry.json`.
5. **Test what changed:** `python afm.py test --module business-processes --build`, then the full suite.
6. **Record it** in `CHANGELOG.md`.

### Add a feature (new module)

0. Branch: `git switch -c feat/<id>-<short-description>`. If the feature changes how the project works (a new
   step, kind, slot or rule), propose the `STANDARD.md` change in the same pull request (section 12).
1. Create `src/modules/addons/<id>.js` following section 4.3.
2. Add it to `addons` in `config/modules.json`: `id`, `kind`, `slot`, `file`, `description`.
3. If it shows text, add the Tamil to `src/i18n/ta/ui.json` (`i18n add`, then `i18n check`).
4. Write `tests/ui/t_<area>.py` (copy the shape of `t_plans.py`) and register it in `tests/registry.json`
   with the pages it checks and the modules it covers.
5. `python afm.py test --module <id> --build`, then the full suite.

### Change or add a Tamil translation

`python afm.py i18n add "English exactly as shown" "தமிழ்"` → `i18n check` → `build --lang ta` →
`scan` to confirm it is gone from the report.

### Add or change a lesson

1. English: edit the course in `guided-training.js` (or add a course module like `backoffice-course.js`). Each step
   has an `id`, `kind` (`action`, `read`, `ask`), `text`, and for actions a `target` and a `check`.
2. Tamil: add the lesson to `src/i18n/ta/lessons.json` under the same course and position, with `s` (step id → text)
   and `q` (question id → `[question, [options], why]`). Name buttons exactly as the Tamil screen shows them.
3. Narration: add scripts for `<course>-<n>-intro`, each step id and `done` to both `narration.json` files, then
   `narrate record --missing` for each language.
4. `python afm.py test --test t_smoke` and `--test t_tamil` (every step must have narration in both languages).

### Re-record one narration clip

Edit its words in `src/i18n/<lang>/narration.json` → `narrate record --lang <lang> --clip <id>` →
`build --edition training --lang <lang>`.

### Add a deployment target

Add an entry to `config/deploy.json` (copy the closest one), run `python afm.py deploy --target <name> --dry-run`,
and propose the new row for the table in section 8.2 in the same pull request.

### Release checklist

- [ ] `main` is green in CI
- [ ] `python afm.py scan` — no new English on Tamil pages
- [ ] `CHANGELOG.md`: `Unreleased` moved under the new version; `VERSION` updated (section 6.6)
- [ ] Merged, then `git tag v<version> && git push origin v<version>`
- [ ] The release workflow passed; the GitHub Release has the zips; the image is in GHCR
- [ ] Deploy (step 10) and `python afm.py verify --url <address>`
- [ ] Publish to Claude artifacts if those links are still in use (step 11)

---

## 10. Testing standard

- **Every module is covered** by at least one test in `tests/registry.json`. A new module needs a new or extended test.
- **Tests check behaviour the user sees** (what is on screen, what is saved, what a role may do), not internals.
- **Both languages** for anything with text: run on the Tamil page too, or add a Tamil assertion.
- **A test prints one line per check**: `PASS <what> | <evidence>` or `FAIL <what> | <evidence>`, and writes them to
  its result file. The runner counts these lines.
- **Tests start clean**: clear `localStorage` and reload before checking.
- **Definition of done**: the tests for every touched module pass on every page they list, the full suite passes in
  CI on the pull request, and the `CHANGELOG.md` entry is written.
- **Backend tests** live in `backend/tests/` (pytest). A new endpoint or rule gets a test there.
- **Server and deployment**: CI builds the image and checks `/healthz`; `afm.py verify` checks a running address.

---

## 11. Coding standards

| Area | Standard |
|---|---|
| JavaScript | Modern browser JS, no build tools, no external libraries. Two-space indent, single quotes, semicolons. Small functions named by what they do. |
| Python (pipeline) | Standard library first; one step per module in `pipeline/`; each module's docstring shows how to run it. Passes `ruff check`. |
| Python (backend, server) | Type hints on public functions; settings only from `config.py` / environment; no secrets in code. Passes `ruff check`. |
| Deployment | Nothing provider-specific in code: provider commands live only in `config/deploy.json`. The image runs as a non-root user. |
| CSS | One file per concern in `src/styles/`; class names prefixed with the feature (`.shop-`, `.afm-`). |
| Text | Plain, short sentences; say what will happen; name buttons exactly as shown. Same terms in lessons and screens. |
| Data | English values in storage; `afm-<feature>-v<N>` keys; a reset function per feature. |
| Accessibility | Labels on inputs, buttons for actions, visible focus, messages announced (`role="status"`/`alert`). |
| Size | Training English page under 16 MB; Tamil narration in separate files. |

---

## 12. Changing this standard and the other `.md` files

`STANDARD.md`, `README.md`, `CLAUDE.md`, `CHANGELOG.md` structure, `backend/README.md` and `tools/tts/README.md`
describe how the project works. They change only with the owner's confirmation:

1. **Propose.** Change the `.md` on a branch (`docs/...`, or inside the feature's own branch), in the same pull
   request as the code it describes, so the document and the code never disagree.
2. **Show.** The pull request lists, in its *Documents changed* section, which sections changed and why.
   `CODEOWNERS` requests the owner's review.
3. **Confirm.** The owner approves the pull request, or asks for changes. Without that approval the `.md` change is
   not merged, even if the code is ready (split the code into its own pull request if it cannot wait).
4. **AI assistants** (see `CLAUDE.md`) show the proposed `.md` text to the owner in the conversation and wait for
   an explicit "yes" before writing it to the repository, and say so in the pull request.

Adding a line under `## Unreleased` in `CHANGELOG.md` is part of every change and does not need a separate
confirmation; changing the changelog's format does.

---

## 13. Known limitations

- Data is saved per browser; there is no shared team dataset in the mock.
- Command center and Signals show fixed figures.
- Some original screens are translated word by word and read a little mechanically in Tamil; codes such as POS-01
  and brand names stay as written.
- The training-records code is inside `phase2` (part `40-training-records.js`) and is switched off by
  `AFM_NO_TRAINING` in the platform edition.
- The mock pages do not call the backend yet; they are served beside it. Connecting them is a separate feature.
- The backend's SQLite store suits one server with a persistent disk. Running several copies, or on a container
  cloud without a disk, needs a managed database first.
- The cloud targets in `config/deploy.json` have been checked with `--dry-run` only, not run against a real account.
