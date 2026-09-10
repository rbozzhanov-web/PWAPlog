# Pilot Logbook PWA

Pilot Logbook is an installable, offline-first browser foundation for a pilot's logbook. Its app shell and working logbook data remain on the device after the first successful load.

## Develop and verify

```sh
npm install
npm run dev
npm run test
npm run build
```

`npm run dev` prints the local development URL. Use `npm run test:web` to run only the browser test project.

## Install and use offline

Open the app in a supported browser once while online. Then use the browser's install action (for example, the install icon in Chrome's address bar, or **Install app** from its menu). On iPhone or iPad, use Safari's Share menu and choose **Add to Home Screen**. The installed app opens in its own window.

After the first successful load, the service worker caches the application shell, manifest, and icon. You can reopen the logbook while offline; a first visit still requires an internet connection to download the app.

## Data and backups

Pilot Logbook data is stored only in this browser until you export a backup; this release does not synchronize devices or automatically create a Files-app document.

The **logbook backup** import/export flow is compatible with the native PilotLogbook v1 backup format. It contains flight-log entries only and preserves their stable IDs and audit fields.

Pay settings, imported schedules, exchange rates, taxable-YTD overrides, and monthly pay-day facts are intentionally outside that native logbook backup. A future **pay-data backup** will use its own versioned format; restoring a native logbook backup must never overwrite or infer salary data.
