// Kana -> Hepburn romaji. Self-contained (no imports) so it can be unit-tested with plain Node.

const BASE: Record<string, string> = {
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o',
  か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko',
  が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go',
  さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so',
  ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
  た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to',
  だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do',
  な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no',
  は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
  ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo',
  ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo',
  や: 'ya', ゆ: 'yu', よ: 'yo',
  ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro',
  わ: 'wa', を: 'o', ん: 'n',
  ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o', ゔ: 'vu',
};

const SMALL_Y: Record<string, string> = { ゃ: 'a', ゅ: 'u', ょ: 'o' };

/** Convert katakana to hiragana (leaves everything else alone). */
export function toHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

export function toRomaji(input: string): string {
  const s = toHiragana(input);
  let out = '';
  let geminate = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const next = s[i + 1];

    if (c === 'っ') {
      geminate = true;
      continue;
    }
    if (c === 'ー') {
      const m = out.match(/[aeiou]$/);
      if (m) out += m[0];
      continue;
    }

    let syl: string | undefined;
    if (next && SMALL_Y[next] && BASE[c] && c !== 'ん') {
      // きゃ -> kya, しゃ -> sha, ちゃ -> cha, じゃ -> ja
      const b = BASE[c];
      const stem = b.endsWith('i') ? b.slice(0, -1) : b;
      syl = /^(sh|ch|j)$/.test(stem) ? stem + SMALL_Y[next] : stem + 'y' + SMALL_Y[next];
      i++;
    } else {
      syl = BASE[c];
    }

    if (syl === undefined) {
      out += c; // punctuation, kanji, latin
      geminate = false;
      continue;
    }

    if (c === 'ん' && next && /^[あいうえおやゆよ]$/.test(next)) syl = "n'";

    if (geminate) {
      out += syl.startsWith('ch') ? 't' : syl[0];
      geminate = false;
    }
    out += syl;
  }
  return out;
}

/**
 * Split a written form into its kanji part and trailing kana (okurigana).
 * 食べる -> { stem: '食', okurigana: 'べる' }
 */
export function splitOkurigana(written: string): { stem: string; okurigana: string } {
  const m = written.match(/^(.*?[^぀-ゟ゠-ヿ])([぀-ゟ]*)$/);
  if (!m) return { stem: written, okurigana: '' };
  return { stem: m[1], okurigana: m[2] };
}
