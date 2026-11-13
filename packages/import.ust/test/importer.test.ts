import { describe, expect, test } from "bun:test";
import { importScore } from "../src/importer";

describe("host UST/USTX detection", () => {
  test("imports UTF-8 USTX bytes and tempo changes through the synthetic member ID", () => {
    const input = JSON.stringify({
      name: "歌" + "x".repeat(4090) + "歌",
      resolution: 480,
      tempos: [{ position: 0, bpm: 120 }, { position: 480, bpm: 75 }],
      tracks: [{ track_name: "歌" }],
      voice_parts: [{ notes: [{ position: 0, duration: 960, tone: 60, lyric: "あ" }] }],
    });
    const result = importScore("import.ust.score", new TextEncoder().encode(input), "import.ust");
    expect(result.tracks[0]!.tempoMap).toEqual([{ tick: 0, bpm: 120 }, { tick: 480, bpm: 75 }]);
    expect(result.tracks[0]!.notes[0]!.lyric).toBe("あ");
  });

  test("rejects invalid UTF-8 USTX", () => {
    expect(() => importScore("ustx", new Uint8Array([0xff]), "bad.ustx")).toThrow();
  });
});
