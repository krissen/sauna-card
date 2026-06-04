#!/usr/bin/env node
// Sync package.json (and package-lock.json if present) with the current git tag.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

function getVersion() {
  try {
    const tag = execSync("git describe --tags --abbrev=0", {
      stdio: ["pipe", "pipe", "ignore"],
    })
      .toString()
      .trim();
    // Strip leading 'v' and any pre-release suffix like '-beta1'.
    return tag.replace(/^v/, "").replace(/-.*/, "");
  } catch {
    return null; // No tag yet; keep existing version.
  }
}

function writeVersion(file, version) {
  if (!existsSync(file)) return;
  const data = JSON.parse(readFileSync(file, "utf8"));
  data.version = version;
  if (data.packages && data.packages[""]) {
    data.packages[""].version = version;
  }
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

const version = getVersion();
if (version) {
  writeVersion("package.json", version);
  writeVersion("package-lock.json", version);
}
