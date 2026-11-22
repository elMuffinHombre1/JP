# JP: Kanji & Vocab trainer for iPhone

A pocket app for learning Japanese vocabulary and kanji. It's built with **Expo (React Native)** and stores everything in **SQLite** on the phone. You can develop it on Windows and run it on an iPhone.

## Features (v0.1)

- **Vocabulary in SQLite**: a starter list of 128 common conversational words in `data/vocab.psv`, loaded into an on-device SQLite database (`expo-sqlite`).
- **Daily lessons**: 10-word lessons grouped **by topic** (greetings, food, travel…) or **by word type** (nouns, る-verbs, う-verbs, い/な-adjectives, adverbs…). Your lesson for the day is the next unfinished one. Score 80%+ on a quiz to complete it.
- **Meaning quiz**: see the word, pick the English meaning.
- **Reading quiz**: see the kanji, pick the right kana. The okurigana (the hiragana ending, e.g. 出来**る**, 食**べる**) is highlighted. The wrong answers end with the same kana, so you have to actually read the kanji. After you answer, it explains how the ending tells you the pronunciation and the word class.
- **⚡ Speed reading**: a timed reading quiz. Choose 3, 5 or 8 seconds per word, then tap the reading before the bar runs out. Correct answers move on automatically, and a miss stops so you can look at it. At the end you see your average time, your fastest time, and a list of slow or missed words. Your best average is saved; a run only counts if you score 80% or more. Start it from any lesson, or from the Review tab to drill words you've already studied.
- **文 Sentences**: 48 example sentences built from the vocab. There are two modes: **Whole sentence** (pick the English translation) and **Word in context** (one word is highlighted; pick what it means in that sentence). The timer can be off, 8, 12 or 20 seconds. Tap the sentence to see its kana reading. Misses show the translation and how the highlighted word appears in the sentence. Start it from a lesson (sentences that use that lesson's words) or from the Review tab.
- **Writing practice**: draw the kanji on a writing pad from its meaning and reading. You can trace a faint guide, then check your drawing against the answer and mark yourself.
- **Spaced repetition**: every answer updates a Leitner box. Words come back after 1, 2, 4, 8, 16 and 32 days in the **Review** tab.
- **Word-of-the-day card**: shows the kanji, kana, romaji and meaning (e.g. 好き · すき · suki · to like). It's a preview of the home-screen widget (see roadmap).

## Run it on your iPhone 13 (from Windows)

1. Install **Node.js LTS** and **Git for Windows**.
2. Clone and install:
   ```powershell
   git clone https://github.com/elMuffinHombre1/JP
   cd JP
   npm install
   npx expo start
   ```
3. Install **Expo Go** from the App Store on your iPhone. Scan the QR code shown in the terminal with the iPhone Camera app. Your phone and PC need to be on the same Wi-Fi. If they aren't, run `npx expo start --tunnel` instead.

Every code change reloads on the phone straight away.

### Installing it as a real app (no Mac needed)

Expo's cloud build service, EAS, builds the iOS app on Expo's own Macs:

```powershell
npx eas-cli@latest login
npx eas-cli@latest build:configure
npx eas-cli@latest build --platform ios
```

To install that build you need an Apple Developer account. It's free for limited on-device testing; the paid program is needed for TestFlight. EAS walks you through the signing.

## Project layout

```
data/vocab.psv              word list (edit this) -> run `npm run vocab`
data/sentences.psv          example sentences (edit this) -> run `npm run vocab`
scripts/build-vocab.mjs     validates the list, writes src/data/vocab.generated.ts
src/db/database.ts          SQLite schema, migrations, seeding and all queries
src/lib/                    pure logic: romaji, okurigana, lesson building, SRS, quiz building
src/ui/                     theme, shared components, KanjiPad (writing canvas)
src/app/                    screens (Expo Router): Today, Lessons, Review, lesson/[id], quiz
tests/                      unit tests for the pure logic (`npm test`)
```

### Database tables

| table | purpose |
|---|---|
| `words` | kanji, kana, meaning, type, context, frequency rank |
| `lessons` / `lesson_words` | generated lessons for both groupings and the words in each |
| `lesson_results` | completion date and best score per lesson |
| `progress` | spaced-repetition box, next due time, right/wrong counts per word |
| `sentences` / `sentence_words` | example sentences and which vocab words appear in each (with the conjugated form) |
| `settings` | chosen grouping, quiz settings, vocab version |

When you change `data/vocab.psv` and run `npm run vocab`, the app spots the new version on its next launch. It updates the words and rebuilds the lessons, and **keeps your progress**.

## Adding words

Add a line to `data/vocab.psv`:

```
kanji | kana | meaning | type | context
好き  | すき | liked; to like | adj-na | feelings
```

Leave `kanji` empty for words normally written in kana. Line order = frequency rank. Then run `npm run vocab`.

## Adding sentences

Add a line to `data/sentences.psv`:

```
japanese | kana reading | english | word=surface, word=surface
犬が好きです。| いぬがすきです。| I like dogs. | 犬=犬, 好き=好き
```

`word` is the word as written in `vocab.psv`. `surface` is how it appears in the sentence, e.g. `食べる=食べ` for 食べません. `npm run vocab` checks that every word exists and every surface form is in the sentence.

## Scripts

| command | does |
|---|---|
| `npx expo start` | dev server (scan the QR with your iPhone) |
| `npm run vocab` | rebuild the vocab module from `data/vocab.psv` |
| `npm test` | unit tests |
| `npm run typecheck` | TypeScript check |

## Roadmap

- [ ] **Top 10,000 words**: write an importer that combines a frequency list with JMdict (CC BY-SA) into `vocab.psv`, then tag types and contexts.
- [ ] **Stroke order checking**: use KanjiVG (CC BY-SA) stroke data to grade stroke count, order and direction, and to animate the correct strokes.
- [ ] **Home-screen widget**: a native iOS WidgetKit extension, written in Swift, that shows a word from the SQLite database. This needs a development build through EAS; it won't run in Expo Go.
- [ ] Daily reminder notification.
- [ ] More example sentences (aim for 2–3 per word).
