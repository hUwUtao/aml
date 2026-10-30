import type { AuthoredTrack, MeterPoint } from "@amsvs/api";
import { PPQ, collect, dedupeTempo, integer, jsonSafe, list, makeTrack, number, object, phoneOverride, recover, string, stableId } from "../../import.common/shared";
import type { AnyRecord, ImportDiagnostic, SourceNote } from "../../import.common/shared";

const SVP_BLICKS_PER_QUARTER = 705_600_000;

export function parseSvp(text: string, filename: string, diagnostics: ImportDiagnostic[] = []): AuthoredTrack[] {
  let project: AnyRecord;
  try { project = object(JSON.parse(text.replace(/^\uFEFF/, "")), "SVP project"); }
  catch (error) { throw new Error(`Invalid SVP JSON: ${error instanceof Error ? error.message : String(error)}`); }
  const time = recover(diagnostics, "invalid_time_map", "Using default SVP time map", () => object(project.time, "SVP time"), {});
  const tempos = dedupeTempo(collect(list(time.tempo), diagnostics, "SVP time.tempo", (value, i) => {
    const item = object(value, `SVP time.tempo[${i}]`);
    const tick = svpBlickToTick(integer(item.position, `SVP time.tempo[${i}].position`));
    const bpm = number(item.bpm, `SVP time.tempo[${i}].bpm`);
    if (tick < 0 || bpm <= 0) throw new Error(`SVP tempo ${i} has invalid position or bpm`);
    return { tick, bpm };
  }));
  if (!tempos.length || tempos[0]!.tick > 0) tempos.unshift({ tick: 0, bpm: 120 });
  const meters = parseSvpMeters(time.meter, diagnostics);
  const sourceTracks = list(project.tracks);
  const basename = stableId(filename.replace(/\.[^.]+$/, ""));
  const tracks = collect(sourceTracks, diagnostics, "SVP tracks", (value, trackIndex) => {
    const track = object(value, `SVP tracks[${trackIndex}]`);
    const group = track.mainGroup && typeof track.mainGroup === "object" ? object(track.mainGroup, `SVP tracks[${trackIndex}].mainGroup`) : {};
    const curve = recover(diagnostics, "invalid_expression", `Ignored invalid pitchDelta in SVP track ${trackIndex}`, () => {
      const parameters = group.parameters === undefined ? {} : object(group.parameters, "SVP mainGroup.parameters");
      return parameters.pitchDelta === undefined ? {} : object(parameters.pitchDelta, "SVP pitchDelta");
    }, {});
    const flatPoints = list(curve.points);
    const curvePoints = collect(Array.from({ length: Math.ceil(flatPoints.length / 2) }, (_, i) => i * 2), diagnostics, `SVP tracks[${trackIndex}].pitchDelta.points`, (value) => {
      const i = value as number;
      return { x: number(flatPoints[i], `SVP pitchDelta.points[${i}]`), y: number(flatPoints[i + 1], `SVP pitchDelta.points[${i + 1}]`) };
    });
    const notes = collect(list(group.notes), diagnostics, `SVP tracks[${trackIndex}].mainGroup.notes`, (value, noteIndex) => {
      const note = object(value, `SVP tracks[${trackIndex}].mainGroup.notes[${noteIndex}]`);
      const start = svpBlickToTick(integer(note.onset, `SVP note[${noteIndex}].onset`));
      const duration = svpBlickToTick(integer(note.duration, `SVP note[${noteIndex}].duration`));
      const pitch = integer(note.pitch, `SVP note[${noteIndex}].pitch`);
      if (start < 0 || duration <= 0 || pitch < 0 || pitch > 127) throw new Error(`SVP note ${noteIndex} has invalid onset, duration, or pitch`);
      const points: { position: number; cents: number }[] = [];
      const startBlick = integer(note.onset, `SVP note[${noteIndex}].onset`);
      const endBlick = startBlick + integer(note.duration, `SVP note[${noteIndex}].duration`);
      if (!Number.isSafeInteger(endBlick)) throw new Error(`SVP note ${noteIndex} end exceeds safe integer range`);
      for (const { x, y } of curvePoints) {
        if (x >= startBlick && x <= endBlick) points.push({ position: (x - startBlick) / (endBlick - startBlick), cents: y });
      }
      const phones = recover(diagnostics, "invalid_expression", `Ignored invalid SVP phonemes on note ${noteIndex}`, () => phoneOverride(note.phonemes, "SVP phonemes", /\s+/), undefined);
      return { start, end: svpBlickToTick(endBlick), pitch, lyric: string(note.lyrics, `SVP note[${noteIndex}].lyrics`), source: note,
        authored: phones ? { phoneOverride: phones } : undefined,
        extension: { pitchExpression: points.length ? { points } : null, svpPitchDelta: jsonSafe(curve) } } as SourceNote;
    });
    const trackName = recover(diagnostics, "invalid_metadata", "Using default SVP track name", () => string(track.name, `SVP tracks[${trackIndex}].name`, `Track ${trackIndex + 1}`), `Track ${trackIndex + 1}`);
    const reference = recover(diagnostics, "invalid_metadata", `Ignored invalid mainRef in SVP track ${trackIndex}`, () => track.mainRef === undefined ? {} : object(track.mainRef, "SVP mainRef"), {});
    return makeTrack({ id: `${basename}_${trackIndex + 1}`, name: trackName, notes, tempos, meters, ppq: PPQ,
      source: { format: "svp", version: project.version ?? null, track: jsonSafe(track), mainRefPitch: jsonSafe(reference.systemPitchDelta ?? null), renderConfig: jsonSafe(project.renderConfig ?? null) } }, diagnostics);
  }).filter((track) => track.notes.length > 0);
  if (!tracks.length) throw new Error("SVP project contains no notes in main groups");
  return tracks;
}

function svpBlickToTick(value: number): number {
  return Math.round(value / (SVP_BLICKS_PER_QUARTER / PPQ));
}

function parseSvpMeters(value: unknown, diagnostics: ImportDiagnostic[]): MeterPoint[] {
  const rows = collect(list(value), diagnostics, "SVP time.meter", (entry, i) => {
    const item = object(entry, `SVP time.meter[${i}]`);
    const bar = integer(item.index, `SVP time.meter[${i}].index`);
    const beats = integer(item.numerator, `SVP time.meter[${i}].numerator`);
    const beatType = integer(item.denominator, `SVP time.meter[${i}].denominator`);
    if (bar < 0 || beats <= 0 || beatType <= 0) throw new Error(`SVP meter ${i} has invalid values`);
    return { bar, beats, beatType };
  }).sort((a, b) => a.bar - b.bar);
  if (!rows.length) return [{ tick: 0, beats: 4, beatType: 4 }];
  if (rows[0]!.bar > 0) rows.unshift({ bar: 0, beats: rows[0]!.beats, beatType: rows[0]!.beatType });
  const result: MeterPoint[] = [];
  let bar = 0;
  let tick = 0;
  let prior = rows[0]!;
  for (const row of rows) {
    const nextTick = tick + (row.bar - bar) * prior.beats * PPQ * 4 / prior.beatType;
    if (!Number.isSafeInteger(nextTick)) {
      diagnostics.push({ severity: "warning", code: "skipped_record", message: `Skipped SVP meter at bar ${row.bar}: position exceeds the importer tick range` });
      continue;
    }
    tick = nextTick;
    result.push({ tick, beats: row.beats, beatType: row.beatType });
    bar = row.bar;
    prior = row;
  }
  return result;
}
