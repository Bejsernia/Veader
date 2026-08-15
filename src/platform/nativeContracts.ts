import { NativeModules, Platform } from 'react-native';
import type { BookFormat, ContentInfo, PageResult } from '../domain/models';

export type OpenSessionInput = {
  uri: string;
  format: BookFormat;
  sessionId: string;
};

export type RenderPageInput = {
  sessionId?: string;
  uri: string;
  format: BookFormat;
  pageIndex: number;
  targetWidth: number;
};

export type PrefetchInput = RenderPageInput & { pageIndexes: number[] };

export type DocumentReaderModule = {
  getInfo?: (uri: string, format?: BookFormat) => Promise<ContentInfo | { pageCount?: number; title?: string; author?: string; imageRecords?: number[] }>;
  openSession?: (input: OpenSessionInput) => Promise<string>;
  renderPage?: (input: RenderPageInput) => Promise<PageResult | string>;
  prefetch?: (input: PrefetchInput) => Promise<void>;
  closeSession?: (sessionId: string) => Promise<void>;
  getPdfInfo?: (uri: string) => Promise<{ pageCount?: number }>;
  renderPdfPage?: (uri: string, pageIndex: number, targetWidth: number) => Promise<string>;
  getMobiInfo?: (uri: string) => Promise<{ imageRecords?: number[]; title?: string; author?: string }>;
  renderMobiPage?: (uri: string, recordIndex: number, targetWidth: number) => Promise<string>;
  cropImage?: (uri: string) => Promise<string>;
};

export type SafScannerModule = {
  scan?: (uri: string) => Promise<Array<{ name: string; uri: string; chapters: Array<{ name: string; uri: string }> }>>;
  scanEpub?: (uri: string) => Promise<{ title?: string; author?: string; direction?: string; pages: string[] }>;
  extractEpubEntries?: (uri: string, entries: string[], targetDirUri: string, fileNames: string[]) => Promise<string[]>;
  extractEpubEntry?: (uri: string, entry: string) => Promise<string>;
  prepareEpubSession?: (uri: string, sessionId: string) => Promise<string>;
  extractEpubEntriesFromSession?: (archiveUri: string, entries: string[], targetDirUri: string, fileNames: string[]) => Promise<string[]>;
  releaseEpubSession?: (sessionId: string) => Promise<void>;
};

export type FolderPickerModule = {
  pickFolder?: () => Promise<{ directoryUri: string; files: Array<{ name: string; uri: string; path?: string; size?: number }> } | null>;
  refreshFolder?: (directoryUri: string) => Promise<{ directoryUri: string; files: Array<{ name: string; uri: string; path?: string; size?: number }> } | null>;
  releaseFolder?: (directoryUri: string) => Promise<void>;
};

export type RemoteSourceModule = {
  scan?: (type: 'ftp' | 'smb', endpoint: string, username?: string, password?: string) => Promise<Array<{ name: string; path: string; size?: number; modifiedAt?: number; directory?: boolean }>>;
  download?: (type: 'ftp' | 'smb', endpoint: string, remotePath: string, username: string | undefined, password: string | undefined, localUri: string) => Promise<void>;
  saveCredentials?: (endpoint: string, username: string, password: string) => Promise<void>;
  deleteCredentials?: (endpoint: string) => Promise<void>;
};

export type NativeModuleErrorCode =
  | 'MODULE_UNAVAILABLE'
  | 'METHOD_UNAVAILABLE'
  | 'PERMISSION_DENIED'
  | 'FILE_NOT_FOUND'
  | 'INVALID_FORMAT'
  | 'NETWORK_UNAVAILABLE'
  | 'RENDER_FAILED';

export class NativeCapabilityError extends Error {
  constructor(
    public readonly code: NativeModuleErrorCode,
    message: string,
    public readonly moduleName?: string,
  ) {
    super(message);
    this.name = 'NativeCapabilityError';
  }
}

export function getDocumentReader(): DocumentReaderModule | undefined {
  const native = NativeModules.DocumentReader as DocumentReaderModule | undefined;
  if (!native) return undefined;
  const getInfo = native.getInfo ?? (async (uri: string, format?: BookFormat) => {
    if (format === 'pdf' && native.getPdfInfo) return native.getPdfInfo(uri);
    if (format === 'mobi' && native.getMobiInfo) return native.getMobiInfo(uri);
    throw new NativeCapabilityError('METHOD_UNAVAILABLE', 'DocumentReader.getInfo 不可用', 'DocumentReader');
  });
  const renderPage = native.renderPage ?? (async (input: RenderPageInput) => {
    if (input.format === 'pdf' && native.renderPdfPage) return native.renderPdfPage(input.uri, input.pageIndex, input.targetWidth);
    if (input.format === 'mobi' && native.renderMobiPage) return native.renderMobiPage(input.uri, input.pageIndex, input.targetWidth);
    throw new NativeCapabilityError('METHOD_UNAVAILABLE', 'DocumentReader.renderPage 不可用', 'DocumentReader');
  });
  return {
    ...native,
    getInfo,
    renderPage,
    openSession: native.openSession ?? (async input => input.sessionId),
    prefetch: native.prefetch ?? (async input => {
      await Promise.all(input.pageIndexes.map(pageIndex => renderPage({ ...input, pageIndex })));
    }),
    closeSession: native.closeSession ?? (async () => undefined),
  };
}

export function getSafScanner(): SafScannerModule | undefined {
  return NativeModules.SafScanner as SafScannerModule | undefined;
}

export function getRemoteSource(): RemoteSourceModule | undefined {
  return NativeModules.RemoteSource as RemoteSourceModule | undefined;
}

export function getFolderPicker(): FolderPickerModule | undefined {
  return NativeModules.VeaderFolderPicker as FolderPickerModule | undefined;
}

export function requireNativeMethod<T extends object, K extends keyof T>(
  module: T | undefined,
  moduleName: string,
  method: K,
): NonNullable<T[K]> {
  const value = module?.[method];
  if (typeof value !== 'function') {
    throw new NativeCapabilityError('METHOD_UNAVAILABLE', moduleName + '.' + String(method) + ' 不可用', moduleName);
  }
  return value as NonNullable<T[K]>;
}

export function assertNativePlatform(moduleName: string) {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') throw new Error(`${moduleName} 不支持当前平台`);
}
