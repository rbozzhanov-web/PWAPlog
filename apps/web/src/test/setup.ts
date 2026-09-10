import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';

import Dexie from 'dexie';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';

beforeEach(() => {
  const indexedDB = new IDBFactory();
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: indexedDB,
  });
  Dexie.dependencies.indexedDB = indexedDB;
  Dexie.dependencies.IDBKeyRange = IDBKeyRange;
});
