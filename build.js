#!/usr/bin/env node
/*
 * build.js — dependency-free builder for the Experis Microsite deck.
 *
 * Reads the master template + brand assets and emits a single-file, ready-to-host
 * deck into dist/. The DRAFT/PUBLISHED state drives everything:
 *
 *   DRAFT      -> injects the draft watermark + the async comment layer, and
 *                 embeds the merged reviewer comments from review/comments.json.
 *   PUBLISHED  -> no watermark, no comment layer, no comment data. Clean client build.
 *
 * Usage:
 *   node build.js                 # uses state from version.json
 *   node build.js --state=draft   # force a state
 *   node build.js --state=published
 *   node build.js --out=dist      # output dir (default: dist)
 *
 * No npm install. Node 16+.
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const m = a.match(/^--([^=]+)=?(.*)$/);
    return m ? [m[1], m[2] === '' ? true : m[2]] : [a, true];
  })
);

const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const read = (p) => fs.readFileSync(p, 'utf8');

const config = readJSON(path.join(ROOT, 'config.json'));
const version = readJSON(path.join(ROOT, 'version.json'));
const state = (args.state || version.state || 'draft').toLowerCase();
if (!['draft', 'published'].includes(state)) {
  console.error(`Unknown state "${state}". Use draft or published.`);
  process.exit(1);
}
const outDir = path.join(ROOT, typeof args.out === 'string' ? args.out : 'dist');

console.log(`\n  Building deck "${config.deckId}"  state=${state}  v${version.version}`);

// ---- load sources ----
let html = read(path.join(ROOT, 'src', 'template.html'));
const watermarkCss = read(path.join(ROOT, 'src', 'watermark.css'));
const commentsJs = read(path.join(ROOT, 'src', 'comments.js'));

// merged reviewer comments (only embedded in draft)
let reviewComments = [];
const commentsPath = path.join(ROOT, 'review', 'comments.json');
if (fs.existsSync(commentsPath)) {
  try { reviewComments = readJSON(commentsPath); } catch { reviewComments = []; }
}
if (!Array.isArray(reviewComments)) reviewComments = [];

// optional Firebase config for the live/shared comment layer (draft only).
// If the file is missing or still holds PASTE_ placeholders, we inject nothing
// and the comment layer falls back to the offline export/merge mode.
let firebaseConfig = null;
const fbPath = path.join(ROOT, 'firebase.config.json');
if (fs.existsSync(fbPath)) {
  try {
    const raw = readJSON(fbPath);
    if (raw && raw.apiKey && raw.projectId &&
        !String(raw.apiKey).includes('PASTE') && !String(raw.projectId).includes('PASTE')) {
      firebaseConfig = {
        apiKey: raw.apiKey, authDomain: raw.authDomain, projectId: raw.projectId,
        storageBucket: raw.storageBucket, messagingSenderId: raw.messagingSenderId, appId: raw.appId
      };
    }
  } catch { firebaseConfig = null; }
}

// ---- token replacement (applies to both states) ----
if (config.baseUrl) {
  html = html.split('https://YOUR-SITE-URL').join(config.baseUrl.replace(/\/$/, ''));
}
html = html.replace(/const PASSWORD="[^"]*";/, `const PASSWORD="${(config.password || 'CHANGEME').replace(/"/g, '\\"')}";`);

// ---- state config injected for the runtime ----
const runtime = {
  state,
  version: version.version,
  created: version.created,
  released: version.released,
  deckId: config.deckId,
};

const headInject = state === 'draft'
  ? `\n<!-- BUILD:DRAFT head -->\n<style id="deck-draft-style">\n${watermarkCss}\n</style>\n`
  : `\n<!-- BUILD:PUBLISHED head (v${version.version}, released ${version.released || 'n/a'}) -->\n`;

let bodyInject = `\n<!-- BUILD:runtime -->\n<script>window.__DECK__=${JSON.stringify(runtime)};</script>\n`;
if (state === 'draft') {
  bodyInject += `<script>window.__REVIEW_COMMENTS__=${JSON.stringify(reviewComments)};</script>\n`;
  if (firebaseConfig) bodyInject += `<script>window.__FIREBASE__=${JSON.stringify(firebaseConfig)};</script>\n`;
  bodyInject += `<div class="deck-draft-ribbon" aria-hidden="true">DRAFT</div>\n`;
  bodyInject += `<div class="deck-version-badge">DRAFT · v${version.version} · ${fmtDate(version.created)}</div>\n`;
  bodyInject += `<!-- BUILD:comment-layer -->\n<script>\n${commentsJs}\n</script>\n`;
}

html = html.replace('</head>', `${headInject}</head>`);
html = html.replace('</body>', `${bodyInject}</body>`);

// ---- write dist ----
rimraf(outDir);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'index.html'), html);
copyDir(path.join(ROOT, 'assets'), path.join(outDir, 'assets'));
if (fs.existsSync(path.join(ROOT, 'downloads'))) {
  copyDir(path.join(ROOT, 'downloads'), path.join(outDir, 'downloads'));
}
// carry version.json into dist so the hosted deck is self-describing
fs.writeFileSync(path.join(outDir, 'version.json'), JSON.stringify(version, null, 2));

console.log(`  Wrote ${path.relative(ROOT, outDir)}/index.html`);
console.log(`  Watermark: ${state === 'draft' ? 'ON' : 'off'}   Comment layer: ${state === 'draft' ? `ON (${reviewComments.length} merged threads)` : 'off'}\n`);

// ---- helpers ----
function fmtDate(iso) {
  if (!iso) return '';
  try { return new Date(iso).toISOString().slice(0, 10); } catch { return iso; }
}
function rimraf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}
function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else {
      fs.copyFileSync(s, d);
      // keep dist files writable so the next rebuild can clean them even if the
      // source assets happen to be read-only
      try { fs.chmodSync(d, 0o644); } catch (e) { /* non-fatal (e.g. restricted mount) */ }
    }
  }
}
