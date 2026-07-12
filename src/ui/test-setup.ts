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
