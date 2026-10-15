# Change log

Newest first. For each change: date, modules touched, what changed for the user, tests run.
Each pull request adds its lines under `## Unreleased`; a release moves them under its version (STANDARD.md 6.6).

## Unreleased

## 1.0.0 — 2026-10-15 — GitHub, CI and deployment
- **Repository:** prepared for `github.com/ilangoj/aifirstmart-mock` (private): `.gitignore`, `.gitattributes`,
  `CODEOWNERS` (every `.md`, `config/`, `deploy/`, `server/`, `.github/` need the owner's review), pull request
  template, Dependabot.
- **CI (`.github/workflows/ci.yml`):** lint (ruff), Tamil check, build twice and compare, full test suite,
  changelog check on pull requests, container build with health, API and page checks.
- **Release (`release.yml`):** a `v<version>` tag builds, tests, attaches the edition and source zips to a GitHub
  Release and pushes `ghcr.io/ilangoj/aifirstmart-mock:<version>` and `:latest`.
- **server (new):** `server/app.py` serves the built pages at `/`, the backend at `/api` and `/healthz`; settings
  only from environment variables; refuses sample secrets when `AFM_ENV=production`. Tests in `tests/server/`.
- **deploy (new):** `deploy/Dockerfile` (two stages, non-root), `deploy/docker-compose.yml` (data volume),
  `.env.example`, `config/deploy.json` with targets local, docker, static, image, cloudrun, ecs (Amazon ECS Express
  Mode; AWS App Runner is closed to new customers), azure, server.
- **pipeline:** new steps `afm.py deploy` and `afm.py verify`; `test` also runs the server tests; `package` leaves
  out `.env`, `site/` and SQLite files.
- **tests/ui:** unused imports and three unused variables removed (lint); no change to what they check.
- **Documents (confirmed by the owner):** `STANDARD.md` sections 6 (source control), 7 (configuration and secrets),
  8 (deployment), 12 (changing the documents); new `CLAUDE.md`; `README.md` quick start.
- Tests: `afm.py test` (full suite), `pytest tests/server`, image built and checked with `afm.py verify`,
  `deploy --dry-run` for every target, `deploy --target local|static|docker` run here.

## Before versioning

### 2026-10-14 — fix: "undefined" on the Payment approver's Command center
- **business-processes:** a role without a built-in neighbour label now uses its own `from` / `to`.
- **phase2 (10-roles):** the Payment approver has its own process panel (review, approve within limit, countersign,
  hand over to Finance, check the record).
- **ta-screens:** roles without a Tamil process table use the standard panel, translated by the dictionary.
- **i18n (ta/ui.json):** 15 Tamil entries for the new panel.
- **t_platform:** new check — no screen shows "undefined" or "NaN" (found by `afm.py scan`).
- Tests: `afm.py test` (full suite).

### 2026-10-14 — modular project
- **All modules:** the single-file page was split into 53 named modules, 32 style sheets and a shell with placeholders;
  narration became one MP3 per clip (325 English, 325 Tamil); Tamil lesson text and the Tamil screen dictionary
  became editable JSON. One command line (`afm.py`) builds, tests, checks and records each part on its own.
- **phase2** split into 13 feature parts (refunds, shop, price tools, accessibility, …), joined into one scope at build.
- Tests: full suite on all four pages; backend 89 passed.

### 2026-10-10 — Tamil edition synced, platform edition added
- Tamil lesson text for 13 new lessons, 106 new Tamil narration clips, Tamil for every newer screen.
- Platform edition without training content (English and Tamil).

### 2026-10-09 — plans and storefront photos
- Mobile app and WhatsApp grouped by Immediate delivery, Weekly plan, Monthly plan.
- Catalogue photos on web shop, mobile app, WhatsApp and till.
