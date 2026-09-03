import { build } from "esbuild";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const outDir = resolve(root, "dist");
await mkdir(outDir, { recursive: true });

await build({
  entryPoints: [resolve(root, "src/plugin.ts")],
  outfile: resolve(outDir, "plugin.iife.js"),
  bundle: true,
  minify: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  legalComments: "eof",
});

const code = await readFile(resolve(outDir, "plugin.iife.js"), "utf8");
if (/\bimport\s+|\bexport\s+|\b(?:Bun\.|node:)/.test(code)) {
  throw new Error("bundle is not QuickJS/self-contained");
}
const sha256 = createHash("sha256").update(code).digest("hex");
const manifest = `protocol = "amadeus.plugin/v1"\nid = "lang.ja.portable"\nversion = "0.1.0"\nname = "Japanese portable CV/VCV/CVVC"\nrole = "language"\nruntime = "quickjs"\nentry = "plugin.iife.js"\nsha256 = "${sha256}"\nenabled_by_default = true\norder = 10\n`;
await writeFile(resolve(outDir, "plugin.toml"), manifest);
console.log(`dist/plugin.iife.js (${Buffer.byteLength(code)} bytes)`);
console.log(`sha256 ${sha256}`);
