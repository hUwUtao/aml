/** Deterministic Japanese lyric normalizer for CV/VCV/CVVC input. */

export const VOWELS = new Set(["a", "i", "u", "e", "o"]);
export const MORAIC_ANCHORS = new Set(["a", "i", "u", "e", "o", "N"]);
export const JA_PHONES = new Set([
  "a", "i", "u", "e", "o", "k", "ky", "g", "gy", "s", "sh", "z", "j",
  "t", "ch", "ts", "d", "dy", "n", "ny", "h", "hy", "f", "b", "by", "p",
  "py", "m", "my", "y", "r", "ry", "w", "v", "N", "cl", "pau", "sil", "br",
]);

export interface Mora { source: string; phones: string[]; }

const BASIC: Record<string, string[]> = {};
const add = (rows: string, phone: string) => {
  for (const [kana, vowel] of rows.split(" ").map((x) => x.split(":"))) {
    BASIC[kana] = phone ? [phone, vowel] : [vowel];
  }
};
add("あ:a い:i う:u え:e お:o", "");
add("か:a き:i く:u け:e こ:o", "k");
add("が:a ぎ:i ぐ:u げ:e ご:o", "g");
add("さ:a し:i す:u せ:e そ:o", "s");
BASIC.し = ["sh", "i"];
add("ざ:a じ:i ず:u ぜ:e ぞ:o", "z");
BASIC.じ = ["j", "i"];
add("た:a ち:i つ:u て:e と:o", "t");
BASIC.ち = ["ch", "i"];
BASIC.つ = ["ts", "u"];
add("だ:a ぢ:i づ:u で:e ど:o", "d");
BASIC.ぢ = ["j", "i"];
BASIC.づ = ["z", "u"];
add("な:a に:i ぬ:u ね:e の:o", "n");
add("は:a ひ:i ふ:u へ:e ほ:o", "h");
BASIC.ふ = ["f", "u"];
add("ば:a び:i ぶ:u べ:e ぼ:o", "b");
add("ぱ:a ぴ:i ぷ:u ぺ:e ぽ:o", "p");
add("ま:a み:i む:u め:e も:o", "m");
add("や:a ゆ:u よ:o", "y");
add("ら:a り:i る:u れ:e ろ:o", "r");
add("わ:a ゐ:i ゑ:e を:o", "w");
BASIC.を = ["o"];
BASIC.ん = ["N"];
BASIC.っ = ["cl"];
BASIC.ゔ = ["v", "u"];
for (const [k, v] of [["ぁ", "a"], ["ぃ", "i"], ["ぅ", "u"], ["ぇ", "e"], ["ぉ", "o"], ["ゃ", "a"], ["ゅ", "u"], ["ょ", "o"]] as const) BASIC[k] = [v];

const DIGRAPH: Record<string, string[]> = {
  きゃ:["ky","a"], きゅ:["ky","u"], きぇ:["ky","e"], きょ:["ky","o"],
  ぎゃ:["gy","a"], ぎゅ:["gy","u"], ぎぇ:["gy","e"], ぎょ:["gy","o"],
  しゃ:["sh","a"], しゅ:["sh","u"], しぇ:["sh","e"], しょ:["sh","o"],
  じゃ:["j","a"], じゅ:["j","u"], じぇ:["j","e"], じょ:["j","o"],
  ちゃ:["ch","a"], ちゅ:["ch","u"], ちぇ:["ch","e"], ちょ:["ch","o"],
  にゃ:["ny","a"], にゅ:["ny","u"], にぇ:["ny","e"], にょ:["ny","o"],
  ひゃ:["hy","a"], ひゅ:["hy","u"], ひぇ:["hy","e"], ひょ:["hy","o"],
  びゃ:["by","a"], びゅ:["by","u"], びぇ:["by","e"], びょ:["by","o"],
  ぴゃ:["py","a"], ぴゅ:["py","u"], ぴぇ:["py","e"], ぴょ:["py","o"],
  みゃ:["my","a"], みゅ:["my","u"], みぇ:["my","e"], みょ:["my","o"],
  りゃ:["ry","a"], りゅ:["ry","u"], りぇ:["ry","e"], りょ:["ry","o"],
  ふぁ:["f","a"], ふぃ:["f","i"], ふぇ:["f","e"], ふぉ:["f","o"],
  てぃ:["t","i"], でぃ:["d","i"], でゅ:["dy","u"], とぅ:["t","u"],
  どぅ:["d","u"], うぃ:["w","i"], うぇ:["w","e"], うぉ:["w","o"],
};

