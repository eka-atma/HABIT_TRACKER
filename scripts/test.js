/* Run: node scripts/test.js   (no dependencies) */
'use strict';
const assert = require('assert');
const os = require('os');
const fs = require('fs');
const path = require('path');
const Core = require('../www/core.js');
const Sync = require('../www/sync.js');
const { createSyncServer } = require('../electron/syncserver.js');
const { openDb } = require('../electron/db.js');

let passed = 0;
function t(name, fn) {
  return Promise.resolve().then(fn).then(function () { passed++; console.log('ok   ' + name); },
    function (e) { console.log('FAIL ' + name + '\n' + (e && e.stack || e)); process.exitCode = 1; });
}
function memStore(device) {
  const a = { load: () => [], put: () => {} };
  return new Core.Store(a, device).init().then(s => s);
}

(async function main() {
  await t('interp hits plan targets', () => {
    const items = Core.PLAN.metrics.find(m => m.id === 'items').target;
    assert.strictEqual(Core.interp(items, 0), 0);
    assert.strictEqual(Core.interp(items, 4), 4);
    assert.strictEqual(Core.interp(items, 8), 8);
    assert.strictEqual(Core.interp(items, 13), 12);
    assert.strictEqual(Core.interp(items, 6), 6);
    const chats = Core.PLAN.metrics.find(m => m.id === 'chats').target;
    assert.strictEqual(Core.interp(chats, 9), 1);
    assert.strictEqual(Core.interp(chats, 13), 0.5);
    assert.strictEqual(Core.interp(chats, 2), 1.6);
  });

  await t('dates: week and day numbering', async () => {
    const s = await memStore('a');
    assert.strictEqual(Core.startDate(s), '2026-10-12');
    assert.strictEqual(Core.dow('2026-10-12'), 1);
    assert.strictEqual(Core.weekOf(s, '2026-10-12'), 1);
    assert.strictEqual(Core.weekOf(s, '2026-10-18'), 1);
    assert.strictEqual(Core.weekOf(s, '2026-10-19'), 2);
    assert.strictEqual(Core.weekOf(s, '2027-01-10'), 13);
    assert.strictEqual(Core.arcEnd(s), '2027-01-10');
    assert.strictEqual(Core.dayNumber(s, '2027-01-10'), 91);
    assert.strictEqual(Core.weekOf(s, '2026-10-10'), 0);
    assert.strictEqual(Core.addDays('2026-12-31', 1), '2027-01-01');
  });

  await t('merge: last write wins, device id breaks ties, bad records dropped', () => {
    const m = new Map();
    const r1 = { id: 'chk:2026-10-12:build', type: 'chk', data: { done: true }, updated: 100, device: 'a' };
    const r2 = { id: 'chk:2026-10-12:build', type: 'chk', data: { done: false }, updated: 200, device: 'b' };
    const r3 = { id: 'chk:2026-10-12:build', type: 'chk', data: { done: true }, updated: 200, device: 'c' };
    assert.strictEqual(Core.mergeInto(m, [r1]).length, 1);
    assert.strictEqual(Core.mergeInto(m, [r2]).length, 1);
    assert.strictEqual(Core.mergeInto(m, [r1]).length, 0);
    assert.strictEqual(Core.mergeInto(m, [r3]).length, 1);
    assert.strictEqual(m.get(r1.id).device, 'c');
    const bad = Core.sanitize([{ id: 'x', type: 'chk' }, { id: 'evil:1', type: 'evil', data: {}, updated: 1 }, { id: 'chk:wrongprefix', type: 'met', data: {}, updated: 1 }, null, r1]);
    assert.strictEqual(bad.length, 1);
  });

  await t('store: habits, streak, metrics, series, heatmap', async () => {
    const s = await memStore('a');
    const d0 = '2026-10-12';
    assert.strictEqual(Core.streak(s, d0), 0);
    Core.toggleHabit(s, d0, 'build');
    Core.toggleHabit(s, Core.addDays(d0, 1), 'build');
    assert.strictEqual(Core.streak(s, Core.addDays(d0, 1)), 2);
    assert.strictEqual(Core.streak(s, Core.addDays(d0, 2)), 2); // today not done yet keeps the streak
    assert.strictEqual(Core.streak(s, Core.addDays(d0, 3)), 0);
    Core.toggleHabit(s, d0, 'build'); // untick
    assert.strictEqual(Core.isChecked(s, d0, 'build'), false);
    Core.toggleHabit(s, d0, 'move');
    assert.strictEqual(Core.dayScore(s, d0).done, 1);
    assert.strictEqual(Core.dayScore(s, d0).total, 3);
    Core.setMetric(s, 1, 'items', 1); Core.setMetric(s, 2, 'items', 2); Core.setMetric(s, 3, 'items', 1);
    assert.strictEqual(Core.cumulative(s, 'items', 3), 4);
    const ser = Core.series(s, 'items', 3);
    assert.strictEqual(ser.length, 13);
    assert.strictEqual(ser[2].actual, 4);
    assert.strictEqual(ser[3].actual, null);
    assert.strictEqual(ser[3].target, 4);
    Core.setMetric(s, 1, 'chats', 2);
    assert.strictEqual(Core.series(s, 'chats', 2)[0].actual, 2);
    assert.strictEqual(Core.heatmap(s).length, 91);
    assert.strictEqual(Core.milestoneProgress(s).total, 13);
    Core.toggleMs(s, 'm1a');
    assert.strictEqual(Core.milestoneProgress(s).done, 1);
    Core.setNote(s, 1, 'hello');
    assert.strictEqual(Core.noteOf(s, 1), 'hello');
  });

  await t('habit editor round trip', () => {
    const list = Core.parseHabits('* Focus block\nRead 10 pages\n\n  * Walk  ');
    assert.deepStrictEqual(list.map(h => [h.label, h.key]), [['Focus block', true], ['Read 10 pages', false], ['Walk', true]]);
    assert.strictEqual(Core.habitsToText(list), '* Focus block\nRead 10 pages\n* Walk');
  });

  await t('two devices sync over HTTP with PIN', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-'));
    const db = openDb(path.join(dir, 'd.json'));
    const pin = db.settings().pin;
    const server = createSyncServer({ getPin: () => db.settings().pin, getRecords: () => db.all(), mergeRecords: r => db.merge(r) });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;

    const phone = await memStore('phone');
    const desk = await memStore('desk');
    // desktop edits go through db (as the Electron IPC would)
    Core.toggleHabit(phone, '2026-10-12', 'build');
    Core.setMetric(phone, 1, 'items', 2);
    desk.adapter = { load: () => [], put: r => db.merge(r) };
    Core.toggleHabit(desk, '2026-10-12', 'move');

    let res = await Sync.syncOnce({ host: '127.0.0.1', port, pin, store: phone });
    assert.ok(res.total >= 3);
    assert.strictEqual(Core.isChecked(phone, '2026-10-12', 'move'), true, 'phone got desktop edit');
    assert.strictEqual(db.all().some(r => r.id === 'met:1:items'), true, 'desktop got phone edit');

    // conflict: both edit same record, later one wins
    Core.setMetric(phone, 1, 'items', 3);
    await new Promise(r => setTimeout(r, 5));
    desk.adapter = { load: () => [], put: r => db.merge(r) };
    Core.setMetric(desk, 1, 'items', 5);
    await Sync.syncOnce({ host: '127.0.0.1', port, pin, store: phone });
    assert.strictEqual(Core.metricValue(phone, 1, 'items'), 5);

    // wrong pin
    await assert.rejects(Sync.syncOnce({ host: '127.0.0.1', port, pin: '000000' === pin ? '111111' : '000000', store: phone }), /Wrong PIN/);
    // lockout after repeated failures
    for (let i = 0; i < 5; i++) { try { await Sync.syncOnce({ host: '127.0.0.1', port, pin: '000000' === pin ? '111111' : '000000', store: phone }); } catch (e) { /* expected */ } }
    await assert.rejects(Sync.syncOnce({ host: '127.0.0.1', port, pin, store: phone }), /Too many/);
    // bad host / pin format
    await assert.rejects(Sync.syncOnce({ host: 'bad host!', port, pin, store: phone }), /address/);
    await assert.rejects(Sync.syncOnce({ host: '127.0.0.1', port, pin: '12', store: phone }), /6 digits/);
    // persistence
    db.flush();
    const db2 = openDb(path.join(dir, 'd.json'));
    assert.strictEqual(db2.all().length, db.all().length);
    assert.strictEqual(db2.settings().pin, pin);
    server.close();
  });

  await t('unreachable desktop gives a friendly error', async () => {
    const s = await memStore('p');
    await assert.rejects(Sync.syncOnce({ host: '127.0.0.1', port: 9, pin: '123456', store: s, timeoutMs: 1500 }), /Cannot reach|No answer/);
  });

  console.log(passed + ' passed' + (process.exitCode ? ', with failures' : ''));
})();
