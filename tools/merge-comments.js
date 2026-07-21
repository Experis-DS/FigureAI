#!/usr/bin/env node
/*
 * merge-comments.js — fold reviewer comment exports into review/comments.json.
 *
 * Each reviewer clicks "Export" in a draft and sends you a comments-*.json file.
 * Drop those files into review/inbox/ (or pass paths as args), then run:
 *
 *   node tools/merge-comments.js
 *   node tools/merge-comments.js path/to/comments-jane-2026-07-20.json ...
 *
 * Merge rules (last-writer-wins by updatedAt):
 *   - Threads keyed by thread.id; messages keyed by message.id.
 *   - Newer updatedAt wins on conflict.
 *   - A thread with all messages deleted upstream is dropped.
 * The next `node build.js` (draft) will render the merged result on the shared link.
 *
 * No npm install. Node 16+.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "review", "comments.json");
const INBOX = path.join(ROOT, "review", "inbox");

function readJSON(p, dflt) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return dflt; } }
function newer(a, b) { return (a || "").localeCompare(b || "") >= 0 ? a : b; }

let inputs = process.argv.slice(2);
if (!inputs.length && fs.existsSync(INBOX)) {
  inputs = fs.readdirSync(INBOX).filter(f => f.endsWith(".json")).map(f => path.join(INBOX, f));
}
if (!inputs.length) {
  console.log("No export files given and review/inbox/ is empty. Nothing to merge.");
  process.exit(0);
}

// seed with what's already merged
const threads = new Map();
(readJSON(OUT, []) || []).forEach(t => threads.set(t.id, t));

let files = 0, threadCount = 0, msgCount = 0;
for (const file of inputs) {
  const payload = readJSON(file, null);
  if (!payload) { console.warn(`  skip (unreadable): ${file}`); continue; }
  const list = Array.isArray(payload) ? payload : payload.threads || [];
  files++;
  for (const t of list) {
    threadCount++;
    const existing = threads.get(t.id);
    if (!existing) { threads.set(t.id, t); msgCount += (t.messages || []).length; continue; }
    // merge messages by id
    const byId = new Map((existing.messages || []).map(m => [m.id, m]));
    for (const m of t.messages || []) {
      const cur = byId.get(m.id);
      if (!cur || newer(m.updatedAt, cur.updatedAt) === m.updatedAt) { byId.set(m.id, m); msgCount++; }
    }
    existing.messages = [...byId.values()].sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
    existing.resolved = newer(t.updatedAt, existing.updatedAt) === t.updatedAt ? t.resolved : existing.resolved;
    existing.updatedAt = newer(t.updatedAt, existing.updatedAt);
    existing.anchor = existing.anchor || t.anchor;
  }
}

const merged = [...threads.values()].filter(t => (t.messages || []).length > 0)
  .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
fs.writeFileSync(OUT, JSON.stringify(merged, null, 2));
console.log(`  Merged ${files} file(s): ${threadCount} thread(s), ${msgCount} message update(s).`);
console.log(`  review/comments.json now holds ${merged.length} thread(s). Run 'node build.js' to rebuild the draft.`);
