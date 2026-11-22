// Builds data/vocab-frequency.psv: the most common conversational words, in order.
//
// You don't need to run this: its output is committed. It's here so the list can be
// rebuilt or extended. It only READS data files (it never runs code from them):
//
//   1. npm pack @johnmorrisdotca/jisho  and extract it   -> JMdict (EDRDG, CC BY-SA 4.0)
//   2. git clone --depth 1 --filter=blob:none --sparse https://github.com/hermitdave/FrequencyWords
//      git -C FrequencyWords sparse-checkout set content/2018/ja   -> OpenSubtitles frequencies (CC BY-SA 4.0)
//   3. node scripts/import-jmdict.mjs <jisho package dir> <ja_full.txt> <ja_ignored.txt>
//      (ja_ignored.txt holds counts ja_full.txt leaves out, including one-kanji words like 犬)
//      Set WORDS=5000 to change how many words are written. The default, 10090, gives
//      exactly 10,000 once the overlap with data/vocab.psv is removed.
//
// Ranking: how often a word appears in film/TV subtitles (conversational Japanese), using
// JMdict's own frequency rank to break ties and to fill the list when subtitles don't
// cover a word. Only words JMdict marks as common are used.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [pkgDir, ...freqFiles] = process.argv.slice(2);
if (!pkgDir || !freqFiles.length) {
  console.error('usage: node scripts/import-jmdict.mjs <jisho package dir> <ja_full.txt> [ja_ignored.txt]');
  process.exit(1);
}
const COUNT = Number(process.env.WORDS ?? 10090);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wordsDir = join(pkgDir, 'dist', 'data', 'words');

/** String literals in a data file (the files are plain arrays of strings). */
const literals = (text) =>
  [...text.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => JSON.parse(`"${m[1]}"`)).filter((s) => s.includes('\t'));

// ---------------------------------------------------------------- JMdict common words
const UNRANKED = 100000;
function rankOf(stored) {
  const band = /(\d\d)$/.exec(stored)?.[1];
  if (band) return (Number(band) - 1) * 500 + 250;
  if (/[nisg]/.test(stored)) return 12000;
  if (/[mjth]/.test(stored)) return 24000;
  return UNRANKED;
}

const common = literals(readFileSync(join(wordsDir, 'common.data.js'), 'utf8')).map((line) => {
  const [reading, forms, whole, ...senses] = line.split('\t');
  const hash = whole.indexOf('#');
  const stored = hash < 0 ? whole : whole.slice(0, hash);
  const id = hash < 0 ? null : parseInt(whole.slice(hash + 1), 36);
  const tilde = stored.indexOf('~');
  const flags = tilde < 0 ? stored : stored.slice(0, tilde);
  return {
    id,
    reading,
    forms: forms ? forms.split('|') : [],
    kinds: flags.replace(/[CU]/g, ''),
    usuallyKana: flags.includes('U'),
    jmRank: rankOf(tilde < 0 ? '' : stored.slice(tilde + 1)),
    senses: senses.map((f) => {
      const [marks, ...glosses] = f.split('¦');
      return { marks: marks ? marks.split(',') : [], glosses };
    }),
  };
});

// Parts of speech live in the whole entries (e*.data.js), keyed by the same id.
const wanted = new Set(common.map((c) => c.id).filter(Boolean));
const posById = new Map();
for (const f of readdirSync(wordsDir).filter((f) => /^x?e\d+\.data\.js$/.test(f))) {
  for (const line of literals(readFileSync(join(wordsDir, f), 'utf8'))) {
    const [rawId, , , ...senses] = line.split('\t');
    const id = parseInt(rawId, 36);
    if (!wanted.has(id)) continue;
    posById.set(id, senses.map((s) => s.split('¦')[0].split(',')));
  }
}

