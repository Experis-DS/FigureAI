/* =====================================================================
 * comments.js — async, no-login, no-backend review layer (DRAFT only)
 * ---------------------------------------------------------------------
 * Injected by build.js into draft builds. Never present in published builds.
 *
 * Model:
 *   - Reviewer types a username once (kept on their device).
 *   - Threads anchor to a slide and, optionally, a component within it
 *     (page + component level — robust across copy edits).
 *   - A reviewer's own threads/replies live in localStorage and are
 *     fully editable/deletable/resolvable by them.
 *   - Everyone else's threads arrive pre-merged in window.__REVIEW_COMMENTS__
 *     (built from review/comments.json) and render read-only.
 *   - "Export" downloads this reviewer's threads as JSON; those exports are
 *     merged back into review/comments.json by tools/merge-comments.js so the
 *     next draft rebuild shows everyone's threads on the shared link.
 *
 * This is intentionally async (no live server). Publishing purges it all.
 * ===================================================================== */
(function () {
  "use strict";
  var DECK = window.__DECK__ || { deckId: "deck", state: "draft" };
  if (DECK.state !== "draft") return;

  var DECK_ID = DECK.deckId || "deck";
  var LS_USER = "deck::user";
  var LS_THREADS = "deck::threads::" + DECK_ID;
  var MERGED = Array.isArray(window.__REVIEW_COMMENTS__) ? window.__REVIEW_COMMENTS__ : [];

  // ---------- storage ----------
  // Resilient store: real localStorage when available, in-memory fallback when it
  // throws (sandboxed preview panes, Safari private mode, etc.). Comments still work
  // within the session; they just don't persist across reloads in the fallback case.
  var LS = (function () {
    try { var k = "__dc_probe"; window.localStorage.setItem(k, "1"); window.localStorage.removeItem(k); return window.localStorage; }
    catch (e) {
      var mem = {};
      return {
        getItem: function (k) { return k in mem ? mem[k] : null; },
        setItem: function (k, v) { mem[k] = String(v); },
        removeItem: function (k) { delete mem[k]; }
      };
    }
  })();
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function now() { return new Date().toISOString(); }
  function getUser() { return LS.getItem(LS_USER) || ""; }
  function setUser(u) { LS.setItem(LS_USER, u); }
  function loadLocal() { try { return JSON.parse(LS.getItem(LS_THREADS)) || []; } catch (e) { return []; } }
  function saveLocal(arr) { LS.setItem(LS_THREADS, JSON.stringify(arr)); }

  // merged (read-only) overlaid by local (editable); local wins on id clash
  function allThreads() {
    var map = {};
    MERGED.forEach(function (t) { map[t.id] = Object.assign({}, t, { _local: false }); });
    loadLocal().forEach(function (t) { map[t.id] = Object.assign({}, t, { _local: true }); });
    return Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (a, b) { return (a.createdAt || "").localeCompare(b.createdAt || ""); });
  }
  function upsertLocal(thread) {
    var arr = loadLocal(); var i = arr.findIndex(function (t) { return t.id === thread.id; });
    if (i >= 0) arr[i] = thread; else arr.push(thread);
    saveLocal(arr); render();
  }
  function removeLocal(id) { saveLocal(loadLocal().filter(function (t) { return t.id !== id; })); render(); }

  // ---------- anchoring (slide + component path) ----------
  function slides() { return [].slice.call(document.querySelectorAll(".slide")); }
  function slug(s) { return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
  function slideOf(el) { while (el && el !== document.body) { if (el.classList && el.classList.contains("slide")) return el; el = el.parentElement; } return null; }

  function computeAnchor(el) {
    var sl = slideOf(el); if (!sl) return null;
    var idx = slides().indexOf(sl);
    var title = sl.getAttribute("data-title") || ("Slide " + (idx + 1));
    var path = [];
    var node = el;
    while (node && node !== sl) {
      var parent = node.parentElement;
      if (!parent) break;
      path.unshift([].indexOf.call(parent.children, node));
      node = parent;
    }
    var label = (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 70) || el.tagName.toLowerCase();
    return { slideSlug: slug(title), slideTitle: title, slideIndex: idx, path: path, label: label };
  }
  function slideBySlug(s, fallbackIndex) {
    var all = slides();
    for (var i = 0; i < all.length; i++) {
      if (slug(all[i].getAttribute("data-title") || ("Slide " + (i + 1))) === s) return all[i];
    }
    return (typeof fallbackIndex === "number" && all[fallbackIndex]) || null;
  }
  function resolveAnchor(a) {
    if (!a) return null;
    var sl = slideBySlug(a.slideSlug, a.slideIndex); if (!sl) return null;
    var node = sl, ok = true;
    (a.path || []).forEach(function (i) { if (node && node.children[i]) node = node.children[i]; else ok = false; });
    return { el: ok ? node : sl, slide: sl, exact: ok };
  }
  function slideIndexOfAnchor(a) {
    var r = resolveAnchor(a); return r ? slides().indexOf(r.slide) : -1;
  }
  function gotoSlide(i) { if (i >= 0 && typeof window.go === "function") window.go(i); }

  // ---------- UI shell ----------
  var state = { open: false, picking: false, filter: "open", composeAnchor: null, hovered: null };

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  function injectStyles() {
    var css = ""
      + ".dc-fab{position:fixed;right:20px;bottom:20px;z-index:10000;background:#5C4BB9;color:#fff;border:none;border-radius:26px;height:48px;padding:0 18px;font:700 14px/1 'Segoe UI',Arial,sans-serif;box-shadow:0 8px 24px rgba(20,14,50,.4);cursor:pointer;display:flex;align-items:center;gap:8px}"
      + ".dc-fab:hover{background:#4a3ba0}"
      + ".dc-panel{position:fixed;top:0;right:0;width:360px;max-width:92vw;height:100vh;z-index:10001;background:#fff;box-shadow:-14px 0 40px rgba(20,14,50,.25);display:flex;flex-direction:column;transform:translateX(100%);transition:transform .22s ease;font-family:'Segoe UI',Arial,sans-serif;color:#282A32}"
      + ".dc-panel.dc-show{transform:none}"
      + ".dc-hd{padding:14px 16px;border-bottom:1px solid #E7E6F2;display:flex;align-items:center;justify-content:space-between}"
      + ".dc-hd h3{font-size:15px;margin:0}.dc-hd .dc-user{font-size:12px;color:#67696F}"
      + ".dc-x{background:none;border:none;font-size:20px;cursor:pointer;color:#67696F}"
      + ".dc-tools{display:flex;gap:6px;padding:10px 16px;border-bottom:1px solid #E7E6F2;flex-wrap:wrap}"
      + ".dc-btn{border:1px solid #E7E6F2;background:#fff;border-radius:7px;padding:6px 10px;font:600 12px/1 'Segoe UI',Arial;cursor:pointer;color:#282A32}"
      + ".dc-btn.dc-primary{background:#5C4BB9;color:#fff;border-color:#5C4BB9}"
      + ".dc-btn.dc-on{background:#EEF;border-color:#9E94FA}"
      + ".dc-seg{margin-left:auto;display:flex;border:1px solid #E7E6F2;border-radius:7px;overflow:hidden}"
      + ".dc-seg button{border:none;background:#fff;padding:6px 9px;font:600 11px 'Segoe UI',Arial;cursor:pointer;color:#67696F}"
      + ".dc-seg button.dc-active{background:#5C4BB9;color:#fff}"
      + ".dc-list{flex:1;overflow:auto;padding:12px 14px}"
      + ".dc-empty{color:#9a9aa2;font-size:13px;text-align:center;margin-top:40px}"
      + ".dc-th{border:1px solid #E7E6F2;border-radius:10px;padding:11px 12px;margin-bottom:11px}"
      + ".dc-th.dc-resolved{opacity:.6}"
      + ".dc-anchor{font-size:11px;color:#5C4BB9;font-weight:700;cursor:pointer;display:flex;gap:6px;align-items:center}"
      + ".dc-anchor .dc-loc{color:#9a9aa2;font-weight:400}"
      + ".dc-msg{margin:8px 0;font-size:13px;line-height:1.45}"
      + ".dc-msg .dc-who{font-weight:700;font-size:12px}.dc-msg .dc-when{color:#9a9aa2;font-size:11px;margin-left:6px}"
      + ".dc-msg .dc-txt{white-space:pre-wrap;margin-top:2px}"
      + ".dc-mact{display:flex;gap:10px;margin-top:3px}.dc-mact a{font-size:11px;color:#67696F;cursor:pointer;text-decoration:underline}"
      + ".dc-reply{width:100%;border:1px solid #E7E6F2;border-radius:7px;padding:7px;font:400 13px 'Segoe UI',Arial;resize:vertical;min-height:34px;margin-top:6px}"
      + ".dc-row{display:flex;gap:6px;margin-top:6px}"
      + ".dc-pin{position:fixed;z-index:9999;width:24px;height:24px;border-radius:50% 50% 50% 2px;background:#5C4BB9;color:#fff;font:700 11px/24px 'Segoe UI',Arial;text-align:center;cursor:pointer;box-shadow:0 3px 10px rgba(20,14,50,.4);transform:translate(-50%,-100%)}"
      + ".dc-pin.dc-resolved{background:#4FA85C}"
      + ".dc-pickhint{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:10002;background:#282A32;color:#fff;padding:8px 14px;border-radius:8px;font:600 12px 'Segoe UI',Arial}"
      + ".dc-hover-outline{outline:2px dashed #5C4BB9 !important;outline-offset:2px;cursor:crosshair !important}"
      + ".dc-modal{position:fixed;inset:0;z-index:10003;background:rgba(20,14,50,.45);display:flex;align-items:center;justify-content:center}"
      + ".dc-modal-box{background:#fff;color:#282A32;border-radius:12px;padding:18px;width:340px;max-width:90vw;box-shadow:0 20px 60px rgba(20,14,50,.4);font-family:'Segoe UI',Arial,sans-serif}"
      + ".dc-modal-msg{font-size:14px;font-weight:600;margin-bottom:10px}"
      + ".dc-modal-input{width:100%;border:1px solid #E7E6F2;border-radius:7px;padding:8px;font:400 14px 'Segoe UI',Arial;resize:vertical}"
      + ".dc-toast{position:fixed;left:50%;bottom:76px;transform:translateX(-50%);z-index:10004;background:#282A32;color:#fff;padding:9px 14px;border-radius:8px;font:600 12px 'Segoe UI',Arial;box-shadow:0 6px 20px rgba(0,0,0,.3)}";
    var s = el("style"); s.textContent = css; document.head.appendChild(s);
  }

  var fab, panel, listEl, pinLayer;
  function buildShell() {
    fab = el("button", "dc-fab"); fab.innerHTML = "💬 Comments";
    fab.onclick = function () { ensureUser(function () { toggle(true); }); };
    document.body.appendChild(fab);

    panel = el("div", "dc-panel");
    var hd = el("div", "dc-hd");
    hd.innerHTML = "<div><h3>Review comments</h3><div class='dc-user'></div></div>";
    var x = el("button", "dc-x", "×"); x.onclick = function () { toggle(false); };
    hd.appendChild(x); panel.appendChild(hd);

    var tools = el("div", "dc-tools");
    var add = el("button", "dc-btn dc-primary", "＋ Add comment");
    add.onclick = togglePick;
    var exp = el("button", "dc-btn", "⭳ Export");
    exp.onclick = exportMine;
    var seg = el("div", "dc-seg");
    ["open", "resolved", "all"].forEach(function (f) {
      var b = el("button", f === state.filter ? "dc-active" : "", f[0].toUpperCase() + f.slice(1));
      b.onclick = function () { state.filter = f; render(); };
      seg.appendChild(b);
    });
    tools.appendChild(add); tools.appendChild(exp); tools.appendChild(seg);
    panel.appendChild(tools);
    panel.dataset.add = ""; // marker

    listEl = el("div", "dc-list"); panel.appendChild(listEl);
    document.body.appendChild(panel);

    pinLayer = el("div"); document.body.appendChild(pinLayer);
    panel._add = add;
  }

  function toggle(open) {
    state.open = open == null ? !state.open : open;
    panel.classList.toggle("dc-show", state.open);
    fab.style.display = state.open ? "none" : "flex";
    if (state.open) render();
  }
  function fabCount() {
    var open = allThreads().filter(function (t) { return !t.resolved; }).length;
    fab.innerHTML = "💬 Comments" + (open ? " (" + open + ")" : "");
  }

  // ---------- username ----------
  function ensureUser(cb) {
    var u = getUser();
    if (u) { updateUserLabel(); return cb && cb(); }
    askText("Enter your name for review comments:", "", function (name) {
      if (name) { setUser(name); updateUserLabel(); cb && cb(); }
    });
  }
  function updateUserLabel() { var e = panel.querySelector(".dc-user"); if (e) e.textContent = getUser() ? "Commenting as " + getUser() : ""; }

  // ---------- in-DOM dialogs (window.prompt/confirm/alert are unsupported in
  //            some sandboxed preview panes, so we never use the native ones) ----------
  function askText(message, initial, cb) {
    var ov = el("div", "dc-modal");
    var box = el("div", "dc-modal-box");
    box.appendChild(el("div", "dc-modal-msg", esc(message)));
    var inp = el("textarea", "dc-modal-input"); inp.rows = message && /edit|reply|comment/i.test(message) ? 3 : 1; inp.value = initial || "";
    var row = el("div", "dc-row");
    var ok = el("button", "dc-btn dc-primary", "OK");
    var cancel = el("button", "dc-btn", "Cancel");
    row.appendChild(ok); row.appendChild(cancel);
    box.appendChild(inp); box.appendChild(row); ov.appendChild(box);
    document.body.appendChild(ov); setTimeout(function () { inp.focus(); }, 0);
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    ok.onclick = function () { var v = inp.value.trim(); close(); cb(v || null); };
    cancel.onclick = function () { close(); cb(null); };
    inp.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && (inp.rows === 1 || !e.shiftKey)) { e.preventDefault(); ok.onclick(); }
      else if (e.key === "Escape") { cancel.onclick(); }
    });
  }
  function askConfirm(message, cb) {
    var ov = el("div", "dc-modal");
    var box = el("div", "dc-modal-box");
    box.appendChild(el("div", "dc-modal-msg", esc(message)));
    var row = el("div", "dc-row");
    var ok = el("button", "dc-btn dc-primary", "Delete");
    var cancel = el("button", "dc-btn", "Cancel");
    row.appendChild(ok); row.appendChild(cancel); box.appendChild(row); ov.appendChild(box);
    document.body.appendChild(ov);
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    ok.onclick = function () { close(); cb(true); };
    cancel.onclick = function () { close(); cb(false); };
  }
  function toast(msg) {
    var t = el("div", "dc-toast", esc(msg)); document.body.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2600);
  }

  // ---------- pick / compose ----------
  var hintEl = null;
  function showHint(text) { hideHint(); hintEl = el("div", "dc-pickhint", esc(text)); document.body.appendChild(hintEl); }
  function hideHint() { if (hintEl) { hintEl.parentNode && hintEl.parentNode.removeChild(hintEl); hintEl = null; } }

  function togglePick() {
    state.picking = !state.picking;
    panel._add.classList.toggle("dc-on", state.picking);
    document.body.style.cursor = state.picking ? "crosshair" : "";
    if (state.picking) {
      showHint("Click any slide or component to attach a comment — Esc to cancel");
      document.addEventListener("mousemove", onHover, true);
      document.addEventListener("click", onPick, true);
      document.addEventListener("keydown", onEsc, true);
    } else stopPick();
  }
  function stopPick() {
    state.picking = false; panel._add.classList.remove("dc-on"); document.body.style.cursor = "";
    hideHint(); clearHover();
    document.removeEventListener("mousemove", onHover, true);
    document.removeEventListener("click", onPick, true);
    document.removeEventListener("keydown", onEsc, true);
  }
  function onEsc(e) { if (e.key === "Escape") stopPick(); }
  function clearHover() { if (state.hovered) { state.hovered.classList.remove("dc-hover-outline"); state.hovered = null; } }
  function onHover(e) {
    var t = e.target;
    if (!slideOf(t) || panel.contains(t) || t.closest(".dc-pin")) { clearHover(); return; }
    if (t !== state.hovered) { clearHover(); state.hovered = t; t.classList.add("dc-hover-outline"); }
  }
  function onPick(e) {
    var t = e.target;
    if (!slideOf(t) || panel.contains(t)) return;
    e.preventDefault(); e.stopPropagation();
    var anchor = computeAnchor(t);
    clearHover(); stopPick();
    if (anchor) openComposer(anchor);
  }

  function openComposer(anchor) {
    toggle(true);
    var box = el("div", "dc-th");
    box.innerHTML = "<div class='dc-anchor'>📍 " + esc(anchor.slideTitle) + "<span class='dc-loc'>" + esc(anchor.label) + "</span></div>";
    var ta = el("textarea", "dc-reply"); ta.placeholder = "Write a comment…";
    var row = el("div", "dc-row");
    var save = el("button", "dc-btn dc-primary", "Comment");
    var cancel = el("button", "dc-btn", "Cancel");
    row.appendChild(save); row.appendChild(cancel);
    box.appendChild(ta); box.appendChild(row);
    listEl.insertBefore(box, listEl.firstChild); ta.focus();
    cancel.onclick = render;
    save.onclick = function () {
      var txt = ta.value.trim(); if (!txt) return;
      var t = now();
      upsertLocal({
        id: uid(), deckId: DECK_ID, anchor: anchor, author: getUser(),
        createdAt: t, updatedAt: t, resolved: false,
        messages: [{ id: uid(), author: getUser(), text: txt, createdAt: t, updatedAt: t }]
      });
    };
  }

  // ---------- render ----------
  function esc(s) { return (s || "").replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function ago(iso) { try { return new Date(iso).toLocaleString(); } catch (e) { return iso; } }
  function mine(author) { return author && author === getUser(); }

  function render() {
    if (!listEl) return;
    updateUserLabel(); fabCount(); renderPins();
    panel.querySelectorAll(".dc-seg button").forEach(function (b) {
      b.classList.toggle("dc-active", b.textContent.toLowerCase() === state.filter);
    });
    var threads = allThreads().filter(function (t) {
      return state.filter === "all" ? true : state.filter === "resolved" ? t.resolved : !t.resolved;
    });
    listEl.innerHTML = "";
    if (!threads.length) { listEl.appendChild(el("div", "dc-empty", "No " + state.filter + " comments yet.")); return; }
    threads.forEach(function (t) { listEl.appendChild(renderThread(t)); });
  }

  function renderThread(t) {
    var box = el("div", "dc-th" + (t.resolved ? " dc-resolved" : ""));
    var a = el("div", "dc-anchor", "📍 " + esc(t.anchor ? t.anchor.slideTitle : "?") + "<span class='dc-loc'>" + esc(t.anchor ? t.anchor.label : "") + "</span>");
    a.onclick = function () { var i = slideIndexOfAnchor(t.anchor); gotoSlide(i); setTimeout(renderPins, 60); };
    box.appendChild(a);

    (t.messages || []).forEach(function (m) {
      var mv = el("div", "dc-msg");
      mv.innerHTML = "<div><span class='dc-who'>" + esc(m.author || "?") + "</span><span class='dc-when'>" + esc(ago(m.updatedAt || m.createdAt)) + "</span></div><div class='dc-txt'>" + esc(m.text) + "</div>";
      if (t._local && mine(m.author)) {
        var act = el("div", "dc-mact");
        var ed = el("a", null, "Edit"); ed.onclick = function () { editMsg(t, m); };
        var dl = el("a", null, "Delete"); dl.onclick = function () { deleteMsg(t, m); };
        act.appendChild(ed); act.appendChild(dl); mv.appendChild(act);
      }
      box.appendChild(mv);
    });

    if (!t.resolved) {
      var ta = el("textarea", "dc-reply"); ta.placeholder = "Reply…";
      var row = el("div", "dc-row");
      var rep = el("button", "dc-btn dc-primary", "Reply");
      rep.onclick = function () { var v = ta.value.trim(); if (v) addReply(t, v); };
      var res = el("button", "dc-btn", "Resolve"); res.onclick = function () { setResolved(t, true); };
      row.appendChild(rep); row.appendChild(res);
      box.appendChild(ta); box.appendChild(row);
    } else if (t._local) {
      var row2 = el("div", "dc-row");
      var re = el("button", "dc-btn", "Reopen"); re.onclick = function () { setResolved(t, false); };
      var del = el("button", "dc-btn", "Delete thread"); del.onclick = function () { askConfirm("Delete this thread?", function (ok) { if (ok) removeLocal(t.id); }); };
      row2.appendChild(re); row2.appendChild(del); box.appendChild(row2);
    }
    return box;
  }

  // editing rules: only threads present in local store (authored by this reviewer)
  function asLocal(t) {
    var arr = loadLocal(); var found = arr.find(function (x) { return x.id === t.id; });
    if (found) return found;
    // reopening/replying to a merged (others') thread: fork a local copy so the change is exportable
    var copy = JSON.parse(JSON.stringify(t)); delete copy._local; return copy;
  }
  function addReply(t, text) {
    var lt = asLocal(t); var ts = now();
    lt.messages = lt.messages || [];
    lt.messages.push({ id: uid(), author: getUser(), text: text, createdAt: ts, updatedAt: ts });
    lt.updatedAt = ts; upsertLocal(lt);
  }
  function editMsg(t, m) {
    askText("Edit comment:", m.text, function (v) {
      if (v == null) return;
      var lt = asLocal(t); var mm = lt.messages.find(function (x) { return x.id === m.id; });
      if (mm) { mm.text = v; mm.updatedAt = now(); lt.updatedAt = mm.updatedAt; upsertLocal(lt); }
    });
  }
  function deleteMsg(t, m) {
    askConfirm("Delete this comment?", function (ok) {
      if (!ok) return;
      var lt = asLocal(t); lt.messages = (lt.messages || []).filter(function (x) { return x.id !== m.id; });
      if (!lt.messages.length) removeLocal(lt.id); else { lt.updatedAt = now(); upsertLocal(lt); }
    });
  }
  function setResolved(t, val) { var lt = asLocal(t); lt.resolved = val; lt.updatedAt = now(); upsertLocal(lt); }

  // ---------- pins on active slide ----------
  function renderPins() {
    if (!pinLayer) return; pinLayer.innerHTML = "";
    var active = document.querySelector(".slide.active") || slides()[0];
    if (!active) return;
    var idx = slides().indexOf(active), n = 0;
    allThreads().forEach(function (t) {
      if (state.filter === "open" && t.resolved) return;
      if (state.filter === "resolved" && !t.resolved) return;
      if (!t.anchor || slideIndexOfAnchor(t.anchor) !== idx) return;
      var r = resolveAnchor(t.anchor); if (!r) return;
      var rect = r.el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      n++;
      var pin = el("div", "dc-pin" + (t.resolved ? " dc-resolved" : ""), String(n));
      pin.style.left = (rect.left + Math.min(rect.width, 40)) + "px";
      pin.style.top = (rect.top + 6) + "px";
      pin.title = (t.messages && t.messages[0] ? t.messages[0].text : "").slice(0, 80);
      pin.onclick = function () { toggle(true); };
      pinLayer.appendChild(pin);
    });
  }

  // ---------- export ----------
  function exportMine() {
    var data = loadLocal();
    if (!data.length) { toast("You have no comments to export yet."); return; }
    var payload = { deckId: DECK_ID, exportedBy: getUser(), exportedAt: now(), threads: data };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var a = el("a"); a.href = URL.createObjectURL(blob);
    a.download = "comments-" + slug(getUser() || "anon") + "-" + now().slice(0, 10) + ".json";
    document.body.appendChild(a); a.click(); a.remove();
  }

  // ---------- boot ----------
  function boot() {
    injectStyles(); buildShell(); render();
    // reposition pins on nav/scroll/resize and when the active slide changes
    var stage = document.getElementById("stage") || document.body;
    new MutationObserver(function () { renderPins(); }).observe(stage, { attributes: true, subtree: true, attributeFilter: ["class"] });
    window.addEventListener("resize", renderPins);
    window.addEventListener("scroll", renderPins, true);
    setInterval(renderPins, 1200);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
