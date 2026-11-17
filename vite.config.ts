import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { defineConfig, type Plugin } from "vite";
import pkg from "./package.json";

// GitHub Pages serves the site from /<repo name>/. Override with BASE=/ for other hosts.
const BASE = process.env.BASE || "/Grips/";

function manifest(base: string) {
  return {
    name: "Open Grips Trainer",
    short_name: "Open Grips",
    description: "Finger-strength trainer for the Prometheus and Sisyphus grippers.",
    id: base,
    start_url: base,
    scope: base,
    display: "standalone",
    orientation: "portrait",
    background_color: "#E4E8E3",
    theme_color: "#0E6655",
    categories: ["health", "fitness", "sports"],
    icons: [
      { src: `${base}icons/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${base}icons/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${base}icons/maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/**
 * Emits the web app manifest, and after the build writes a service worker that precaches
 * every file in dist/ (the whole app shell, fonts and icons). The cache name is a hash of
 * the contents, so each deploy installs fresh and old caches are deleted.
 */
function pwa(): Plugin {
  let outDir = "dist";
  let base = BASE;
  return {
    name: "open-grips-pwa",
    configResolved(c) {
      outDir = c.build.outDir;
      base = c.base;
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "manifest.webmanifest", source: JSON.stringify(manifest(base), null, 2) });
    },
    closeBundle() {
      const files = walk(outDir)
        .map((p) => relative(outDir, p).split(sep).join("/"))
        .filter((f) => f !== "sw.js" && !f.endsWith(".map") && !f.endsWith(".woff") && f !== "404.html" && !f.startsWith("."));
      const hash = createHash("sha256");
      files.sort().forEach((f) => hash.update(f).update(readFileSync(join(outDir, f))));
      const version = hash.digest("hex").slice(0, 12);
      const urls = ["./", ...files.filter((f) => f !== "index.html")];
      const src = readFileSync("src/sw-template.js", "utf8")
        .replace("__VERSION__", version)
        .replace("__PRECACHE__", JSON.stringify(urls));
      writeFileSync(join(outDir, "sw.js"), src);
    },
  };
}

export default defineConfig({
  base: BASE,
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [pwa()],
  build: { target: "es2020", assetsInlineLimit: 0 },
});
