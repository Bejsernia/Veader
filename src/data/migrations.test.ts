import { CURRENT_LIBRARY_SCHEMA_VERSION, runLibraryMigrations } from './migrations';

class FakeDatabase {
  version: number | null = null;
  tables: string[] = [];
  execs: string[] = [];
  runs: Array<{ sql: string; params: unknown[] }> = [];
  transactions = 0;
  failOn: string | undefined;

  async execAsync(sql: string) {
    this.execs.push(sql);
    if (this.failOn && sql.includes(this.failOn)) throw new Error(`migration failed: ${this.failOn}`);
  }

  async runAsync(sql: string, ...params: unknown[]) {
    this.runs.push({ sql, params });
    if (sql.startsWith('INSERT INTO schema_meta')) this.version = Number(params[1]);
    if (sql.startsWith('UPDATE schema_meta')) this.version = Number(params[0]);
    return { changes: 1, lastInsertRowId: 1 };
  }

  async getFirstAsync<T>(sql: string): Promise<T | null> {
    if (sql.includes('SELECT version FROM schema_meta')) {
      return this.version === null ? null : ({ version: this.version } as T);
    }
    return null;
  }

  async getAllAsync<T>(sql: string): Promise<T[]> {
    if (sql.includes('sqlite_master')) return this.tables.map(name => ({ name } as T));
    return [];
  }

  async withTransactionAsync(task: () => Promise<void>) {
    this.transactions += 1;
    return task();
  }
}

const asSqliteDatabase = (database: FakeDatabase) => database as never;

describe('library schema migrations', () => {
  it('creates a new database and records every applied version', async () => {
    const database = new FakeDatabase();

    await expect(runLibraryMigrations(asSqliteDatabase(database))).resolves.toBe(CURRENT_LIBRARY_SCHEMA_VERSION);

    expect(database.transactions).toBe(3);
    expect(database.version).toBe(CURRENT_LIBRARY_SCHEMA_VERSION);
    expect(database.runs.some(item => item.sql.includes('schema_migrations'))).toBe(true);
  });

  it('upgrades a legacy v1 database without rerunning the base schema', async () => {
    const database = new FakeDatabase();
    database.version = 1;
    database.tables = ['series', 'chapters', 'sources'];

    await runLibraryMigrations(asSqliteDatabase(database));

    expect(database.transactions).toBe(2);
    expect(database.execs.some(sql => sql.includes('CREATE TABLE IF NOT EXISTS series'))).toBe(false);
    expect(database.execs.some(sql => sql.includes('ALTER TABLE chapters ADD COLUMN remote_path'))).toBe(true);
    expect(database.version).toBe(3);
  });

  it('does not advance schema_meta when a migration fails', async () => {
    const database = new FakeDatabase();
    database.version = 1;
    database.tables = ['series', 'chapters', 'sources'];
    database.failOn = 'ALTER TABLE chapters ADD COLUMN remote_path';

    await expect(runLibraryMigrations(asSqliteDatabase(database))).rejects.toThrow('migration failed');
    expect(database.runs.some(item => item.sql.startsWith('UPDATE schema_meta'))).toBe(false);
  });

  it('is idempotent once the current version is recorded', async () => {
    const database = new FakeDatabase();

    await runLibraryMigrations(asSqliteDatabase(database));
    const transactionCount = database.transactions;
    const runCount = database.runs.length;
    await expect(runLibraryMigrations(asSqliteDatabase(database))).resolves.toBe(CURRENT_LIBRARY_SCHEMA_VERSION);

    expect(database.transactions).toBe(transactionCount);
    expect(database.runs.length).toBe(runCount);
  });

  it('rejects a database newer than this app understands', async () => {
    const database = new FakeDatabase();
    database.version = CURRENT_LIBRARY_SCHEMA_VERSION + 1;

    await expect(runLibraryMigrations(asSqliteDatabase(database))).rejects.toThrow('Unsupported library schema version');
  });
});