// ---------------------------------------------------------------- subtitle frequencies
const freq = new Map();
for (const file of freqFiles) {
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const [tok, n] = line.split(' ');
    if (tok && n) freq.set(tok, (freq.get(tok) ?? 0) + Number(n));
  }
}

const KANA = /^[぀-ヿ]+$/;
const HAS_KANJI = /[一-鿿々]/;
// The subtitle tokens cut the last kana off verbs and adjectives: 食べる -> 食べ,
// 嬉しい -> 嬉し, 分かる -> 分か, 行く -> 行.
const stem = (form) => (/[぀-ゟ]$/.test(form) ? form.slice(0, -1) : form);

// Match whole forms, and the stem of the main form of inflecting words.
// A token several words could be shares its count evenly between them.
const exact = new Map(); // token -> rows whose written form IS the token
const stems = new Map(); // token -> inflecting rows whose main form's stem is the token
const add = (m, k, row) => {
  if (!freq.has(k)) return;
  if (!m.has(k)) m.set(k, []);
  m.get(k).push(row);
};
for (const row of common) {
  for (const f of row.forms) add(exact, f, row);
  if (row.usuallyKana || row.forms.length === 0) add(exact, row.reading, row);
  const main = row.forms[0];
  if (/[gika]/.test(row.kinds)) {
    if (main) {
      const s = stem(main);
      if (s && s !== main && HAS_KANJI.test(s)) add(stems, s, row);
    }
    // Words usually written in kana are counted by their kana stem (うれし).
    if ((row.usuallyKana || !main) && row.reading.length > 3) add(stems, stem(row.reading), row);
  }
}
const subScore = new Map();
const credit = (rows, n) => {
  for (const row of rows) subScore.set(row, Math.max(subScore.get(row) ?? 0, n / rows.length));
};
for (const tok of new Set([...exact.keys(), ...stems.keys()])) {
  const n = freq.get(tok);
  // A kana token that is a word in its own right (それ) belongs to that word, not to a
  // verb whose stem happens to look the same (それる).
  const kanaWord = KANA.test(tok) && (exact.get(tok) ?? []).length > 0;
  const st = kanaWord ? [] : stems.get(tok) ?? [];
  // Of the verbs/adjectives sharing a stem, the shortest is almost always the base
  // word (聞く over 聞かす, 知る over 知らせる); ties share.
  const len = (r) => (r.forms[0] ?? r.reading).length;
  const shortest = Math.min(...st.map(len));
  const base = st.filter((r) => len(r) === shortest);
  let ex = exact.get(tok) ?? [];
  // A one-character token can be a verb stem (行 from 行く) or a noun (力 ちから). Share
  // it, but drop nouns JMdict ranks far rarer than the verb (行 ぎょう). Verbs are never
  // dropped: JMdict's ranks come from newspapers and undervalue everyday verbs.
  if (base.length && ex.length && [...tok].length === 1) {
    const bv = Math.min(...base.map((r) => r.jmRank));
    ex = ex.filter((r) => r.jmRank <= 2 * bv);
  }
  credit([...base, ...ex], n);
}

// ---------------------------------------------------------------- types and topics
function typeOf(row) {
  const pos = (posById.get(row.id) ?? [[]])[0];
  const has = (p) => pos.some((x) => x === p || x.startsWith(p));
  if (has('v5')) return 'verb-u';
  if (has('v1')) return 'verb-ru';
  if (has('vk') || pos.includes('vs-i') || pos.includes('vs-s')) return 'verb-irr';
  if (has('adj-i')) return 'adj-i';
  if (has('adj-na')) return 'adj-na';
  if (has('adj-pn')) return 'adj-pre';
  if (has('adv')) return 'adverb';
  if (has('pn')) return 'pronoun';
  if (has('prt')) return 'particle';
  if (has('conj')) return 'conjunction';
  if (has('ctr')) return 'counter';
  if (has('num')) return 'number';
  if (has('int') || has('exp')) return 'expression';
  if (has('n') || has('adj-no')) return 'noun';
  if (has('suf') || has('pref')) return 'affix';
  // Fall back on the inflection class JMdict gives in the common table.
  if (row.kinds.includes('g')) return 'verb-u';
  if (row.kinds.includes('i')) return 'verb-ru';
  if (row.kinds.includes('k')) return 'verb-irr';
  if (row.kinds.includes('a')) return 'adj-i';
  if (row.kinds.includes('n')) return 'adj-na';
  return 'noun';
}

