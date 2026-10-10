/* Winter Arc UI. Shared by the Windows desktop app (Electron) and the Android app (Capacitor). */
(function () {
  'use strict';
  var C = window.Core, PLAN = C.PLAN;
  var native = window.native || null; // set by electron/preload.js on desktop
  var isDesktop = !!native;
  var appEl = document.getElementById('app'), navEl = document.getElementById('nav'), statusEl = document.getElementById('status');
  var store = null;
  var S = { tab: 'today', date: C.today(), week: 1, msg: null, syncing: false, info: null, editingNote: null };
  var DAYN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  function fmtDate(s) { var p = s.split('-'); return DAYN[C.dow(s)] + ' ' + (+p[2]) + ' ' + MONTHN[+p[1] - 1]; }
  function fmtNum(v) { return Math.abs(v - Math.round(v)) < 0.001 ? String(Math.round(v)) : v.toFixed(1); }

  /* ---------- Storage adapters ---------- */
  function localAdapter() {
    var cache = null;
    function read() { if (!cache) cache = lsGet('wa.records', []); return cache; }
    return {
      load: function () { return read().slice(); },
      put: function (recs) {
        var map = {}; read().forEach(function (r) { map[r.id] = r; });
        recs.forEach(function (r) { map[r.id] = r; });
        cache = Object.keys(map).map(function (k) { return map[k]; });
        lsSet('wa.records', cache);
      }
    };
  }
  function nativeAdapter() {
    return { load: function () { return native.all(); }, put: function (recs) { native.put(recs); } };
  }

  /* ---------- Icons ---------- */
  var ICON = {
    today: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
    week: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
    arc: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></svg>',
    sync: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 8a8 8 0 0 0-14-2L4 8M4 4v4h4M4 16a8 8 0 0 0 14 2l2-2M20 20v-4h-4"/></svg>',
    tick: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
  };
  var TABS = [['today', 'Today'], ['week', 'Week'], ['arc', 'Arc'], ['sync', 'Sync']];

  /* ---------- Shared pieces ---------- */
  function check(on, act, attrs, label) {
    return '<button class="check" role="checkbox" aria-checked="' + on + '" aria-label="' + esc(label) + '" data-act="' + act + '" ' + attrs + '>' + ICON.tick + '</button>';
  }
  function trackChip(t) { return '<span class="chip ' + t.toLowerCase() + '">' + t + '</span>'; }
  function arcStatus() {
    var d = C.today(), n = C.dayNumber(store, d), total = PLAN.weeks * 7;
    if (n < 1) return 'Starts ' + fmtDate(C.startDate(store)) + ' · in ' + (1 - n) + ' day' + (1 - n === 1 ? '' : 's');
    if (n > total) return 'Arc complete · ' + total + ' days';
    var w = C.weekOf(store, d), p = C.phaseOf(w);
    return 'Day ' + n + ' of ' + total + ' · Week ' + w + (p ? ' · ' + p.name : '');
  }
  function clampDate(d) {
    var s = C.startDate(store), e = C.arcEnd(store);
    if (d < s) return s; if (d > e) return e; return d;
  }

  /* ---------- Today ---------- */
  function viewToday() {
    var d = S.date, w = C.weekOf(store, d), hs = C.habits(store), sc = C.dayScore(store, d), st = C.streak(store, C.today());
    var inArc = w >= 1 && w <= PLAN.weeks;
    var prevOk = d > C.startDate(store), nextOk = d < C.arcEnd(store);
    var h = '<div class="card"><div class="row between"><div><div class="label">' + (d === C.today() ? 'Today' : 'Logging') + '</div><h2>' + fmtDate(d) + '</h2></div>' +
      '<div class="row"><button class="btn" data-act="day" data-d="-1" aria-label="Previous day"' + (prevOk ? '' : ' disabled') + '>‹</button><button class="btn" data-act="day" data-d="0">Today</button><button class="btn" data-act="day" data-d="1" aria-label="Next day"' + (nextOk ? '' : ' disabled') + '>›</button></div></div>' +
      '<div class="bar" aria-hidden="true"><i style="width:' + Math.round(sc.ratio * 100) + '%"></i></div>' +
      '<div class="row between small"><span>' + sc.done + ' of ' + sc.total + ' habits</span><span class="muted">Streak: ' + st + ' day' + (st === 1 ? '' : 's') + '</span></div>' +
      '<div class="list">' + hs.map(function (x) {
        var on = C.isChecked(store, d, x.id);
        return '<div class="item' + (on ? ' done' : '') + '">' + check(on, 'habit', 'data-id="' + esc(x.id) + '"', x.label) + '<span class="txt">' + esc(x.label) + (x.key ? ' <span class="key" title="Counts toward your streak">★</span>' : '') + '</span></div>';
      }).join('') + '</div></div>';

    if (inArc) {
      h += '<div class="card"><div class="row between"><h3>This week (week ' + w + ')</h3><span class="muted small">' + weekRange(w) + '</span></div><div class="list">' +
        PLAN.weekly.map(function (t) {
          var on = C.weeklyDone(store, w, t.id);
          return '<div class="item' + (on ? ' done' : '') + '">' + check(on, 'weekly', 'data-w="' + w + '" data-id="' + t.id + '"', t.label) +
            '<span class="txt">' + esc(t.label) + '</span>' + trackChip(t.track) + '<span class="chip">' + t.mins + ' min · ' + DAYN[t.day] + '</span></div>';
        }).join('') + '</div></div>';
      var upcoming = PLAN.milestones.filter(function (m) { return m.week <= w + 1 && !C.msDone(store, m.id); }).slice(0, 4);
      if (upcoming.length) {
        h += '<div class="card"><h3>Milestones due now</h3><div class="list">' + upcoming.map(function (m) {
          return '<div class="item">' + check(false, 'ms', 'data-id="' + m.id + '"', m.label) + '<span class="txt">' + esc(m.label) + '</span>' + trackChip(m.track) + '<span class="chip">W' + m.week + '</span></div>';
        }).join('') + '</div></div>';
      }
    } else {
      h += '<div class="card"><div class="msg">Outside the arc. Your arc runs ' + fmtDate(C.startDate(store)) + ' to ' + fmtDate(C.arcEnd(store)) + '. You can change the start date in Sync, under Settings.</div></div>';
    }
    return h;
  }
  function weekRange(w) { var s = C.weekStart(store, w), e = C.addDays(s, 6); return fmtDate(s) + ' to ' + fmtDate(e); }

  /* ---------- Week ---------- */
  function viewWeek() {
    var w = S.week;
    var h = '<div class="card"><div class="row between"><div><div class="label">Week ' + w + ' of ' + PLAN.weeks + '</div><h2>' + weekRange(w) + '</h2><div class="muted small">' + (C.phaseOf(w) ? C.phaseOf(w).name : '') + '</div></div>' +
      '<div class="row"><button class="btn" data-act="wk-nav" data-d="-1" aria-label="Previous week"' + (w > 1 ? '' : ' disabled') + '>‹</button><button class="btn" data-act="wk-nav" data-d="0">This week</button><button class="btn" data-act="wk-nav" data-d="1" aria-label="Next week"' + (w < PLAN.weeks ? '' : ' disabled') + '>›</button></div></div></div>';

    h += '<div class="card"><h3>Log the numbers</h3><div class="list">' + PLAN.metrics.map(function (m) {
      var v = C.metricValue(store, w, m.id), t = C.targetFor(m.id, w);
      var cum = m.kind === 'cum' ? C.cumulative(store, m.id, w) : null;
      var sub = m.kind === 'cum' ? 'Total so far ' + fmtNum(cum) + ' · target ' + fmtNum(t) : 'Target ' + (m.lowerIsBetter ? 'at most ' : '') + fmtNum(t);
      return '<div class="item"><span class="txt">' + esc(m.label) + '<div class="muted small">' + sub + '</div></span>' + trackChip(m.track) +
        '<div class="stepper"><button data-act="met" data-w="' + w + '" data-id="' + m.id + '" data-d="-1" aria-label="Decrease">−</button><output>' + (v === null ? '–' : fmtNum(v)) + '</output><button data-act="met" data-w="' + w + '" data-id="' + m.id + '" data-d="1" aria-label="Increase">+</button></div></div>';
    }).join('') + '</div></div>';

    h += '<div class="card"><h3>Weekly tasks</h3><div class="list">' + PLAN.weekly.map(function (t) {
      var on = C.weeklyDone(store, w, t.id);
      return '<div class="item' + (on ? ' done' : '') + '">' + check(on, 'weekly', 'data-w="' + w + '" data-id="' + t.id + '"', t.label) + '<span class="txt">' + esc(t.label) + '</span>' + trackChip(t.track) + '<span class="chip">' + t.mins + ' min</span></div>';
    }).join('') + '</div></div>';

    var ms = PLAN.milestones.filter(function (m) { return m.week === w; });
    if (ms.length) {
      h += '<div class="card"><h3>Milestones this week</h3><div class="list">' + ms.map(function (m) {
        var on = C.msDone(store, m.id);
        return '<div class="item' + (on ? ' done' : '') + '">' + check(on, 'ms', 'data-id="' + m.id + '"', m.label) + '<span class="txt">' + esc(m.label) + '</span>' + trackChip(m.track) + '</div>';
      }).join('') + '</div></div>';
    }
    h += '<div class="card"><label for="note">Review note for week ' + w + '<textarea id="note" data-w="' + w + '" placeholder="What worked, what to change next week">' + esc(C.noteOf(store, w)) + '</textarea></label></div>';
    return h;
  }

  /* ---------- Charts ---------- */
  function lineChart(rows, color, name) {
    var W = 560, H = 190, L = 34, R = 10, T = 12, B = 26;
    var ymax = 1; rows.forEach(function (r) { ymax = Math.max(ymax, r.target, r.actual || 0); });
    ymax = Math.ceil(ymax * 1.1);
    function x(w) { return L + (w - 1) / (PLAN.weeks - 1) * (W - L - R); }
    function y(v) { return T + (1 - v / ymax) * (H - T - B); }
    var s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(name) + ' versus target by week">';
    [0, 0.5, 1].forEach(function (f) { var v = ymax * f; s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="var(--grid)"/><text x="' + (L - 6) + '" y="' + (y(v) + 3) + '" text-anchor="end">' + fmtNum(v) + '</text>'; });
    [1, 4, 7, 10, 13].forEach(function (w) { s += '<text x="' + x(w) + '" y="' + (H - 8) + '" text-anchor="middle">W' + w + '</text>'; });
    s += '<polyline fill="none" stroke="var(--muted)" stroke-width="2" stroke-dasharray="5 4" points="' + rows.map(function (r) { return x(r.week) + ',' + y(r.target); }).join(' ') + '"/>';
    var pts = rows.filter(function (r) { return r.actual !== null; });
    if (pts.length) {
      s += '<polyline fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linejoin="round" points="' + pts.map(function (r) { return x(r.week) + ',' + y(r.actual); }).join(' ') + '"/>';
      var last = pts[pts.length - 1];
      s += '<circle cx="' + x(last.week) + '" cy="' + y(last.actual) + '" r="4.5" fill="' + color + '" stroke="var(--surface)" stroke-width="2"/><text x="' + x(last.week) + '" y="' + (y(last.actual) - 9) + '" text-anchor="middle" style="fill:var(--fg)">' + fmtNum(last.actual) + '</text>';
    }
    return s + '</svg>';
  }
  function barChart(rows, color, name) {
    var W = 560, H = 190, L = 34, R = 10, T = 12, B = 26;
    var ymax = 1; rows.forEach(function (r) { ymax = Math.max(ymax, r.target, r.actual || 0); });
    ymax = Math.ceil(ymax * 1.2 * 2) / 2;
    var bw = (W - L - R) / PLAN.weeks;
    function y(v) { return T + (1 - v / ymax) * (H - T - B); }
    var s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(name) + ' by week with target">';
    [0, 0.5, 1].forEach(function (f) { var v = ymax * f; s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="var(--grid)"/><text x="' + (L - 6) + '" y="' + (y(v) + 3) + '" text-anchor="end">' + fmtNum(v) + '</text>'; });
    rows.forEach(function (r) {
      var cx = L + (r.week - 1) * bw;
      if (r.actual !== null) { var hh = Math.max(1, y(0) - y(r.actual)); s += '<rect x="' + (cx + 3) + '" y="' + (y(0) - hh) + '" width="' + (bw - 6) + '" height="' + hh + '" fill="' + color + '" rx="2"><title>Week ' + r.week + ': ' + fmtNum(r.actual) + '</title></rect>'; }
      if ([1, 4, 7, 10, 13].indexOf(r.week) >= 0) s += '<text x="' + (cx + bw / 2) + '" y="' + (H - 8) + '" text-anchor="middle">W' + r.week + '</text>';
    });
    s += '<polyline fill="none" stroke="var(--muted)" stroke-width="2" stroke-dasharray="5 4" points="' + rows.map(function (r) { return (L + (r.week - 0.5) * bw) + ',' + y(r.target); }).join(' ') + '"/>';
    return s + '</svg>';
  }
  function legend(color) { return '<div class="legend"><span><i class="sw" style="border-color:' + color + '"></i>Actual</span><span><i class="sw dash"></i>Target</span></div>'; }

  /* ---------- Arc ---------- */
  function viewArc() {
    var d = C.today(), w = Math.max(0, Math.min(PLAN.weeks, C.weekOf(store, d))), upTo = Math.max(1, w);
    var items = C.series(store, 'items', upTo), assets = C.series(store, 'assets', upTo), chats = C.series(store, 'chats', upTo), dirq = C.series(store, 'dirq', upTo);
    var mp = C.milestoneProgress(store), st = C.streak(store, d);
    var curItems = items[upTo - 1].actual || 0, curAssets = assets[upTo - 1].actual || 0;
    var h = '<div class="grid g4">' +
      tile(w < 1 ? '–' : String(Math.min(C.dayNumber(store, d), PLAN.weeks * 7)), 'day of ' + PLAN.weeks * 7) +
      tile(String(st), 'day streak') +
      tile(fmtNum(curItems) + ' / ' + fmtNum(items[upTo - 1].target), 'items out vs target') +
      tile(fmtNum(curAssets) + ' / ' + fmtNum(assets[upTo - 1].target), 'assets vs target') + '</div>';
    h += '<div class="grid g2"><div class="card"><div class="row between"><h3>Proposals or portfolio pieces out</h3>' + trackChip('A') + '</div><div class="label">Cumulative</div>' + lineChart(items, 'var(--a)', 'Items out') + legend('var(--a)') + '</div>' +
      '<div class="card"><div class="row between"><h3>Assets shipped</h3>' + trackChip('B') + '</div><div class="label">Cumulative</div>' + lineChart(assets, 'var(--b)', 'Assets shipped') + legend('var(--b)') + '</div>' +
      '<div class="card"><div class="row between"><h3>Marketing, sales and admin AI chats</h3>' + trackChip('B') + '</div><div class="label">Per week · lower is better</div>' + barChart(chats, 'var(--b)', 'Chats') + legend('var(--b)') + '</div>' +
      '<div class="card"><div class="row between"><h3>New "which field?" chats</h3>' + trackChip('A') + '</div><div class="label">Per week · target 0</div>' + barChart(dirq, 'var(--a)', 'Direction chats') + legend('var(--a)') + '</div></div>';

    var cells = C.heatmap(store), s0 = C.startDate(store);
    var hm = '<div class="heat"><span></span>';
    for (var wk = 1; wk <= PLAN.weeks; wk++) hm += '<span class="w">' + (wk % 3 === 1 ? wk : '') + '</span>';
    for (var r = 0; r < 7; r++) {
      hm += '<span class="d">' + DAYN[C.dow(C.addDays(s0, r))].slice(0, 1) + '</span>';
      for (var c2 = 0; c2 < PLAN.weeks; c2++) {
        var cell = cells[c2 * 7 + r];
        var a = cell.ratio;
        hm += '<span class="c' + (cell.date === d ? ' today' : '') + '" style="' + (a > 0 ? 'background:color-mix(in srgb,var(--ok) ' + Math.round(25 + a * 75) + '%,var(--grid))' : '') + '" title="' + cell.date + ': ' + Math.round(a * 100) + '%"></span>';
      }
    }
    h += '<div class="card"><div class="row between"><h3>Every day of the arc</h3><span class="muted small">Habits done per day</span></div>' + hm + '</div></div>';

    h += '<div class="card"><div class="row between"><h3>Milestones</h3><span class="chip">' + mp.done + ' of ' + mp.total + '</span></div>' +
      PLAN.phases.map(function (p) {
        var ms = PLAN.milestones.filter(function (m) { return m.week >= p.from && m.week <= p.to; });
        return '<div class="label" style="margin-top:6px">Weeks ' + p.from + '–' + p.to + ' · ' + esc(p.name) + '</div><div class="list">' + ms.map(function (m) {
          var on = C.msDone(store, m.id);
          return '<div class="item' + (on ? ' done' : '') + '">' + check(on, 'ms', 'data-id="' + m.id + '"', m.label) + '<span class="txt">' + esc(m.label) + '</span>' + trackChip(m.track) + '<span class="chip">W' + m.week + '</span></div>';
        }).join('') + '</div>';
      }).join('') + '</div>';
    return h;
  }
  function tile(n, t) { return '<div class="card tile"><span class="n">' + esc(n) + '</span><span class="t">' + esc(t) + '</span></div>'; }

  /* ---------- Sync + settings ---------- */
  function viewSync() {
    var h = '';
    if (isDesktop) {
      var inf = S.info;
      h += '<div class="card"><div class="row between"><h2>Connect your phone</h2><span class="chip">' + (inf && inf.running ? 'Listening on port ' + inf.port : 'Not running') + '</span></div>' +
        '<p class="muted small" style="margin:0">Keep this app open. On your phone, open Winter Arc, go to Sync, and enter this address and PIN. Both devices must be on the same Wi-Fi.</p>' +
        (inf ? '<div><div class="label">Address</div>' + (inf.ips.length ? inf.ips.map(function (ip) { return '<div class="ip">' + esc(ip) + '</div>'; }).join('') : '<div class="muted">No network found. Connect to Wi-Fi.</div>') +
          '</div><div><div class="label">PIN</div><div class="pin" aria-label="PIN">' + esc(inf.pin) + '</div></div>' +
          '<div class="row"><button class="btn" data-act="regen">New PIN</button></div>' +
          '<p class="muted small" style="margin:0">First run: allow Winter Arc through Windows Firewall on private networks when Windows asks.</p>' : '<div class="muted">Loading…</div>') + '</div>';
    } else {
      var cfg = lsGet('wa.sync', { host: '', port: 47321, pin: '', auto: true, last: 0 });
      h += '<div class="card"><h2>Sync with your laptop</h2><p class="muted small" style="margin:0">Open the desktop app, go to Sync, then enter the address and PIN it shows. Same Wi-Fi on both.</p>' +
        '<label for="sh">Laptop address<input id="sh" type="text" inputmode="decimal" autocomplete="off" placeholder="192.168.1.20" value="' + esc(cfg.host) + '"></label>' +
        '<div class="grid g2"><label for="sp">Port<input id="sp" type="number" inputmode="numeric" value="' + esc(cfg.port) + '"></label><label for="spin">PIN<input id="spin" type="text" inputmode="numeric" maxlength="6" autocomplete="off" value="' + esc(cfg.pin) + '"></label></div>' +
        '<label style="flex-direction:row;align-items:center;gap:8px"><input id="sauto" type="checkbox" ' + (cfg.auto ? 'checked' : '') + ' style="width:auto"> Sync automatically when the app opens and after changes</label>' +
        '<div class="row"><button class="btn primary" data-act="sync-now"' + (S.syncing ? ' disabled' : '') + '>' + (S.syncing ? 'Syncing…' : 'Sync now') + '</button><span class="muted small">' + (cfg.last ? 'Last sync ' + new Date(cfg.last).toLocaleString() : 'Never synced') + '</span></div></div>';
    }
    if (S.msg) h += '<div class="msg ' + S.msg.kind + '" role="alert">' + esc(S.msg.text) + '</div>';

    h += '<div class="card"><h2>Settings</h2><label for="start">Arc start date (first day of week 1)<input id="start" type="date" value="' + C.startDate(store) + '"></label>' +
      '<label for="habits">Daily habits, one per line. Start a line with * to count it toward the streak<textarea id="habits">' + esc(C.habitsToText(C.habits(store))) + '</textarea></label>' +
      '<div class="row"><button class="btn" data-act="save-habits">Save habits</button></div></div>';
    h += '<div class="card"><h2>Backup</h2><p class="muted small" style="margin:0">Copy your data as text and keep it somewhere safe, or paste a backup below to merge it in.</p>' +
      '<div class="row"><button class="btn" data-act="copy-backup">Copy backup</button></div><label for="restore">Paste backup<textarea id="restore" placeholder="Paste backup text here"></textarea></label><div class="row"><button class="btn" data-act="restore">Merge backup</button></div></div>';
    return h;
  }

  /* ---------- Render + events ---------- */
  function render() {
    navEl.innerHTML = TABS.map(function (t) { return '<button data-act="tab" data-t="' + t[0] + '"' + (S.tab === t[0] ? ' aria-current="page"' : '') + '>' + ICON[t[0]] + '<span>' + t[1] + '</span></button>'; }).join('');
    var focusId = document.activeElement && document.activeElement.id, selStart = null;
    if (focusId && document.activeElement.selectionStart !== undefined) selStart = document.activeElement.selectionStart;
    appEl.innerHTML = S.tab === 'today' ? viewToday() : S.tab === 'week' ? viewWeek() : S.tab === 'arc' ? viewArc() : viewSync();
    statusEl.textContent = arcStatus();
    if (focusId && S.tab === 'week' && focusId === 'note') { var n = document.getElementById('note'); if (n) { n.focus(); if (selStart !== null) n.setSelectionRange(selStart, selStart); } }
  }
  function rerender() { render(); scheduleAutoSync(); }

  var noteTimer = null;
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t && t.id === 'note') { clearTimeout(noteTimer); var w = +t.getAttribute('data-w'), v = t.value; noteTimer = setTimeout(function () { C.setNote(store, w, v); scheduleAutoSync(); }, 500); }
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t && t.id === 'start' && C.validDate(t.value)) { store.put('cfg', 'cfg:start', { start: t.value }); S.date = clampDate(C.today()); S.week = Math.max(1, Math.min(PLAN.weeks, C.weekOf(store, C.today()))); render(); }
  });
  document.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el || el.disabled) return;
    var act = el.getAttribute('data-act'), id = el.getAttribute('data-id'), d = +el.getAttribute('data-d'), w = +el.getAttribute('data-w');
    switch (act) {
      case 'tab': S.tab = el.getAttribute('data-t'); S.msg = null; if (S.tab === 'sync' && isDesktop) refreshInfo(); render(); appEl.scrollTop = 0; window.scrollTo(0, 0); return;
      case 'habit': C.toggleHabit(store, S.date, id); break;
      case 'weekly': C.toggleWeekly(store, w, id); break;
      case 'ms': C.toggleMs(store, id); break;
      case 'day': S.date = d === 0 ? clampDate(C.today()) : clampDate(C.addDays(S.date, d)); break;
      case 'wk-nav': S.week = d === 0 ? Math.max(1, Math.min(PLAN.weeks, C.weekOf(store, C.today()))) : Math.max(1, Math.min(PLAN.weeks, S.week + d)); break;
      case 'met': var cur = C.metricValue(store, w, id) || 0; var step = id === 'chats' ? 1 : 1; C.setMetric(store, w, id, cur + d * step); break;
      case 'regen': native.regenPin().then(function (pin) { S.info.pin = pin; render(); }); return;
      case 'save-habits': var list = C.parseHabits(document.getElementById('habits').value); if (!list.length) { S.msg = { kind: 'err', text: 'Add at least one habit.' }; render(); return; } store.put('cfg', 'cfg:habits', { list: list }); S.msg = { kind: 'ok', text: 'Habits saved.' }; break;
      case 'copy-backup': copyBackup(); return;
      case 'restore': restoreBackup(); return;
      case 'sync-now': saveSyncForm(); doSync(true); return;
    }
    rerender();
  });

  function copyBackup() {
    var text = JSON.stringify({ app: 'winter-arc', records: store.all() });
    var done = function () { S.msg = { kind: 'ok', text: 'Backup copied. Paste it somewhere safe.' }; render(); };
    var fallback = function () {
      var ta = document.getElementById('restore'); if (ta) { ta.value = text; ta.select(); }
      S.msg = { kind: 'ok', text: 'Copy blocked here. The backup is in the box below. Select all and copy.' }; render();
      var t2 = document.getElementById('restore'); if (t2) { t2.value = text; t2.select(); }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
  }
  function restoreBackup() {
    var v = document.getElementById('restore').value, data;
    try { data = JSON.parse(v); } catch (e) { S.msg = { kind: 'err', text: 'That is not a valid backup.' }; render(); return; }
    var n = store.merge(data && data.records || [], true);
    S.msg = { kind: 'ok', text: n + ' records merged.' }; rerender();
  }

  /* ---------- Sync client (phone) ---------- */
  function saveSyncForm() {
    var h = document.getElementById('sh'); if (!h) return;
    lsSet('wa.sync', { host: h.value.trim(), port: parseInt(document.getElementById('sp').value, 10) || 47321, pin: document.getElementById('spin').value.trim(), auto: document.getElementById('sauto').checked, last: lsGet('wa.sync', {}).last || 0 });
  }
  function doSync(manual) {
    if (isDesktop || S.syncing) return;
    var cfg = lsGet('wa.sync', null);
    if (!cfg || !cfg.host || !cfg.pin) { if (manual) { S.msg = { kind: 'err', text: 'Enter the laptop address and PIN first.' }; render(); } return; }
    S.syncing = true; if (manual) { S.msg = null; } render();
    window.Sync.syncOnce({ host: cfg.host, port: cfg.port, pin: cfg.pin, store: store }).then(function (r) {
      cfg.last = r.at; lsSet('wa.sync', cfg); S.syncing = false;
      S.msg = { kind: 'ok', text: 'Synced. ' + r.changed + ' change' + (r.changed === 1 ? '' : 's') + ' from the laptop.' }; render();
    }, function (err) {
      S.syncing = false; if (manual || S.tab === 'sync') S.msg = { kind: 'err', text: err.message }; render();
    });
  }
  var autoTimer = null;
  function scheduleAutoSync() {
    if (isDesktop) return;
    var cfg = lsGet('wa.sync', null); if (!cfg || !cfg.auto || !cfg.host || !cfg.pin) return;
    clearTimeout(autoTimer); autoTimer = setTimeout(function () { doSync(false); }, 4000);
  }
  function refreshInfo() { native.syncInfo().then(function (i) { S.info = i; if (S.tab === 'sync') render(); }); }

  /* ---------- Boot ---------- */
  function boot() {
    var device = lsGet('wa.device', null); if (!device) { device = C.newDeviceId(); lsSet('wa.device', device); }
    store = new C.Store(isDesktop ? nativeAdapter() : localAdapter(), (isDesktop ? 'desk-' : 'phone-') + device);
    store.init().then(function () {
      S.date = clampDate(C.today());
      S.week = Math.max(1, Math.min(PLAN.weeks, C.weekOf(store, C.today())));
      render();
      if (isDesktop) {
        refreshInfo();
        native.onRemote(function () { native.all().then(function (all) { store.replaceReload(all); }); });
      } else {
        scheduleAutoSync(); setTimeout(function () { doSync(false); }, 600);
        document.addEventListener('visibilitychange', function () { if (!document.hidden) doSync(false); });
      }
      store.on(function (why) { if (why === 'remote') render(); });
      if (window.__WA_TEST__) window.__WA_TEST__.store = store;
    });
  }
  boot();
})();
