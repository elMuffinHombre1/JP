# JP: Kanji & Vocab trainer for iPhone

A pocket app for learning Japanese vocabulary and kanji. It's built with **Expo (React Native)** and stores everything in **SQLite** on the phone. You can develop it on Windows and run it on an iPhone.

## Features (v0.1)

- **Vocabulary in SQLite**: a starter list of 128 common conversational words in `data/vocab.psv`, loaded into an on-device SQLite database (`expo-sqlite`).
- **Daily lessons**: 10-word lessons grouped **by topic** (greetings, food, travel…) or **by word type** (nouns, る-verbs, う-verbs, い/な-adjectives, adverbs…). Your lesson for the day is the next unfinished one. Score 80%+ on a quiz to complete it.
- **Meaning quiz**: see the word, pick the English meaning.
- **Reading quiz**: see the kanji, pick the right kana. The okurigana (the hiragana ending, e.g. 出来**る**, 食**べる**) is highlighted. The wrong answers end with the same kana, so you have to actually read the kanji. After you answer, it explains how the ending tells you the pronunciation and the word class.
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
| `settings` | chosen grouping, vocab version |

When you change `data/vocab.psv` and run `npm run vocab`, the app spots the new version on its next launch. It updates the words and rebuilds the lessons, and **keeps your progress**.

## Adding words

Add a line to `data/vocab.psv`:

```
kanji | kana | meaning | type | context
好き  | すき | liked; to like | adj-na | feelings
```

Leave `kanji` empty for words normally written in kana. Line order = frequency rank. Then run `npm run vocab`.

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
- [ ] Example sentences per word.
