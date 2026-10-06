// Bundles the site's React components with esbuild and compiles Tailwind v4 CSS, for local testing only.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
const require = createRequire("/opt/npm-tools/node_modules/");
const esbuild = require("esbuild");
const tw = require("tailwindcss");
const H = path.dirname(new URL(import.meta.url).pathname);
const WEB = path.resolve(H, "../../web");
const OUT = path.join(H, "out");

// Which pages to build: `node build.mjs` = all; `node build.mjs office` = just the office, etc.
const PAGES = { site: ["entry.jsx", "bundle.js", "index.html"], office: ["office-entry.jsx", "bundle-office.js", "office.html"], crew: ["crew-entry.jsx", "bundle-crew.js", "crew.html"] };
const want = process.argv.slice(2).filter((a) => PAGES[a]);
const build = want.length ? want : Object.keys(PAGES);
for (const name of build) {
  const [entry, outJs, html] = PAGES[name];
  await esbuild.build({
    entryPoints: [path.join(H, entry)],
    bundle: true,
    outfile: path.join(OUT, outJs),
    jsx: "automatic",
    format: "iife",
    minify: false,
    sourcemap: false,
    nodePaths: ["/opt/npm-tools/node_modules"],
    alias: { "framer-motion": path.join(H, "fm-stub.jsx") },
    tsconfig: path.join(WEB, "tsconfig.json"),
    define: { "process.env.NODE_ENV": '"development"' },
    logLevel: "warning"
  });
  const title = { site: "TelineKiito (test build)", office: "TelineKiito – Toimisto (test)", crew: "TelineKiito – Työmaa (test)" }[name];
  const extra = name === "crew" ? '<link rel="manifest" href="/crew.webmanifest">' : "";
  fs.writeFileSync(path.join(OUT, html), `<!doctype html><html lang="fi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>${title}</title>${extra}<link rel="stylesheet" href="/site.css"></head><body><div id="root"></div><script src="/${outJs}"></script></body></html>`);
}
// Static files from web/public (manifest, service worker, icons).
const PUB = path.join(WEB, "public");
if (fs.existsSync(PUB)) for (const f of fs.readdirSync(PUB)) if (fs.statSync(path.join(PUB, f)).isFile()) fs.copyFileSync(path.join(PUB, f), path.join(OUT, f));

// Tailwind: collect candidate class names from all source files.
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (f === "node_modules") continue; if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(tsx?|jsx?)$/.test(f)) files.push(p); } })(WEB);
const cand = new Set();
for (const f of files) for (const tok of fs.readFileSync(f, "utf8").split(/[\s"'`{}]+|\$\{/)) if (tok && tok.length < 120) cand.add(tok);
const css = fs.readFileSync(path.join(WEB, "app/globals.css"), "utf8");
const compiler = await tw.compile(css, {
  base: path.join(WEB, "app"),
  loadStylesheet: async (id, base) => {
    const p = id === "tailwindcss" ? "/opt/npm-tools/node_modules/tailwindcss/index.css" : path.resolve(base, id);
    return { path: p, base: path.dirname(p), content: fs.readFileSync(p, "utf8") };
  }
});
fs.writeFileSync(path.join(OUT, "site.css"), compiler.build([...cand]));
console.log("built", build.join(", "), "+", fs.statSync(path.join(OUT, "site.css")).size, "bytes css,", cand.size, "candidates");
