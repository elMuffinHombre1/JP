import type { SQLiteDatabase } from 'expo-sqlite';
import { SENTENCES, VOCAB, VOCAB_VERSION } from '../data/vocab.generated';
import { buildLessons, nextReview, type Grouping } from '../lib/lessons';

export const DATABASE_NAME = 'jp.db';
const SCHEMA_VERSION = 2;
const LESSON_SIZE = 10;

export interface Word {
  id: number;
  kanji: string; // '' when the word is normally written in kana
  kana: string;
  meaning: string;
  type: string;
  context: string;
  rank: number;
}

export interface Lesson {
  id: number;
  grouping: Grouping;
  group_value: string;
  part: number;
  title: string;
  word_count: number;
  completed_at: number | null;
  best_score: number | null;
}

export interface WordProgress extends Word {
  box: number | null;
  due: number | null;
}

/** Display form: kanji if the word has one, otherwise kana. */
export const written = (w: Pick<Word, 'kanji' | 'kana'>) => w.kanji || w.kana;

// ---------------------------------------------------------------- setup

export async function migrate(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;

  if (current < 1) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS words (
        id      INTEGER PRIMARY KEY,
        kanji   TEXT NOT NULL DEFAULT '',
        kana    TEXT NOT NULL,
        meaning TEXT NOT NULL,
        type    TEXT NOT NULL,
        context TEXT NOT NULL,
        rank    INTEGER NOT NULL,
        UNIQUE (kanji, kana)
      );
      CREATE INDEX IF NOT EXISTS idx_words_type ON words(type);
      CREATE INDEX IF NOT EXISTS idx_words_context ON words(context);

      CREATE TABLE IF NOT EXISTS lessons (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        grouping    TEXT NOT NULL CHECK (grouping IN ('type', 'context')),
        group_value TEXT NOT NULL,
        part        INTEGER NOT NULL,
        title       TEXT NOT NULL,
        position    INTEGER NOT NULL,
        UNIQUE (grouping, group_value, part)
      );

      CREATE TABLE IF NOT EXISTS lesson_words (
        lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
        word_id   INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
        position  INTEGER NOT NULL,
        PRIMARY KEY (lesson_id, word_id)
      );

      -- Completion is kept by (grouping, group_value, part) so it survives lesson rebuilds.
      CREATE TABLE IF NOT EXISTS lesson_results (
        grouping     TEXT NOT NULL,
        group_value  TEXT NOT NULL,
        part         INTEGER NOT NULL,
        completed_at INTEGER,
        best_score   INTEGER,
        PRIMARY KEY (grouping, group_value, part)
      );

      CREATE TABLE IF NOT EXISTS progress (
        word_id   INTEGER PRIMARY KEY REFERENCES words(id) ON DELETE CASCADE,
        box       INTEGER NOT NULL DEFAULT 0,
        due       INTEGER NOT NULL,
        correct   INTEGER NOT NULL DEFAULT 0,
        wrong     INTEGER NOT NULL DEFAULT 0,
        last_seen INTEGER
      );

      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }
  if (current < 2) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS sentences (
        id       INTEGER PRIMARY KEY,
        japanese TEXT NOT NULL,
        kana     TEXT NOT NULL,
        english  TEXT NOT NULL
      );
      -- Which vocab words appear in each sentence, and how they're written there.
      CREATE TABLE IF NOT EXISTS sentence_words (
        sentence_id INTEGER NOT NULL REFERENCES sentences(id) ON DELETE CASCADE,
        word_id     INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
        surface     TEXT NOT NULL,
        PRIMARY KEY (sentence_id, word_id)
      );
      CREATE INDEX IF NOT EXISTS idx_sentence_words_word ON sentence_words(word_id);
    `);
    // Force a reseed so the new tables get filled on upgrade.
    await db.runAsync("DELETE FROM settings WHERE key = 'vocab_version'");
  }
  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);

  const v = await getSetting(db, 'vocab_version');
  if (v !== VOCAB_VERSION) await seedVocab(db);
}

type Row = (string | number)[];

/**
 * Insert many rows with a few big statements instead of one call per row: 10,000 words
 * plus their lessons would otherwise take a long time on a phone.
 */
async function insertMany(db: SQLiteDatabase, head: string, columns: number, rows: Row[], tail = '') {
  const PER = Math.floor(900 / columns); // stay well under SQLite's parameter limit
  const one = `(${Array(columns).fill('?').join(', ')})`;
  for (let i = 0; i < rows.length; i += PER) {
    const chunk = rows.slice(i, i + PER);
    await db.runAsync(`${head} VALUES ${chunk.map(() => one).join(', ')} ${tail}`, chunk.flat());
  }
}

/**
 * Upsert the bundled word list, then rebuild lessons. Learning progress is kept: words
 * keep their ids (see scripts/build-vocab.mjs), and lesson results are stored by group.
 */
async function seedVocab(db: SQLiteDatabase) {
  await db.withExclusiveTransactionAsync(async (txn) => {
    await insertMany(
      txn,
      'INSERT INTO words (id, kanji, kana, meaning, type, context, rank)',
      7,
      VOCAB.map(([kanji, kana, meaning, type, context], i) => [i + 1, kanji, kana, meaning, type, context, i + 1]),
      `ON CONFLICT(id) DO UPDATE SET
         kanji = excluded.kanji, kana = excluded.kana, meaning = excluded.meaning,
         type = excluded.type, context = excluded.context, rank = excluded.rank`,
    );
    await txn.runAsync('DELETE FROM words WHERE id > ?', VOCAB.length);

    await txn.execAsync('DELETE FROM sentence_words; DELETE FROM sentences;');
    await insertMany(
      txn, 'INSERT INTO sentences (id, japanese, kana, english)', 4,
      SENTENCES.map(([japanese, kana, english], i) => [i + 1, japanese, kana, english]),
    );
    await insertMany(
      txn, 'INSERT INTO sentence_words (sentence_id, word_id, surface)', 3,
      SENTENCES.flatMap(([, , , targets], i) => targets.map(([wordId, surface]) => [i + 1, wordId, surface])),
    );

    const words: Word[] = VOCAB.map(([kanji, kana, meaning, type, context], i) => ({
      id: i + 1, kanji, kana, meaning, type, context, rank: i + 1,
    }));
    await txn.execAsync('DELETE FROM lesson_words; DELETE FROM lessons;');
    const lessons: Row[] = [];
    const lessonWords: Row[] = [];
    for (const grouping of ['type', 'context'] as const) {
      buildLessons(words, grouping, LESSON_SIZE).forEach((plan, position) => {
        const id = lessons.length + 1;
        lessons.push([id, grouping, plan.groupValue, plan.part, plan.title, position]);
        plan.wordIds.forEach((wordId, i) => lessonWords.push([id, wordId, i]));
      });
    }
    await insertMany(txn, 'INSERT INTO lessons (id, grouping, group_value, part, title, position)', 6, lessons);
    await insertMany(txn, 'INSERT INTO lesson_words (lesson_id, word_id, position)', 3, lessonWords);

    await txn.runAsync(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      'vocab_version', VOCAB_VERSION,
    );
  });
  wordCache = null;
}

// ---------------------------------------------------------------- settings

export async function getSetting(db: SQLiteDatabase, key: string) {
  const r = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  return r?.value ?? null;
}

export async function setSetting(db: SQLiteDatabase, key: string, value: string) {
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key, value,
  );
}

export async function getGrouping(db: SQLiteDatabase): Promise<Grouping> {
  return (await getSetting(db, 'grouping')) === 'type' ? 'type' : 'context';
}

// ---------------------------------------------------------------- lessons

const LESSON_SELECT = `
  SELECT l.id, l.grouping, l.group_value, l.part, l.title,
         (SELECT COUNT(*) FROM lesson_words lw WHERE lw.lesson_id = l.id) AS word_count,
         r.completed_at, r.best_score
  FROM lessons l
  LEFT JOIN lesson_results r
    ON r.grouping = l.grouping AND r.group_value = l.group_value AND r.part = l.part`;

export function getLessons(db: SQLiteDatabase, grouping: Grouping) {
  return db.getAllAsync<Lesson>(`${LESSON_SELECT} WHERE l.grouping = ? ORDER BY l.position`, grouping);
}

export function getLesson(db: SQLiteDatabase, id: number) {
  return db.getFirstAsync<Lesson>(`${LESSON_SELECT} WHERE l.id = ?`, id);
}

/** Today's lesson = the first lesson in the chosen grouping that isn't completed yet. */
export async function getTodaysLesson(db: SQLiteDatabase, grouping: Grouping) {
  return db.getFirstAsync<Lesson>(
    `${LESSON_SELECT} WHERE l.grouping = ? AND r.completed_at IS NULL ORDER BY l.position LIMIT 1`,
    grouping,
  );
}

export function getLessonWords(db: SQLiteDatabase, lessonId: number) {
  return db.getAllAsync<WordProgress>(
    `SELECT w.*, p.box, p.due FROM lesson_words lw
     JOIN words w ON w.id = lw.word_id
     LEFT JOIN progress p ON p.word_id = w.id
     WHERE lw.lesson_id = ? ORDER BY lw.position`,
    lessonId,
  );
}

export async function recordLessonScore(db: SQLiteDatabase, lessonId: number, scorePct: number) {
  const l = await getLesson(db, lessonId);
  if (!l) return;
  const done = scorePct >= 80 ? Date.now() : null;
  await db.runAsync(
    `INSERT INTO lesson_results (grouping, group_value, part, completed_at, best_score)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(grouping, group_value, part) DO UPDATE SET
       completed_at = COALESCE(lesson_results.completed_at, excluded.completed_at),
       best_score   = MAX(COALESCE(lesson_results.best_score, 0), excluded.best_score)`,
    l.grouping, l.group_value, l.part, done, scorePct,
  );
}

// ---------------------------------------------------------------- words & review

// The full list (10,000 words) is used as the pool of wrong answers in quizzes. It only
// changes when the bundled list does, so load it once.
let wordCache: Promise<Word[]> | null = null;

export function getAllWords(db: SQLiteDatabase) {
  if (!wordCache) {
    wordCache = db.getAllAsync<Word>('SELECT * FROM words ORDER BY rank');
    wordCache.catch(() => (wordCache = null));
  }
  return wordCache;
}

/** Word-of-the-day candidates: the commonest words, so the card is always useful. */
export const WORD_OF_DAY_POOL = 2000;

export function getWordAtRank(db: SQLiteDatabase, index: number) {
  return db.getFirstAsync<Word>(
    'SELECT * FROM words WHERE rank <= ? ORDER BY rank LIMIT 1 OFFSET ?',
    WORD_OF_DAY_POOL, index % WORD_OF_DAY_POOL,
  );
}

export function getDueWords(db: SQLiteDatabase, limit = 20) {
  return db.getAllAsync<WordProgress>(
    `SELECT w.*, p.box, p.due FROM progress p JOIN words w ON w.id = p.word_id
     WHERE p.due <= ? ORDER BY p.due LIMIT ?`,
    Date.now(), limit,
  );
}

/** Random words you've already studied (for speed practice outside a lesson). */
export function getSeenWords(db: SQLiteDatabase, limit = 20) {
  return db.getAllAsync<WordProgress>(
    `SELECT w.*, p.box, p.due FROM progress p JOIN words w ON w.id = p.word_id
     ORDER BY RANDOM() LIMIT ?`,
    limit,
  );
}

export async function recordAnswer(db: SQLiteDatabase, wordId: number, correct: boolean) {
  const now = Date.now();
  const cur = await db.getFirstAsync<{ box: number }>('SELECT box FROM progress WHERE word_id = ?', wordId);
  const { box, due } = nextReview(cur?.box ?? 0, correct, now);
  await db.runAsync(
    `INSERT INTO progress (word_id, box, due, correct, wrong, last_seen)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(word_id) DO UPDATE SET
       box = excluded.box, due = excluded.due, last_seen = excluded.last_seen,
       correct = progress.correct + excluded.correct, wrong = progress.wrong + excluded.wrong`,
    wordId, box, due, correct ? 1 : 0, correct ? 0 : 1, now,
  );
}

export async function getStats(db: SQLiteDatabase) {
  const r = await db.getFirstAsync<{ total: number; seen: number; learned: number; due: number }>(
    `SELECT (SELECT COUNT(*) FROM words) AS total,
            (SELECT COUNT(*) FROM progress) AS seen,
            (SELECT COUNT(*) FROM progress WHERE box >= 3) AS learned,
            (SELECT COUNT(*) FROM progress WHERE due <= ?) AS due`,
    Date.now(),
  );
  return r ?? { total: 0, seen: 0, learned: 0, due: 0 };
}

export async function resetProgress(db: SQLiteDatabase) {
  await db.execAsync('DELETE FROM progress; DELETE FROM lesson_results;');
}

// ---------------------------------------------------------------- sentences

export interface SentenceRow {
  id: number;
  japanese: string;
  kana: string;
  english: string;
  word_id: number;
  surface: string;
}

/**
 * One row per (sentence, target word). With a lesson, only sentences that use that
 * lesson's words; otherwise sentences that use words you've studied, falling back to all.
 */
export async function getSentenceRows(db: SQLiteDatabase, lessonId?: number) {
  const base = `SELECT s.id, s.japanese, s.kana, s.english, sw.word_id, sw.surface
                FROM sentences s JOIN sentence_words sw ON sw.sentence_id = s.id`;
  if (lessonId) {
    return db.getAllAsync<SentenceRow>(
      `${base} WHERE sw.word_id IN (SELECT word_id FROM lesson_words WHERE lesson_id = ?)`, lessonId,
    );
  }
  const seen = await db.getAllAsync<SentenceRow>(
    `${base} WHERE sw.word_id IN (SELECT word_id FROM progress)`,
  );
  return seen.length ? seen : db.getAllAsync<SentenceRow>(base);
}

export async function getAllSentences(db: SQLiteDatabase) {
  return db.getAllAsync<{ id: number; english: string }>('SELECT id, english FROM sentences');
}
