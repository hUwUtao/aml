const root = import.meta.dir;
const packageFiles = await Array.fromAsync(
  new Bun.Glob("packages/*/package.json").scan({ cwd: root }),
);

const configs = await Promise.all(
  packageFiles.sort().map(async (packageFile) => {
    const packageRoot = `${root}/${packageFile.slice(0, -"/package.json".length)}`;
    const packageJson = await Bun.file(`${root}/${packageFile}`).json();
    if (packageJson.utility === true) return null;
    const pluginId = packageJson.pluginId;
    if (typeof pluginId !== "string" || !pluginId) {
      throw new Error(`${packageFile}: pluginId is required`);
    }

    const outputRoot = `${root}/dist/${pluginId}`;
    return {
      cwd: packageRoot,
      entry: "src/plugin.ts",
      format: "iife",
      minify: true,
      platform: "browser",
      target: "es2020",
      outDir: outputRoot,
      clean: true,
      deps: {
        alwaysBundle: Object.keys(packageJson.dependencies ?? {}),
        onlyBundle: false,
      },
      hooks: {
        async "build:done"() {
          const output = `${outputRoot}/plugin.iife.js`;
          const code = await Bun.file(output).text();
          if (/(^|[;\n])\s*(?:import|export)\s|\bBun\.(?:file|write|Glob|env|spawn)\s*\(|\brequire\s*\(/.test(code)) {
            throw new Error(`${packageFile}: bundle is not QuickJS/self-contained`);
          }
          const digest = await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(code),
          );
          const sha256 = [...new Uint8Array(digest)]
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join("");
          const role = packageJson.pluginRole ?? "language";
          const manifest = `#
protocol = "amadeus.plugin/v1"
id = "${pluginId}"
version = "${packageJson.version}"
name = "${packageJson.pluginName ?? packageJson.name}"
role = "${role}"
runtime = "quickjs"
entry = "plugin.iife.js"
sha256 = "${sha256}"
enabled_by_default = true
order = 10
`;
          await Bun.write(`${outputRoot}/plugin.toml`, manifest);
        },
      },
    };
  }),
);

export default configs.filter((config) => config !== null);
