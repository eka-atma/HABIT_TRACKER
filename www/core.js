/* Winter Arc core: plan data, record store, last-write-wins merge, stats.
   UMD: works in the browser (window.Core), in Electron main (require) and in Node tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Core = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- Plan (from the 2026-10-09 history audit) ---------- */
  var PLAN = {
    name: 'Winter Arc',
    start: '2026-10-12', // Monday. Change in Settings.
    weeks: 13,
    phases: [
      { from: 1, to: 4, name: 'Decide and ship v0' },
      { from: 5, to: 8, name: 'Prove it' },
      { from: 9, to: 13, name: 'Publish and judge' }
    ],
    tracks: {
      A: 'A · Money and direction',
      B: 'B · Systems at Sisira'
    },
    // Defaults you can edit in Settings. "key" habits drive the streak.
    defaultHabits: [
      { id: 'build', label: 'Focus block (60-90 min) on Track A or B', key: true },
      { id: 'move', label: 'Move for 30 minutes', key: false },
      { id: 'sleep', label: 'Keep your sleep window', key: false }
    ],
    // Weekly tasks. day: 0 = Sunday ... 6 = Saturday (suggested day only).
    weekly: [
      { id: 'plan', label: 'Plan the week. Pick one repeated task to turn into a system', mins: 10, day: 1, track: 'B' },
      { id: 'asset', label: 'Ship one template, script or saved prompt', mins: 60, day: 3, track: 'B' },
      { id: 'item', label: 'Send one proposal or publish one portfolio piece', mins: 30, day: 0, track: 'A' },
      { id: 'review', label: 'Weekly review. Log the numbers below', mins: 10, day: 0, track: 'A' }
    ],
    // Numbers you log every week. target = [[week, value], ...] piecewise linear.
    metrics: [
      { id: 'items', label: 'Proposals or portfolio pieces out', kind: 'cum', track: 'A', lowerIsBetter: false, target: [[0, 0], [4, 4], [8, 8], [13, 12]] },
      { id: 'assets', label: 'Assets shipped', kind: 'cum', track: 'B', lowerIsBetter: false, target: [[0, 0], [4, 4], [13, 13]] },
      { id: 'chats', label: 'Marketing, sales and admin AI chats', kind: 'week', track: 'B', lowerIsBetter: true, target: [[1, 1.6], [4, 1.6], [9, 1], [13, 0.5]] },
      { id: 'dirq', label: 'New "which field?" chats', kind: 'week', track: 'A', lowerIsBetter: true, target: [[1, 0], [13, 0]] }
    ],
    milestones: [
      { id: 'm1a', week: 1, track: 'A', label: 'Write the one-page decision rule: income target, judging date, path, kill rule' },
      { id: 'm1b', week: 1, track: 'B', label: 'Title-block macro or template v0.1 works on one real drawing' },
      { id: 'm2', week: 2, track: 'B', label: 'Quotation template with locked wording is in use' },
      { id: 'm3', week: 3, track: 'B', label: 'Poster template with name and role fields is in use' },
      { id: 'm4a', week: 4, track: 'B', label: 'Day-30 gate: 4 assets shipped, macro used on real drawings' },
      { id: 'm4b', week: 4, track: 'A', label: 'Day-30 gate: 4 proposals or portfolio pieces out' },
      { id: 'm6', week: 6, track: 'B', label: 'Image batch script (background, A4, disclaimer) runs on a folder' },
      { id: 'm8', week: 8, track: 'A', label: 'Mid-arc review: 8 items out. Compare results to your rule' },
      { id: 'm9a', week: 9, track: 'B', label: 'Day-60 gate: marketing, sales and admin chats at 1 a week or fewer' },
      { id: 'm9b', week: 9, track: 'B', label: 'Day-60 gate: one colleague uses one of your assets' },
      { id: 'm11', week: 11, track: 'B', label: 'Macro write-up drafted' },
      { id: 'm13a', week: 13, track: 'B', label: 'Macro write-up published (first portfolio piece for Track A)' },
      { id: 'm13b', week: 13, track: 'A', label: 'Day-90 review against your rule: continue, adjust or drop' }
    ]
  };

  var RECORD_TYPES = { chk: 1, wk: 1, ms: 1, met: 1, note: 1, cfg: 1 };

  /* ---------- Dates (local calendar days as YYYY-MM-DD) ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function toUTC(s) { var a = s.split('-'); return Date.UTC(+a[0], +a[1] - 1, +a[2]); }
  function today() { return ymd(new Date()); }
  function addDays(s, n) { var t = new Date(toUTC(s) + n * 86400000); return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate()); }
  function daysBetween(a, b) { return Math.round((toUTC(b) - toUTC(a)) / 86400000); }
  function dow(s) { return new Date(toUTC(s)).getUTCDay(); }
  function validDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(toUTC(s)); }

  /* ---------- Piecewise-linear targets ---------- */
  function interp(points, x) {
    if (x <= points[0][0]) return points[0][1];
    for (var i = 1; i < points.length; i++) {
      var a = points[i - 1], b = points[i];
      if (x <= b[0]) return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
    }
    return points[points.length - 1][1];
  }

  /* ---------- Records and merge (last write wins, tie broken by device id) ---------- */
  function validRecord(r) {
    return r && typeof r.id === 'string' && r.id.length <= 200 && typeof r.type === 'string' && RECORD_TYPES[r.type] &&
      typeof r.updated === 'number' && isFinite(r.updated) && r.data && typeof r.data === 'object' &&
      r.id.indexOf(r.type + ':') === 0 && JSON.stringify(r.data).length < 20000;
  }
  function sanitize(list) {
    var out = [];
    if (!Array.isArray(list)) return out;
    for (var i = 0; i < list.length && i < 20000; i++) {
      var r = list[i];
      if (validRecord(r)) out.push({ id: r.id, type: r.type, data: r.data, updated: r.updated, device: String(r.device || '').slice(0, 64), deleted: !!r.deleted });
    }
    return out;
  }
  function newer(a, b) {
    if (a.updated !== b.updated) return a.updated > b.updated;
    return String(a.device || '') > String(b.device || '');
  }
  /** Merge incoming records into a Map. Returns the records that changed the map. */
  function mergeInto(map, incoming) {
    var changed = [];
    for (var i = 0; i < incoming.length; i++) {
      var r = incoming[i], l = map.get(r.id);
      if (!l || newer(r, l)) { map.set(r.id, r); changed.push(r); }
    }
    return changed;
  }

  /* ---------- Store ---------- */
  function Store(adapter, device) {
    this.adapter = adapter; this.device = device; this.map = new Map(); this.listeners = [];
  }
  Store.prototype.init = function () {
    var self = this;
    return Promise.resolve(this.adapter.load()).then(function (all) {
      sanitize(all).forEach(function (r) { self.map.set(r.id, r); });
      return self;
    });
  };
  Store.prototype.on = function (fn) { this.listeners.push(fn); };
  Store.prototype.emit = function (why) { this.listeners.forEach(function (f) { try { f(why); } catch (e) { /* ignore */ } }); };
  Store.prototype.get = function (id) { var r = this.map.get(id); return r && !r.deleted ? r.data : undefined; };
  Store.prototype.put = function (type, id, data) {
    var r = { id: id, type: type, data: data, updated: Date.now(), device: this.device, deleted: false };
    var prev = this.map.get(id);
    if (prev && r.updated <= prev.updated) r.updated = prev.updated + 1; // keep local edits strictly newer
    this.map.set(id, r);
    this.adapter.put([r]);
    this.emit('local');
    return r;
  };
  Store.prototype.all = function () { return Array.from(this.map.values()); };
  Store.prototype.merge = function (records, quiet) {
    var changed = mergeInto(this.map, sanitize(records));
    if (changed.length) {
      this.adapter.put(changed);
      if (!quiet) this.emit('remote');
    }
    return changed.length;
  };
  Store.prototype.replaceReload = function (records) { // used by desktop when main process merged data
    var self = this; this.map = new Map();
    sanitize(records).forEach(function (r) { self.map.set(r.id, r); });
    this.emit('remote');
  };

  /* ---------- Domain helpers ---------- */
  function startDate(store) { var c = store.get('cfg:start'); return c && validDate(c.start) ? c.start : PLAN.start; }
  function habits(store) {
    var c = store.get('cfg:habits');
    if (c && Array.isArray(c.list) && c.list.length) return c.list;
    return PLAN.defaultHabits;
  }
  function weekOf(store, date) { return Math.floor(daysBetween(startDate(store), date) / 7) + 1; }
  function weekStart(store, w) { return addDays(startDate(store), (w - 1) * 7); }
  function dayNumber(store, date) { return daysBetween(startDate(store), date) + 1; }
  function arcEnd(store) { return addDays(startDate(store), PLAN.weeks * 7 - 1); }
  function phaseOf(w) { for (var i = 0; i < PLAN.phases.length; i++) if (w >= PLAN.phases[i].from && w <= PLAN.phases[i].to) return PLAN.phases[i]; return null; }

  function isChecked(store, date, habitId) { var d = store.get('chk:' + date + ':' + habitId); return !!(d && d.done); }
  function toggleHabit(store, date, habitId) { store.put('chk', 'chk:' + date + ':' + habitId, { done: !isChecked(store, date, habitId) }); }
  function weeklyDone(store, w, id) { var d = store.get('wk:' + w + ':' + id); return !!(d && d.done); }
  function toggleWeekly(store, w, id) { store.put('wk', 'wk:' + w + ':' + id, { done: !weeklyDone(store, w, id) }); }
  function msDone(store, id) { var d = store.get('ms:' + id); return !!(d && d.done); }
  function toggleMs(store, id) { store.put('ms', 'ms:' + id, { done: !msDone(store, id), date: today() }); }
  function metricValue(store, w, id) { var d = store.get('met:' + w + ':' + id); return d && typeof d.value === 'number' ? d.value : null; }
  function setMetric(store, w, id, v) { store.put('met', 'met:' + w + ':' + id, { value: Math.max(0, Math.min(9999, v)) }); }
  function noteOf(store, w) { var d = store.get('note:' + w); return d && typeof d.text === 'string' ? d.text : ''; }
  function setNote(store, w, text) { store.put('note', 'note:' + w, { text: String(text).slice(0, 4000) }); }

  function dayScore(store, date) {
    var hs = habits(store), done = 0;
    hs.forEach(function (h) { if (isChecked(store, date, h.id)) done++; });
    return { done: done, total: hs.length, ratio: hs.length ? done / hs.length : 0 };
  }
  /** Consecutive days (ending today, or yesterday if today is not done yet) with every key habit done. */
  function streak(store, date) {
    var keys = habits(store).filter(function (h) { return h.key; });
    if (!keys.length) return 0;
    function ok(d) { return keys.every(function (h) { return isChecked(store, d, h.id); }); }
    var d = date;
    if (!ok(d)) d = addDays(d, -1);
    var n = 0;
    while (ok(d) && n < 400) { n++; d = addDays(d, -1); }
    return n;
  }
  function cumulative(store, metricId, upToWeek) {
    var s = 0;
    for (var w = 1; w <= upToWeek; w++) { var v = metricValue(store, w, metricId); if (v) s += v; }
    return s;
  }
  function metricDef(id) { return PLAN.metrics.filter(function (m) { return m.id === id; })[0]; }
  function targetFor(metricId, w) { return interp(metricDef(metricId).target, w); }
  /** Series for a metric over weeks 1..upTo: actual (null = not logged) and target. */
  function series(store, metricId, upTo) {
    var m = metricDef(metricId), out = [];
    for (var w = 1; w <= PLAN.weeks; w++) {
      var logged = metricValue(store, w, metricId);
      var actual = null;
      if (w <= upTo) actual = m.kind === 'cum' ? cumulative(store, metricId, w) : logged;
      out.push({ week: w, actual: actual, target: interp(m.target, w), logged: logged });
    }
    return out;
  }
  function milestoneProgress(store) {
    var done = PLAN.milestones.filter(function (m) { return msDone(store, m.id); }).length;
    return { done: done, total: PLAN.milestones.length };
  }
  function heatmap(store) {
    var s = startDate(store), cells = [];
    for (var i = 0; i < PLAN.weeks * 7; i++) {
      var d = addDays(s, i);
      cells.push({ date: d, week: Math.floor(i / 7) + 1, dow: i % 7, ratio: dayScore(store, d).ratio });
    }
    return cells;
  }

  /** Parse the habit editor text. One habit per line. A leading "*" marks a streak habit. */
  function parseHabits(text) {
    var out = [], seen = {};
    String(text).split(/\r?\n/).forEach(function (line) {
      var t = line.trim(); if (!t) return;
      var key = t.charAt(0) === '*'; if (key) t = t.slice(1).trim();
      if (!t) return;
      var id = t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'h';
      while (seen[id]) id += 'x';
      seen[id] = 1; out.push({ id: id, label: t.slice(0, 120), key: key });
    });
    return out.slice(0, 12);
  }
  function habitsToText(list) { return list.map(function (h) { return (h.key ? '* ' : '') + h.label; }).join('\n'); }

  function newDeviceId(rand) {
    var r = rand || Math.random; var s = '';
    for (var i = 0; i < 8; i++) s += 'abcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(r() * 36));
    return s;
  }

  return {
    PLAN: PLAN, Store: Store, sanitize: sanitize, mergeInto: mergeInto, newer: newer, validRecord: validRecord,
    ymd: ymd, today: today, addDays: addDays, daysBetween: daysBetween, dow: dow, validDate: validDate, interp: interp,
    startDate: startDate, habits: habits, weekOf: weekOf, weekStart: weekStart, dayNumber: dayNumber, arcEnd: arcEnd, phaseOf: phaseOf,
    isChecked: isChecked, toggleHabit: toggleHabit, weeklyDone: weeklyDone, toggleWeekly: toggleWeekly, msDone: msDone, toggleMs: toggleMs,
    metricValue: metricValue, setMetric: setMetric, noteOf: noteOf, setNote: setNote,
    dayScore: dayScore, streak: streak, cumulative: cumulative, targetFor: targetFor, series: series, metricDef: metricDef,
    milestoneProgress: milestoneProgress, heatmap: heatmap, parseHabits: parseHabits, habitsToText: habitsToText, newDeviceId: newDeviceId
  };
});
