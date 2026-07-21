---
name: microsite-draft
description: >-
  Create or update a DRAFT of an Experis microsite deck for collaborative review.
  Use whenever the user wants to start a new client deck, spin up a review/draft
  version, refresh a draft with new content, or pull in reviewer comments. A draft
  build carries the DRAFT watermark and the async comment layer so people across the
  org can leave page/component-anchored comment threads on the shared GitHub Pages
  link. Triggers: "start a draft", "new microsite draft", "build a review version",
  "put this deck up for comments", "merge the review comments", "rebuild the draft".
  Pairs with the microsite-publish skill, which strips the watermark and purges comments.
---

# Microsite Draft

Builds a **draft** of a microsite deck: the DRAFT watermark is on and the async
comment layer is embedded so reviewers can comment on the shared link. This is the
first half of the two-state workflow (draft ↔ publish).

## Mental model

- One master template + brand system lives in the repo. Each deck is built from it.
- `version.json` holds `state`, `version`, `created`, `released`. A draft has
  `state: "draft"` and `released: null`.
- `build.js` reads state and emits `dist/index.html`. In draft it injects the
  watermark (`src/watermark.css`) and the comment layer (`src/comments.js`) plus the
  merged reviewer comments from `review/comments.json`.
- Comments are **async and serverless**: each reviewer types a username, comments in
  the browser (stored on their device), and clicks **Export** to send you a JSON.
  You merge those exports and rebuild — the shared link then shows everyone's threads.

## Steps

### A. Start or update the draft content
1. Confirm `version.json` is in draft state. If publishing just happened and this is a
   new cycle, set `state: "draft"`, bump `version` (e.g. 1.0.0 → 1.1.0), set `created`
   to now, and `released: null`.
2. Edit `src/template.html` for this deck: replace `[CLIENT]` placeholders, set slide
   copy, add/remove `<section class="slide" data-title="…">` blocks (nav + stepper are
   automatic), drop the client logo at `assets/client-logo.svg`, and update the
   `downloads/` files + `<head>` Open Graph tags if used.
3. Confirm brand tokens (`assets/brand/tokens.css`) — only change for a sub-brand tweak.

### B. Fold in reviewer comments (when reviewers have sent exports)
4. Put each reviewer's `comments-*.json` export into `review/inbox/`.
5. Run: `node tools/merge-comments.js` (merges inbox → `review/comments.json`).

### C. Build and deploy the draft
6. Set the access code and base URL in `config.json` if not already
   (`password`, `baseUrl`). Remember the password is a cosmetic gate, not security.
7. Build: `node build.js` (or `node build.js --state=draft`).
8. Verify `dist/index.html`: the DRAFT ribbon shows, the version badge reads the right
   version/date, the 💬 Comments button appears, adding a comment pins to a slide/
   component, and merged threads render.
9. Deploy: commit and push. The Pages workflow publishes `dist/` to the shared URL.
   (Claude cannot push — hand the commit to the user's own GitHub login, or use the
   publish flow.) Share the Pages link for review.

## Guardrails
- Never deploy a draft to a client-facing URL you don't control — the watermark and
  comment layer are visible to anyone with the link.
- Do not put confidential figures in a draft on a **public** Pages site; the JS gate
  and username field are not access control.
- Keep the comment layer and watermark in `src/` — do not paste flags into the
  template by hand; `build.js` owns state.
