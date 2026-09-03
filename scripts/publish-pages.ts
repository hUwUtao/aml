const root = import.meta.dir.replace(/\/scripts$/, "");
const siteDir = `${root}/site`;

await Bun.$`rm -rf ${siteDir}`;
await Bun.$`mkdir -p ${siteDir}/dist`;

const packageFiles = await Array.fromAsync(
  new Bun.Glob("packages/*/package.json").scan({ cwd: root }),
);
const published = [];

for (const packageFile of packageFiles.sort()) {
  const packageJson = await Bun.file(`${root}/${packageFile}`).json();
  const pluginId = packageJson.pluginId;
  if (typeof pluginId !== "string" || !pluginId) {
    throw new Error(`${packageFile}: pluginId is required`);
  }
  const source = `${root}/dist/${pluginId}`;
  const target = `${siteDir}/dist/${pluginId}`;
  const manifest = await Bun.file(`${source}/plugin.toml`).text();
  const manifestId = /^id = "([^"]+)"$/m.exec(manifest)?.[1];
  if (manifestId !== pluginId) {
    throw new Error(`${packageFile}: manifest id ${manifestId ?? "<missing>"} does not match ${pluginId}`);
  }
  await Bun.$`mkdir -p ${target}`;

  for await (const file of new Bun.Glob("**/*").scan({ cwd: source, onlyFiles: true })) {
    await Bun.write(`${target}/${file}`, Bun.file(`${source}/${file}`));
  }
  published.push({
    name: packageJson.pluginName ?? packageJson.name,
    id: pluginId,
    version: packageJson.version,
    path: `dist/${pluginId}/`,
  });
}

await Bun.write(
  `${siteDir}/index.html`,
  `<!doctype html><meta charset="utf-8"><title>Amadeus language plugins</title><h1>Amadeus language plugins</h1><ul>${published.map((item) => `<li><a href="${item.path}">${item.name}</a> ${item.version}</li>`).join("")}</ul>`,
);
await Bun.write(`${siteDir}/plugins.json`, JSON.stringify(published, null, 2) + "\n");
console.log(`published ${published.length} plugin(s) to site/`);