// Values are canonical phones; the longest-match parser also accepts compact words.
const ROMAJI: Record<string, string[]> = {
  a:["a"], i:["i"], u:["u"], e:["e"], o:["o"], n:["N"], nn:["N"], "n'":["N"],
  ka:["k","a"],ki:["k","i"],ku:["k","u"],ke:["k","e"],ko:["k","o"],
  ga:["g","a"],gi:["g","i"],gu:["g","u"],ge:["g","e"],go:["g","o"],
  sa:["s","a"],si:["sh","i"],shi:["sh","i"],su:["s","u"],se:["s","e"],so:["s","o"],
  za:["z","a"],zi:["j","i"],ji:["j","i"],zu:["z","u"],ze:["z","e"],zo:["z","o"],
  ta:["t","a"],ti:["ch","i"],chi:["ch","i"],tu:["ts","u"],tsu:["ts","u"],te:["t","e"],to:["t","o"],
  da:["d","a"],di:["d","i"],du:["d","u"],de:["d","e"],do:["d","o"],
  na:["n","a"],ni:["n","i"],nu:["n","u"],ne:["n","e"],no:["n","o"],
  ha:["h","a"],hi:["h","i"],hu:["h","u"],fu:["f","u"],he:["h","e"],ho:["h","o"],
  ba:["b","a"],bi:["b","i"],bu:["b","u"],be:["b","e"],bo:["b","o"],pa:["p","a"],pi:["p","i"],pu:["p","u"],pe:["p","e"],po:["p","o"],
  ma:["m","a"],mi:["m","i"],mu:["m","u"],me:["m","e"],mo:["m","o"],ya:["y","a"],yu:["y","u"],yo:["y","o"],
  ra:["r","a"],ri:["r","i"],ru:["r","u"],re:["r","e"],ro:["r","o"],wa:["w","a"],wi:["w","i"],we:["w","e"],wo:["o"],
  kya:["ky","a"],kyu:["ky","u"],kye:["ky","e"],kyo:["ky","o"],gya:["gy","a"],gyu:["gy","u"],gye:["gy","e"],gyo:["gy","o"],
  sha:["sh","a"],shu:["sh","u"],she:["sh","e"],sho:["sh","o"],ja:["j","a"],ju:["j","u"],je:["j","e"],jo:["j","o"],
  cha:["ch","a"],chu:["ch","u"],che:["ch","e"],cho:["ch","o"],nya:["ny","a"],nyu:["ny","u"],nye:["ny","e"],nyo:["ny","o"],
  hya:["hy","a"],hyu:["hy","u"],hye:["hy","e"],hyo:["hy","o"],bya:["by","a"],byu:["by","u"],bye:["by","e"],byo:["by","o"],
  pya:["py","a"],pyu:["py","u"],pye:["py","e"],pyo:["py","o"],mya:["my","a"],myu:["my","u"],mye:["my","e"],myo:["my","o"],
  rya:["ry","a"],ryu:["ry","u"],rye:["ry","e"],ryo:["ry","o"],xtsu:["cl"],ltsu:["cl"],
};

