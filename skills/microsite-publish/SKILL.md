---
name: microsite-publish
description: >-
  Promote an Experis microsite deck from DRAFT to PUBLISHED — the client-facing
  release. Publishing removes the DRAFT watermark, strips the comment layer, purges
  all review comments, stamps the release date, bumps and tags the version, and
  deploys the clean build to the shared GitHub Pages link. Use when the user says
  "publish the deck", "finalize this", "ship it to the client", "make it live",
  "cut a release", or "remove the draft watermark and comments". Pairs with the
  microsite-draft skill.
---

# Microsite Publish

Turns a reviewed draft into the clean, client-facing **published** deck. This is the
second half of the two-state workflow. Publishing is destructive to review data by
design: comments are purged so no internal review chatter ships to the client.

## Preconditions
- The draft is content-complete and reviewers have signed off.
- You are OK deleting the review comments for this cycle (they are archived, see below).

## Steps
1. **Snapshot comments before purge.** Copy `review/comments.json` to
   `review/archive/comments-v<version>-<date>.json` so the review history is kept even
   though it leaves the live site. (Recommended, not required.)
2. **Flip state + stamp the release** in `version.json`:
   - `state: "published"`
   - `released:` set to now (ISO timestamp)
   - `version:` bump per semver (patch for copy fixes, minor for new slides/content,
     major for a structural redesign).
3. **Purge review data:** set `review/comments.json` back to `[]` and empty
   `review/inbox/`.
4. **Build the clean release:** `node build.js --state=published`. Confirm in
   `dist/index.html` that: no DRAFT ribbon/badge, no 💬 Comments button, no
   `__REVIEW_COMMENTS__`, and the access gate/OG tags are correct.
5. **Tag the release** in git: `git tag v<version>` and add a one-line entry to
   `CHANGELOG.md` (what changed this release).
6. **Deploy:** commit, push, and tag. The Pages workflow publishes the clean `dist/`
   to the shared URL. (Claude cannot push — hand the commit to the user's own GitHub
   login, or use the publish flow.)
7. **Update the master, if this cycle improved the template itself.** If the deck
   introduced a reusable pattern (new slide type, brand fix, build/skill improvement),
   port it back into `src/`, `assets/`, or these skills and note it in `CHANGELOG.md`
   so the whole team benefits.

## Starting the next cycle
To reopen for edits after publishing, run the **microsite-draft** skill: it flips state
back to `draft`, bumps the version, resets `created`, and `released: null`.

## Guardrails
- Never publish without confirming the comment layer and watermark are gone — that is
  the whole point of this state.
- Double-check `config.password` and the client logo before a client sees the URL.
- Publishing to a public Pages site makes the deck world-readable. Confirm that's
  acceptable for the client content before deploying.
