/**
 * Small deterministic Japanese lyric normalizer.
 *
 * Inputs deliberately accepted:
 * - hiragana / katakana morae
 * - OpenUtau-style VCV aliases such as `a か`, `i し`, `- あ`, `* た`
 * - explicit canonical CVVC fragments such as `a k`
 * - canonical phone sequences such as `k a`, `sh i`, `N`, `cl`
 *
 * No dictionary/G2P/model inference is performed.
 */

export const VOWELS = new Set(["a", "i", "u", "e", "o"]);
export const MORAIC_ANCHORS = new Set(["a", "i", "u", "e", "o", "N"]);

export const JA_PHONES = new Set([
  "a",
  "i",
  "u",
  "e",
  "o",
  "k",
  "ky",
  "g",
  "gy",
  "s",
  "sh",
  "z",
  "j",
  "t",
  "ch",
  "ts",
  "d",
  "dy",
  "n",
  "ny",
  "h",
  "hy",
  "f",
  "b",
  "by",
  "p",
  "py",
  "m",
  "my",
  "y",
  "r",
  "ry",
  "w",
  "v",
  "N",
  "cl",
  "pau",
  "sil",
  "br",
]);

export interface Mora {
  source: string;
  phones: string[];
}

const BASIC: Record<string, string[]> = {
  ぁ: ["a"],
  あ: ["a"],
  ぃ: ["i"],
  い: ["i"],
  ぅ: ["u"],
  う: ["u"],
  ぇ: ["e"],
  え: ["e"],
  ぉ: ["o"],
  お: ["o"],
  を: ["o"],
  か: ["k", "a"],
  き: ["k", "i"],
  く: ["k", "u"],
  け: ["k", "e"],
  こ: ["k", "o"],
  が: ["g", "a"],
  ぎ: ["g", "i"],
  ぐ: ["g", "u"],
  げ: ["g", "e"],
  ご: ["g", "o"],
  さ: ["s", "a"],
  し: ["sh", "i"],
  す: ["s", "u"],
  せ: ["s", "e"],
  そ: ["s", "o"],
  ざ: ["z", "a"],
  じ: ["j", "i"],
  ず: ["z", "u"],
  ぜ: ["z", "e"],
  ぞ: ["z", "o"],
  た: ["t", "a"],
  ち: ["ch", "i"],
  つ: ["ts", "u"],
  て: ["t", "e"],
  と: ["t", "o"],
  だ: ["d", "a"],
  ぢ: ["j", "i"],
  づ: ["z", "u"],
  で: ["d", "e"],
  ど: ["d", "o"],
  な: ["n", "a"],
  に: ["n", "i"],
  ぬ: ["n", "u"],
  ね: ["n", "e"],
  の: ["n", "o"],
  は: ["h", "a"],
  ひ: ["h", "i"],
  ふ: ["h", "u"],
  へ: ["h", "e"],
  ほ: ["h", "o"],
  ば: ["b", "a"],
  び: ["b", "i"],
  ぶ: ["b", "u"],
  べ: ["b", "e"],
  ぼ: ["b", "o"],
  ぱ: ["p", "a"],
  ぴ: ["p", "i"],
  ぷ: ["p", "u"],
  ぺ: ["p", "e"],
  ぽ: ["p", "o"],
  ま: ["m", "a"],
  み: ["m", "i"],
  む: ["m", "u"],
  め: ["m", "e"],
  も: ["m", "o"],
  ゃ: ["y", "a"],
  や: ["y", "a"],
  ゅ: ["y", "u"],
  ゆ: ["y", "u"],
  ょ: ["y", "o"],
  よ: ["y", "o"],
  ら: ["r", "a"],
  り: ["r", "i"],
  る: ["r", "u"],
  れ: ["r", "e"],
  ろ: ["r", "o"],
  わ: ["w", "a"],
  ゐ: ["i"],
  ゑ: ["e"],
  ん: ["N"],
  っ: ["cl"],
  ゔ: ["v", "u"],
};