function katakanaToHiragana(input: string): string {
  return [...input].map((ch) => {
    const code = ch.codePointAt(0)!;
    return code >= 0x30a1 && code <= 0x30f6 ? String.fromCodePoint(code - 0x60) : ch;
  }).join("");
}
function normalizeSurface(input: string): string {
  return katakanaToHiragana(input.normalize("NFC").trim()).replace(/[\t\r\n]+/g, " ").replace(/\s+/g, " ");
}
function isCanonicalPhoneSequence(text: string): boolean {
  return !!text && text.split(/\s+/).every((token) => JA_PHONES.has(token));
}
function stripOpenUtauAliasPrefix(text: string): string {
  const m = text.match(/^(?:[aeiouNn]|-|\*)\s+(.+)$/u);
  return m ? m[1]!.trim() : text;
}
function lastVowel(phones: string[]): string | null {
  for (let i = phones.length - 1; i >= 0; i--) if (VOWELS.has(phones[i]!)) return phones[i]!;
  return null;
}
function parseRomanizedToken(token: string): string[] | null {
  const input = token.toLocaleLowerCase();
  const memo = new Map<number, string[] | null>();
  const visit = (offset: number): string[] | null => {
    if (offset === input.length) return [];
    if (memo.has(offset)) return memo.get(offset)!;
    const candidates = Object.keys(ROMAJI).filter((x) => input.startsWith(x, offset)).sort((a, b) => b.length - a.length);
    for (const candidate of candidates) {
      const tail = visit(offset + candidate.length);
      if (tail) { const result = [...ROMAJI[candidate]!, ...tail]; memo.set(offset, result); return result; }
    }
    memo.set(offset, null); return null;
  };
  return visit(0);
}
function parseRomanizedText(text: string): string[] | null {
  if (!/[a-z]/iu.test(text)) return null;
  const phones: string[] = [];
  for (const token of text.split(/\s+/)) { const parsed = parseRomanizedToken(token); if (!parsed) return null; phones.push(...parsed); }
  return phones;
}

export function parseJapaneseLyric(raw: string, previousVowel: string | null = null): Mora[] {
  let text = normalizeSurface(raw);
  if (!text || text === "+") {
    if (!previousVowel) throw new Error("lyric extender has no previous vowel");
    return [{ source: text || "+", phones: [previousVowel] }];
  }
  if (text === "-") return [{ source: text, phones: ["pau"] }];
  if (isCanonicalPhoneSequence(text)) return [{ source: text, phones: text.split(/\s+/) }];
  text = stripOpenUtauAliasPrefix(text);
  if (isCanonicalPhoneSequence(text)) return [{ source: text, phones: text.split(/\s+/) }];
  const romanized = parseRomanizedText(text);
  if (romanized) return [{ source: text, phones: romanized }];
  text = text.replace(/[、。,.!?！？・]/g, "");
  if (!text) return [{ source: raw, phones: ["pau"] }];
  const morae: Mora[] = [];
  let inheritedVowel = previousVowel;
  for (let i = 0; i < text.length;) {
    const one = text[i]!;
    if (one === "ー") {
      if (!inheritedVowel) throw new Error("long-vowel mark has no preceding vowel");
      morae.push({ source: one, phones: [inheritedVowel] }); i++; continue;
    }
    const two = text.slice(i, i + 2);
    const phones = DIGRAPH[two] ?? BASIC[one];
    const source = DIGRAPH[two] ? two : one;
    if (!phones) throw new Error(`unsupported Japanese mora: ${JSON.stringify(source)}`);
    morae.push({ source, phones: [...phones] }); inheritedVowel = lastVowel(phones) ?? inheritedVowel;
    i += DIGRAPH[two] ? 2 : 1;
  }
  return morae;
}
export function trailingVowel(morae: Mora[], fallback: string | null = null): string | null {
  for (let i = morae.length - 1; i >= 0; i--) { const found = lastVowel(morae[i]!.phones); if (found) return found; }
  return fallback;
}
export function roleForPhone(phones: string[], index: number): "pre" | "anchor" | "tail" | "breath" {
  const phone = phones[index]!;
  if (phone === "pau" || phone === "sil" || phone === "br") return "breath";
  const anchor = phones.findIndex((candidate) => MORAIC_ANCHORS.has(candidate));
  if (anchor < 0) return "tail";
  if (index < anchor) return "pre";
  if (index === anchor) return "anchor";
  return "tail";
}
