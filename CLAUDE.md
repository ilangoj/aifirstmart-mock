# Instructions for AI coding assistants

This repository is maintained code, not a prototype. Follow `STANDARD.md`; this file only adds the rules that
matter most when an assistant makes the change.

## Before changing anything

1. Read `STANDARD.md` sections 1, 4 and 9 (principles, module contract, common tasks).
2. Run `python afm.py modules` and find the module that owns the behaviour. Change that module, not a new patch
   on top of it. If no module fits, add one as `STANDARD.md` section 9 describes.
3. Work on a branch named as in section 6.2. Never commit to `main`.

## While changing

- Edit only `src/`, `config/`, `pipeline/`, `server/`, `backend/`, `deploy/`, `tests/` and `.github/`. Never edit
  `dist/`; rebuild it.
- Keep every change inside the modules it is about. No unrelated refactoring or reformatting in the same change.
- Screen text stays English in module code; Tamil goes into `src/i18n/ta/ui.json` via `python afm.py i18n add`.
- No secrets, keys or passwords in any file. Settings come from environment variables (section 7).
- Python for tooling; no new languages, frameworks or build tools without the owner's agreement.

## Documents need the owner's confirmation

Before writing any change to a `.md` file (except adding a line under `## Unreleased` in `CHANGELOG.md`):

1. Show the owner the exact proposed text, or a section-by-section summary with the full text attached.
2. Ask for confirmation and wait for an explicit yes.
3. Only then write it, and note "Documents changed: confirmed by owner" in the pull request.

If a code change makes a document wrong, say so and propose the document change; do not leave them disagreeing.

## Before saying it is done

1. `python afm.py i18n check`
2. `python afm.py test --module <each module touched> --build`, then `python afm.py test`
3. `ruff check .`
4. A line under `## Unreleased` in `CHANGELOG.md`: date, modules, what changed for the user, tests run.
5. Report what was run and its result. Never report a test as passing without running it.
