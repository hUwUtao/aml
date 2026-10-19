import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { AuthoredTrack, TempoPoint } from "@amsvs/api";
import { CEVIO_PPQ, dedupeTempo, integer, jsonSafe, list, makeTrack, number, object, stableId, string } from "../../import.common/shared";
import type { AnyRecord, SourceNote } from "../../import.common/shared";

function xmlList(value: unknown): AnyRecord[] {
  return (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value])
    .filter((item): item is AnyRecord => !!item && typeof item === "object" && !Array.isArray(item));
}

function xmlNumber(value: unknown, where: string, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback;
  return number(value, where);
}

export function parseCevio(text: string, filename: string, extension: string): AuthoredTrack[] {
  const validation = XMLValidator.validate(text);
  if (validation !== true) throw new Error(`Invalid CeVIO XML: ${validation.err.msg}`);
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", parseAttributeValue: true,
    trimValues: true, isArray: (name) => ["Unit", "Sound", "Time", "Note", "Key", "Dynamics", "Data", "NoData"].includes(name) });
  const document = parser.parse(text) as AnyRecord;
  const rootName = Object.keys(document).find((name) => name !== "?xml");
  const root = rootName ? object(document[rootName], "CeVIO XML root") : {};
  if ((extension === "ccs" && rootName !== "Scenario") || (extension === "ccst" && rootName !== "Definition")) {
    throw new Error(`Expected a CeVIO ${extension.toUpperCase()} ${extension === "ccs" ? "Scenario" : "Definition"} XML document`);
  }
  const unitsRoot = findXmlObject(root, "Units") ?? root;
  const units = xmlList(unitsRoot.Unit).filter((unit) => String(unit["@_Category"] ?? "") === "SingerSong");
  const basename = stableId(filename.replace(/\.[^.]+$/, ""));
  const tracks: AuthoredTrack[] = [];
  for (let unitIndex = 0; unitIndex < units.length; unitIndex++) {
    const unit = units[unitIndex]!;
    const song = unit.Song && typeof unit.Song === "object" ? object(unit.Song, `Unit[${unitIndex}].Song`) : null;
    if (!song) continue;
    const tempoNode = song.Tempo && typeof song.Tempo === "object" ? object(song.Tempo, "Song.Tempo") : {};
    const tempoItems = xmlList(tempoNode.Sound).map((item, i) => {
      const tick = integer(item["@_Clock"], `Tempo.Sound[${i}].Clock`);
      const bpm = number(item["@_Tempo"], `Tempo.Sound[${i}].Tempo`);
      if (tick < 0 || bpm <= 0) throw new Error(`CeVIO tempo ${i} has invalid clock or tempo`);
      return { tick, bpm };
    });
    const tempos = dedupeTempo(tempoItems);
    if (!tempos.length || tempos[0]!.tick > 0) tempos.unshift({ tick: 0, bpm: 120 });
    const beatNode = song.Beat && typeof song.Beat === "object" ? object(song.Beat, "Song.Beat") : {};
    const meterItems = xmlList(beatNode.Time).map((item, i) => {
      const tick = integer(item["@_Clock"], `Beat.Time[${i}].Clock`);
      const beats = integer(item["@_Beats"], `Beat.Time[${i}].Beats`);
      const beatType = integer(item["@_BeatType"], `Beat.Time[${i}].BeatType`);
      if (tick < 0 || beats <= 0 || beatType <= 0) throw new Error(`CeVIO meter ${i} has invalid values`);
      return { tick, beats, beatType };
    }).sort((a, b) => a.tick - b.tick);
    if (!meterItems.length || meterItems[0]!.tick > 0) meterItems.unshift({ tick: 0, beats: 4, beatType: 4 });
    const score = song.Score && typeof song.Score === "object" ? object(song.Score, "Song.Score") : {};
    const noteItems = xmlList(score.Note);
    const offset = timecodeToTicks(unit["@_StartTime"], tempos);
    const sourceNotes: SourceNote[] = noteItems.map((item, i) => {
      const localStart = integer(item["@_Clock"], `Note[${i}].Clock`);
      const duration = integer(item["@_Duration"], `Note[${i}].Duration`);
      const pitch = integer(item["@_PitchOctave"], `Note[${i}].PitchOctave`) * 12 + 12 + integer(item["@_PitchStep"], `Note[${i}].PitchStep`);
      if (localStart < 0 || duration <= 0 || pitch < 0 || pitch > 127) throw new Error(`CeVIO note ${i} has invalid timing or pitch`);
      const attrs = Object.fromEntries(Object.entries(item).filter(([key]) => key.startsWith("@_")));
      const lyric = string(item["@_Lyric"], `Note[${i}].Lyric`);
      return { start: offset + localStart, end: offset + localStart + duration, pitch, lyric, source: attrs,
        extension: { cevio: { ...attrs, localClock: localStart, duration } } };
    });
    const extentEnd = Math.max(offset, ...sourceNotes.map((note) => note.end));
    const parameter = song.Parameter ?? null;
    const partName = string(unit["@_Name"], `Unit[${unitIndex}].Name`, `Track ${unitIndex + 1}`);
    tracks.push(makeTrack({ id: `${basename}_${unitIndex + 1}`, name: partName, notes: sourceNotes, tempos,
      meters: meterItems, ppq: CEVIO_PPQ, extentEnd,
      source: { format: extension, root: rootName, unit: jsonSafe(unit), parameter: jsonSafe(parameter), scoreMeta: {
        keys: jsonSafe(score.Key ?? []), dynamics: jsonSafe(score.Dynamics ?? []), startTime: unit["@_StartTime"] ?? null,
      } } }));
  }
  if (!tracks.length) throw new Error(`CeVIO ${extension.toUpperCase()} contains no SingerSong tracks`);
  return tracks;
}
function findXmlObject(value: unknown, key: string): AnyRecord | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as AnyRecord;
  if (record[key] && typeof record[key] === "object" && !Array.isArray(record[key])) return record[key] as AnyRecord;
  for (const child of Object.values(record)) {
    const found = findXmlObject(child, key);
    if (found) return found;
  }
  return undefined;
}

function timecodeToTicks(value: unknown, tempos: TempoPoint[]): number {
  if (value === undefined || value === null || value === "") return 0;
  const parts = String(value).split(":");
  if (parts.length !== 3) throw new Error(`Invalid CeVIO StartTime: ${String(value)}`);
  const seconds = Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error(`Invalid CeVIO StartTime: ${String(value)}`);
  let remaining = seconds;
  let tick = 0;
  let bpm = tempos[0]?.bpm ?? 120;
  for (const point of tempos.slice(1)) {
    const spanSeconds = (point.tick - tick) * 60 / (CEVIO_PPQ * bpm);
    if (remaining <= spanSeconds) break;
    remaining -= spanSeconds;
    tick = point.tick;
    bpm = point.bpm;
  }
  return Math.round(tick + remaining * CEVIO_PPQ * bpm / 60);
}
