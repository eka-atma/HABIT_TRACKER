'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('native', {
  all: function () { return ipcRenderer.invoke('store:all'); },
  put: function (recs) { return ipcRenderer.invoke('store:put', recs); },
  syncInfo: function () { return ipcRenderer.invoke('sync:info'); },
  regenPin: function () { return ipcRenderer.invoke('sync:regen'); },
  onRemote: function (fn) { ipcRenderer.on('remote-change', function () { fn(); }); }
});
