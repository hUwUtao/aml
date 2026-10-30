import { parse as parseYaml } from "yaml";
import type { AuthoredTrack } from "@amsvs/api";
import { PPQ, collect, convertUstxNoteExtensions, dedupeTempo, integer, list, makeTrack, number, object, parseUstxMeters, recover, string, stableId } from "../../import.common/shared";
import type { ImportDiagnostic, SourceNote } from "../../import.common/shared";

export function parseUstx(text: string, filename: string, diagnostics: ImportDiagnostic[] = []): AuthoredTrack[] {
  const root = object(parseYaml(text), "USTX document");
  const resolution = recover(diagnostics, "invalid_resolution", "Using USTX resolution 480", () => {
    const ppq = integer(root.resolution, "USTX resolution", PPQ);
    if (ppq <= 0) throw new Error("USTX resolution must be positive");
    return ppq;
  }, PPQ);
  const tempos = dedupeTempo(collect(list(root.tempos), diagnostics, "tempos", (value, i) => {
    const item = object(value, `tempos[${i}]`);
    const tick = integer(item.position, `tempos[${i}].position`);
    const bpm = number(item.bpm, `tempos[${i}].bpm`);
    if (tick < 0 || bpm <= 0) throw new Error(`tempos[${i}] has invalid position or bpm`);
    return { tick, bpm };
  }));
  if (!tempos.length || tempos[0]!.tick > 0) tempos.unshift({ tick: 0, bpm: recover(diagnostics, "invalid_tempo", "Using USTX tempo 120", () => {
    const bpm = number(root.bpm, "USTX bpm", 120);
    if (bpm <= 0) throw new Error("USTX bpm must be positive");
    return bpm;
  }, 120) });
  const meters = parseUstxMeters(root.time_signatures ?? root.time_signature, resolution, diagnostics);
  const tracks = list(root.tracks);
  const parts = list(root.voice_parts);
  if (!parts.length) throw new Error("USTX project has no voice parts");
  const basename = stableId(filename.replace(/\.[^.]+$/, ""));
  const result = collect(parts, diagnostics, "voice_parts", (partValue, partIndex) => {
    const part = object(partValue, `voice_parts[${partIndex}]`);
    const trackNo = integer(part.track_no, `voice_parts[${partIndex}].track_no`, 0);
    const sourceTrack = recover(diagnostics, "invalid_metadata", `Ignored USTX track ${trackNo} metadata`, () => tracks[trackNo] ? object(tracks[trackNo], `tracks[${trackNo}]`) : {}, {});
    const offset = integer(part.position, `voice_parts[${partIndex}].position`, 0);
    if (offset < 0) throw new Error("USTX part position must be non-negative");
    const noteInputs = collect(list(part.notes), diagnostics, `voice_parts[${partIndex}].notes`, (noteValue, noteIndex) => {
      const n = object(noteValue, `voice_parts[${partIndex}].notes[${noteIndex}]`);
      const start = offset + integer(n.position, `note ${noteIndex}.position`);
      const duration = integer(n.duration, `note ${noteIndex}.duration`);
      const pitch = integer(n.tone, `note ${noteIndex}.tone`);
      if (start < 0 || duration <= 0 || pitch < 0 || pitch > 127) throw new Error(`USTX note ${noteIndex} has invalid timing or MIDI tone`);
      const note: SourceNote = { start, end: start + duration, pitch, lyric: string(n.lyric, `note ${noteIndex}.lyric`), source: n };
      note.extension = convertUstxNoteExtensions(n, note.start, note.end, tempos, resolution, diagnostics);
      if (list(n.phoneme_overrides).length) diagnostics.push({ severity: "warning", code: "preserved_phoneme_overrides",
        message: `USTX note ${noteIndex} phoneme overrides are preserved in extensions; sparse phonemizer-specific edits cannot be applied as a complete phone override` });
      return note;
    });
    const trackName = recover(diagnostics, "invalid_metadata", "Using default USTX track name", () => string(sourceTrack.track_name, `tracks[${trackNo}].track_name`, `Track ${trackNo + 1}`), `Track ${trackNo + 1}`);
    const partName = recover(diagnostics, "invalid_metadata", "Using default USTX part name", () => string(part.name, `voice_parts[${partIndex}].name`, `Part ${partIndex + 1}`), `Part ${partIndex + 1}`);
    const extentEnd = recover(diagnostics, "invalid_metadata", "Ignored invalid USTX part duration", () => {
      const duration = integer(part.duration, `voice_parts[${partIndex}].duration`, 0);
      if (duration < 0 || !Number.isSafeInteger(offset + duration)) throw new Error("USTX part duration is outside the tick range");
      return offset + duration;
    }, offset);
    return makeTrack({
      id: `${basename}_${trackNo + 1}_${partIndex + 1}`, name: `${trackName} / ${partName}`,
      notes: noteInputs, tempos, meters, ppq: resolution, extentEnd,
      source: { format: "ustx", version: root.ustx_version ?? null, projectName: root.name ?? null,
        sourceTrack,
        part: Object.fromEntries(Object.entries(part).filter(([key]) => key !== "notes")), curves: list(part.curves), expressions: root.expressions ?? null,
        waveParts: list(root.wave_parts), key: root.key ?? null },
    }, diagnostics);
  });
  if (!result.length) throw new Error("USTX project has no usable voice parts");
  return result;
}
