import '@testing-library/jest-dom/vitest';

// jsdom lacks PointerEvent and the pointer-capture methods that @dnd-kit's
// PointerSensor relies on; provide minimal shims so drag interactions can be
// exercised in tests.
if (typeof window !== 'undefined' && typeof window.PointerEvent === 'undefined') {
  class PointerEventShim extends MouseEvent {
    readonly pointerId: number;
    readonly isPrimary: boolean;
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 1;
      this.isPrimary = params.isPrimary ?? true;
    }
  }
  window.PointerEvent = PointerEventShim as unknown as typeof PointerEvent;
}
if (typeof Element !== 'undefined' && typeof Element.prototype.hasPointerCapture !== 'function') {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
}

// jsdom's Range lacks the layout methods CodeMirror calls when it measures the
// document (textRange(...).getClientRects); provide empty-rect stubs so the
// editor can mount and take input in tests without throwing.
if (typeof Range !== 'undefined' && typeof Range.prototype.getClientRects !== 'function') {
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) }) as DOMRect;
}

// jsdom's File/Blob lack the standard async text() method; provide it so tests
// can spy on it and components can read selected files the same way real
// browsers do.
if (typeof Blob !== 'undefined' && typeof Blob.prototype.text !== 'function') {
  Blob.prototype.text = function text(this: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}
