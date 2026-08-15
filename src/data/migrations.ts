import type * as SQLite from 'expo-sqlite';

export const LIBRARY_SCHEMA_NAME = 'library';
export const CURRENT_LIBRARY_SCHEMA_VERSION = 3;

export type Migration = {
  version: number;
  description: string;
  migrate: (db: SQLite.SQLiteDatabase) => Promise<void>;
};

const BASE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS series (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    author TEXT NOT NULL DEFAULT '',
    source_uri TEXT NOT NULL UNIQUE,
    cover_uri TEXT,
    progress REAL NOT NULL DEFAULT 0,
    current_chapter_id INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS chapters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    series_id INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
    chapter_number INTEGER NOT NULL,
    chapter_title TEXT NOT NULL,
    format TEXT NOT NULL CHECK(format IN ('epub','mobi','pdf')),
    local_uri TEXT NOT NULL UNIQUE,
    original_name TEXT NOT NULL,
    file_size INTEGER NOT NULL DEFAULT 0,
    progress REAL NOT NULL DEFAULT 0,
    current_location TEXT,
    added_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    username TEXT,
    secret_key TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS schema_meta (
    name TEXT PRIMARY KEY NOT NULL,
    version INTEGER NOT NULL
  );
`;

async function hasColumn(db: SQLite.SQLiteDatabase, table: string, column: string) {
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return rows.some(row => row.name === column);
}

async function addColumn(db: SQLite.SQLiteDatabase, table: string, definition: string) {
  const column = definition.trim().split(/\s+/, 1)[0];
  if (!column || await hasColumn(db, table, column)) return;
  await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
}

async function inferVersion(db: SQLite.SQLiteDatabase) {
  const tables = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('series', 'chapters', 'sources')",
  );
  if (tables.length === 0) return 0;

  const [seriesHasSource, chapterHasRemotePath, chapterHasFingerprint, chapterHasStatus, sourceHasCount, sourceHasUpdatedAt] = await Promise.all([
    hasColumn(db, 'series', 'source_id'),
    hasColumn(db, 'chapters', 'remote_path'),
    hasColumn(db, 'chapters', 'content_fingerprint'),
    hasColumn(db, 'chapters', 'scan_status'),
    hasColumn(db, 'sources', 'book_count'),
    hasColumn(db, 'sources', 'updated_at'),
  ]);
  return seriesHasSource && chapterHasRemotePath && chapterHasFingerprint && chapterHasStatus && sourceHasCount && sourceHasUpdatedAt ? 2 : 1;
}

export const libraryMigrations: Migration[] = [
  {
    version: 1,
    description: 'create the original local library schema',
    migrate: async db => {
      await db.execAsync(BASE_SCHEMA);
    },
  },
  {
    version: 2,
    description: 'add source identity, remote locators, content metadata and scan state',
    migrate: async db => {
      await addColumn(db, 'series', 'source_id INTEGER');
      await addColumn(db, 'sources', 'book_count INTEGER NOT NULL DEFAULT 0');
      await addColumn(db, 'sources', 'updated_at INTEGER NOT NULL DEFAULT 0');
      await addColumn(db, 'chapters', 'source_id INTEGER');
      await addColumn(db, 'chapters', 'remote_path TEXT');
      await addColumn(db, 'chapters', 'remote_locator TEXT');
      await addColumn(db, 'chapters', 'remote_size INTEGER');
      await addColumn(db, 'chapters', 'remote_modified_at INTEGER');
      await addColumn(db, 'chapters', 'content_fingerprint TEXT');
      await addColumn(db, 'chapters', 'page_count INTEGER');
      await addColumn(db, 'chapters', 'scan_status TEXT NOT NULL DEFAULT \'ready\'');
      await addColumn(db, 'chapters', 'last_opened_at INTEGER');
      await db.execAsync('CREATE INDEX IF NOT EXISTS idx_chapters_series ON chapters(series_id, chapter_number)');
    },
  },
  {
    version: 3,
    description: 'harden lookup indexes and normalize existing progress metadata',
    migrate: async db => {
      await db.execAsync('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY NOT NULL, applied_at INTEGER NOT NULL, description TEXT NOT NULL)');
      await db.execAsync('CREATE INDEX IF NOT EXISTS idx_series_source ON series(source_id, updated_at)');
      await db.execAsync('CREATE INDEX IF NOT EXISTS idx_chapters_remote ON chapters(source_id, remote_path, content_fingerprint)');
      await db.runAsync('UPDATE sources SET updated_at = created_at WHERE updated_at IS NULL OR updated_at = 0');
      await db.runAsync('UPDATE chapters SET scan_status = \'ready\' WHERE scan_status IS NULL OR scan_status = \'\'');
      await db.runAsync('UPDATE chapters SET progress = 0 WHERE progress IS NULL OR progress < 0');
      await db.runAsync('UPDATE chapters SET progress = 1 WHERE progress > 1');
      await db.runAsync('UPDATE series SET progress = 0 WHERE progress IS NULL OR progress < 0');
      await db.runAsync('UPDATE series SET progress = 1 WHERE progress > 1');
    },
  },
];

export async function runLibraryMigrations(db: SQLite.SQLiteDatabase) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      name TEXT PRIMARY KEY NOT NULL,
      version INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      applied_at INTEGER NOT NULL,
      description TEXT NOT NULL
    );
  `);

  const stored = await db.getFirstAsync<{ version: number }>(
    'SELECT version FROM schema_meta WHERE name = ?',
    LIBRARY_SCHEMA_NAME,
  );
  const version = stored ? Number(stored.version) : await inferVersion(db);
  if (version > CURRENT_LIBRARY_SCHEMA_VERSION) {
    throw new Error(`Unsupported library schema version: ${version}`);
  }
  if (!stored) {
    await db.runAsync(
      'INSERT INTO schema_meta(name, version) VALUES(?, ?)',
      LIBRARY_SCHEMA_NAME,
      version,
    );
  }

  for (const migration of libraryMigrations.filter(item => item.version > version)) {
    await db.withTransactionAsync(async () => {
      await migration.migrate(db);
      await db.runAsync(
        'UPDATE schema_meta SET version = ? WHERE name = ?',
        migration.version,
        LIBRARY_SCHEMA_NAME,
      );
      await db.runAsync(
        'INSERT OR REPLACE INTO schema_migrations(version, applied_at, description) VALUES(?, ?, ?)',
        migration.version,
        Date.now(),
        migration.description,
      );
    });
  }

  return CURRENT_LIBRARY_SCHEMA_VERSION;
}
