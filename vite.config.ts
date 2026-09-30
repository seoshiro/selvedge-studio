import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
let commit = "local";
try {
  commit = execSync("git rev-parse HEAD", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
} catch {
  /* local first build */
}
export default defineConfig({
  plugins: [
    react(),
    {
      name: "release-manifest",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "release.json",
          source: JSON.stringify({ product: "SELVEDGE", schema: 1, commit }),
        });
      },
    },
  ],
  base: "./",
  define: { __COMMIT__: JSON.stringify(commit) },
  build: { target: "es2022" },
  server: { host: "127.0.0.1", port: 5279, strictPort: true },
});
