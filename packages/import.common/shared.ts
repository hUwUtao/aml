import type { AuthoredNote, AuthoredTrack, JsonObject, MeterPoint, PluginDiagnostic, TempoPoint } from "@amsvs/api";

export type AnyRecord = Record<string, unknown>;
export type SourceNote = { start: number; end: number; pitch: number; lyric: string; source: AnyRecord; extension?: AnyRecord;
  authored?: Pick<AuthoredNote, "flags" | "slurs" | "phoneOverride"> };
export type ImportDiagnostic = PluginDiagnostic;
export const PPQ = 480;
export const CEVIO_PPQ = 960;

export function recover<T>(diagnostics: ImportDiagnostic[], code: string, message: string, read: () => T, fallback: T): T {
  try { return read(); }
  catch (error) {
    diagnostics.push({ severity: "warning", code, message: `${message}: ${error instanceof Error ? error.message : String(error)}` });
    return fallback;
  }
}

export function collect<T>(values: unknown[], diagnostics: ImportDiagnostic[], where: string, read: (value: unknown, index: number) => T): T[] {
  return values.flatMap((value, index) => recover(diagnostics, "skipped_record", `Skipped ${where}[${index}]`, () => [read(value, index)], []));
}

export function object(value: unknown, where: string): AnyRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${where} must be a mapping`);
  return value as AnyRecord;
}
export function list(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
export function number(value: unknown, where: string, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback;
  if ((typeof value !== "number" && typeof value !== "string") || (typeof value === "string" && !value.trim())) throw new Error(`${where} must be a finite number`);
  const result = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(result)) throw new Error(`${where} must be a finite number`);
  return result;
}
export function integer(value: unknown, where: string, fallback?: number): number {
  const result = number(value, where, fallback);
  if (!Number.isSafeInteger(result)) throw new Error(`${where} must be a safe integer`);
  return result;
}
export function string(value: unknown, where: string, fallback = ""): string {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string") throw new Error(`${where} must be a string`);
  return value;
}
export function boolean(value: unknown, where: string): boolean {
  if (value === true || value === "true" || value === "1") return true;
  if (value === false || value === "false" || value === "0") return false;
  throw new Error(`${where} must be a boolean`);
}
export function phoneOverride(value: unknown, where: string, delimiter: RegExp): string[] | undefined {
  const phones = string(value, where).split(delimiter).map((phone) => phone.trim()).filter(Boolean);
  return phones.length ? phones : undefined;
}
export function jsonSafe(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonSafe(item)]));
  return String(value);
}
export function entries(value: unknown): AnyRecord {
  if (value === undefined || value === null) return {};
  return object(value, "expression entry");
}
export function stableId(text: string): string {
  return text.normalize("NFC").replace(/[^\p{L}\p{N}_.-]+/gu, "_").replace(/^_+|_+$/g, "") || "track";
}

export function dedupeTempo(points: TempoPoint[]): TempoPoint[] {
  const byTick = new Map<number, TempoPoint>();
  for (const point of points.sort((a, b) => a.tick - b.tick)) byTick.set(point.tick, point);
  return [...byTick.values()].sort((a, b) => a.tick - b.tick);
}

export function parseUstxMeters(input: unknown, ppq: number, diagnostics: ImportDiagnostic[] = []): MeterPoint[] {
  const rows = collect(list(input), diagnostics, "time_signatures", (value, i) => {
    const item = object(value, `time_signatures[${i}]`);
    const row = { bar: integer(item.bar_position, `time_signatures[${i}].bar_position`, 0), beats: integer(item.beat_per_bar, `time_signatures[${i}].beat_per_bar`), beatType: integer(item.beat_unit, `time_signatures[${i}].beat_unit`) };
    if (row.bar < 0 || row.beats <= 0 || row.beatType <= 0) throw new Error(`time_signatures[${i}] has invalid values`);
    return row;
  }).sort((a, b) => a.bar - b.bar);
  if (!rows.length) return [{ tick: 0, beats: 4, beatType: 4 }];
  if (rows[0]!.bar > 0) rows.unshift({ bar: 0, beats: rows[0]!.beats, beatType: rows[0]!.beatType });
  const result: MeterPoint[] = [];
  let bar = 0; let tick = 0; let prior = rows[0]!;
  for (const row of rows) {
    const nextTick = tick + Math.round((row.bar - bar) * prior.beats * ppq * 4 / prior.beatType);
    if (!Number.isSafeInteger(nextTick)) {
      diagnostics.push({ severity: "warning", code: "skipped_record", message: `Skipped time signature at bar ${row.bar}: tick exceeds safe integer range` });
      continue;
    }
    tick = nextTick;
    result.push({ tick, beats: row.beats, beatType: row.beatType });
    bar = row.bar; prior = row;
  }
  return result;
}

export function convertUstxNoteExtensions(source: AnyRecord, startTick: number, endTick: number, tempos: TempoPoint[], ppq: number, diagnostics: ImportDiagnostic[] = []): AnyRecord {
  const pitch = recover(diagnostics, "invalid_expression", "Ignored invalid USTX pitch", () => entries(source.pitch), {});
  const data = collect(list(pitch.data), diagnostics, "pitch.data", (point, i) => {
    const p = object(point, `pitch.data[${i}]`);
    return { xMs: number(p.x, `pitch.data[${i}].x`), y: number(p.y, `pitch.data[${i}].y`), shape: p.shape ?? null };
  });
  const durationMs = tickToMs(endTick, tempos, ppq) - tickToMs(startTick, tempos, ppq);
  const startMs = tickToMs(startTick, tempos, ppq);
  const points = data.filter((point) => point.xMs >= 0 && point.xMs <= durationMs).map((point) => ({
    position: durationMs ? Math.max(0, Math.min(1, point.xMs / durationMs)) : 0,
    cents: point.y * 10,
  }));
  const vibrato = recover(diagnostics, "invalid_expression", "Ignored invalid USTX vibrato", () => convertVibrato(source.vibrato, durationMs), undefined);
  return { pitchData: data, pitchSnapFirst: pitch.snap_first ?? null,
    pitchExpression: points.length || vibrato ? { points, ...(vibrato ? { vibrato } : {}) } : null,
    vibratoSource: source.vibrato ?? null, phonemeExpressions: list(source.phoneme_expressions), phonemeOverrides: list(source.phoneme_overrides),
    sourcePitchAbsoluteMs: data.map((point) => startMs + point.xMs) };
}

export function tickToMs(tick: number, tempos: TempoPoint[], ppq: number): number {
  let ms = 0; let cursor = 0; let bpm = tempos[0]?.bpm ?? 120;
  for (const point of tempos.slice(1)) {
    if (point.tick >= tick) break;
    ms += (point.tick - cursor) * 60000 / (ppq * bpm); cursor = point.tick; bpm = point.bpm;
  }
  return ms + (tick - cursor) * 60000 / (ppq * bpm);
}

export function makeTrack(input: { id: string; name: string; notes: SourceNote[]; tempos: TempoPoint[]; meters: MeterPoint[]; ppq: number; extentEnd?: number; source: AnyRecord }, diagnostics: ImportDiagnostic[] = []): AuthoredTrack {
  const notes = input.notes.filter((note, i) => {
    const valid = Number.isSafeInteger(note.start) && Number.isSafeInteger(note.end) && note.start >= 0 && note.end > note.start && Number.isSafeInteger(note.pitch) && note.pitch >= 0 && note.pitch <= 127;
    if (!valid) diagnostics.push({ severity: "warning", code: "skipped_note", message: `Skipped note ${i} in ${input.name}: invalid timing or MIDI pitch` });
    return valid;
  }).sort((a, b) => a.start - b.start || a.end - b.end);
  const extentEnd = notes.reduce((end, note) => Math.max(end, note.end), Math.max(1, Number.isSafeInteger(input.extentEnd) ? input.extentEnd! : 0));
  let cursor = 0;
  const authored: AuthoredNote[] = [];
  const gaps: { id: string; startTick: number; endTick: number; kind: "sil" }[] = [];
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i]!;
    if (note.start < cursor) {
      diagnostics.push({ severity: "warning", code: "overlapping_note", message: `Skipped overlapping note ${i} in ${input.name} at tick ${note.start}` });
      continue;
    }
    if (note.start > cursor) gaps.push({ id: `${input.id}:gap:${gaps.length}`, startTick: cursor, endTick: note.start, kind: "sil" });
    const extra = note.extension ?? recover(diagnostics, "invalid_expression", `Ignored invalid expression on note ${i} in ${input.name}`, () => convertUstNoteExtensions(note, note.start, note.end, input.tempos, input.ppq), {});
    authored.push({ id: `${input.id}:note:${i}`, startTick: note.start, endTick: note.end, pitch: note.pitch, lyric: note.lyric, ...note.authored,
      ...(extra.pitchExpression && typeof extra.pitchExpression === "object" ? { pitchExpression: extra.pitchExpression as AuthoredNote["pitchExpression"] } : {}),
      extensions: jsonSafe({ source: note.source, ...extra }) as JsonObject });
    cursor = note.end;
  }
  if (cursor < extentEnd) gaps.push({ id: `${input.id}:gap:${gaps.length}`, startTick: cursor, endTick: extentEnd, kind: "sil" });
  return { schema: "amadeus.track/v2", trackId: input.id, ppq: input.ppq, tempoMap: input.tempos, meterMap: input.meters,
    extent: { startTick: 0, endTick: extentEnd }, languageRoute: [], notes: authored, gaps,
    extensions: jsonSafe({ source: input.source }) as JsonObject };
}

export function convertUstNoteExtensions(note: SourceNote, start: number, end: number, tempos: TempoPoint[], ppq: number): AnyRecord {
  const source = note.source;
  const pbs = string(source.PBS, "PBS", "0;0").split(/[;,]/).map(Number);
  const widths = string(source.PBW, "PBW").split(",").filter(Boolean).map(Number);
  const offsets = string(source.PBY, "PBY").split(",").filter(Boolean).map(Number);
  const rawPitch: { xMs: number; y: number }[] = [];
  if (Number.isFinite(pbs[0]) && Number.isFinite(pbs[1]) && (source.PBS !== undefined || widths.length || offsets.length)) {
    rawPitch.push({ xMs: pbs[0]!, y: pbs[1]! });
    let x = pbs[0]!;
    for (let i = 0; i < Math.max(widths.length, offsets.length); i++) {
      x += Number.isFinite(widths[i]) ? widths[i]! : 0;
      rawPitch.push({ xMs: x, y: Number.isFinite(offsets[i]) ? offsets[i]! : 0 });
    }
  }
  const durationMs = tickToMs(end, tempos, ppq) - tickToMs(start, tempos, ppq);
  const points = rawPitch.filter((point) => point.xMs >= 0 && point.xMs <= durationMs).map((point) => ({ position: durationMs > 0 ? point.xMs / durationMs : 0, cents: point.y * 10 }));
  const vibrato = convertVibrato(parseUstVibrato(string(source.VBR, "VBR")), durationMs);
  return { pitchData: rawPitch, pitchExpression: points.length || vibrato ? { points, ...(vibrato ? { vibrato } : {}) } : null, vibratoSource: source.VBR ?? null,
    flags: source.Flags ?? null, velocity: source.Velocity ?? null, intensity: source.Intensity ?? null, modulation: source.Modulation ?? null,
    envelope: source.Envelope ?? null, preUtterance: source.PreUtterance ?? null, voiceOverlap: source.VoiceOverlap ?? null };
}

export function parseUstVibrato(raw: string): AnyRecord | null {
  const values = raw.split(",").map(Number);
  if (values.length < 5 || values.some((value) => !Number.isFinite(value)) || values[1]! <= 0) return null;
  return { length: values[0], periodMs: values[1], depth: values[2], fadeIn: values[3], fadeOut: values[4], shift: values[5] ?? 0, drift: values[6] ?? 0, volumeLink: values[7] ?? 0 };
}

export function convertVibrato(value: unknown, durationMs: number): NonNullable<AuthoredNote["pitchExpression"]>["vibrato"] | undefined {
  if (value === undefined || value === null) return undefined;
  const source = object(value, "vibrato");
  const periodMs = number(source.periodMs ?? source.period, "vibrato period", 0);
  if (periodMs <= 0) return undefined;
  const length = Math.max(0, Math.min(100, number(source.length, "vibrato length", 100)));
  const fade = Math.max(0, Math.min(100, number(source.fadeIn ?? source.in, "vibrato fade-in", 0)));
  return {
    depthCents: number(source.depth, "vibrato depth", 0) * 10,
    rateHz: 1000 / periodMs,
    delay: durationMs > 0 ? Math.max(0, Math.min(1, (1 - length / 100))) : 0,
    fadeIn: Math.max(0.001, Math.min(1, fade / 100 || 0.001)),
  };
}
