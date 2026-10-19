# Synthesizer V SVP import research

Synthesizer V Studio projects use `.svp` and the file contains project editing data, including tracks, notes, tempo, and meter. SVP is JSON. The project time map stores tempo positions and note onsets/durations in blicks; a quarter note is 705,600,000 blicks. Notes contain MIDI pitch, lyrics, and phonemes. Singer tracks expose their note group as `mainGroup` and vocal parameter curves in `mainGroup.parameters`.

The importer converts blicks to AML's 480 PPQ ticks, rounds positions to the nearest tick, imports tempo and bar-indexed meter changes, and imports notes from each track's `mainGroup`. The track's raw source JSON is retained in extensions. `pitchDelta` points are additionally projected onto the notes they fall within, as note-local cents points. SynthV system-generated pitch (`mainRef.systemPitchDelta`) and non-pitch vocal parameters remain preserved raw because they are separate from the editable pitchDelta curve.

Sources:

- [Synthesizer V Studio 2 project manual](https://sv2.docs.dreamtonics.com/en/project) identifies `.svp` as the project format and describes project contents and supported import/export workflows.
- [Synthesizer V JSON bridge format example](https://github.com/SynthVCopilot/SV1_Harmony_API) documents the track, note, tempo, meter, and parameter structure and the 705,600,000 blick quarter note.
- [Synthesizer V SVP format notes](https://je1ght.top/posts/svp-project-file-format/) describes `mainGroup` notes and track-level groups/parameters; this is community documentation because Dreamtonics does not publish a complete SVP schema.

Scope limitation: only `mainGroup.notes` is emitted as AML notes. Other group data, instrumental/audio tracks, voice-library references, synthesis settings, and all raw per-track fields remain available in the imported track's source extension.
