/* Phone-side sync client. Talks to the desktop app on the same Wi-Fi. UMD. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Sync = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function validHost(h) {
    return typeof h === 'string' && /^[A-Za-z0-9.\-]{1,100}$/.test(h);
  }

  /** Send every local record, merge everything the desktop returns. */
  function syncOnce(opts) {
    var store = opts.store;
    if (!validHost(opts.host)) return Promise.reject(new Error('Enter the desktop address, for example 192.168.1.20'));
    if (!/^\d{6}$/.test(String(opts.pin || ''))) return Promise.reject(new Error('The PIN is 6 digits'));
    var port = parseInt(opts.port, 10) || 47321;
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, opts.timeoutMs || 8000) : null;
    return fetch('http://' + opts.host + ':' + port + '/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Pin': String(opts.pin) },
      body: JSON.stringify({ device: store.device, records: store.all() }),
      signal: ctl ? ctl.signal : undefined
    }).then(function (res) {
      if (timer) clearTimeout(timer);
      if (res.status === 401) throw new Error('Wrong PIN. Check the PIN shown in the desktop app.');
      if (res.status === 429) throw new Error('Too many wrong PINs. Wait a minute and try again.');
      if (!res.ok) throw new Error('Desktop replied with status ' + res.status);
      return res.json();
    }).then(function (json) {
      var changed = store.merge(json.records || []);
      return { changed: changed, total: (json.records || []).length, at: Date.now() };
    }).catch(function (e) {
      if (timer) clearTimeout(timer);
      if (e && e.name === 'AbortError') throw new Error('No answer from the desktop. Is the app open and on the same Wi-Fi?');
      if (e && /fetch|network|Failed/i.test(String(e.message))) throw new Error('Cannot reach the desktop. Is the app open and on the same Wi-Fi?');
      throw e;
    });
  }

  return { syncOnce: syncOnce, validHost: validHost };
});
