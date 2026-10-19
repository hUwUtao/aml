import type { AuthoredTrack, MeterPoint, TempoPoint } from "@amsvs/api";
import { PPQ, dedupeTempo, integer, jsonSafe, list, makeTrack, number, object, string, stableId } from "../../import.common/shared";
import type { AnyRecord, SourceNote } from "../../import.common/shared";

const SVP_BLICKS_PER_QUARTER = 705_600_000;

export function parseSvp(text: string, filename: string): AuthoredTrack[] {
  let project: AnyRecord;
  try { project = object(JSON.parse(text.replace(/^\uFEFF/, "")), "SVP project"); }
  catch (error) { throw new Error(`Invalid SVP JSON: ${error instanceof Error ? error.message : String(error)}`); }
  const time = object(project.time, "SVP time");
  const tempos = dedupeTempo(list(time.tempo).map((value, i) => {
    const item = object(value, `SVP time.tempo[${i}]`);
    const tick = svpBlickToTick(integer(item.position, `SVP time.tempo[${i}].position`));
    const bpm = number(item.bpm, `SVP time.tempo[${i}].bpm`);
    if (tick < 0 || bpm <= 0) throw new Error(`SVP tempo ${i} has invalid position or bpm`);
    return { tick, bpm };
  }));
  if (!tempos.length || tempos[0]!.tick > 0) tempos.unshift({ tick: 0, bpm: 120 });
  const meters = parseSvpMeters(time.meter);
  const sourceTracks = list(project.tracks);
  const basename = stableId(filename.replace(/\.[^.]+$/, ""));
  const tracks: AuthoredTrack[] = [];
  for (let trackIndex = 0; trackIndex < sourceTracks.length; trackIndex++) {
    const track = object(sourceTracks[trackIndex], `SVP tracks[${trackIndex}]`);
    const group = track.mainGroup && typeof track.mainGroup === "object" ? object(track.mainGroup, `SVP tracks[${trackIndex}].mainGroup`) : {};
    const notes = list(group.notes).map((value, noteIndex) => {
      const note = object(value, `SVP tracks[${trackIndex}].mainGroup.notes[${noteIndex}]`);
      const start = svpBlickToTick(integer(note.onset, `SVP note[${noteIndex}].onset`));
      const duration = svpBlickToTick(integer(note.duration, `SVP note[${noteIndex}].duration`));
      const pitch = integer(note.pitch, `SVP note[${noteIndex}].pitch`);
      if (start < 0 || duration <= 0 || pitch < 0 || pitch > 127) throw new Error(`SVP note ${noteIndex} has invalid onset, duration, or pitch`);
      const rawCurve = group.parameters && typeof group.parameters === "object"
        ? object(group.parameters, "SVP mainGroup.parameters").pitchDelta : undefined;
      const curve = rawCurve && typeof rawCurve === "object" ? object(rawCurve, "SVP pitchDelta") : {};
      const flatPoints = list(curve.points);
      const points: { position: number; cents: number }[] = [];
      for (let i = 0; i + 1 < flatPoints.length; i += 2) {
        const x = number(flatPoints[i], `SVP pitchDelta.points[${i}]`);
        const y = number(flatPoints[i + 1], `SVP pitchDelta.points[${i + 1}]`);
        const startBlick = integer(note.onset, `SVP note[${noteIndex}].onset`);
        const endBlick = startBlick + integer(note.duration, `SVP note[${noteIndex}].duration`);
        if (x >= startBlick && x <= endBlick) points.push({ position: (x - startBlick) / (endBlick - startBlick), cents: y });
      }
      return { start, end: start + duration, pitch, lyric: string(note.lyrics, `SVP note[${noteIndex}].lyrics`), source: note,
        extension: { pitchExpression: points.length ? { points } : null, svpPitchDelta: jsonSafe(curve) } } as SourceNote;
    });
    if (!notes.length) continue;
    const trackName = string(track.name, `SVP tracks[${trackIndex}].name`, `Track ${trackIndex + 1}`);
    const reference = track.mainRef && typeof track.mainRef === "object" ? object(track.mainRef, "SVP mainRef") : {};
    tracks.push(makeTrack({ id: `${basename}_${trackIndex + 1}`, name: trackName, notes, tempos, meters, ppq: PPQ,
      extentEnd: Math.max(...notes.map((note) => note.end)),
      source: { format: "svp", version: project.version ?? null, track: jsonSafe(track), mainRefPitch: jsonSafe(reference.systemPitchDelta ?? null), renderConfig: jsonSafe(project.renderConfig ?? null) } }));
  }
  if (!tracks.length) throw new Error("SVP project contains no notes in main groups");
  return tracks;
}

function svpBlickToTick(value: number): number {
  return Math.round(value / (SVP_BLICKS_PER_QUARTER / PPQ));
}

function parseSvpMeters(value: unknown): MeterPoint[] {
  const rows = list(value).map((entry, i) => {
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
    tick += (row.bar - bar) * prior.beats * PPQ * 4 / prior.beatType;
    if (!Number.isSafeInteger(tick)) throw new Error("SVP meter position exceeds the importer tick range");
    result.push({ tick, beats: row.beats, beatType: row.beatType });
    bar = row.bar;
    prior = row;
  }
  return result;
}
