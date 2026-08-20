import { describe, it, expect, beforeEach } from "vitest";
import { DEFAULT_SESSION, loadSession, saveSession } from "../../src/lib/treeSession";

const KEY = "assetbox.treeSession";

describe("treeSession", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns defaults when nothing is stored", () => {
    expect(loadSession()).toEqual(DEFAULT_SESSION);
  });

  it("round-trips a saved session", () => {
    saveSession({ location: "/assets", expanded: ["/assets/sub"], sort: "size" });
    const session = loadSession();
    expect(session.location).toBe("/assets");
    expect(session.expanded).toEqual(["/assets/sub"]);
    expect(session.sort).toBe("size");
    // Untouched fields keep their defaults.
    expect(session.modelsOnly).toBe(true);
  });

  it("merges successive partial saves", () => {
    saveSession({ location: "/assets" });
    saveSession({ modelsOnly: false });
    expect(loadSession()).toMatchObject({ location: "/assets", modelsOnly: false });
  });

  it("falls back per field when the payload is malformed", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ location: 42, expanded: ["/ok", 7], sort: "nonsense", width: "wide" })
    );
    const session = loadSession();
    expect(session.location).toBeNull();
    expect(session.expanded).toEqual(["/ok"]);
    expect(session.sort).toBe("name");
    expect(session.width).toBe(DEFAULT_SESSION.width);
  });

  it("ignores unparseable storage", () => {
    localStorage.setItem(KEY, "{{{");
    expect(loadSession()).toEqual(DEFAULT_SESSION);
  });
});
