import { expect, test } from "bun:test";
import { parseJapaneseLyric } from "../src/kana.ts";
import { finalize, plan, tickTo100ns } from "../src/implementation.ts";

const assert = {
  deepEqual(actual, expected) {
    expect(actual).toEqual(expected);
  },
  equal(actual, expected) {
    expect(actual).toBe(expected);
  },
  ok(value) {
    expect(value).toBeTruthy();
  },
  throws(fn, pattern) {
    expect(fn).toThrow(pattern);
  },
};

function phones(raw) {
  return parseJapaneseLyric(raw).flatMap((m) => m.phones);
}

function track(lyrics) {
  const ppq = 480;
  const notes = lyrics.map((lyric, i) => ({
    id: `n${i + 1}`,
    startTick: i * ppq,
    endTick: (i + 1) * ppq,
    pitch: 60 + i,
    lyric,
    language: "ja",
  }));
  return {
    schema: "amadeus.track/v2",
    trackId: "test",
    ppq,
    tempoMap: [{ tick: 0, bpm: 120 }],
    meterMap: [{ tick: 0, beats: 4, beatType: 4 }],
    extent: { startTick: 0, endTick: lyrics.length * ppq },
    languageRoute: ["ja"],
    notes,
    gaps: [],
  };
}

test("kana and katakana map deterministically", () => {
  assert.deepEqual(phones("かな"), ["k", "a", "n", "a"]);
  assert.deepEqual(phones("キャ"), ["ky", "a"]);
  assert.deepEqual(phones("シ"), ["sh", "i"]);
  assert.deepEqual(phones("ッ"), ["cl"]);
  assert.deepEqual(phones("ン"), ["N"]);
});

test("NFC normalization handles decomposed dakuten", () => {
  assert.deepEqual(phones("か\u3099"), ["g", "a"]);
});

test("OpenUtau VCV prefix is syntax-normalized", () => {
  assert.deepEqual(phones("a か"), ["k", "a"]);
  assert.deepEqual(phones("- あ"), ["a"]);
  assert.deepEqual(phones("* た"), ["t", "a"]);
});

test("explicit canonical CVVC fragment is retained", () => {
  assert.deepEqual(phones("a k"), ["a", "k"]);
  assert.deepEqual(phones("k a"), ["k", "a"]);
});

test("long-vowel mark repeats the preceding vowel", () => {
  assert.deepEqual(phones("カー"), ["k", "a", "a"]);
});

test("tick conversion is tempo aware", () => {
  const t = track(["あ"]);
  assert.equal(tickTo100ns(t, 480), 5_000_000);
});

test("vowel anchoring moves next consonant before note boundary", () => {
  const t = track(["か", "な"]);
  const p = plan(t, { vowelAnchoring: true, consonantLeadMs: 70 });
  assert.ok(!("kind" in p));
  if ("kind" in p) return;
  const note2Start = tickTo100ns(t, 480);
  const n2 = p.phones.filter((x) => x.ownerId === "n2");
  assert.equal(n2[0].phone, "n");
  assert.equal(n2[1].phone, "a");
  assert.ok(n2[0].start < note2Start);
  assert.equal(n2[1].start, note2Start);
  assert.equal(n2[0].id, "note:n2:phone:0");
  assert.equal(n2[1].id, "note:n2:phone:1");
});

test("anchoring off keeps consonant at note boundary and delays vowel", () => {
  const t = track(["か", "な"]);
  const p = plan(t, { vowelAnchoring: false, consonantLeadMs: 70 });
  assert.ok(!("kind" in p));
  if ("kind" in p) return;
  const note2Start = tickTo100ns(t, 480);
  const n2 = p.phones.filter((x) => x.ownerId === "n2");
  assert.equal(n2[0].start, note2Start);
  assert.ok(n2[1].start > note2Start);
});

test("finalize applies boundary edit by stable phone id", () => {
  const t = track(["か", "な"]);
  const p = plan(t, { vowelAnchoring: true, consonantLeadMs: 70 });
  assert.ok(!("kind" in p));
  if ("kind" in p) return;
  const target = p.phones.find((x) => x.id === "note:n2:phone:0");
  const before = target.start;
  const score = finalize(p, [{ phoneId: target.id, boundaryOffset100ns: 20_000 }]);
  assert.equal(score.kind, "neutrino_sinsy_v1");
  const row = score.rows.find((x) => x.sourcePhoneId === target.id);
  assert.equal(row.start, before + 20_000);
  assert.equal(score.kind, "neutrino_sinsy_v1");
});

test("explicit gap survives plan/finalize as a gap row", () => {
  const t = {
    schema: "amadeus.track/v2",
    trackId: "gap-test",
    ppq: 480,
    tempoMap: [{ tick: 0, bpm: 120 }],
    meterMap: [{ tick: 0, beats: 4, beatType: 4 }],
    extent: { startTick: 0, endTick: 960 },
    languageRoute: ["ja-JP"],
    notes: [{ id: "n1", startTick: 0, endTick: 480, pitch: 60, lyric: "あ", language: "ja-JP" }],
    gaps: [{ id: "g1", startTick: 480, endTick: 960, kind: "pau" }],
  };
  const p = plan(t);
  assert.ok(!("kind" in p));
  if ("kind" in p) return;
  assert.equal(p.phones.at(-1).phone, "pau");
  const score = finalize(p);
  assert.equal(score.kind, "neutrino_sinsy_v1");
  assert.equal(score.rows.at(-1).gapId, "g1");
  assert.equal(score.rows.at(-1).contexts, undefined);
});

test("unsupported mora fails instead of guessing", () => {
  assert.throws(() => parseJapaneseLyric("☆"), /unsupported Japanese mora/);
});
