import * as FileSystem from 'expo-file-system';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ReaderPreferences = {
  readingDirection?: 'ltr' | 'rtl' | 'vertical';
  tapZones?: boolean;
  smooth?: boolean;
  dark?: boolean;
  crop?: boolean;
  notch?: boolean;
  volume?: boolean;
  pageMode?: 'single' | 'double';
  doubleOrder?: 'natural' | 'reverse';
};
type Preferences = { themeMode?: ThemeMode; reader?: ReaderPreferences };

const preferencesUri = () => `${FileSystem.documentDirectory}veader-preferences.json`;

async function readPreferences(): Promise<Preferences> {
  try {
    const info = await FileSystem.getInfoAsync(preferencesUri());
    if (!info.exists) return {};
    return JSON.parse(await FileSystem.readAsStringAsync(preferencesUri())) as Preferences;
  } catch {
    return {};
  }
}

async function writePreferences(value: Preferences) {
  await FileSystem.writeAsStringAsync(preferencesUri(), JSON.stringify(value));
}

export async function loadThemeMode(): Promise<ThemeMode> {
  const preferences = await readPreferences();
  return preferences.themeMode ?? 'dark';
}

export async function saveThemeMode(themeMode: ThemeMode) {
  const preferences = await readPreferences();
  await writePreferences({ ...preferences, themeMode });
}

export async function loadReaderPreferences(): Promise<ReaderPreferences> {
  const preferences = await readPreferences();
  return preferences.reader ?? {};
}

export async function saveReaderPreferences(reader: ReaderPreferences) {
  const preferences = await readPreferences();
  await writePreferences({ ...preferences, reader: { ...preferences.reader, ...reader } });
}
