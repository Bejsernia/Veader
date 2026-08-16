import type { ReaderPreferences } from '../preferences';

export interface ReaderSettingsRepository {
  loadGlobal(): Promise<ReaderPreferences>;
  saveGlobal(input: ReaderPreferences): Promise<void>;
  loadBookOverrides(bookId: number): Promise<Partial<ReaderPreferences>>;
  saveBookOverride<K extends keyof ReaderPreferences>(bookId: number, key: K, value: ReaderPreferences[K]): Promise<void>;
  resetBookOverrides(bookId: number): Promise<void>;
}
