# Winter Arc

A 13-week plan (12 Oct 2026 to 10 Jan 2027) plus a progress tracker that runs as:

- **Windows desktop app** (Electron, its own window, not a website). Data lives in a file on the laptop.
- **Android app** (Capacitor APK). Data lives on the phone.
- **Wi-Fi sync**: the desktop app runs a small server on your network. The phone syncs with it using a 6-digit PIN. Both work fully offline; edits merge when you sync (latest edit wins per item).

## Honest status
Core logic, merging and the sync server pass `npm test` (7 tests), and the interface was checked in Chromium at desktop and phone widths. **The .exe and .apk were not compiled in the environment that wrote this**, so the first build is the first real run of those wrappers. If a build step fails, send me the error text.

## Easiest way to get the installers (no tools on your machine)
1. Create a free GitHub account and a new private repository.
2. Upload every file in this folder (drag the unzipped contents into the repo page).
3. Open the **Actions** tab, choose **Build Winter Arc**, press **Run workflow**.
4. After about 10 minutes download `WinterArc-Windows-Setup` (installer) and `WinterArc-Android-APK` from the finished run.
5. Windows: run the installer. Android: copy `app-debug.apk` to the phone, open it, allow "install unknown apps" for your file manager.

## Build locally instead
Needs Node 20. For Android also JDK 17 and the Android SDK.
```
npm install
npm test
npm start            # run the desktop app now
npm run dist:win     # Windows installer in dist/ (run on Windows)
npx cap add android && node scripts/patch-android.js
npx cap sync android && node scripts/patch-android.js
cd android && ./gradlew assembleDebug    # APK: android/app/build/outputs/apk/debug/
```

## Pair phone and laptop
1. Laptop and phone on the same Wi-Fi.
2. Desktop app > **Sync**: note the address (like `192.168.1.20`) and the PIN.
3. Phone app > **Sync**: enter address, port 47321, PIN. Press **Sync now**. It then syncs automatically while open.
4. First time only, Windows Firewall asks to allow the app on private networks. Allow it. If it never asks, allow TCP port 47321 for private networks.

Guest or office Wi-Fi often blocks device-to-device traffic. Use home Wi-Fi or a phone hotspot with the laptop connected to it.

## Security
The PIN is required for every sync. Five wrong PINs lock that address out for 60 seconds. Traffic is plain HTTP inside your own network, so do not sync on public Wi-Fi. Regenerate the PIN in the desktop app any time.

## Backup
Sync > Settings has copy and restore for all data on either device.
