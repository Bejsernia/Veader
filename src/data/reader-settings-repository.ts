import { loadReaderPreferences, saveReaderPreferences, type ReaderPreferences } from '../preferences';
import { getLibraryDatabase } from './database';
import type { ReaderSettingsRepository } from '../domain/reader-settings';

function parseSettings(value: string | null | undefined): Partial<ReaderPreferences> {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' ? parsed as Partial<ReaderPreferences> : {};
  } catch {
    return {};
  }
}

export const readerSettingsRepository: ReaderSettingsRepository = {
  loadGlobal: loadReaderPreferences,
  saveGlobal: saveReaderPreferences,
  async loadBookOverrides(bookId) {
    const db = await getLibraryDatabase();
    const row = await db.getFirstAsync<any>('SELECT settings_json FROM book_reader_settings WHERE book_id = ?', bookId);
    return parseSettings(row?.settings_json);
  },
  async saveBookOverride(bookId, key, value) {
    const db = await getLibraryDatabase();
    const current = await this.loadBookOverrides(bookId);
    const next = { ...current, [key]: value };
    await db.runAsync('INSERT INTO book_reader_settings(book_id, settings_json, updated_at) VALUES(?, ?, ?) ON CONFLICT(book_id) DO UPDATE SET settings_json = excluded.settings_json, updated_at = excluded.updated_at', bookId, JSON.stringify(next), Date.now());
  },
  async resetBookOverrides(bookId) {
    const db = await getLibraryDatabase();
    await db.runAsync('DELETE FROM book_reader_settings WHERE book_id = ?', bookId);
  },
};
