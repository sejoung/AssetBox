#!/usr/bin/env node

/**
 * Bump version across all project files and create a git tag.
 *
 * Usage:
 *   node scripts/bump-version.js patch   # 0.1.0 → 0.1.1
 *   node scripts/bump-version.js minor   # 0.1.0 → 0.2.0
 *   node scripts/bump-version.js major   # 0.1.0 → 1.0.0
 *   node scripts/bump-version.js 0.3.0   # set exact version
 */

import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";

const PACKAGE_JSON = "package.json";
const PACKAGE_LOCK = "package-lock.json";
const TAURI_CONF = "src-tauri/tauri.conf.json";
const CARGO_TOML = "src-tauri/Cargo.toml";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

function bumpVersion(current, type) {
  const [major, minor, patch] = current.split(".").map(Number);
  switch (type) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    default:
      // Exact version provided
      if (/^\d+\.\d+\.\d+$/.test(type)) return type;
      console.error(`Invalid version type: ${type}`);
      process.exit(1);
  }
}

// Parse args
const type = process.argv[2];
if (!type) {
  console.error("Usage: node scripts/bump-version.js <patch|minor|major|x.y.z>");
  process.exit(1);
}

// Read current version from package.json
const pkg = readJson(PACKAGE_JSON);
const currentVersion = pkg.version;
const newVersion = bumpVersion(currentVersion, type);

console.log(`Bumping version: ${currentVersion} → ${newVersion}`);

// 1. Update package.json
pkg.version = newVersion;
writeJson(PACKAGE_JSON, pkg);
console.log(`  ✓ ${PACKAGE_JSON}`);

// 2. Update package-lock.json (version fields only; deps are managed by npm)
const lock = readJson(PACKAGE_LOCK);
lock.version = newVersion;
if (lock.packages && lock.packages[""]) lock.packages[""].version = newVersion;
writeJson(PACKAGE_LOCK, lock);
console.log(`  ✓ ${PACKAGE_LOCK}`);

// 3. Update tauri.conf.json
const tauriConf = readJson(TAURI_CONF);
tauriConf.version = newVersion;
writeJson(TAURI_CONF, tauriConf);
console.log(`  ✓ ${TAURI_CONF}`);

// 4. Update Cargo.toml
let cargoToml = readFileSync(CARGO_TOML, "utf-8");
cargoToml = cargoToml.replace(/^version = ".*"$/m, `version = "${newVersion}"`);
writeFileSync(CARGO_TOML, cargoToml);
console.log(`  ✓ ${CARGO_TOML}`);

// 5. Update Cargo.lock
try {
  execSync("cargo generate-lockfile", { cwd: "src-tauri", stdio: "ignore" });
  console.log("  ✓ Cargo.lock");
} catch {
  console.log("  ⚠ Cargo.lock (skipped — cargo not available)");
}

// 6. Git commit + tag
execSync(`git add ${PACKAGE_JSON} ${PACKAGE_LOCK} ${TAURI_CONF} ${CARGO_TOML} src-tauri/Cargo.lock`, {
  stdio: "inherit",
});
execSync(`git commit -m "chore: bump version to ${newVersion}"`, { stdio: "inherit" });
execSync(`git tag v${newVersion}`, { stdio: "inherit" });

console.log(`\nDone! Tagged v${newVersion}`);
console.log(`Run 'git push origin main --tags' to trigger release.`);
