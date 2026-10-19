import { parse as parseYaml } from "yaml";
import type { AuthoredTrack, MeterPoint, TempoPoint } from "@amsvs/api";
import { PPQ, convertUstxNoteExtensions, dedupeTempo, integer, list, makeTrack, number, object, parseUstxMeters, string, stableId } from "../../import.common/shared";
import type { AnyRecord, SourceNote } from "../../import.common/shared";

export function parseUstx(text: string, filename: string): AuthoredTrack[] {
  const root = object(parseYaml(text), "USTX document");
  const resolution = integer(root.resolution, "USTX resolution", PPQ);
  if (resolution <= 0) throw new Error("USTX resolution must be positive");
  const tempos = dedupeTempo(list(root.tempos).map((value, i) => {
    const item = object(value, `tempos[${i}]`);
    const tick = integer(item.position, `tempos[${i}].position`);
    const bpm = number(item.bpm, `tempos[${i}].bpm`);
    if (tick < 0 || bpm <= 0) throw new Error(`tempos[${i}] has invalid position or bpm`);
    return { tick, bpm };
  }));
  if (!tempos.length || tempos[0]!.tick > 0) tempos.unshift({ tick: 0, bpm: number(root.bpm, "USTX bpm", 120) });
  const meters = parseUstxMeters(root.time_signatures ?? root.time_signature, resolution);
  const tracks = list(root.tracks);
  const parts = list(root.voice_parts);
  if (!parts.length) throw new Error("USTX project has no voice parts");
  const basename = stableId(filename.replace(/\.[^.]+$/, ""));
  return parts.map((partValue, partIndex) => {
    const part = object(partValue, `voice_parts[${partIndex}]`);
    const trackNo = integer(part.track_no, `voice_parts[${partIndex}].track_no`, 0);
    const sourceTrack = tracks[trackNo] ? object(tracks[trackNo], `tracks[${trackNo}]`) : {};
    const offset = integer(part.position, `voice_parts[${partIndex}].position`, 0);
    const noteInputs = list(part.notes).map((noteValue, noteIndex) => {
      const n = object(noteValue, `voice_parts[${partIndex}].notes[${noteIndex}]`);
      const start = offset + integer(n.position, `note ${noteIndex}.position`);
      const duration = integer(n.duration, `note ${noteIndex}.duration`);
      const pitch = integer(n.tone, `note ${noteIndex}.tone`);
      if (start < 0 || duration <= 0 || pitch < 0 || pitch > 127) throw new Error(`USTX note ${noteIndex} has invalid timing or MIDI tone`);
      const note: SourceNote = { start, end: start + duration, pitch, lyric: string(n.lyric, `note ${noteIndex}.lyric`), source: n };
      note.extension = convertUstxNoteExtensions(n, note.start, note.end, tempos, resolution);
      return note;
    });
    const trackName = string(sourceTrack.track_name, `tracks[${trackNo}].track_name`, `Track ${trackNo + 1}`);
    const partName = string(part.name, `voice_parts[${partIndex}].name`, `Part ${partIndex + 1}`);
    return makeTrack({
      id: `${basename}_${trackNo + 1}_${partIndex + 1}`, name: `${trackName} / ${partName}`,
      notes: noteInputs, tempos, meters, ppq: resolution, extentEnd: offset + integer(part.duration, `voice_parts[${partIndex}].duration`, 0),
      source: { format: "ustx", version: root.ustx_version ?? null, projectName: root.name ?? null,
        sourceTrack: { track_name: sourceTrack.track_name, singer: sourceTrack.singer, phonemizer: sourceTrack.phonemizer },
        part: { name: part.name, position: offset, duration: part.duration }, curves: list(part.curves),
        waveParts: list(root.wave_parts), key: root.key ?? null },
    });
  });
}
