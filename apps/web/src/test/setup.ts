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

/**
 * jsdom ships no PointerEvent, so Testing Library falls back to a plain Event and a fired
 * pointermove reaches the handler with no coordinates at all — which makes any drag gesture look
 * like a zero-distance one and silently untestable. A MouseEvent-backed shim carries clientX and
 * clientY along with the pointer fields the app reads.
 */
if (typeof window.PointerEvent === 'undefined') {
  class PointerEventShim extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    readonly isPrimary: boolean;

    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 1;
      this.pointerType = params.pointerType ?? 'touch';
      this.isPrimary = params.isPrimary ?? true;
    }
  }

  window.PointerEvent = PointerEventShim as unknown as typeof PointerEvent;
}

// Nor does it implement pointer capture, which any drag handler calls on the way in.
Element.prototype.setPointerCapture ??= function setPointerCapture() {};
Element.prototype.releasePointerCapture ??= function releasePointerCapture() {};
