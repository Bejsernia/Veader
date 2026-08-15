import * as SQLite from 'expo-sqlite';
import { runLibraryMigrations } from './migrations';

export const LIBRARY_DATABASE_NAME = 'veader.db';

let database: Promise<SQLite.SQLiteDatabase> | undefined;
let initialization: Promise<void> | undefined;

export function getLibraryDatabase() {
  database ??= SQLite.openDatabaseAsync(LIBRARY_DATABASE_NAME);
  return database;
}

export function initializeDatabase() {
  initialization ??= (async () => {
    const db = await getLibraryDatabase();
    await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    await runLibraryMigrations(db);
  })().catch(error => {
    initialization = undefined;
    throw error;
  });
  return initialization;
}

/** Only used by isolated tests; production code keeps one connection per process. */
export function resetDatabaseConnectionForTests() {
  database = undefined;
  initialization = undefined;
}