// Topic from JMdict field marks first, then words in the first meaning.
const FIELD_TOPIC = {
  food: 'food', cook: 'food', bot: 'nature', zool: 'nature', biol: 'nature', geol: 'nature', astron: 'nature',
  med: 'body-health', anat: 'body-health', physiol: 'body-health', pharm: 'body-health',
  sports: 'sports-hobbies', baseb: 'sports-hobbies', sumo: 'sports-hobbies', MA: 'sports-hobbies', music: 'sports-hobbies', cards: 'sports-hobbies', go: 'sports-hobbies', shogi: 'sports-hobbies',
  comp: 'science-tech', engr: 'science-tech', math: 'science-tech', physics: 'science-tech', chem: 'science-tech', elec: 'science-tech',
  econ: 'business-money', bus: 'business-money', finc: 'business-money', stockm: 'business-money',
  law: 'society', politics: 'society', mil: 'society', Buddh: 'society', Shinto: 'society', Christn: 'society',
};
const TOPIC_WORDS = [
  ['greetings', /\b(hello|goodbye|good (morning|night|evening)|thank|excuse me|sorry|welcome)\b/],
  ['food', /\b(eat|food|meal|dish|rice|bread|meat|fish|fruit|vegetable|drink|tea|coffee|sake|beer|wine|soup|cook|taste|delicious|breakfast|lunch|dinner|sweets?|sugar|salt|egg|milk|noodles?|restaurant|kitchen|hungry)\b/],
  ['time', /\b(time|day|week|month|year|hour|minute|second|morning|evening|night|today|tomorrow|yesterday|now|soon|later|early|late|ago|always|never|often|sometimes|season|spring|summer|autumn|winter|weekend|date|clock|future|past|recently|already|yet|period|era|age)\b/],
  ['people', /\b(person|people|man|woman|men|women|boy|girl|child|children|kid|baby|friend|family|mother|father|parent|brother|sister|son|daughter|husband|wife|grand\w*|uncle|aunt|cousin|wedding|marriage|marry|love|lover|partner|guest|neighbou?r|everyone|somebody|someone|stranger|mr|mrs|you|he|she|they|we|i|me)\b/],
  ['body-health', /\b(body|head|face|eyes?|ears?|nose|mouth|teeth|tooth|hand|arm|leg|foot|feet|heart|blood|hair|skin|bone|stomach|back|neck|ill|illness|sick|disease|hospital|doctor|medicine|pain|hurt|injur\w*|health|healthy|fever|cold|cough|tired|sleep|die|death|dead|alive|life|breath\w*)\b/],
  ['places', /\b(place|house|home|room|town|city|village|country|world|road|street|building|station|school|shop|store|office|park|area|region|inside|outside|left|right|front|behind|near|far|here|there|where|north|south|east|west|japan\w*|tokyo|america\w*|china|chinese|england|english|abroad)\b/],
  ['travel', /\b(travel|trip|journey|go|come|return|arrive|leave|depart\w*|car|train|bus|plane|airplane|airport|ship|boat|bicycle|taxi|drive|ride|walk|run|hotel|ticket|map|tour\w*|passport|luggage|road)\b/],
  ['nature', /\b(nature|weather|rain|snow|wind|sky|sun|moon|star|cloud|sea|ocean|river|mountain|lake|forest|tree|flower|grass|leaf|animal|dog|cat|bird|horse|cow|fish|insect|hot|cold|warm|cool|fire|water|earth|stone|rock|island)\b/],
  ['work-school', /\b(work|job|company|office|boss|employee|worker|meeting|study|student|teacher|school|university|class|lesson|exam|test|homework|book|read|write|letter|paper|pen|learn|teach|research|knowledge|question|answer|problem|report|project|plan|career)\b/],
  ['business-money', /\b(money|yen|price|cost|expensive|cheap|pay|buy|sell|shop|market|business|bank|tax|economy|trade|sales?|profit|budget|salary|wage|rich|poor|debt|loan|customer|product)\b/],
  ['feelings', /\b(happy|sad|angry|anger|afraid|fear|scared|worry|worried|anxious|glad|joy|lonely|surprised?|feel\w*|emotion|mood|like|dislike|hate|love|enjoy|fun|bored|boring|tired|nervous|calm|kind|gentle|cruel|shame|embarrass\w*|proud|jealous|hope|wish|want|desire|think|believe|remember|forget|mind|heart|spirit)\b/],
  ['conversation', /\b(say|speak|talk|tell|ask|answer|call|word|language|story|news|voice|listen|hear|explain|understand|mean|meaning|yes|no|ok|okay|really|well|maybe|perhaps|probably|of course|please|right)\b/],
  ['home', /\b(house|home|room|door|window|bed|table|chair|desk|kitchen|bath|toilet|clean|wash|laundry|clothes|wear|shoes?|bag|key|phone|television|tv|furniture)\b/],
  ['sports-hobbies', /\b(sport|game|play|ball|team|match|win|lose|race|swim|music|song|sing|dance|movie|film|picture|photo\w*|art|draw|paint|hobby|camera|guitar|piano|festival|party)\b/],
  ['society', /\b(society|government|politic\w*|law|police|crime|criminal|court|war|army|soldier|military|peace|nation|state|public|official|rule|right|freedom|vote|election|religion|god|temple|shrine|culture|history|tradition)\b/],
  ['science-tech', /\b(computer|machine|science|technology|electric\w*|energy|system|data|internet|network|program|software|engine|number|math\w*|calculat\w*|measure|experiment|research)\b/],
];
const TYPE_TOPIC = { 'adj-i': 'describing', 'adj-na': 'describing', 'adj-pre': 'describing', adverb: 'describing' };

