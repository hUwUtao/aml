import * as Encoding from "encoding-japanese";
import type { AuthoredTrack, TempoPoint } from "@amsvs/api";
import { PPQ, dedupeTempo, integer, makeTrack, number, recover, stableId, string } from "../../import.common/shared";
import type { AnyRecord, ImportDiagnostic, SourceNote } from "../../import.common/shared";

export function parseUstText(bytes: Uint8Array): string {
  const asciiHead = [...bytes.slice(0, 1024)].map((byte) => String.fromCharCode(byte)).join("");
  const charset = asciiHead.split(/\r?\n/).slice(0, 10).map((line) => line.match(/^\s*Charset\s*=\s*(.+?)\s*$/i)?.[1]).find(Boolean);
  let from: string;
  if (charset) {
    const normalized = charset.toLowerCase().replace(/[-_ ]/g, "");
    from = normalized.includes("utf8") ? "UTF8" : normalized.includes("utf16") ? (normalized.includes("le") ? "UTF16LE" : "UTF16BE") : normalized.includes("euc") ? "EUCJP" : normalized.includes("jis") ? "JIS" : "SJIS";
  } else if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) from = "UTF8";
  else if (bytes[0] === 0xff && bytes[1] === 0xfe) from = "UTF16LE";
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) from = "UTF16BE";
  else from = Encoding.detect(bytes) === "UTF8" ? "UTF8" : "SJIS";
  return Encoding.convert(bytes, { to: "UNICODE", from: from as "UTF8" | "UTF16LE" | "UTF16BE" | "EUCJP" | "JIS" | "SJIS", type: "string", fallback: "error" });
}

export function parseUst(text: string, filename: string, diagnostics: ImportDiagnostic[] = []): AuthoredTrack {
  const blocks: { name: string; values: AnyRecord }[] = [];
  let current: { name: string; values: AnyRecord } | undefined;
  for (const rawLine of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = rawLine.trim();
    const header = line.match(/^\[#([^\]]+)\]$/);
    if (header) { current = { name: header[1]!, values: {} }; blocks.push(current); continue; }
    if (!line || line.startsWith(";")) continue;
    if (!current) continue;
    if (current.name.toUpperCase() === "VERSION" && /^UST Version\d+(?:\.\d+)*$/i.test(line)) continue;
    const split = line.indexOf("=");
    if (split < 1) {
      diagnostics.push({ severity: "warning", code: "invalid_line", message: `Ignored invalid UST line in ${current.name}: ${rawLine}` });
      continue;
    }
    current.values[line.slice(0, split).trim()] = line.slice(split + 1).trim();
  }
  if (!blocks.some((block) => /^\d+$/.test(block.name))) throw new Error("UST document has no note blocks");
  const setting = blocks.find((block) => block.name.toUpperCase() === "SETTING")?.values ?? {};
  const initialTempo = recover(diagnostics, "invalid_tempo", "Using UST tempo 120", () => {
    const bpm = number(setting.Tempo, "UST Tempo", 120);
    if (bpm <= 0) throw new Error("UST Tempo must be positive");
    return bpm;
  }, 120);
  let previousPosition = 0;
  let previousEnd = 0;
  const sourceNotes: SourceNote[] = [];
  const tempos: TempoPoint[] = [{ tick: 0, bpm: initialTempo }];
  const [beats, beatType] = recover(diagnostics, "invalid_meter", "Using UST meter 4/4", () => {
    const beats = integer(setting.BeatPerBar ?? setting.TimeSignatureNumerator, "UST beats per bar", 4);
    const beatType = integer(setting.BeatUnit ?? setting.TimeSignatureDenominator, "UST beat unit", 4);
    if (beats <= 0 || beatType <= 0) throw new Error("UST time signature values must be positive");
    return [beats, beatType] as const;
  }, [4, 4] as const);
  for (const block of blocks) {
    if (!/^\d+$/.test(block.name)) continue;
    const p = block.values;
    const timing = recover(diagnostics, "skipped_note", `Skipped UST note ${block.name}`, () => {
      const length = integer(p.Length, `${block.name}.Length`);
      if (length <= 0) throw new Error(`${block.name}.Length must be positive`);
      const hasV2Timing = p.Delta !== undefined && p.Duration !== undefined;
      const start = hasV2Timing ? previousPosition + integer(p.Delta, `${block.name}.Delta`) : previousEnd;
      const duration = hasV2Timing ? integer(p.Duration, `${block.name}.Duration`) : length;
      if (duration <= 0 || start < 0) throw new Error(`${block.name} has invalid timing`);
      const end = start + duration;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) throw new Error(`${block.name} timing exceeds safe integer range`);
      return { start, end };
    }, undefined);
    if (!timing) continue;
    const { start, end } = timing;
    // Advance even if the note's lyric or pitch is unusable, preserving later timing.
    previousPosition = start;
    previousEnd = end;
    if (p.Tempo !== undefined) recover(diagnostics, "invalid_tempo", `Ignored tempo on UST note ${block.name}`, () => {
      const bpm = number(p.Tempo, `${block.name}.Tempo`);
      if (bpm <= 0) throw new Error("Tempo must be positive");
      tempos.push({ tick: start, bpm });
    }, undefined);
    recover(diagnostics, "skipped_note", `Skipped UST note ${block.name}`, () => {
      const lyric = string(p.Lyric, `${block.name}.Lyric`);
      if (lyric.toLowerCase() === "r") return;
      const pitch = integer(p.NoteNum, `${block.name}.NoteNum`, 60);
      if (pitch < 0 || pitch > 127) throw new Error(`${block.name}.NoteNum must be in MIDI range 0..127`);
      sourceNotes.push({ start, end, pitch,
        lyric: lyric.startsWith("!") ? `[${lyric.slice(1)}]` : lyric.startsWith("?") ? lyric.slice(1) : lyric, source: p });
    }, undefined);
  }
  const sourceId = stableId(filename.replace(/\.[^.]+$/, ""));
  return makeTrack({ id: sourceId, name: string(setting.ProjectName, "UST ProjectName", sourceId),
    notes: sourceNotes, tempos: dedupeTempo(tempos), meters: [{ tick: 0, beats, beatType }],
    ppq: PPQ, extentEnd: previousEnd, source: { format: "ust", setting } }, diagnostics);
}
