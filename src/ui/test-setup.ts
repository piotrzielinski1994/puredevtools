import '@testing-library/jest-dom/vitest';

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
