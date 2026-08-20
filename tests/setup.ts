import "@testing-library/jest-dom/vitest";

// jsdom does not implement ResizeObserver, which the file tree uses to size
// its virtualized row window.
if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
