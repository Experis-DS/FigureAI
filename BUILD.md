# BUILD.md — how to build, review, and publish a microsite deck

This is the tool-agnostic guide. Claude reads it through the `skills/` wrappers;
GitHub Copilot / Cursor read it through `.github/copilot-instructions.md`. A human can
follow it directly. Nothing here needs an internet connection or `npm install` —
`build.js` and `tools/*.js` are plain Node (16+).

## Concepts

- **Master:** `src/template.html` + `assets/` + brand tokens. One self-contained file.
- **State:** `version.json.state` is `draft` or `published`. `build.js` reads it.
- **Draft** injects `src/watermark.css` and `src/comments.js` and embeds merged
  comments from `review/comments.json`. **Published** injects none of that.
- **Output:** `build.js` writes `dist/` (the thing that gets hosted). Never edit
  `dist/` by hand.

## 1. Create / edit a deck (draft)

1. Ensure `version.json` → `state: "draft"`, `released: null`. If starting a new cycle
   after a publish, bump `version` and set `created` to today.
2. In `src/template.html`:
   - Replace `[CLIENT]` with the client name.
   - Edit slides: each `<section class="slide" data-title="Nav Label">` is one screen.
     The left index and the prev/next stepper build themselves from the sections —
     add/remove `<section>` blocks freely (watch only for hardcoded `go(N)` links).
   - Fill cards/stats/levers with real content.
3. In `config.json`: set `baseUrl` (the Pages URL), `password` (cosmetic gate),
   and `deckId`.
4. Client logo: drop an SVG at `assets/client-logo.svg` (or remove that `<img>` if not
   co-branding). Downloads: put files in `downloads/` and update the hrefs.
5. Build: `node build.js`. Open `dist/index.html`.

## 2. Collect review comments (async, no server, no login)

1. Deploy the draft (see §4) and share the Pages URL.
2. Each reviewer: opens the link → enters a name → clicks **＋ Add comment** → clicks a
   slide or component → types. They can reply, edit/delete their own, and resolve.
   When done they click **Export** and send you the downloaded `comments-*.json`.
3. Put those files in `review/inbox/`.
4. Merge: `node tools/merge-comments.js` (writes `review/comments.json`).
5. Rebuild: `node build.js`. Redeploy. The shared link now shows all merged threads.
   Repeat as needed — review is asynchronous across rebuilds.

## 3. Publish (draft → client-facing)

1. (Optional) archive the review: copy `review/comments.json` to
   `review/archive/comments-v<version>-<date>.json`.
2. Edit `version.json`: `state: "published"`, set `released` to now, bump `version`.
3. Purge: set `review/comments.json` to `[]`, empty `review/inbox/`.
4. Build clean: `node build.js --state=published`. Confirm no watermark, no 💬 button,
   no comment data in `dist/index.html`.
5. Add a `CHANGELOG.md` line; tag `v<version>` in git.
6. Deploy (see §4).

## 4. Deploy (GitHub Pages)

Deployment is a git push; the Pages workflow (`.github/workflows/pages.yml`) runs
`node build.js` and publishes `dist/`.

> **Claude/Copilot cannot push for you** — they run sandboxed and must not hold your
> GitHub credentials. Do the commit/push with your own GitHub login (CLI, desktop, or
> the publish flow). The agent prepares the commit; you send it.

```bash
git add -A
git commit -m "deck: <state> v<version> — <summary>"
git push
# for a release also:
git tag v<version> && git push --tags
```

## 5. Versioning (semver)

- **patch** (x.y.Z): copy fixes, small styling tweaks.
- **minor** (x.Y.0): new slides/content, new reusable pattern.
- **major** (X.0.0): structural redesign or breaking template change.
Every publish bumps the version, adds a `CHANGELOG.md` line, and gets a git tag.

## 6. Contributing improvements to the template

This repo is the home for all iterations. When a deck produces something reusable:
1. Port it into `src/` / `assets/` / `skills/` (not just the one deck).
2. Add a `CHANGELOG.md` entry under a new version.
3. Open a PR describing the design/process/integration change.
Keep decks and the template coherent so the whole team builds from the same base.

## Guardrails (read before publishing)

- The password gate and comment usernames are **not** security. Public Pages =
  world-readable. Don't host confidential figures publicly.
- `build.js` owns state — never hand-edit watermark/comment flags into the template.
- Always verify the published build has no watermark and no comment layer.
