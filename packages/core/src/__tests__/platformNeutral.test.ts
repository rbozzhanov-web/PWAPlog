import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The package's whole reason for existing is that it runs anywhere: browser, Node, and a native
 * runtime next door. The previous version of this test asserted `globalThis.document === undefined`
 * in a Node environment, which is true whatever core imports — it could not have failed.
 *
 * This reads the source instead, so an accidental `import { useState } from 'react'` in a domain
 * module is caught here rather than at the point someone tries to reuse the package.
 */
const SRC = new URL('..', import.meta.url).pathname;

const FORBIDDEN = [
  { name: 'React', pattern: /from '(react|react-dom)[^']*'/ },
  { name: 'React Native or Expo', pattern: /from '(react-native|expo)[^']*'/ },
  { name: 'Dexie', pattern: /from 'dexie[^']*'/ },
  { name: 'Node built-ins', pattern: /from '(node:|fs|path|os|child_process)[^']*'/ },
];

/** Globals that only exist in a browser. A platform-neutral module must not reach for them. */
const FORBIDDEN_GLOBALS =
  /\b(document|localStorage|sessionStorage|indexedDB|navigator|XMLHttpRequest)\s*\./;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      return name === '__tests__' || name === '__fixtures__' ? [] : sourceFiles(full);
    }
    return name.endsWith('.ts') && !name.endsWith('.test.ts') ? [full] : [];
  });
}

const files = sourceFiles(SRC);

test('finds the core sources to check', () => {
  expect(files.length).toBeGreaterThan(15);
});

test.each(FORBIDDEN)('no core module imports $name', ({ pattern }) => {
  const offenders = files.filter((file) => pattern.test(readFileSync(file, 'utf8')));
  expect(offenders).toEqual([]);
});

test('no core module reaches for a browser global', () => {
  const offenders = files.filter((file) => {
    // Strip comments first: the modules explain at length which browser APIs they avoid.
    const source = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    return FORBIDDEN_GLOBALS.test(source);
  });
  expect(offenders).toEqual([]);
});

test('runs without a browser document', () => {
  expect((globalThis as Record<string, unknown>).document).toBeUndefined();
});
