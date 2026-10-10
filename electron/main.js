/* Winter Arc desktop app (Electron main process). Real app window, local data file, LAN sync server for the phone. */
'use strict';
const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron');
const path = require('path');
const os = require('os');
const Core = require('../www/core.js');
const { openDb } = require('./db.js');
const { createSyncServer } = require('./syncserver.js');

let win = null, db = null, server = null, running = false;

function lanIps() {
  const out = [];
  const nets = os.networkInterfaces();
  Object.keys(nets).forEach(function (k) {
    (nets[k] || []).forEach(function (n) { if (n.family === 'IPv4' && !n.internal) out.push(n.address); });
  });
  return out;
}

function notifyRemote() { if (win && !win.isDestroyed()) win.webContents.send('remote-change'); }

function startServer() {
  server = createSyncServer({
    getPin: function () { return db.settings().pin; },
    getRecords: function () { return db.all(); },
    mergeRecords: function (r) { return db.merge(r); },
    onRemoteChange: notifyRemote
  });
  server.on('error', function () { running = false; });
  server.listen(db.settings().port, '0.0.0.0', function () { running = true; });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1100, height: 780, minWidth: 720, minHeight: 560,
    title: 'Winter Arc', backgroundColor: '#0d121a', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.loadFile(path.join(__dirname, '..', 'www', 'index.html'));
  win.webContents.setWindowOpenHandler(function (d) { shell.openExternal(d.url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', function (e, url) { if (!url.startsWith('file://')) e.preventDefault(); });
}

const lock = app.requestSingleInstanceLock();
if (!lock) { app.quit(); } else {
  app.on('second-instance', function () { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(function () {
    Menu.setApplicationMenu(null);
    db = openDb(path.join(app.getPath('userData'), 'winter-arc.json'));
    ipcMain.handle('store:all', function () { return db.all(); });
    ipcMain.handle('store:put', function (e, recs) { return db.merge(Array.isArray(recs) ? recs : [recs]).length; });
    ipcMain.handle('sync:info', function () { return { ips: lanIps(), port: db.settings().port, pin: db.settings().pin, running: running }; });
    ipcMain.handle('sync:regen', function () { return db.regenPin(); });
    startServer();
    createWindow();
    app.on('activate', function () { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  app.on('before-quit', function () { if (db) db.flush(); if (server) server.close(); });
  app.on('window-all-closed', function () { app.quit(); });
}
