# Synthesizer V SVP import research

Synthesizer V Studio projects use `.svp` and the file contains project editing data, including tracks, notes, tempo, and meter. SVP is JSON. The project time map stores tempo positions and note onsets/durations in blicks; a quarter note is 705,600,000 blicks. Notes contain MIDI pitch, lyrics, and phonemes. Singer tracks expose their note group as `mainGroup` and vocal parameter curves in `mainGroup.parameters`.

The importer converts blicks to AML's 480 PPQ ticks, rounds positions to the nearest tick, imports tempo and bar-indexed meter changes, and imports notes from each track's `mainGroup`. The track's raw source JSON is retained in extensions. `pitchDelta` points are additionally projected onto the notes they fall within, as note-local cents points. SynthV system-generated pitch (`mainRef.systemPitchDelta`) and non-pitch vocal parameters remain preserved raw because they are separate from the editable pitchDelta curve.

The file payload is treated as one JSON document with an optional trailing NUL terminator. Before UTF-8 decoding, the importer strips a UTF-8 BOM and trailing NUL/JSON-whitespace padding from the byte buffer. Already-decoded string inputs receive equivalent cleanup before JSON parsing. Interior NUL bytes, multiple documents, and arbitrary trailing data are not removed or merged. LibreSVIP's reader removes a trailing NUL before decoding, and its writer appends that byte for older version compatibility; this directly supports terminator handling. UtaFormatix also supports splitting on NUL, but that is a different compatibility policy and is not evidence that a particular file contains multiple projects.

Parser audit (2026-10-30): compared the supported fields against the supplied `synthv-svp-v153.inferred.schema.json`, then cross-checked the blick constant against Dreamtonics' scripting manual and serialized field use against UtaFormatix's loader. The supplied schema identifies itself as an unofficial, specimen-derived structural validator, so it is not used as a strict import gate.

| Area | Verified behavior and limits |
| --- | --- |
| Notes | `onset`/`duration` are blick integers, `pitch` is MIDI, and `lyrics` is text. Conversion uses 705,600,000 blicks per quarter and 480 PPQ. Invalid notes are skipped with diagnostics. Negative timing, zero-length notes, unsafe integers, and pitches outside 0–127 cannot be emitted to the host. |
| Time map | `tempo[].position` is in blicks; `meter[].index` is a zero-based measure index. Missing or invalid entries recover to usable defaults. |
| Pitch curves | `pitchDelta.points` is a flat alternating coordinate/value array. Invalid pairs are skipped. Other curve data is preserved raw in the source track. |
| Loose metadata | Unknown fields and version values are accepted. Group name/UUID, curve mode, attributes, system attributes, retakes, voice, mixer, and render metadata are not required to emit valid notes. Raw note and track fields are retained. |
| Unsupported semantics | Library-group references and time/pitch offsets from `mainRef`/`groups` are not applied. Note `detune`, newer pitch controls, and system-generated pitch are not converted into host pitch expression. Preserving raw fields does not implement their playback semantics. |

Sources:

- [Synthesizer V Studio 2 project manual](https://sv2.docs.dreamtonics.com/en/project) identifies `.svp` as the project format and describes project contents and supported import/export workflows.
- [Synthesizer V JSON bridge format example](https://github.com/SynthVCopilot/SV1_Harmony_API) documents the track, note, tempo, meter, and parameter structure and the 705,600,000 blick quarter note.
- [Synthesizer V SVP format notes](https://je1ght.top/posts/svp-project-file-format/) describes `mainGroup` notes and track-level groups/parameters; this is community documentation because Dreamtonics does not publish a complete SVP schema.
- [LibreSVIP SVP converter](https://github.com/SoulMelody/LibreSVIP/blob/main/libresvip/plugins/svp/synthv_studio_converter.py) removes a trailing NUL and UTF-8 BOM before decoding; its writer conditionally appends a NUL terminator.
- [UtaFormatix SVP reader](https://github.com/sdercolin/utaformatix3/blob/master/core/src/main/kotlin/core/io/Svp.kt) independently maps serialized note, time-map, curve, and group-reference fields.
- [Dreamtonics scripting constants](https://resource.dreamtonics.com/scripting/SV.html#QUARTER), [note properties](https://resource.dreamtonics.com/scripting/Note.html), and [group references](https://resource.dreamtonics.com/scripting/NoteGroupReference.html) document musical units and offset/detune semantics, rather than a complete on-disk JSON schema.

Scope limitation: only `mainGroup.notes` is emitted as AML notes. Raw fields within each emitted track remain available in its source extension. Root `library` data and tracks without emitted notes are not retained by this importer.