const DIGRAPH: Record<string, string[]> = {
  きゃ: ["ky", "a"],
  きゅ: ["ky", "u"],
  きぇ: ["ky", "e"],
  きょ: ["ky", "o"],
  ぎゃ: ["gy", "a"],
  ぎゅ: ["gy", "u"],
  ぎぇ: ["gy", "e"],
  ぎょ: ["gy", "o"],
  しゃ: ["sh", "a"],
  しゅ: ["sh", "u"],
  しぇ: ["sh", "e"],
  しょ: ["sh", "o"],
  じゃ: ["j", "a"],
  じゅ: ["j", "u"],
  じぇ: ["j", "e"],
  じょ: ["j", "o"],
  ぢゃ: ["j", "a"],
  ぢゅ: ["j", "u"],
  ぢぇ: ["j", "e"],
  ぢょ: ["j", "o"],
  ちゃ: ["ch", "a"],
  ちゅ: ["ch", "u"],
  ちぇ: ["ch", "e"],
  ちょ: ["ch", "o"],
  にゃ: ["ny", "a"],
  にゅ: ["ny", "u"],
  にぇ: ["ny", "e"],
  にょ: ["ny", "o"],
  ひゃ: ["hy", "a"],
  ひゅ: ["hy", "u"],
  ひぇ: ["hy", "e"],
  ひょ: ["hy", "o"],
  びゃ: ["by", "a"],
  びゅ: ["by", "u"],
  びぇ: ["by", "e"],
  びょ: ["by", "o"],
  ぴゃ: ["py", "a"],
  ぴゅ: ["py", "u"],
  ぴぇ: ["py", "e"],
  ぴょ: ["py", "o"],
  みゃ: ["my", "a"],
  みゅ: ["my", "u"],
  みぇ: ["my", "e"],
  みょ: ["my", "o"],
  りゃ: ["ry", "a"],
  りゅ: ["ry", "u"],
  りぇ: ["ry", "e"],
  りょ: ["ry", "o"],

  つぁ: ["ts", "a"],
  つぃ: ["ts", "i"],
  つぇ: ["ts", "e"],
  つぉ: ["ts", "o"],
  てぃ: ["t", "i"],
  てゅ: ["t", "u"],
  でぃ: ["d", "i"],
  でゅ: ["dy", "u"],
  とぅ: ["t", "u"],
  どぅ: ["d", "u"],
  ふぁ: ["f", "a"],
  ふぃ: ["f", "i"],
  ふぇ: ["f", "e"],
  ふぉ: ["f", "o"],
  うぃ: ["w", "i"],
  うぇ: ["w", "e"],
  うぉ: ["w", "o"],
  いぇ: ["y", "e"],
  ゔぁ: ["v", "a"],
  ゔぃ: ["v", "i"],
  ゔぇ: ["v", "e"],
  ゔぉ: ["v", "o"],
};

function katakanaToHiragana(input: string): string {
  let out = "";
  for (const ch of input) {
    const code = ch.codePointAt(0)!;
    if (code >= 0x30a1 && code <= 0x30f6) out += String.fromCodePoint(code - 0x60);
    else out += ch;
  }
  return out;
}

function normalizeSurface(input: string): string {
  return katakanaToHiragana(input.normalize("NFC").trim())
    .replace(/[\t\r\n]+/g, " ")
    .replace(/\s+/g, " ");
}

function isCanonicalPhoneSequence(text: string): boolean {
  if (!text) return false;
  const tokens = text.split(/\s+/);
  return tokens.every((token) => JA_PHONES.has(token));
}

function stripOpenUtauAliasPrefix(text: string): string {
  // OpenUtau-style aliases: "a か", "N か", "- あ", "* か".
  const m = text.match(/^(?:[aeiouNn]|-|\*)\s+(.+)$/u);
  return m ? m[1]!.trim() : text;
}

function lastVowel(phones: string[]): string | null {
  for (let i = phones.length - 1; i >= 0; i--) {
    if (VOWELS.has(phones[i]!)) return phones[i]!;
  }
  return null;
}

export function parseJapaneseLyric(raw: string, previousVowel: string | null = null): Mora[] {
  let text = normalizeSurface(raw);
  if (!text || text === "+") {
    if (!previousVowel) throw new Error("lyric extender has no previous vowel");
    return [{ source: text || "+", phones: [previousVowel] }];
  }
  if (text === "-") return [{ source: text, phones: ["pau"] }];

  // Direct canonical phone/CVVC input is always explicit and therefore wins.
  if (isCanonicalPhoneSequence(text)) {
    return [{ source: text, phones: text.split(/\s+/) }];
  }

  // Normalize VCV/CV aliases into their current kana. This is syntax handling,
  // not voicebank lookup: no oto/presamp data is guessed.
  text = stripOpenUtauAliasPrefix(text);

  if (isCanonicalPhoneSequence(text)) {
    return [{ source: text, phones: text.split(/\s+/) }];
  }

  // Common punctuation is a separator, not a pronounced symbol.
  text = text.replace(/[、。,.!?！？・]/g, "");
  if (!text) return [{ source: raw, phones: ["pau"] }];

  const morae: Mora[] = [];
  let inheritedVowel = previousVowel;
  for (let i = 0; i < text.length;) {
    const one = text[i]!;
    if (one === "ー") {
      if (!inheritedVowel) throw new Error("long-vowel mark has no preceding vowel");
      morae.push({ source: one, phones: [inheritedVowel] });
      i += 1;
      continue;
    }

    const two = text.slice(i, i + 2);
    const phones = DIGRAPH[two] ?? BASIC[one];
    const source = DIGRAPH[two] ? two : one;
    if (!phones) throw new Error(`unsupported Japanese mora: ${JSON.stringify(source)}`);
    morae.push({ source, phones: [...phones] });
    inheritedVowel = lastVowel(phones) ?? inheritedVowel;
    i += DIGRAPH[two] ? 2 : 1;
  }
  return morae;
}

export function trailingVowel(morae: Mora[], fallback: string | null = null): string | null {
  for (let i = morae.length - 1; i >= 0; i--) {
    const found = lastVowel(morae[i]!.phones);
    if (found) return found;
  }
  return fallback;
}

export function roleForPhone(
  phones: string[],
  index: number,
): "pre" | "anchor" | "tail" | "breath" {
  const phone = phones[index]!;
  if (phone === "pau" || phone === "sil" || phone === "br") return "breath";
  const anchor = phones.findIndex((candidate) => MORAIC_ANCHORS.has(candidate));
  if (anchor < 0) return "tail";
  if (index < anchor) return "pre";
  if (index === anchor) return "anchor";
  return "tail";
}
