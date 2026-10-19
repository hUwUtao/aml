# UST and USTX import notes

## What the formats are

`.ust` is UTAU's classic sequence text format, also accepted and written by OpenUtau. It is a
text stream divided into named blocks such as `[#SETTING]`, numbered note blocks, and terminal
`[#TRACKEND]`; parameters are `key=value` lines. OpenUtau's reader detects the text encoding from
an optional `Charset=` setting in the first ten lines and otherwise defaults to Shift-JIS. Its
reader parses one UST as one track/voice part. `[#SETTING]` carries project defaults such as
tempo; note blocks carry lyric, MIDI note number, length, optional tempo changes, expression/flag
values, vibrato, and pitch-bend fields. OpenUtau's parser supports both legacy `Length`-only
sequential notes and the UST 2.0 `Delta` + `Duration` + `Length` representation. [OpenUtau `Ust.cs`](https://github.com/openutau/OpenUtau/blob/master/OpenUtau.Core/Classic/Ust.cs)
and [OpenUtau `UstNote.cs`](https://github.com/openutau/OpenUtau/blob/master/OpenUtau.Core/Classic/UstNote.cs)
are the implementation references.

`.ustx` is OpenUtau's project format: UTF-8 YAML 1.2. The upstream format page describes a
project-wide resolution of 480 ticks per quarter note, tempo and time-signature maps, tracks,
voice parts, and optional wave parts. Notes carry start and duration in ticks, MIDI tone, lyric,
pitch control points, vibrato, per-phoneme expressions, and phoneme overrides. Voice-part
positions are project-relative; note positions are relative to their voice part. Curves carry
sample positions and expression abbreviations. The format page explicitly recommends a YAML 1.2
parser. [OpenUtau USTX file format](https://github.com/openutau/OpenUtau/wiki/USTX-file-format)
and the [official USTX implementation directory](https://github.com/openutau/OpenUtau/tree/master/OpenUtau.Core/Ustx)
are the primary references. OpenUtau's [Getting Started guide](https://github.com/openutau/OpenUtau/wiki/Getting-Started)
lists `.ustx` as its project save format and `.ust` as an importable UTAU project format.

## Tuning and meaning to preserve

- Treat both as **score/project imports**, not as a phoneme or tuning-only sidecar. Preserve each
  authored note's absolute start, duration, MIDI pitch, and lyric. UST ordering and rests matter:
  UST note positions are reconstructed from preceding note end (or, in v2 blocks, preceding note
  position plus `Delta`); lyric `R` is a rest rather than a sung note.
- Preserve pitch bends as pitch automation if AML's authored-score schema supports it. In UST,
  `PBS` gives the initial pitch point, `PBW` supplies successive horizontal distances, `PBY` the
  pitch offsets, and `PBM` the point interpolation shapes; OpenUtau's parser reconstructs the point
  sequence from those fields. Do not flatten these into note semitones or discard them silently.
  [OpenUtau `UstNote.ParsePitchBend`](https://github.com/openutau/OpenUtau/blob/master/OpenUtau.Core/Classic/UstNote.cs)
- USTX pitch control points are explicitly present on notes, alongside vibrato and phoneme-level
  overrides/expressions. Curve `xs` use ticks. Importing only the note list would lose authored
  tuning and automation. [USTX note and curve schema](https://github.com/openutau/OpenUtau/wiki/USTX-file-format#voice-parts)
- UST can carry note-local tempo changes; USTX has project tempo points at tick positions. Build
  the AML tempo map from these before converting ticks to wall-clock time. USTX resolution is 480
  PPQ per the format page; do not assume that for UST without checking the input conventions.
- UST's `Flags`, `Velocity`, `Intensity`, `Modulation`, `Envelope`, `VBR`, and `t` tuning flag are
  resampler/UTAU semantics, not generic MIDI equivalents. OpenUtau interprets some `t` flags as
  tuning based on the selected `Tool2` resampler. Preserve supported values as source metadata or
  report unsupported/lossy fields; do not reinterpret arbitrary resampler flags as universal pitch
  curves. [OpenUtau `Ust.cs` note mapping](https://github.com/openutau/OpenUtau/blob/master/OpenUtau.Core/Classic/Ust.cs)
- USTX can contain multiple tracks, voice parts, and external wave parts. Importing a single track
  must select/flatten deliberately while preserving project offsets; importing the whole project
  should retain track/part relationships and audio references where AML can represent them.
- Keep lyrics verbatim at import time. A UST lyric may be a phonemizer/voicebank-specific alias
  (including CV/VCV forms), not ordinary language text. Language-to-phone conversion belongs to
  a later phonemizer stage; don't guess or normalize aliases in the file importer.

## Importer implementation implications for AML

1. Route `.ust` and `.ustx` through a file-import capability that returns AML's authored score
   representation. Do not implement them as `role = "language"` plugins: those consume authored
   lyrics and create phone plans, while this importer must create notes, timing, pitch, and maps.
2. Parse UST as an INI-like block stream, splitting each parameter at its first `=` so lyrics or
   paths containing `=` survive. Support `[#SETTING]`, numbered note sections, and terminators;
   use declared `Charset` when present and robustly handle UTF-8/Shift-JIS. Handle UST's two
   timing conventions and USTX's YAML 1.2 schema explicitly.
3. Keep score time in ticks through parse and mapping. Merge part offsets with note positions,
   apply tempo events to AML's tempo map, preserve MIDI note number without octave renumbering,
   and convert relative pitch-control points into AML's absolute coordinate convention only at
   the mapping boundary.
4. Return structured diagnostics for unrepresentable fields (voicebank paths, resampler flags,
   phoneme overrides, wave assets, or interpolation shapes). Preserve original values in metadata
   when possible so later plugin or UI layers can make a deliberate choice.

The UST/USTX notes above describe OpenUtau's documented format and current reader behavior; UST
files in the wild vary in encoding, version, and producer-specific flags. AML should reject malformed
required structure clearly and treat unknown optional keys as forward-compatible metadata.
