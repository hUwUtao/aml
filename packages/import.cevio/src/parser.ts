import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { AuthoredTrack, TempoPoint } from "@amsvs/api";
import { CEVIO_PPQ, boolean, collect, dedupeTempo, integer, jsonSafe, makeTrack, number, object, phoneOverride, recover, stableId, string } from "../../import.common/shared";
import type { AnyRecord, ImportDiagnostic, SourceNote } from "../../import.common/shared";

function xmlList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
}

export function parseCevio(text: string, filename: string, extension: string, diagnostics: ImportDiagnostic[] = []): AuthoredTrack[] {
  const validation = XMLValidator.validate(text);
  if (validation !== true) throw new Error(`Invalid CeVIO XML: ${validation.err.msg}`);
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", parseAttributeValue: false,
    trimValues: true, isArray: (name) => ["Unit", "Sound", "Time", "Note", "Key", "Dynamics", "Data", "NoData"].includes(name) });
  const document = parser.parse(text) as AnyRecord;
  const rootName = Object.keys(document).find((name) => name !== "?xml");
  const root = rootName ? object(document[rootName], "CeVIO XML root") : {};
  if (extension === "import.cevio.score") extension = rootName === "Definition" ? "ccst" : "ccs";
  if (extension !== "ccs" && extension !== "ccst") throw new Error(`Unsupported CeVIO format: ${extension}`);
  if ((extension === "ccs" && rootName !== "Scenario") || (extension === "ccst" && rootName !== "Definition")) {
    throw new Error(`Expected a CeVIO ${extension.toUpperCase()} ${extension === "ccs" ? "Scenario" : "Definition"} XML document`);
  }
  const unitsRoot = findXmlObject(root, "Units") ?? root;
  const units = xmlList(unitsRoot.Unit).filter((unit): unit is AnyRecord => !!unit && typeof unit === "object" && !Array.isArray(unit) && (unit as AnyRecord)["@_Category"] === "SingerSong");
  const basename = stableId(filename.replace(/\.[^.]+$/, ""));
  const tracks = collect(units, diagnostics, "CeVIO Unit", (value, unitIndex) => {
    const unit = object(value, `Unit[${unitIndex}]`);
    const song = unit.Song && typeof unit.Song === "object" ? object(unit.Song, `Unit[${unitIndex}].Song`) : null;
    if (!song) throw new Error("SingerSong unit has no Song");
    const tempoNode = recover(diagnostics, "invalid_tempo", "Ignored invalid Song.Tempo", () => song.Tempo === undefined ? {} : object(song.Tempo, "Song.Tempo"), {});
    const tempoItems = collect(xmlList(tempoNode.Sound), diagnostics, `Unit[${unitIndex}].Tempo.Sound`, (value, i) => {
      const item = object(value, `Tempo.Sound[${i}]`);
      const tick = integer(item["@_Clock"], `Tempo.Sound[${i}].Clock`);
      const bpm = number(item["@_Tempo"], `Tempo.Sound[${i}].Tempo`);
      if (tick < 0 || bpm <= 0) throw new Error(`CeVIO tempo ${i} has invalid clock or tempo`);
      return { tick, bpm };
    });
    const tempos = dedupeTempo(tempoItems);
    if (!tempos.length || tempos[0]!.tick > 0) tempos.unshift({ tick: 0, bpm: 120 });
    const beatNode = recover(diagnostics, "invalid_meter", "Ignored invalid Song.Beat", () => song.Beat === undefined ? {} : object(song.Beat, "Song.Beat"), {});
    const meterItems = collect(xmlList(beatNode.Time), diagnostics, `Unit[${unitIndex}].Beat.Time`, (value, i) => {
      const item = object(value, `Beat.Time[${i}]`);
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
    const sourceNotes: SourceNote[] = collect(noteItems, diagnostics, `Unit[${unitIndex}].Note`, (value, i) => {
      const item = object(value, `Note[${i}]`);
      const localStart = integer(item["@_Clock"], `Note[${i}].Clock`);
      const duration = integer(item["@_Duration"], `Note[${i}].Duration`);
      const pitch = integer(item["@_PitchOctave"], `Note[${i}].PitchOctave`) * 12 + 12 + integer(item["@_PitchStep"], `Note[${i}].PitchStep`);
      if (localStart < 0 || duration <= 0 || pitch < 0 || pitch > 127) throw new Error(`CeVIO note ${i} has invalid timing or pitch`);
      const attrs = Object.fromEntries(Object.entries(item).filter(([key]) => key.startsWith("@_")));
      const lyric = string(item["@_Lyric"], `Note[${i}].Lyric`);
      const readFlag = (name: string) => item[`@_${name}`] === undefined ? undefined : recover(diagnostics, "invalid_expression", `Ignored invalid CeVIO ${name} on note ${i}`, () => boolean(item[`@_${name}`], name), undefined);
      const breath = readFlag("Breath");
      const accent = readFlag("Accent");
      const staccato = readFlag("Staccato");
      const slurs = [...(readFlag("SlurStart") ? ["start"] : []), ...(readFlag("SlurStop") ? ["stop"] : [])];
      const phones = recover(diagnostics, "invalid_expression", `Ignored invalid CeVIO Phonetic on note ${i}`, () => phoneOverride(item["@_Phonetic"], "Phonetic", /,/), undefined);
      return { start: offset + localStart, end: offset + localStart + duration, pitch, lyric, source: item,
        authored: { flags: { ...(breath !== undefined ? { breath } : {}), ...(accent !== undefined ? { accent } : {}), ...(staccato !== undefined ? { staccato } : {}) },
          ...(slurs.length ? { slurs } : {}), ...(phones ? { phoneOverride: phones } : {}) },
        extension: { cevio: { ...attrs, localClock: localStart, duration } } };
    });
    const parameter = song.Parameter ?? null;
    const partName = recover(diagnostics, "invalid_metadata", "Using default CeVIO track name", () => string(unit["@_Name"], `Unit[${unitIndex}].Name`, `Track ${unitIndex + 1}`), `Track ${unitIndex + 1}`);
    return makeTrack({ id: `${basename}_${unitIndex + 1}`, name: partName, notes: sourceNotes, tempos,
      meters: meterItems, ppq: CEVIO_PPQ, extentEnd: offset,
      source: { format: extension, root: rootName, unit: jsonSafe(unit), parameter: jsonSafe(parameter), scoreMeta: {
        keys: jsonSafe(score.Key ?? []), dynamics: jsonSafe(score.Dynamics ?? []), startTime: unit["@_StartTime"] ?? null,
      } } }, diagnostics);
  });
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
