---
name: publish-microsite
description: >-
  Promote an Experis microsite deck from DRAFT to the client-facing PUBLISHED build.
  Publishing forces the password login, removes all comment history + visibility
  (comment layer and Firebase config stripped, review data purged), removes the draft
  watermark/version chrome, keeps GA4 analytics, stamps + tags the release, and deploys
  the clean build. Use when the user says "publish the deck", "finalize / ship it to the
  client", "make it live", "cut a release", or "lock it down with the password and
  remove the drafts/comments". Pairs with draft-microsite.
---

# Publish Microsite

Turns a reviewed draft into the clean, password-gated, client-facing **published** deck.
Publishing is intentionally destructive to review data so no internal chatter ships.

## Preconditions
- Draft is content-complete and reviewers have signed off.
- OK to remove the review comments for this cycle (archived below).

## Steps
1. **Archive comments (optional).** Copy `review/comments.json` to
   `review/archive/comments-v<version>-<date>.json`. With live Firebase comments, threads
   also live in Firestore under `decks/<deckId>/threads`; the published build won't load
   them, but clear that collection separately if you want them gone from the backend.
2. **Flip state + stamp release** in `version.json`: `state:"published"`, `released:` now,
   bump `version` (patch/minor/major).
3. **Purge local review data:** `review/comments.json` → `[]`, empty `review/inbox/`.
4. **Build clean:** `node build.js --state=published`. Verify `dist/index.html`:
   - **Password login forced** — `#gate` present and `const PASSWORD` matches
     `config.password`; the deck is not reachable without the code.
   - **No comment history/visibility** — no `BUILD:comment-layer`, no `dc-fab`, no
     `window.__REVIEW_COMMENTS__`, and **no `window.__FIREBASE__`**.
   - **No draft chrome** — no version badge, no draft wash, no corner sash.
   - **GA4 stays on** — `gtag/js?id=G-…` still present.
   - Share/OG tags + client logo correct.
5. **Tag + changelog:** `git tag v<version>`; add a one-line `CHANGELOG.md` entry.
6. **Deploy:** commit, push, tag (user's GitHub login; Claude can't push). Pages publishes
   the clean `dist/`.
7. **Port reusable improvements back to the template** and note them in `CHANGELOG.md`.

## Reopen for edits
Run **draft-microsite** (section D) to flip back to draft for the next cycle.

## Guardrails
- Never publish without confirming the comment layer, Firebase config, watermark, and
  version chrome are gone, and the password gate is intact.
- The gate is cosmetic (view-source reveals the code) — deters casual access, not real
  security. Don't rely on it for confidential figures on public Pages.
- Double-check `config.password` and the client logo before the client sees the URL.
