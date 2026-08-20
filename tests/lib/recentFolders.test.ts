import { describe, it, expect, beforeEach } from "vitest";
import { getRecentFolders, pushRecentFolder } from "../../src/lib/recentFolders";

describe("recentFolders", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts empty", () => {
    expect(getRecentFolders()).toEqual([]);
  });

  it("stores most recent first", () => {
    pushRecentFolder("/a");
    pushRecentFolder("/b");
    expect(getRecentFolders()).toEqual(["/b", "/a"]);
  });

  it("de-duplicates by moving an existing folder to the front", () => {
    pushRecentFolder("/a");
    pushRecentFolder("/b");
    pushRecentFolder("/a");
    expect(getRecentFolders()).toEqual(["/a", "/b"]);
  });

  it("caps the list at five entries", () => {
    for (const path of ["/1", "/2", "/3", "/4", "/5", "/6"]) pushRecentFolder(path);
    expect(getRecentFolders()).toEqual(["/6", "/5", "/4", "/3", "/2"]);
  });

  it("ignores malformed storage contents", () => {
    localStorage.setItem("assetbox.recentFolders", "not json");
    expect(getRecentFolders()).toEqual([]);
  });
});