function topicOf(row, type) {
  for (const m of row.senses[0]?.marks ?? []) if (FIELD_TOPIC[m]) return FIELD_TOPIC[m];
  // The first gloss is the plainest meaning, so it decides before the others do
  // (行く "to go" is travel, even though a later gloss says "to head (towards)").
  const glosses = (row.senses[0]?.glosses ?? []).map((g) => g.toLowerCase());
  for (const text of [glosses[0] ?? '', glosses.join('; ')]) {
    for (const [topic, re] of TOPIC_WORDS) if (re.test(text)) return topic;
  }
  return TYPE_TOPIC[type] ?? 'general';
}

function meaningOf(row) {
  const out = [];
  for (const g of row.senses[0]?.glosses ?? []) {
    const next = [...out, g].join('; ');
    if (out.length && next.length > 48) break;
    out.push(g);
    if (out.length === 3) break;
  }
  return out.join('; ').replace(/\|/g, '/');
}

// ---------------------------------------------------------------- choose and write
const SKIP_MARKS = new Set(['arch', 'obs', 'rare', 'obsc']);
// One-kanji entries that only rank high because the subtitle tokenizer cut them out of
// longer words (信 from 信じる). Checked by hand against the top of the list.
const FRAGMENTS = new Set(['信']);
// Written forms with several common readings where JMdict's ranks pick the wrong one for
// everyday speech. Checked by hand.
const READING_OVERRIDES = { '出来': 'でき', '入る': 'はいる' };
const usable = common.filter((r) => {
  if (!r.senses.length || !r.senses[0].glosses.length) return false;
  if (r.senses[0].marks.some((m) => SKIP_MARKS.has(m))) return false;
  const shown = r.usuallyKana || !r.forms.length ? r.reading : r.forms[0];
  if (/[A-Za-zＡ-Ｚａ-ｚ0-9０-９・]/.test(shown)) return false; // romaji, digits, dotted loanword spellings
  if (/^[\u3040-\u30ff]$/.test(shown)) return false; // single kana
  if (/^[-~〜]/.test(r.senses[0].glosses[0])) return false; // suffixes like 的 (-ical)
  if (FRAGMENTS.has(shown)) return false;
  return true;
});

