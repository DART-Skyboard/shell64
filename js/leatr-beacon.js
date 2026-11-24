/* Shell 64 → LEATR activity beacon.
   Listens for `shell64:calc` (fired by js/app.js on each user calculation) and relays it two ways:
   1. BroadcastChannel('leatr-shell64') — instant echo to an Autumn tab open in the same browser.
   2. A throttled POST (action `shell64event`, at most one every 2 s per tab) to Autumn's shared Apps Script,
      so every Autumn user sees the Shell 64 node light up in the real-time scene.
   Payload is op names and numbers only. Prompt text never leaves the page. Contract: FEED_CONTRACT.md in Autumn. */
(function () {
  "use strict";
  var GAS = "https://script.google.com/macros/s/AKfycbyzkQxLR5miUXP6oDw-1AR1GIjgpzlw9iLw0gO_ZTeLfL849LWbNX7WVz_kf7yLWBKA_w/exec";
  var FLUSH_MS = 2000, MAX_BATCH = 20, OPS = { weight: 1, convert: 1, preset: 1, reflex: 1 };
  var sid;
  try { sid = sessionStorage.getItem("s64_sid"); } catch (e) {}
  if (!sid) {
    sid = "s64_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    try { sessionStorage.setItem("s64_sid", sid); } catch (e) {}
  }
  var bc = null;
  try { bc = typeof BroadcastChannel === "function" ? new BroadcastChannel("leatr-shell64") : null; } catch (e) {}

  var queue = [], timer = null, lastSent = 0, total = 0;

  function num(v) { return typeof v === "number" && isFinite(v) ? v : undefined; }
  function clean(d) {
    var s = d.stats || {}, out = {};
    ["params", "qbits", "baseBits", "group", "quantBytes", "denseBytes", "ratio", "precision", "shellBytes", "tokens"].forEach(function (k) {
      var v = num(s[k]); if (v !== undefined) out[k] = v;
    });
    if (/^[A-Z]{2,5}$/.test(s.shell || "")) out.shell = s.shell;
    if (/^[a-z_]{2,24}$/.test(s.emotion || "")) out.emotion = s.emotion;
    return { op: OPS[d.op] ? d.op : "weight", mode: d.mode === "reflex" ? "reflex" : "weight", ts: num(d.ts) || Date.now(), stats: out };
  }

  function body() {
    var batch = queue.splice(0, queue.length);
    var events = batch.slice(-MAX_BATCH);
    return JSON.stringify({ action: "shell64event", sid: sid, n: batch.length, total: total, events: events });
  }

  function flush(useBeacon) {
    timer = null;
    if (!queue.length) return;
    lastSent = Date.now();
    var payload = body();
    if (useBeacon && navigator.sendBeacon) {
      try { if (navigator.sendBeacon(GAS, new Blob([payload], { type: "text/plain" }))) return; } catch (e) {}
    }
    try {
      // text/plain keeps this a "simple" request: Apps Script can't answer a CORS preflight.
      fetch(GAS, { method: "POST", headers: { "Content-Type": "text/plain" }, body: payload, keepalive: true, mode: "no-cors" }).catch(function () {});
    } catch (e) {}
  }

  function schedule() {
    if (timer) return;
    var wait = Math.max(0, FLUSH_MS - (Date.now() - lastSent));
    timer = setTimeout(function () { flush(false); }, wait);
  }

  window.addEventListener("shell64:calc", function (e) {
    var ev = clean(e.detail || {});
    total += 1;
    if (bc) { try { bc.postMessage({ type: "shell64calc", sid: sid, total: total, ev: ev }); } catch (err) {} }
    queue.push(ev);
    if (queue.length > 200) queue.splice(0, queue.length - 200);
    schedule();
  });
  window.addEventListener("pagehide", function () {
    if (bc) { try { bc.postMessage({ type: "shell64idle", sid: sid }); } catch (err) {} }
    if (timer) { clearTimeout(timer); flush(true); }
  });
  window.LeatrBeacon = { sid: sid, flush: flush, _queue: queue, GAS: GAS };
})();
