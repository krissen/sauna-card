import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

function gitVersion(): string {
  try {
    return execSync("git describe --exact-match --tags", {
      stdio: ["pipe", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    // No exact tag — fall back to the short commit SHA.
    try {
      return execSync("git rev-parse --short HEAD", {
        stdio: ["pipe", "pipe", "ignore"],
      })
        .toString()
        .trim();
    } catch {
      // No git metadata at all (e.g. building from a source tarball).
      return "0.0.0-unknown";
    }
  }
}

export default defineConfig({
  define: {
    __VERSION__: JSON.stringify(gitVersion()),
  },
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "saunaCard",
      fileName: () => "sauna-card.js",
      formats: ["es"],
    },
    rollupOptions: {
      external: [],
      output: { sourcemap: false },
    },
  },
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.ts"],
  },
});
