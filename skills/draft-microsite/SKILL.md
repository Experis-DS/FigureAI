---
name: draft-microsite
description: >-
  Draft a new Experis-branded microsite deck (click-through pitch/value site) in DRAFT
  state, using the full branded design system and all current template behavior — the
  refined draft chrome, live Firebase review comments, GA4 analytics, TOC comment
  badges, downloads dropdown with document hover-preview, and the auto-incrementing
  draft version stamp. Use whenever the user wants to create, start, or spin up a new
  microsite / branded web deck / client pitch page, or to refresh an existing draft and
  fold in reviewer comments. Triggers: "draft a microsite", "new branded deck", "spin
  up a deck for <client>", "make a pitch site like the Figure/Kroger one", "build a
  review version", "rebuild the draft", "merge the review comments". Includes a step to
  connect Firebase (comments) + GitHub (hosting), or to prompt for those links/config.
  Pairs with publish-microsite (ship) and push-template (propagate template updates).
---

# Draft Microsite

The starting skill. Produces a branded deck in **draft** state — DRAFT chrome on, the
live comment layer embedded, GA4 wired — ready to iterate and share for review. This is
the first half of the two-state workflow (draft ↔ publish).

Work from the **template project folder**; connect the destination folder for a new deck.

## What a draft includes (current best process)
- Experis brand system (tokens, logos, motion, people imagery) + click-through nav.
- Refined draft chrome: bottom-left auto-version stamp `Draft · V#.# · date` (climbs per
  commit). No corner sash.
- **Live shared comments** (Firebase/Firestore, scoped per deck by `deckId`), with the
  Comments CTA, TOC per-slide count badges, drawer that closes on outside click, and a
  live toast on new comments. Falls back to offline export/merge if Firebase isn't set.
- **GA4 analytics** injected from `firebase.config.json` `measurementId`.
- Downloads dropdown in the header + cursor-following document hover-preview.

## A. Create the deck (new client)
1. Gather: **client name**, **deckId** (unique lowercase slug — scopes comments),
   GitHub **org/repo**, **baseUrl** (Pages URL), access **password**.
2. Scaffold from the template:
   ```bash
   node tools/new-deck.js "<destination>" --deckId=<slug> --org=<org> \
     --repo=<repo> --baseUrl=<url> --password="<pw>" --client="<Client>"
   ```
   This copies template CORE + brand, writes `config.json`/`version.json` (draft, v0.1.0),
   seeds `review/`, and copies the shared `firebase.config.json`.

## B. Connect the backends (Firebase + GitHub)
3. **Firebase + GA4** (comments + analytics). If the shared project is already wired
   (`firebase.config.json` has real keys + `measurementId`), the deck inherits it — done.
   Otherwise, ask the user to paste their Firebase web config block (and GA4
   `measurementId`); write it into `firebase.config.json`. First-time setup is in
   `FIREBASE-SETUP.md` (create project → enable Firestore → publish open POC rules →
   copy web config).
4. **GitHub hosting.** Ask for the repo (or confirm `org/repo`). Claude can't push
   (sandboxed) — the user creates the repo, pushes `main`, and sets
   **Settings → Pages → Source: "GitHub Actions"**. The bundled workflow builds & deploys.

## C. Fill content + build
5. Edit `src/template.html`: replace `[CLIENT]`, write slide copy, add/remove
   `<section class="slide" data-title="…">` blocks (nav + stepper auto-update), set the
   client logo at `assets/client-logo.svg`, and wire `downloads/` + `assets/previews/`
   for the docs dropdown.
6. Build + preview: `node build.js` → open `dist/index.html`. Confirm DRAFT stamp, the
   Comments CTA shows **● Live — shared**, and (view-source) the GA4 tag is present.

## D. Iterate + fold in comments (existing draft)
7. New cycle after a publish: set `version.json` back to `state:"draft"`, bump `version`,
   reset `created`, `released:null`.
8. Offline-mode comments only: drop reviewer `comments-*.json` into `review/inbox/`, run
   `node tools/merge-comments.js`, rebuild. (Live Firebase mode needs no merge step.)
9. Deploy: commit + push (user's GitHub login); the Pages workflow publishes `dist/`.

## Guardrails
- Don't put confidential figures on a public draft — the password gate and comment
  usernames are cosmetic, not security.
- `build.js` owns state — never hand-paste watermark/comment/GA4 flags into the template.
- Keep reusable improvements in the template `src/` and run **push-template** to share
  them; don't fork per-deck.
