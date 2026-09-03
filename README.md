# Amadeus language plugins

A contrib collection of language support for AMADEUS.

Feel free to PR your own implementation. However, this repo does not have a strict policy or quatest against agentic programming. This repo is not a limitation to how you can distribute your plugins.

For attribution, git attribution may not stripped. However, you also want list yourself as `author` of respected submodule `package.json` for streamlined addressing.

## Development

Uses `bun`

```bash
bun install
bun run test       # test every plugin
bun run check      # type-check every plugin
bun run build      # build every plugin
bun run pages      # stage dist/<plugin-id>/ for GitHub Pages
bun run release    # test, check, bulk-build, and stage Pages
```

Every plugin package declares a `pluginId` in its `package.json`. The root
`tsdown.config.mts` discovers all packages and writes each artifact to
`dist/<pluginId>/`.

## Minimal standard

- No obfuscated, minified code except dependencies.
- No absurd dependencies and must be AMADEUS runtime compliant. Preferably, the bundled dependencies is none other than the API.
- No malicious code or absurdly unreasonable quality. If you struggle with programming your idea, we can help! (or maybe ask yo AI?)
