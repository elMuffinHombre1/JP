import type { SQLiteDatabase } from 'expo-sqlite';
import { VOCAB, VOCAB_VERSION } from '../data/vocab.generated';
import { buildLessons, nextReview, type Grouping } from '../lib/lessons';

export const DATABASE_NAME = 'jp.db';
const SCHEMA_VERSION = 1;
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
  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);

  const v = await getSetting(db, 'vocab_version');
  if (v !== VOCAB_VERSION) await seedVocab(db);
}

/** Upsert the bundled word list, then rebuild lessons. Learning progress is kept. */
async function seedVocab(db: SQLiteDatabase) {
  await db.withExclusiveTransactionAsync(async (txn) => {
    const stmt = await txn.prepareAsync(`
      INSERT INTO words (id, kanji, kana, meaning, type, context, rank)
      VALUES ($id, $kanji, $kana, $meaning, $type, $context, $rank)
      ON CONFLICT(id) DO UPDATE SET
        kanji = excluded.kanji, kana = excluded.kana, meaning = excluded.meaning,
        type = excluded.type, context = excluded.context, rank = excluded.rank
    `);
    try {
      for (let i = 0; i < VOCAB.length; i++) {
        const [kanji, kana, meaning, type, context] = VOCAB[i];
        await stmt.executeAsync({
          $id: i + 1, $kanji: kanji, $kana: kana, $meaning: meaning,
          $type: type, $context: context, $rank: i + 1,
        });
      }
    } finally {
      await stmt.finalizeAsync();
    }
    await txn.runAsync('DELETE FROM words WHERE id > ?', VOCAB.length);

    const words = await txn.getAllAsync<Word>('SELECT * FROM words');
    await txn.execAsync('DELETE FROM lesson_words; DELETE FROM lessons;');
    for (const grouping of ['type', 'context'] as const) {
      const plans = buildLessons(words, grouping, LESSON_SIZE);
      for (let p = 0; p < plans.length; p++) {
        const plan = plans[p];
        const res = await txn.runAsync(
          'INSERT INTO lessons (grouping, group_value, part, title, position) VALUES (?, ?, ?, ?, ?)',
          grouping, plan.groupValue, plan.part, plan.title, p,
        );
        for (let i = 0; i < plan.wordIds.length; i++) {
          await txn.runAsync(
            'INSERT INTO lesson_words (lesson_id, word_id, position) VALUES (?, ?, ?)',
            res.lastInsertRowId, plan.wordIds[i], i,
          );
        }
      }
    }
    await txn.runAsync(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      'vocab_version', VOCAB_VERSION,
    );
  });
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

export function getAllWords(db: SQLiteDatabase) {
  return db.getAllAsync<Word>('SELECT * FROM words ORDER BY rank');
}

export function getDueWords(db: SQLiteDatabase, limit = 20) {
  return db.getAllAsync<WordProgress>(
    `SELECT w.*, p.box, p.due FROM progress p JOIN words w ON w.id = p.word_id
     WHERE p.due <= ? ORDER BY p.due LIMIT ?`,
    Date.now(), limit,
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
