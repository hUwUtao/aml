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
  for (const [kana, vowel] of rows.split(" ").map((x) => x.split(":") as [string, string])) {
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
  a:["a"], i:["i"], u:["u"], e:["e"], o:["o"], n:["N"], "n'":["N"],
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

// Common lyric vocabulary. Prefer whole words over ambiguous single-kanji readings.
const KANJI_READINGS: Record<string, string> = {
  今日: "きょう", 明日: "あした", 昨日: "きのう", 今夜: "こんや",
  明後日: "あさって", 一昨日: "おととい", 毎日: "まいにち", 何時: "なんじ",
  今年: "ことし", 去年: "きょねん", 来年: "らいねん", 今朝: "けさ",
  今度: "こんど", 最後: "さいご", 最初: "さいしょ", 瞬間: "しゅんかん",
  一瞬: "いっしゅん", 永久: "えいきゅう", 久しぶり: "ひさしぶり",
  夕焼け: "ゆうやけ", 朝焼け: "あさやけ", 夜明け: "よあけ", 真夜中: "まよなか",
  満月: "まんげつ", 三日月: "みかづき", 流れ星: "ながれぼし", 星屑: "ほしくず",
  木漏れ日: "こもれび", 日差し: "ひざし", 陽だまり: "ひだまり", 虹: "にじ",
  雲: "くも", 霧: "きり", 霞: "かすみ", 嵐: "あらし", 波: "なみ",
  大地: "だいち", 水平線: "すいへいせん", 地平線: "ちへいせん",
  向日葵: "ひまわり", 紫陽花: "あじさい", 薔薇: "ばら", 紅葉: "もみじ",
  花火: "はなび", 花びら: "はなびら", 木: "き", 森: "もり", 山: "やま",
  川: "かわ", 河: "かわ", 水: "みず", 火: "ひ", 土: "つち", 石: "いし",
  鳥: "とり", 魚: "さかな", 犬: "いぬ", 猫: "ねこ", 蝶: "ちょう",
  翼: "つばさ", 羽: "はね", 船: "ふね", 窓: "まど", 扉: "とびら",
  部屋: "へや", 屋根: "やね", 階段: "かいだん", 駅: "えき", 橋: "はし",
  故郷: "ふるさと", 場所: "ばしょ", 町: "まち", 都会: "とかい",
  運命: "うんめい", 奇跡: "きせき", 理由: "りゆう", 答え: "こたえ",
  秘密: "ひみつ", 魔法: "まほう", 物語: "ものがたり", 願い: "ねがい",
  祈り: "いのり", 勇気: "ゆうき", 自由: "じゆう", 平和: "へいわ",
  孤独: "こどく", 不安: "ふあん", 後悔: "こうかい", 嘘: "うそ",
  真実: "しんじつ", 現実: "げんじつ", 幻: "まぼろし", 形: "かたち",
  絆: "きずな", 宝物: "たからもの", 面影: "おもかげ", 温もり: "ぬくもり",
  情熱: "じょうねつ", 感情: "かんじょう", 感謝: "かんしゃ",
  瞳: "ひとみ", 胸: "むね", 体: "からだ", 身体: "からだ", 命: "いのち",
  指: "ゆび", 足: "あし", 腕: "うで", 肩: "かた", 髪: "かみ", 頬: "ほほ",
  唇: "くちびる", 鼓動: "こどう", 呼吸: "こきゅう", 吐息: "といき",
  足音: "あしおと", 手紙: "てがみ", 名前: "なまえ", 写真: "しゃしん",
  母: "はは", 父: "ちち", 兄: "あに", 姉: "あね", 弟: "おとうと", 妹: "いもうと",
  彼女: "かのじょ", 彼: "かれ", 貴方: "あなた", 貴女: "あなた",
  僕ら: "ぼくら", 僕達: "ぼくたち", 私達: "わたしたち", 君達: "きみたち",
  誰: "だれ", 何: "なに", 何度: "なんど", 何故: "なぜ", 全て: "すべて",
  良かった: "よかった", 良い: "よい", 良く: "よく",
  大丈夫: "だいじょうぶ", 不思議: "ふしぎ", 綺麗: "きれい", 綺麗な: "きれいな",
  上手: "じょうず", 下手: "へた", 人気: "にんき", 人生: "じんせい",
  大きい: "おおきい", 小さい: "ちいさい", 広い: "ひろい", 狭い: "せまい",
  長い: "ながい", 短い: "みじかい", 高い: "たかい", 低い: "ひくい",
  暖かい: "あたたかい", 温かい: "あたたかい", 冷たい: "つめたい",
  暑い: "あつい", 熱い: "あつい", 寒い: "さむい", 眩しい: "まぶしい",
  寂しい: "さびしい", 淋しい: "さびしい", 苦しい: "くるしい", 愛しい: "いとしい",
  切ない: "せつない", 儚い: "はかない", 懐かしい: "なつかしい",
  青春: "せいしゅん", 真っ白: "まっしろ", 真っ赤: "まっか", 真っ暗: "まっくら",
  好: "す", 愛し: "あいし", 恋し: "こいし", 笑っ: "わらっ", 笑い: "わらい",
  歌っ: "うたっ", 歌い: "うたい", 歌う: "うたう", 歩: "ある", 走: "はし",
  食べ: "たべ", 飲: "の", 読: "よ", 書: "か", 話: "はな", 語: "かた",
  呼: "よ", 叫: "さけ", 眠: "ねむ", 目覚め: "めざめ", 起き: "おき",
  行く: "いく", 行き: "いき", 行っ: "いっ", 来る: "くる", 来て: "きて",
  来た: "きた", 来ない: "こない", 来よう: "こよう", 来い: "こい",
  帰っ: "かえっ", 帰り: "かえり", 帰る: "かえる", 帰ろ: "かえろ",
  出会: "であ", 出来: "でき", 出し: "だし", 出す: "だす", 出せ: "だせ",
  出る: "でる", 出て: "でて", 出た: "でた", 出よう: "でよう",
  入る: "はいる", 入っ: "はいっ", 入り: "はいり", 入れ: "いれ",
  生け: "いけ", 生涯: "しょうがい",
  抱き: "だき", 抱く: "だく", 抱い: "だい", 抱え: "かかえ",
  抱きしめ: "だきしめ", 繋: "つな", 離: "はな", 放: "はな", 探: "さが",
  守: "まも", 救: "すく", 許: "ゆる", 伝: "つた", 感じ: "かんじ",
  気付: "きづ", 気づ: "きづ", 気が付: "きがつ", 気がつ: "きがつ",
  振り返: "ふりかえ", 振り向: "ふりむ", 見上げ: "みあげ", 見つけ: "みつけ",
  見え: "みえ", 見せ: "みせ", 聞こえ: "きこえ", 輝: "かがや",
  消え: "きえ", 消し: "けし", 消す: "けす", 消さ: "けさ", 消せ: "けせ",
  溢: "あふ", 溶け: "とけ", 揺れ: "ゆれ", 触れ: "ふれ", 触る: "さわる",
  越え: "こえ", 超え: "こえ", 進: "すす", 選: "えら", 信じ: "しんじ",

  未来: "みらい", 過去: "かこ", 時間: "じかん", 世界: "せかい",
  宇宙: "うちゅう", 地球: "ちきゅう", 日本: "にほん", 言葉: "ことば",
  気持ち: "きもち", 笑顔: "えがお", 涙: "なみだ", 笑う: "わらう",
  大人: "おとな", 子供: "こども", 一人: "ひとり", 二人: "ふたり",
  一緒: "いっしょ", 自分: "じぶん", 本当: "ほんとう", 大切: "たいせつ",
  大好き: "だいすき", 好き: "すき", 素敵: "すてき", 幸せ: "しあわせ",
  永遠: "えいえん", 希望: "きぼう", 約束: "やくそく", 記憶: "きおく",
  思い出: "おもいで", 季節: "きせつ", 桜: "さくら", 雪: "ゆき",
  太陽: "たいよう", 星空: "ほしぞら", 青空: "あおぞら", 夜空: "よぞら",
  朝日: "あさひ", 夕日: "ゆうひ", 夕暮れ: "ゆうぐれ", 景色: "けしき",
  電車: "でんしゃ", 学校: "がっこう", 友達: "ともだち", 家族: "かぞく",
  音楽: "おんがく", 歌声: "うたごえ", 心: "こころ", 愛: "あい",
  恋: "こい", 夢: "ゆめ", 君: "きみ", 僕: "ぼく", 私: "わたし",
  空: "そら", 海: "うみ", 風: "かぜ", 雨: "あめ", 星: "ほし",
  月: "つき", 花: "はな", 光: "ひかり", 闇: "やみ", 影: "かげ",
  声: "こえ", 歌: "うた", 音: "おと", 道: "みち", 街: "まち",
  人: "ひと", 手: "て", 目: "め", 耳: "みみ", 口: "くち",
  春: "はる", 夏: "なつ", 秋: "あき", 冬: "ふゆ", 朝: "あさ",
  昼: "ひる", 夜: "よる", 今: "いま", 時: "とき", 色: "いろ",
  白い: "しろい", 黒い: "くろい", 赤い: "あかい", 青い: "あおい",
  遠い: "とおい", 近い: "ちかい", 強い: "つよい", 弱い: "よわい",
  優しい: "やさしい", 悲しい: "かなしい", 嬉しい: "うれしい",
  楽しい: "たのしい", 美しい: "うつくしい", 新しい: "あたらしい",
  古い: "ふるい", 小さな: "ちいさな", 大きな: "おおきな",
  生き: "いき", 生まれ: "うまれ", 歩く: "あるく", 走る: "はしる",
  会い: "あい", 会う: "あう", 逢い: "あい", 逢う: "あう",
  見: "み", 聞: "き", 言: "い", 思: "おも", 想: "おも",
  忘: "わす", 信: "しん", 待: "ま", 泣: "な", 咲: "さ",
  届: "とど", 続: "つづ", 変: "か", 帰: "かえ", 知: "し",
};
const KANJI_WORDS = Object.keys(KANJI_READINGS).sort((a, b) => b.length - a.length);

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
    if (input.slice(offset) === "nn") {
      memo.set(offset, ["N"]);
      return ["N"];
    }
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

export function parseJapaneseLyric(
  raw: string,
  previousVowel: string | null = null,
  onSkipped?: (message: string) => void,
): Mora[] {
  let text = normalizeSurface(raw);
  if (!text || text === "+" || text === "-") {
    if (!previousVowel) {
      if (!onSkipped) throw new Error("lyric extender has no previous vowel");
      onSkipped("lyric extender has no previous vowel");
      return [];
    }
    return [{ source: text || "+", phones: [previousVowel] }];
  }
  if (isCanonicalPhoneSequence(text)) return [{ source: text, phones: text.split(/\s+/) }];
  text = stripOpenUtauAliasPrefix(text);
  if (isCanonicalPhoneSequence(text)) return [{ source: text, phones: text.split(/\s+/) }];
  const romanized = parseRomanizedText(text);
  if (romanized) return [{ source: text, phones: romanized }];
  if (onSkipped && /^[\x20-\x7e]+$/.test(text)) {
    const morae: Mora[] = [];
    for (const token of text.split(/\s+/)) {
      const phones = JA_PHONES.has(token) ? [token] : parseRomanizedToken(token);
      if (phones) morae.push({ source: token, phones });
      else onSkipped(`unsupported Japanese phone: ${JSON.stringify(token)}`);
    }
    return morae;
  }
  text = text.replace(/[、。,.!?！？・]/g, "");
  if (!text) return [{ source: raw, phones: ["pau"] }];
  text = text.replace(/[\p{Script=Han}\p{Script=Hiragana}]+/gu, (run) => {
    let reading = "";
    for (let i = 0; i < run.length;) {
      const word = KANJI_WORDS.find((candidate) => run.startsWith(candidate, i));
      reading += word ? KANJI_READINGS[word] : run[i];
      i += word?.length ?? 1;
    }
    return reading;
  });
  const morae: Mora[] = [];
  let inheritedVowel = previousVowel;
  for (let i = 0; i < text.length;) {
    const one = text[i]!;
    if (onSkipped && /\s/u.test(one)) { i++; continue; }
    if (one === "ー") {
      if (!inheritedVowel) {
        if (!onSkipped) throw new Error("long-vowel mark has no preceding vowel");
        onSkipped("long-vowel mark has no preceding vowel");
        i++;
        continue;
      }
      morae.push({ source: one, phones: [inheritedVowel] }); i++; continue;
    }
    const two = text.slice(i, i + 2);
    const phones = DIGRAPH[two] ?? BASIC[one];
    const source = DIGRAPH[two] ? two : one;
    if (!phones) {
      const unsupported = String.fromCodePoint(text.codePointAt(i)!);
      const message = `unsupported Japanese mora: ${JSON.stringify(unsupported)}`;
      if (!onSkipped) throw new Error(message);
      onSkipped(message);
      inheritedVowel = null;
      i += unsupported.length;
      continue;
    }
    morae.push({ source, phones: [...phones] }); inheritedVowel = lastVowel(phones) ?? inheritedVowel;
    i += DIGRAPH[two] ? 2 : 1;
  }
  return morae;
}
export function trailingVowel(morae: Mora[], fallback: string | null = null): string | null {
  for (let i = morae.length - 1; i >= 0; i--) {
    const phones = morae[i]!.phones;
    for (let j = phones.length - 1; j >= 0; j--) {
      const phone = phones[j]!;
      if (phone === "pau" || phone === "sil" || phone === "br") return null;
      if (VOWELS.has(phone)) return phone;
    }
  }
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
