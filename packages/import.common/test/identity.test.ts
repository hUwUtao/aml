import { describe, expect, test } from "bun:test";
import type { AuthoredTrack } from "@amsvs/api";
import { importScore } from "../../import.ust/src/importer";
import { parseSvp } from "../../import.svp/src/parser";
import { parseCevio } from "../../import.cevio/src/parser";

const ust = `[#SETTING]
ProjectName=Same name
Tempo=120
[#0000]
Length=120
Lyric=R
[#0001]
Length=480
Lyric=la
NoteNum=60
[#TRACKEND]
`;

const ustx = JSON.stringify({
  tracks: [{ track_name: "Same name" }],
  voice_parts: [
    null, // Skipping a malformed record must not collapse source identities.
    ...[0, 960].map(position => ({
      track_no: 0, name: "Same name", position, duration: 960,
      notes: [{ position: 120, duration: 480, tone: 60, lyric: "la" }],
    })),
  ],
});

const svp = JSON.stringify({
  tracks: [
    { name: "Same name", mainGroup: { uuid: "duplicate", notes: [] } },
    ...[0, 1].map(() => ({
      name: "Same name",
      mainGroup: {
        uuid: "duplicate",
        notes: [{ onset: 176_400_000, duration: 705_600_000, pitch: 60, lyrics: "la" }],
      },
    })),
  ],
});

function cevio(root: "Scenario" | "Definition"): string {
  const unit = `<Unit Category="SingerSong" Name="Same name" Id="duplicate">
    <Song><Score><Note Clock="120" Duration="960" PitchOctave="4" PitchStep="0" Lyric="la" /></Score></Song>
  </Unit>`;
  return `<${root}><Units><Unit Category="SingerSong" />${unit}${unit}</Units></${root}>`;
}

const cases: { format: string; count: number; parse: () => AuthoredTrack[] }[] = [
  { format: "ust", count: 1, parse: () => importScore("ust", ust, "same.ust").tracks },
  { format: "ustx", count: 2, parse: () => importScore("ustx", ustx, "same.ustx").tracks },
  { format: "svp", count: 2, parse: () => parseSvp(svp, "same.svp") },
  { format: "ccs", count: 2, parse: () => parseCevio(cevio("Scenario"), "same.ccs", "ccs") },
  { format: "ccst", count: 2, parse: () => parseCevio(cevio("Definition"), "same.ccst", "ccst") },
];

function identities(tracks: AuthoredTrack[]) {
  return tracks.map(track => ({
    trackId: track.trackId,
    notes: track.notes.map(note => note.id),
    gaps: track.gaps.map(gap => gap.id),
  }));
}

describe("source-local import identities", () => {
  for (const { format, count, parse } of cases) {
    test(`${format}: IDs are unique within a result and repeatable across imports`, () => {
      const tracks = parse();
      expect(tracks).toHaveLength(count);
      const ids = identities(tracks);
      expect(identities(parse())).toEqual(ids);
      const allIds = ids.flatMap(track => [track.trackId, ...track.notes, ...track.gaps]);
      expect(allIds.every(id => typeof id === "string" && id.length > 0)).toBe(true);
      expect(new Set(allIds).size).toBe(allIds.length);
      for (const track of tracks) {
        expect((track as AuthoredTrack & { name: string }).name).toBe("Same name");
        expect(track.schema).toBe("amadeus.track/v2");
        expect(track.notes).toHaveLength(1);
        expect(track.notes[0]!.lyric).toBe("la");
        expect(track.notes[0]!.startTick).toBeGreaterThan(0);
        expect(track.gaps.length).toBeGreaterThan(0);
      }
    });
  }

  test("USTX keeps source part order and offsets after skipping an invalid part", () => {
    const tracks = importScore("ustx", ustx, "same.ustx").tracks;
    expect(tracks.map(track => track.trackId)).toEqual(["same_1_2", "same_1_3"]);
    expect(tracks.map(track => track.notes[0]!.startTick)).toEqual([120, 1080]);
  });
});
