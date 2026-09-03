import { JA_PHONES, MORAIC_ANCHORS, parseJapaneseLyric, roleForPhone, trailingVowel, type Mora } from "./kana.js";
import { sinsyContexts } from "./sinsy.js";
import type {
  AuthoredGap,
  AuthoredNote,
  AuthoredTrack,
  Diagnostic,
  EngineScore,
  MeterPoint,
  NoteSnapshot,
  PhonePlan,
  PhonePlanPhone,
  PlannerOptions,
  PluginError,
  TimingEdit,
} from "./types.js";

export const PLUGIN_VERSION = "0.1.0";
export const PLUGIN_ID = "lang.ja.portable" as const;
const LANGUAGE_PROTOCOL = "amadeus.language/v2" as const;
const TRACK_SCHEMA = "amadeus.track/v2" as const;
const MIN_PHONE_100NS = 10_000; // 1 ms

const DEFAULT_OPTIONS: PlannerOptions = {
  vowelAnchoring: true,
  consonantLeadMs: 70,
};

interface PlannedUnit {
  ownerId: string;
  ownerKind: "note" | "gap";
  slotStart: number;
  slotEnd: number;
  phones: string[];
  note: NoteSnapshot;
  sourceBase: number;
}

export function plan(track: AuthoredTrack, inputOptions: Partial<PlannerOptions> = {}): PhonePlan | PluginError {
  const problem = validateTrack(track);
  if (problem) return problem;

  const selectedLanguage = track.languageRoute[0] ?? "ja";
  if (!isJapaneseLanguage(selectedLanguage)) {
    return { kind: "unsupported", message: `Japanese portable does not support ${selectedLanguage}` };
  }
  const unsupported = track.notes.find((note) => note.language && !isJapaneseLanguage(note.language));
  if (unsupported) {
    return { kind: "unsupported", message: `Japanese portable does not support ${unsupported.language} for ${unsupported.id}` };
  }

  const options: PlannerOptions = {
    vowelAnchoring: inputOptions.vowelAnchoring ?? DEFAULT_OPTIONS.vowelAnchoring,
    consonantLeadMs: clampNumber(inputOptions.consonantLeadMs ?? DEFAULT_OPTIONS.consonantLeadMs, 0, 250),
  };

  const diagnostics: Diagnostic[] = [];
  const ordered = [
    ...track.notes.map((note) => ({ kind: "note" as const, start: note.startTick, note })),
    ...track.gaps.map((gap) => ({ kind: "gap" as const, start: gap.startTick, gap })),
  ].sort((a, b) => a.start - b.start);

  const units: PlannedUnit[] = [];
  let previousVowel: string | null = null;

  for (const item of ordered) {
    if (item.kind === "gap") {
      const snapshot = gapSnapshot(track, item.gap);
      units.push({
        ownerId: item.gap.id,
        ownerKind: "gap",
        slotStart: snapshot.start100ns,
        slotEnd: snapshot.end100ns,
        phones: [item.gap.kind],
        note: snapshot,
        sourceBase: 0,
      });
      previousVowel = null;
      continue;
    }

    const note = item.note;
    const snapshot = noteSnapshot(track, note);
    let morae: Mora[];
    try {
      if (note.phoneOverride?.length) {
        const invalid = note.phoneOverride.filter((phone) => !JA_PHONES.has(phone));
        if (invalid.length) {
          return { kind: "malformed", message: `unsupported phoneOverride on ${note.id}: ${invalid.join(", ")}` };
        }
        morae = [{ source: "phoneOverride", phones: [...note.phoneOverride] }];
      } else {
        const lyric = note.lyric?.trim() ?? "+";
        morae = parseJapaneseLyric(lyric, previousVowel);
      }
    } catch (error) {
      return {
        kind: "malformed",
        message: `${note.id}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    if (morae.length === 0) return { kind: "malformed", message: `${note.id}: empty phoneme plan` };
    previousVowel = trailingVowel(morae, previousVowel);

    const total = snapshot.end100ns - snapshot.start100ns;
    let sourceBase = 0;
    for (let m = 0; m < morae.length; m++) {
      const slotStart = snapshot.start100ns + Math.round((total * m) / morae.length);
      const slotEnd = snapshot.start100ns + Math.round((total * (m + 1)) / morae.length);
      const phones = morae[m]!.phones;
      units.push({ ownerId: note.id, ownerKind: "note", slotStart, slotEnd, phones, note: snapshot, sourceBase });
      sourceBase += phones.length;
    }
  }

  const phones = materializeUnits(units, options, diagnostics);
  const invalidOrder = phones.findIndex((phone) => phone.end100ns <= phone.start100ns);
  if (invalidOrder >= 0) {
    return { kind: "runtime", message: `planner produced an empty phone window at ${phones[invalidOrder]!.id}` };
  }

  return {
    protocol: LANGUAGE_PROTOCOL,
    trackSchema: TRACK_SCHEMA,
    trackId: track.trackId,
    phones,
    diagnostics,
    provenance: {
      protocol: LANGUAGE_PROTOCOL,
      moduleId: PLUGIN_ID,
      moduleVersion: PLUGIN_VERSION,
      bundleHash: "",
      selectedLanguage,
      route: [...track.languageRoute],
    },
  };
}

function materializeUnits(units: PlannedUnit[], options: PlannerOptions, diagnostics: Diagnostic[]): PhonePlanPhone[] {
  const result: PhonePlanPhone[] = [];
  const ownerCounts = new Map<string, number>();
  for (const unit of units) ownerCounts.set(unit.ownerId, (ownerCounts.get(unit.ownerId) ?? 0) + unit.phones.length);

  for (const unit of units) {
    const { phones } = unit;
    const duration = unit.slotEnd - unit.slotStart;
    if (duration < MIN_PHONE_100NS * phones.length) {
      diagnostics.push({
        severity: "warning",
        code: "compressed_phone_timing",
        message: `${unit.ownerId} is shorter than ${phones.length} ms; boundaries were compressed`,
        ownerId: unit.ownerId,
      });
    }

    const anchorIndex = phones.findIndex((phone) => MORAIC_ANCHORS.has(phone));
    const preCount = anchorIndex > 0 ? anchorIndex : 0;
    const desiredLead = Math.round(options.consonantLeadMs * 10_000);
    let preStart = unit.slotStart;
    let anchorStart = unit.slotStart;

    if (preCount > 0) {
      const safeLead = Math.min(desiredLead, Math.max(MIN_PHONE_100NS * preCount, Math.floor(duration * 0.45)));
      if (options.vowelAnchoring) {
        const desired = unit.slotStart - safeLead;
        const lower = result.length ? result[result.length - 1]!.start100ns + MIN_PHONE_100NS : 0;
        preStart = Math.max(lower, desired);
        anchorStart = preStart + safeLead;
        if (preStart <= desired) anchorStart = unit.slotStart;
        if (anchorStart >= unit.slotEnd - MIN_PHONE_100NS) {
          anchorStart = Math.max(unit.slotStart + MIN_PHONE_100NS * preCount, unit.slotEnd - MIN_PHONE_100NS);
        }
      } else {
        preStart = unit.slotStart;
        anchorStart = Math.min(unit.slotStart + safeLead, unit.slotEnd - MIN_PHONE_100NS);
      }
    }

    const starts: number[] = [];
    if (anchorIndex >= 0) {
      for (let i = 0; i < preCount; i++) {
        starts.push(Math.round(preStart + ((anchorStart - preStart) * i) / Math.max(1, preCount)));
      }
      starts.push(anchorStart);
      const tailCount = phones.length - anchorIndex - 1;
      for (let t = 0; t < tailCount; t++) {
        const pos = t + 1;
        starts.push(Math.round(anchorStart + ((unit.slotEnd - anchorStart) * pos) / (tailCount + 1)));
      }
    } else {
      for (let i = 0; i < phones.length; i++) {
        starts.push(Math.round(unit.slotStart + (duration * i) / phones.length));
      }
    }

    // Ensure strictly increasing starts even on pathological tiny notes.
    for (let i = 1; i < starts.length; i++) {
      if (starts[i]! <= starts[i - 1]!) starts[i] = starts[i - 1]! + 1;
    }

    for (let i = 0; i < phones.length; i++) {
      const sourceIndex = unit.sourceBase + i;
      const phone: PhonePlanPhone = {
        id: `${unit.ownerKind}:${unit.ownerId}:phone:${sourceIndex}`,
        ownerId: unit.ownerId,
        ownerKind: unit.ownerKind,
        phone: phones[i]!,
        role: roleForPhone(phones, i),
        weight: 1,
        ghost: false,
        vacuum: false,
        start100ns: starts[i]!,
        end100ns: i + 1 < phones.length ? starts[i + 1]! : unit.slotEnd,
        sourceIndex,
        sourceCount: ownerCounts.get(unit.ownerId) ?? phones.length,
        note: unit.note,
      };

      const previous = result[result.length - 1];
      if (previous) {
        if (phone.start100ns <= previous.start100ns) phone.start100ns = previous.start100ns + 1;
        previous.end100ns = phone.start100ns;
      }
      if (phone.end100ns <= phone.start100ns) phone.end100ns = phone.start100ns + 1;
      result.push(phone);
    }
  }

  return result;
}

export function finalize(planValue: PhonePlan, timingEdits: TimingEdit[] = []): EngineScore | PluginError {
  if (!planValue || planValue.protocol !== LANGUAGE_PROTOCOL) {
    return { kind: "incompatible_schema", message: `expected ${LANGUAGE_PROTOCOL}` };
  }
  const diagnostics = [...planValue.diagnostics];
  const phones = planValue.phones.map((phone) => ({ ...phone, note: { ...phone.note } }));
  const byId = new Map(phones.map((phone, index) => [phone.id, index]));

  for (const edit of timingEdits) {
    const index = byId.get(edit.phoneId);
    if (index === undefined) {
      diagnostics.push({
        severity: "warning",
        code: "obsolete_timing_edit",
        message: `Timing edit references unknown phone ${edit.phoneId}`,
        phoneId: edit.phoneId,
      });
      continue;
    }
    if (!Number.isFinite(edit.boundaryOffset100ns)) continue;
    const phone = phones[index]!;
    const proposed = phone.start100ns + Math.round(edit.boundaryOffset100ns);
    const lower = index === 0 ? 0 : phones[index - 1]!.start100ns + 1;
    const upper = index + 1 < phones.length ? phones[index + 1]!.start100ns - 1 : phone.end100ns - 1;
    phone.start100ns = Math.max(lower, Math.min(proposed, upper));
    if (index > 0) phones[index - 1]!.end100ns = phone.start100ns;
  }

  for (let i = 1; i < phones.length; i++) {
    if (phones[i]!.start100ns <= phones[i - 1]!.start100ns) {
      return { kind: "runtime", message: `phone ${phones[i]!.id} is not ordered` };
    }
    phones[i - 1]!.end100ns = phones[i]!.start100ns;
  }
  const invalid = phones.find((phone) => phone.end100ns <= phone.start100ns);
  if (invalid) return { kind: "runtime", message: `phone ${invalid.id} has an empty timing window` };

  const rows = phones.map((phone, index) => ({
    rowId: `${phone.id}:segment:0`,
    sourcePhoneId: phone.id,
    segmentIndex: 0,
    start100ns: phone.start100ns,
    end100ns: phone.end100ns,
    phoneme: phone.phone,
    ...(phone.ownerKind === "note" ? { noteId: phone.ownerId } : { gapId: phone.ownerId }),
    scoreStartTick: phone.note.startTick,
    scoreEndTick: phone.note.endTick,
    midi: phone.note.pitch,
    contexts: sinsyContexts(phones, index),
  }));

  return {
    kind: "neutrino_sinsy_v1",
    protocol: LANGUAGE_PROTOCOL,
    trackId: planValue.trackId,
    rows,
    diagnostics,
    provenance: planValue.provenance,
  };
}

function noteSnapshot(track: AuthoredTrack, note: AuthoredNote): NoteSnapshot {
  return {
    id: note.id,
    isRest: false,
    startTick: note.startTick,
    endTick: note.endTick,
    start100ns: tickTo100ns(track, note.startTick),
    end100ns: tickTo100ns(track, note.endTick),
    pitch: note.pitch,
    tempo: tempoAt(track, note.startTick),
    beat: meterAt(track, note.startTick),
    dynamic: note.dynamic ?? "mf",
    ties: note.ties,
    slurs: note.slurs,
    flags: note.flags,
  };
}

function gapSnapshot(track: AuthoredTrack, gap: AuthoredGap): NoteSnapshot {
  return {
    id: gap.id,
    isRest: true,
    startTick: gap.startTick,
    endTick: gap.endTick,
    start100ns: tickTo100ns(track, gap.startTick),
    end100ns: tickTo100ns(track, gap.endTick),
    pitch: null,
    tempo: tempoAt(track, gap.startTick),
    beat: meterAt(track, gap.startTick),
    dynamic: "mf",
    flags: { breath: gap.kind === "br" },
  };
}

function isJapaneseLanguage(value: string): boolean {
  const normalized = value.toLowerCase();
  return normalized === "ja" || normalized.startsWith("ja-");
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function validateTrack(track: AuthoredTrack): PluginError | null {
  if (!track || track.schema !== TRACK_SCHEMA) return { kind: "incompatible_schema", message: `expected ${TRACK_SCHEMA}` };
  if (!track.trackId?.trim()) return { kind: "malformed", message: "trackId is empty" };
  if (!Number.isSafeInteger(track.ppq) || track.ppq <= 0) return { kind: "malformed", message: "ppq must be a positive safe integer" };
  if (!track.tempoMap.length || track.tempoMap[0]?.tick !== 0) return { kind: "malformed", message: "tempoMap must begin at tick 0" };
  if (track.tempoMap.some((p, i) => !Number.isSafeInteger(p.tick) || p.tick < 0 || !Number.isFinite(p.bpm) || p.bpm <= 0 || (i > 0 && p.tick <= track.tempoMap[i - 1]!.tick))) {
    return { kind: "malformed", message: "tempoMap must be ordered and positive" };
  }
  if (!track.meterMap.length || track.meterMap[0]?.tick !== 0) return { kind: "malformed", message: "meterMap must begin at tick 0" };
  if (track.meterMap.some((p, i) => !Number.isSafeInteger(p.tick) || p.tick < 0 || !Number.isSafeInteger(p.beats) || p.beats <= 0 || !Number.isSafeInteger(p.beatType) || p.beatType <= 0 || (i > 0 && p.tick <= track.meterMap[i - 1]!.tick))) {
    return { kind: "malformed", message: "meterMap must be ordered and positive" };
  }
  if (!Number.isSafeInteger(track.extent.startTick) || !Number.isSafeInteger(track.extent.endTick) || track.extent.startTick < 0 || track.extent.endTick <= track.extent.startTick) {
    return { kind: "malformed", message: "track extent is empty" };
  }

  const ids = [...track.notes.map((n) => n.id), ...track.gaps.map((g) => g.id)];
  if (ids.some((id) => !id.trim()) || new Set(ids).size !== ids.length) return { kind: "malformed", message: "note/gap IDs must be non-empty and unique" };

  const segments = [
    ...track.notes.map((n) => ({ start: n.startTick, end: n.endTick, valid: Number.isSafeInteger(n.pitch) && n.pitch >= 0 && n.pitch <= 127 })),
    ...track.gaps.map((g) => ({ start: g.startTick, end: g.endTick, valid: true })),
  ].sort((a, b) => a.start - b.start || a.end - b.end);
  let cursor = track.extent.startTick;
  for (const segment of segments) {
    if (!segment.valid || !Number.isSafeInteger(segment.start) || !Number.isSafeInteger(segment.end) || segment.start !== cursor || segment.end <= segment.start || segment.end > track.extent.endTick) {
      return { kind: "malformed", message: "notes and explicit gaps must cover the track extent without overlap or holes" };
    }
    cursor = segment.end;
  }
  if (cursor !== track.extent.endTick) return { kind: "malformed", message: "notes and explicit gaps must cover the full track extent" };
  return null;
}

function tempoAt(track: AuthoredTrack, tick: number): number {
  let active = track.tempoMap[0]!;
  for (const point of track.tempoMap) if (point.tick <= tick && point.tick >= active.tick) active = point;
  return active.bpm;
}

function meterAt(track: AuthoredTrack, tick: number): MeterPoint {
  let active = track.meterMap[0]!;
  for (const point of track.meterMap) if (point.tick <= tick && point.tick >= active.tick) active = point;
  return { ...active };
}

export function tickTo100ns(track: AuthoredTrack, targetTick: number): number {
  const points = [...track.tempoMap].sort((a, b) => a.tick - b.tick);
  let cursor = 0;
  let bpm = points[0]!.bpm;
  let output = 0;
  for (const point of points.slice(1)) {
    if (point.tick >= targetTick) break;
    output += ((point.tick - cursor) * 600_000_000) / (track.ppq * bpm);
    cursor = point.tick;
    bpm = point.bpm;
  }
  output += ((targetTick - cursor) * 600_000_000) / (track.ppq * bpm);
  return Math.round(output);
}
