/* File-backed record database for the desktop app (main process). */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Core = require('../www/core.js');

function newPin() { return String(crypto.randomInt(0, 1000000)).padStart(6, '0'); }

function openDb(file) {
  let state = { records: [], settings: { pin: newPin(), port: 47321 } };
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    state.records = Core.sanitize(raw.records);
    state.settings = Object.assign(state.settings, raw.settings || {});
  } catch (e) { /* first run */ }
  const map = new Map();
  state.records.forEach(function (r) { map.set(r.id, r); });
  let timer = null;

  function writeNow() {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ records: Array.from(map.values()), settings: state.settings }));
    fs.renameSync(tmp, file);
  }
  function save() { clearTimeout(timer); timer = setTimeout(writeNow, 200); }
  writeNow();

  return {
    all: function () { return Array.from(map.values()); },
    merge: function (records) { const changed = Core.mergeInto(map, Core.sanitize(records)); if (changed.length) save(); return changed; },
    settings: function () { return state.settings; },
    regenPin: function () { state.settings.pin = newPin(); save(); return state.settings.pin; },
    flush: function () { clearTimeout(timer); writeNow(); }
  };
}

module.exports = { openDb, newPin };
