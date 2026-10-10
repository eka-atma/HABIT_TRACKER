/* LAN sync server. Runs inside the desktop app. Plain Node, no dependencies, so it can be tested without Electron.
   Protocol: POST /sync  header X-Pin: <6 digits>  body {device, records:[...]}  ->  {records:[...all records...]}
   Merge rule: last write wins per record id. */
'use strict';
const http = require('http');
const crypto = require('crypto');
const Core = require('../www/core.js');

const MAX_BODY = 5 * 1024 * 1024;

function pinOk(given, expected) {
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(String(expected || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * @param {{getPin:()=>string, getRecords:()=>object[], mergeRecords:(r:object[])=>object[], onRemoteChange?:(n:number)=>void}} opts
 */
function createSyncServer(opts) {
  const fails = new Map(); // ip -> {n, until}
  function blocked(ip) {
    const f = fails.get(ip);
    return !!(f && f.until > Date.now());
  }
  function fail(ip) {
    const f = fails.get(ip) || { n: 0, until: 0 };
    f.n += 1;
    if (f.n >= 5) { f.until = Date.now() + 60000; f.n = 0; }
    fails.set(ip, f);
  }
  function send(res, code, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(code, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, X-Pin',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    });
    res.end(body);
  }
  return http.createServer(function (req, res) {
    const ip = req.socket.remoteAddress || '';
    if (req.method === 'OPTIONS') return send(res, 204, {});
    if (req.method === 'GET' && req.url === '/ping') return send(res, 200, { app: 'winter-arc', ok: true });
    if (req.method === 'POST' && req.url === '/sync') {
      if (blocked(ip)) return send(res, 429, { error: 'Too many wrong PINs. Wait a minute.' });
      if (!pinOk(req.headers['x-pin'], opts.getPin())) { fail(ip); return send(res, 401, { error: 'Wrong PIN' }); }
      let size = 0; const chunks = [];
      req.on('data', function (c) {
        size += c.length;
        if (size > MAX_BODY) { send(res, 413, { error: 'Too large' }); req.destroy(); return; }
        chunks.push(c);
      });
      req.on('end', function () {
        if (res.writableEnded) return;
        let body;
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { return send(res, 400, { error: 'Bad JSON' }); }
        const incoming = Core.sanitize(body && body.records);
        const changed = opts.mergeRecords(incoming);
        if (changed.length && opts.onRemoteChange) opts.onRemoteChange(changed.length);
        return send(res, 200, { records: opts.getRecords() });
      });
      return undefined;
    }
    return send(res, 404, { error: 'Not found' });
  });
}

module.exports = { createSyncServer, pinOk };
