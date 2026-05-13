/// <reference lib="dom" />
// jsdom does not implement ResizeObserver; cmdk uses it for its
// virtualized list. Provide a no-op stub so the tests can run.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
if (typeof globalThis.ResizeObserver === 'undefined') {
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver =
    ResizeObserverStub;
}

// jsdom does not implement Element.scrollIntoView; cmdk calls it when
// selecting items in its keyboard-navigation handler.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function (): void {};
}
