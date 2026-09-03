# Japanese portable CV / VCV / CVVC for Amadeus Studio

A deliberately small Japanese `role = "language"` plugin for the Amadeus `amadeus.plugin/v1` ABI.
It converts Japanese lyrics to canonical Japanese Sinsy/NEUTRINO-style phones and emits a
`neutrino_sinsy_v1` score. It does **not** load an UTAU voicebank and does **not** infer oto timings.

## What it accepts

- CV kana: `か` → `k a`
- VCV alias syntax: `a か` → `k a`, `- あ` → `a`
- explicit CVVC fragments: `a k` stays `a k`
- katakana and NFC-normalized kana
- `ん` → `N`, `っ` → `cl`
- `ー` repeats the preceding vowel
- explicit `phoneOverride` using the canonical phone inventory
- explicit `pau`, `sil`, `br` gaps from the authored track

Unsupported morae are errors rather than guesses.

## Vowel anchoring

With **Vowel anchoring** enabled, a mora such as `か = k a` tries to put `a` exactly on the
mora/note boundary and borrows the configured consonant lead time from the preceding material.
If there is no room, it degrades by delaying the vowel rather than creating invalid overlap.
This is purely a timing rule; there is no model or voicebank inference.

Defaults:

- vowel anchoring: on
- consonant lead: 70 ms

## Build

```bash
npm install
npm run release
```

The installable package is:

```text
dist/
  plugin.iife.js
  plugin.toml
```

Install the resulting `dist/` package from Amadeus Studio via **View → Plugins**.

The IIFE is bundled for a browser/QuickJS-like runtime and the build rejects residual imports,
exports, `node:` references, or `Bun.*` runtime dependencies. `plugin.toml` gets the bundle SHA-256.

## Test

```bash
npm test
```

Tests cover kana/katakana, decomposed dakuten normalization, VCV alias stripping, explicit CVVC,
long vowels, tempo conversion, vowel anchoring on/off, stable phone IDs, and timing-edit finalization.

## Deliberate non-goals

- no `oto.ini` or `presamp.ini` lookup
- no automatic alias probing against a singer
- no pitch-accent dictionary
- no morphological tokenizer
- no ML/G2P fallback
- no OpenUtau consonant substitutions based on voicebank availability

Those features would make the package less portable and would introduce inference not requested here.

## Attribution / design references

The alias conventions and CVVC transition shape are informed by OpenUtau's Japanese legacy
phonemizers (MIT). The Amadeus lifecycle/package shape follows the public Amadeus plugin spec and
uses only the published `@amsvs/api`. Vowel anchoring follows the same general timing concept used by
Cephome, but this implementation is standalone and Japanese-specific.
