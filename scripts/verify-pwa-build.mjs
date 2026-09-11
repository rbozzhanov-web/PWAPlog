import { readdir, readFile } from 'node:fs/promises';

const distUrl = new URL('../apps/web/dist/', import.meta.url);
const assets = await readdir(new URL('assets/', distUrl));
const workerAssets = assets.filter((name) => /^pdf\.worker\.min-.*\.mjs$/.test(name));

if (workerAssets.length !== 1) {
  throw new Error(`Expected one emitted PDF worker, found ${workerAssets.length}.`);
}

const serviceWorker = await readFile(new URL('sw.js', distUrl), 'utf8');
const workerPath = `assets/${workerAssets[0]}`;

if (!serviceWorker.includes(`url:"${workerPath}"`)) {
  throw new Error(`${workerPath} is missing from the Workbox precache manifest.`);
}

console.log(`Verified Workbox precaches ${workerPath}.`);
