export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface TempoPoint { tick: number; bpm: number }
export interface MeterPoint { tick: number; beats: number; beatType: number }

export interface AuthoredNote {
  id: string;
  startTick: number;
  endTick: number;
  pitch: number;
  lyric?: string;
  language?: string;
  ties?: string[];
  slurs?: string[];
  flags?: { breath?: boolean; accent?: boolean; staccato?: boolean };
  dynamic?: string;
  phoneOverride?: string[];
  pitchExpression?: JsonValue;
  vibrato?: JsonValue;
  extensions?: Record<string, JsonValue>;
}

export interface AuthoredGap {
  id: string;
  startTick: number;
  endTick: number;
  kind: "pau" | "sil" | "br";
  extensions?: Record<string, JsonValue>;
}

export interface AuthoredTrack {
  schema: "amadeus.track/v2";
  trackId: string;
  ppq: number;
  tempoMap: TempoPoint[];
  meterMap: MeterPoint[];
  extent: { startTick: number; endTick: number };
  languageRoute: string[];
  notes: AuthoredNote[];
  gaps: AuthoredGap[];
  extensions?: Record<string, JsonValue>;
}

export interface TimingEdit {
  phoneId: string;
  boundaryOffset100ns: number;
}

export interface Diagnostic {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  ownerId?: string;
  phoneId?: string;
}

export type PhoneRole = "pre" | "anchor" | "tail" | "breath";

export interface NoteSnapshot {
  id: string;
  isRest: boolean;
  startTick: number;
  endTick: number;
  start100ns: number;
  end100ns: number;
  pitch: number | null;
  tempo: number;
  beat: { beats: number; beatType: number };
  dynamic: string;
  ties?: string[];
  slurs?: string[];
  flags?: { breath?: boolean; accent?: boolean; staccato?: boolean };
}

export interface PhonePlanPhone {
  id: string;
  ownerId: string;
  ownerKind: "note" | "gap";
  phone: string;
  role: PhoneRole;
  weight: number;
  ghost: boolean;
  vacuum: boolean;
  start100ns: number;
  end100ns: number;
  sourceIndex: number;
  sourceCount: number;
  note: NoteSnapshot;
}

export interface ModuleProvenance {
  protocol: "amadeus.language/v2";
  moduleId: "lang.ja.portable";
  moduleVersion: string;
  bundleHash: string;
  selectedLanguage: string;
  route: string[];
}

export interface PhonePlan {
  protocol: "amadeus.language/v2";
  trackSchema: "amadeus.track/v2";
  trackId: string;
  phones: PhonePlanPhone[];
  diagnostics: Diagnostic[];
  provenance: ModuleProvenance;
}

export interface SinsyContextGroups {
  p: string[];
  a: string[];
  b: string[];
  c: string[];
  d: string[];
  e: string[];
  f: string[];
  g: string[];
  h: string[];
  i: string[];
  j: string[];
}

export interface EngineRow {
  rowId: string;
  sourcePhoneId: string;
  segmentIndex: number;
  start100ns: number;
  end100ns: number;
  phoneme: string;
  noteId?: string;
  gapId?: string;
  scoreStartTick: number;
  scoreEndTick: number;
  midi: number | null;
  contexts: SinsyContextGroups;
}

export interface EngineScore {
  kind: "neutrino_sinsy_v1";
  protocol: "amadeus.language/v2";
  trackId: string;
  rows: EngineRow[];
  diagnostics: Diagnostic[];
  provenance: ModuleProvenance;
}

export type PluginError = {
  kind: "unsupported" | "malformed" | "incompatible_schema" | "runtime";
  message: string;
};

export interface PlannerOptions {
  vowelAnchoring: boolean;
  consonantLeadMs: number;
}
