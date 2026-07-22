# GitHub Copilot / Cursor — project instructions

This repo builds Experis-branded microsite decks with two states: **Draft** and
**Published**. The authoritative, tool-agnostic workflow is in **`BUILD.md`** — read it
first and follow it. This file is the adapter so Copilot/Cursor behave the same way the
Claude skills (`skills/draft-microsite`, `skills/publish-microsite`, `skills/push-template`) do.

## Golden rules
- **`build.js` owns state.** Never hand-edit the DRAFT watermark or the comment layer
  into `src/template.html`. Change `version.json` and let `build.js` inject.
- **Never edit `dist/`** — it is generated. Edit `src/`, `assets/`, `config.json`,
  `version.json`.
- **Do not commit/push credentials or push on the user's behalf implicitly.** Prepare
  the commit; the user pushes with their own GitHub login.

## Common tasks
- **Start/refresh a draft:** ensure `version.json.state = "draft"`; edit
  `src/template.html` (slides are `<section class="slide" data-title="…">`); set
  `config.json` (`baseUrl`, `password`, `deckId`); run `node build.js`.
- **Merge review comments:** put reviewer `comments-*.json` exports in `review/inbox/`,
  run `node tools/merge-comments.js`, then `node build.js`.
- **Publish:** set `version.json` → `state: "published"`, set `released`, bump
  `version`; set `review/comments.json` to `[]`; run `node build.js --state=published`;
  add a `CHANGELOG.md` line; tag `v<version>`.

## Safety
- The password gate and comment usernames are cosmetic, not security. Do not place
  confidential client figures on a public GitHub Pages site.
- Keep the comment layer and watermark strictly draft-only; verify published builds
  contain neither.
