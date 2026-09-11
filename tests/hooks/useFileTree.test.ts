import { act, renderHook } from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { useFileTree } from "../../src/hooks/useFileTree";
import {
  listDirectory,
  searchFiles,
  watchDirectory,
  type DirEntry,
} from "../../src/hooks/useTauriCommand";

const events = vi.hoisted(() => ({
  handler: undefined as
    | undefined
    | ((event: { payload: { root: string; paths: string[] } }) => void),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (_name, handler) => {
    events.handler = handler;
    return vi.fn();
  }),
}));
vi.mock("../../src/hooks/useTauriCommand", () => ({
  listDirectory: vi.fn(),
  searchFiles: vi.fn(),
  watchDirectory: vi.fn(async () => {}),
}));
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function entry(path: string, isDir = false): DirEntry {
  return {
    path,
    name: path.split("/").pop()!,
    isDir,
    kind: isDir ? "dir" : "model",
    hasChildren: isDir,
    fileSize: 1,
    modified: 1,
    thumbnailPath: null,
  };
}
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.mocked(listDirectory).mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

it.each([false, true])(
  "keeps the latest root and watcher when an older listing settles (failure=%s)",
  async (failure) => {
    const old = deferred<DirEntry[]>();
    vi.mocked(listDirectory).mockImplementation(async (path) =>
      path === "/A" ? old.promise : [entry("/B/new.obj")]
    );
    const { result } = renderHook(() => useFileTree());
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.navigate("/A");
    });
    await act(async () => {
      await result.current.navigate("/B");
    });
    await act(async () => {
      if (failure) old.reject(new Error("old failure"));
      else old.resolve([entry("/A/old.obj")]);
      await pending;
    });
    expect(result.current.location).toBe("/B");
    expect(result.current.rows.map((row) => row.path)).toEqual(["/B/new.obj"]);
    expect(vi.mocked(watchDirectory).mock.calls.slice(-1)[0]).toEqual(["/B"]);
  }
);

it("restores nested expansions using freshly fetched parents", async () => {
  vi.mocked(listDirectory).mockImplementation(async (path) =>
    path === "/A"
      ? [entry("/A/sub", true)]
      : path === "/A/sub"
        ? [entry("/A/sub/nested", true)]
        : [entry("/A/sub/nested/model.obj")]
  );
  const { result } = renderHook(() => useFileTree());
  await act(async () => {
    await result.current.navigate("/A", { expand: ["/A/sub/nested", "/A/sub"] });
  });
  expect(result.current.rows.map((row) => row.path)).toContain("/A/sub/nested/model.obj");
});

it("does not let an old expansion overwrite a refreshed listing", async () => {
  const old = deferred<DirEntry[]>();
  vi.mocked(listDirectory).mockResolvedValue([entry("/A/sub", true)]);
  const { result } = renderHook(() => useFileTree());
  await act(async () => {
    await result.current.navigate("/A");
  });
  vi.mocked(listDirectory).mockReturnValueOnce(old.promise);
  let pending!: Promise<void>;
  act(() => {
    pending = result.current.toggle("/A/sub");
  });
  vi.mocked(listDirectory).mockImplementation(async (path) =>
    path === "/A" ? [entry("/A/sub", true)] : [entry("/A/sub/new.obj")]
  );
  await act(async () => {
    await result.current.refresh();
  });
  await act(async () => {
    old.resolve([entry("/A/sub/old.obj")]);
    await pending;
  });
  expect(result.current.rows.map((row) => row.path)).toContain("/A/sub/new.obj");
  expect(result.current.rows.map((row) => row.path)).not.toContain("/A/sub/old.obj");
});

it("ignores stale search results and their spinner completion", async () => {
  const first = deferred<DirEntry[]>(),
    second = deferred<DirEntry[]>();
  vi.mocked(searchFiles).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const { result } = renderHook(() => useFileTree());
  await act(async () => {
    await result.current.navigate("/A");
  });
  act(() => result.current.search.setQuery("first"));
  await act(async () => vi.advanceTimersByTimeAsync(200));
  act(() => result.current.search.setQuery("second"));
  await act(async () => vi.advanceTimersByTimeAsync(200));
  await act(async () => {
    first.resolve([entry("/A/first.obj")]);
  });
  expect(result.current.search.searching).toBe(true);
  expect(result.current.search.results).toEqual([]);
  await act(async () => {
    second.resolve([entry("/A/second.obj")]);
  });
  expect(result.current.search.results[0].name).toBe("second.obj");
  expect(result.current.search.searching).toBe(false);
});

it("invalidates source edits and manual refresh, but not exports or old-root events", async () => {
  const invalidate = vi.fn();
  const { result } = renderHook(() => useFileTree(invalidate));
  await act(async () => {
    await result.current.navigate("/A");
  });
  const emit = async (root: string, paths: string[]) => {
    await act(async () => {
      events.handler!({ payload: { root, paths } });
      await vi.advanceTimersByTimeAsync(300);
    });
  };
  await emit("/old", ["/old/model.obj"]);
  await emit("/A", ["/A/chair.glb_thumbnail.png", "/A/chair.glb_report.html"]);
  expect(invalidate).not.toHaveBeenCalled();
  await emit("/A", ["/A/textures/wood.png", "/A/chair.bin"]);
  expect(invalidate).toHaveBeenCalledWith(["/A/textures/wood.png", "/A/chair.bin"]);
  await act(async () => {
    await result.current.refresh();
  });
  expect(invalidate).toHaveBeenLastCalledWith(null);
});
