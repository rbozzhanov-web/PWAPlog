/**
 * Renders the app icon set from apps/web/public/icon.svg.
 *
 * Three platforms want three different things from the same artwork:
 *
 *  - **Manifest "any"** takes the icon as drawn, rounded corners and all.
 *  - **Manifest "maskable"** is cropped by the platform to a shape it chooses, so it needs a
 *    full-bleed background and the artwork pulled into the safe zone — the centred circle of 80%
 *    diameter. Marking one icon `any maskable`, as this app did, means whichever shape Android
 *    applies eats the corners of art that was drawn to sit right up against them.
 *  - **apple-touch-icon** is what iOS actually uses: it ignores manifest icons entirely, and it
 *    ignores SVG, so a PNG has to exist at a real URL. iOS applies its own rounding, so this one
 *    is full-bleed too, with no corner radius of its own.
 *
 * Rasterised through headless Chromium, which is already available for browser tests, rather than
 * adding an image toolchain. Run with `npm run generate:icons` after changing the artwork; it
 * needs playwright on the path (`npx playwright ...`) and is not part of the build.
 */
import { readFile, writeFile } from 'node:fs/promises';

// Not a project dependency: the icons change about as often as the brand does, so the renderer is
// borrowed for the run rather than carried in every install.
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('This script needs playwright. Run it as: npx --yes playwright@latest exec -- node scripts/generate-icons.mjs');
  process.exit(1);
}

const publicDir = new URL('../apps/web/public/', import.meta.url);
const source = await readFile(new URL('icon.svg', publicDir), 'utf8');

const BACKGROUND = '#10233f';
/** The artwork without its own background plate, for the variants that supply their own. */
const artwork = [...source.matchAll(/<path[^>]*\/>/g)].map((match) => match[0]).join('\n  ');
if (!artwork) throw new Error('No <path> artwork found in icon.svg.');

/**
 * The source is drawn in a 192 box. `scale` is applied about the centre, so a value below the
 * full-bleed ratio insets the artwork — which is how the maskable safe zone is met.
 */
function compose(size, scale, { rounded = false } = {}) {
  const drawn = 192 * scale;
  const offset = (size - drawn) / 2;
  const radius = rounded ? ` rx="${Math.round(size * 0.22)}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}"${radius} fill="${BACKGROUND}"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})">
  ${artwork}
  </g>
</svg>`;
}

const variants = [
  // Manifest "any": the icon as drawn, at both sizes Chrome looks for.
  { file: 'icon-192.png', size: 192, svg: compose(192, 1, { rounded: true }) },
  { file: 'icon-512.png', size: 512, svg: compose(512, 512 / 192, { rounded: true }) },
  // Maskable: full bleed, artwork inside the 80% safe circle (192 * 2 = 384 of 512).
  { file: 'icon-maskable-512.png', size: 512, svg: compose(512, 2, {}) },
  // iOS home screen. 180 is the size current iPhones ask for; iOS rounds it itself.
  { file: 'apple-touch-icon.png', size: 180, svg: compose(180, 180 / 192, {}) },
];

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? undefined,
});

for (const variant of variants) {
  const page = await browser.newPage({
    viewport: { width: variant.size, height: variant.size },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    `<body style="margin:0">${variant.svg}</body>`,
    { waitUntil: 'load' },
  );
  const png = await page.screenshot({ omitBackground: true });
  await writeFile(new URL(variant.file, publicDir), png);
  await page.close();
  console.log(`${variant.file}: ${variant.size}x${variant.size}, ${png.length} bytes`);
}

await browser.close();
