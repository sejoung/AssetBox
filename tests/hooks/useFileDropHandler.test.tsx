import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { useFileDropHandler } from "../../src/hooks/useFileDropHandler";
const native = vi.hoisted(() => ({ listen: vi.fn() }));
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: () => ({ onDragDropEvent: native.listen }),
}));
beforeEach(() => vi.clearAllMocks());
it("unsubscribes registrations that finish after unmount and ignores late drops", async () => {
  let finish!: (stop: () => void) => void;
  native.listen.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const callback = vi.fn(),
    stop = vi.fn();
  const { unmount } = renderHook(() => useFileDropHandler(callback));
  await act(async () => {});
  unmount();
  await act(async () => {
    finish(stop);
  });
  native.listen.mock.calls[0][0]({ payload: { type: "drop", paths: ["/model.obj"] } });
  expect(stop).toHaveBeenCalledOnce();
  expect(callback).not.toHaveBeenCalled();
});
it("keeps one StrictMode subscription and forwards drops to the latest callback", async () => {
  const stop = vi.fn();
  native.listen.mockResolvedValue(stop);
  const first = vi.fn(),
    latest = vi.fn();
  const { rerender, unmount } = renderHook(({ callback }) => useFileDropHandler(callback), {
    initialProps: { callback: first },
    wrapper: ({ children }) => <StrictMode>{children}</StrictMode>,
  });
  await act(async () => {});
  await waitFor(() => expect(native.listen).toHaveBeenCalledOnce());
  rerender({ callback: latest });
  native.listen.mock.calls.slice(-1)[0][0]({ payload: { type: "drop", paths: ["/model.obj"] } });
  expect(latest).toHaveBeenCalledOnce();
  expect(first).not.toHaveBeenCalled();
  expect(native.listen).toHaveBeenCalledOnce();
  unmount();
  expect(stop).toHaveBeenCalledOnce();
});
