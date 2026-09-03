import type { PhonePlanPhone, SinsyContextGroups } from "./types.js";
import { VOWELS } from "./kana.js";

function fill(size: number): string[] {
  return Array.from({ length: size }, () => "xx");
}

export function classifyPhone(phone: string): "c" | "v" | "p" {
  if (["pau", "sil", "br"].includes(phone)) return "p";
  if (VOWELS.has(phone) || phone === "N") return "v";
  return "c";
}

export function pitchName(midi: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return `${names[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

function pitchClass(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

function distinctOwner(phones: PhonePlanPhone[], index: number, direction: -1 | 1): PhonePlanPhone | null {
  const owner = phones[index]!.ownerId;
  for (let i = index + direction; i >= 0 && i < phones.length; i += direction) {
    if (phones[i]!.ownerId !== owner && phones[i]!.ownerKind === "note") return phones[i]!;
  }
  return null;
}

function fillNoteSummary(values: string[], phone: PhonePlanPhone | null): void {
  const midi = phone?.note.pitch;
  if (midi === null || midi === undefined || !phone) return;
  values[0] = pitchName(midi);
  values[1] = String(pitchClass(midi));
  values[2] = "0";
  values[3] = `${phone.note.beat.beats}/${phone.note.beat.beatType}`;
  values[4] = String(Math.round(phone.note.tempo));
  values[5] = "1";
  const cs = Math.max(0, Math.floor((phone.note.end100ns - phone.note.start100ns) / 100_000));
  values[6] = String(Math.min(cs, 499));
  values[7] = String(phone.note.endTick - phone.note.startTick);
}

function pitchDiff(current: number | null, other: number | null): number {
  if (current === null || other === null) return 0;
  return other - current;
}

function formatPitchDiff(value: number): string {
  return value < 0 ? `m${Math.abs(value)}` : `p${value}`;
}

/**
 * Minimal Sinsy context payload required by the `neutrino_sinsy_v1` row shape.
 * Unknown linguistic fields stay `xx`; we do not synthesize accent/prosody labels.
 */
export function sinsyContexts(phones: PhonePlanPhone[], index: number): SinsyContextGroups {
  const event = phones[index]!;
  const previous = distinctOwner(phones, index, -1);
  const next = distinctOwner(phones, index, 1);
  const midi = event.note.pitch;

  const p = fill(16);
  p[0] = classifyPhone(event.phone);
  p[1] = phones[index - 2]?.phone ?? "xx";
  p[2] = phones[index - 1]?.phone ?? "xx";
  p[3] = event.phone;
  p[4] = phones[index + 1]?.phone ?? "xx";
  p[5] = phones[index + 2]?.phone ?? "xx";
  p[11] = String(Math.min(9, event.sourceIndex + 1));
  p[12] = String(Math.min(9, Math.max(1, event.sourceCount - event.sourceIndex)));

  const a = fill(5);
  const b = fill(5);
  const c = fill(5);
  b[0] = String(Math.min(9, event.sourceCount));
  b[1] = "1";
  b[2] = "1";
  c[0] = "1";
  c[1] = "1";
  c[2] = "1";

  const d = fill(9);
  const f = fill(9);
  fillNoteSummary(d, previous);
  fillNoteSummary(f, next);

  const e = fill(60);
  if (midi !== null) {
    e[0] = pitchName(midi);
    e[1] = String(pitchClass(midi));
  }
  e[2] = "0";
  e[3] = `${event.note.beat.beats}/${event.note.beat.beatType}`;
  e[4] = String(Math.round(event.note.tempo));
  e[5] = "1";
  e[25] = event.note.slurs?.includes("stop") || event.note.ties?.includes("stop") ? "1" : "0";
  e[26] = event.note.slurs?.includes("start") || event.note.ties?.includes("start") ? "1" : "0";
  e[27] = event.note.dynamic;
  e[28] = "0";
  e[29] = "0";
  e[30] = "0";
  e[31] = "100";
  e[34] = event.note.flags?.staccato ? "1" : "0";
  e[35] = e[34];

  const fromPrev = pitchDiff(midi, previous?.note.pitch ?? null);
  const toNext = pitchDiff(midi, next?.note.pitch ?? null);
  e[40] = fromPrev < 0 ? String(Math.abs(fromPrev)) : "0";
  e[41] = toNext > 0 ? String(toNext) : "0";
  e[56] = formatPitchDiff(fromPrev);
  e[57] = formatPitchDiff(toNext);
  e[58] = "0";
  e[59] = event.note.flags?.breath ? "1" : "0";

  const g = fill(2);
  const h = ["1", "1"];
  const i = fill(2);
  const j = ["0", "0", "1"];
  return { p, a, b, c, d, e, f, g, h, i, j };
}