// One reading per written form: the one JMdict ranks commonest (drops rare readings
// such as 出来 = しゅったい when でき exists).
const bestOfForm = new Map();
for (const r of usable) {
  const key = r.usuallyKana || !r.forms.length ? `kana:${r.reading}` : r.forms[0];
  const cur = bestOfForm.get(key);
  const forced = READING_OVERRIDES[key];
  const better = forced
    ? r.reading === forced
    : !cur || r.jmRank < cur.jmRank || (r.jmRank === cur.jmRank && (subScore.get(r) ?? 0) > (subScore.get(cur) ?? 0));
  if (better) {
    bestOfForm.set(key, r);
  }
}
const pool = [...bestOfForm.values()];

// Blend two rank positions (geometric mean): how common in subtitles, and how common
// JMdict says it is. A word must do well on both to come early, which smooths out
// mismatches from the stem matching above.
const bySub = [...pool].sort((a, b) => (subScore.get(b) ?? 0) - (subScore.get(a) ?? 0));
const subPos = new Map(bySub.map((r, i) => [r, subScore.get(r) ? i + 1 : pool.length]));
const byJm = [...pool].sort((a, b) => a.jmRank - b.jmRank);
const jmPos = new Map();
byJm.forEach((r, i) => {
  // Equal JMdict ranks share a position (the middle of their tie).
  jmPos.set(r, i + 1);
});
const tieMid = new Map();
for (const r of byJm) {
  const list = tieMid.get(r.jmRank) ?? [];
  list.push(jmPos.get(r));
  tieMid.set(r.jmRank, list);
}
for (const r of byJm) {
  const l = tieMid.get(r.jmRank);
  jmPos.set(r, (l[0] + l[l.length - 1]) / 2);
}
// Conversational (subtitle) frequency carries three quarters of the weight.
const score = (r) => Math.pow(subPos.get(r), 0.75) * Math.pow(jmPos.get(r), 0.25);
usable.length = 0;
usable.push(...pool.sort((a, b) => score(a) - score(b)));

const lines = [];
const seen = new Set();
for (const row of usable) {
  if (lines.length >= COUNT) break;
  const kanji = row.usuallyKana || !row.forms.length ? '' : row.forms[0];
  if (kanji && KANA.test(kanji)) continue;
  const key = `${kanji}|${row.reading}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const type = typeOf(row);
  if (type === 'affix') continue; // 〜的, 〜達… are better learned inside words
  lines.push([kanji, row.reading, meaningOf(row), type, topicOf(row, type)].join('|'));
}

const header = `# Generated by scripts/import-jmdict.mjs. Do not edit by hand (edit data/vocab.psv instead).
# ${lines.length} words, most common in conversation first.
# Words: JMdict (c) Electronic Dictionary Research and Development Group, CC BY-SA 4.0, https://www.edrdg.org/edrdg/licence.html
# Order: OpenSubtitles frequency list by Hermit Dave (FrequencyWords), CC BY-SA 4.0
# Format: kanji | kana | meaning | type | context
`;
writeFileSync(join(root, 'data', 'vocab-frequency.psv'), header + lines.join('\n') + '\n');
console.log(`wrote ${lines.length} words; ${[...subScore.keys()].length} matched subtitle tokens`);
